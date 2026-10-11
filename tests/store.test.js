'use strict';
const assert=require('assert'),http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let catalog={themes:['Demo',{url:'http://github.com/example/demo'},'None',{url:'.'},{name:'Broken',url:'https://github.com/example/broken'}],skills:[{name:'Example Skill',url:'https://github.com/example/skill'}]};
let offline=false,broken=true;
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#54b9e6"/></svg>';
const readme='# Demo\n\nFirst **description** paragraph.\n\n![Preview](face/eye.png)\n\n<script>window.bad=true</script>\n\n[Unsafe](javascript:alert(1))';
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/manifest.json') {res.setHeader('Content-Type','application/json');res.statusCode=offline?503:200;res.end(JSON.stringify(catalog));return;}
 const file=path.resolve(root,'.'+pathname);
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const target=pathname.endsWith('/')?path.join(file,'index.html'):file;
 if(!fs.existsSync(target)){res.writeHead(404);res.end();return;}
 const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf'};
 res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light'});
  await context.addInitScript(()=>{window.__storeRefresh=null;window.setInterval=(callback,delay)=>{if(delay===3600000)window.__storeRefresh=callback;return 1;};});
  await context.route('https://api.github.com/repos/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ owner: { login: 'example' }, stargazers_count: 42 }) }));
  await context.route('https://raw.githubusercontent.com/**',async route=>{
   const u=new URL(route.request().url());const parts=u.pathname.split('/');const repo=parts[2],file=parts.slice(4).join('/');
   if(offline||(repo==='broken'&&broken)){await route.fulfill({status:503,body:'Unavailable'});return;}
   if(file==='banner.png'||file==='face/eye.png'){await route.fulfill({contentType:'image/svg+xml',body:svg});return;}
   if(file==='manifest.json'&&repo==='skill'){await route.fulfill({status:404,body:'Missing'});return;}
   const data=file==='manifest.json'?JSON.stringify({name:repo==='new'?'New Theme':repo==='broken'?'Recovered':'Demo',version:'1.0.0',supported:'3.1.5',type:'theme'}):file==='package.json'?JSON.stringify({name:'Example Skill',version:'2.0.0',type:'module'}):file==='README.md'?repo==='skill'?'# Skill\n\nA useful skill.':readme:null;
   await route.fulfill({status:data===null?404:200,body:data||'Missing',contentType:file.endsWith('.json')?'application/json':'text/plain'});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/');await page.waitForFunction(()=>!document.querySelector('#store-status').textContent.includes('Loading'));
  assert.strictEqual(await page.locator('#store-themes .store-card').count(),3);
  assert.strictEqual(await page.locator('#store-themes .store-card-name').first().textContent(),'None');
  assert((await page.locator('#store-themes .store-publisher').first().textContent()).includes('example'));
  assert((await page.locator('#store-themes .store-publisher').first().textContent()).includes('★ 42'));
  assert.strictEqual(await page.locator('nav,.toolbar,[data-action="install-theme"]').count(),0);
  assert.strictEqual(await page.getByRole('button',{name:/install/i}).count(),0);
  assert((await page.locator('.store-description').nth(1).textContent()).includes('First description paragraph.'));
  await page.getByRole('button',{name:'Details for Demo',exact:true}).click();
  await page.waitForSelector('#details:not([hidden])');
  assert((await page.locator('.theme-readme-image').getAttribute('src')).endsWith('/HEAD/face/eye.png'));
  assert.strictEqual(await page.locator('#details-readme script,#details-readme a[href^="javascript:"]').count(),0);
  assert.strictEqual(await page.evaluate(()=>window.bad),undefined);
  await page.keyboard.press('Escape');assert(await page.locator('#details').isHidden());
  assert.strictEqual(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Details for Demo');
  await page.getByRole('tab',{name:'Skills',exact:true}).click();await page.waitForSelector('#store-skills:not([hidden])');
  assert.strictEqual(await page.locator('#store-skills .store-card-name').textContent(),'Example Skill');
  assert(await page.locator('#skills-notice').isVisible());
  assert((await page.locator('#store-skills .store-publisher').textContent()).includes('★ 42'));
  assert((await page.locator('#store-skills .store-description').textContent()).includes('A useful skill.'));
  await page.getByRole('tab',{name:'Skills',exact:true}).press('ArrowLeft');assert(await page.getByRole('tab',{name:'Themes',exact:true}).getAttribute('aria-selected')==='true');
  for(const mode of ['light','dark'])for(const width of [320,390,768,1440]){
   await page.emulateMedia({colorScheme:mode});await page.setViewportSize({width,height:960});await page.waitForTimeout(250);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+' '+width+' must fit');
   assert.strictEqual(await page.locator('.store-none-icon').evaluate(n=>getComputedStyle(n).filter.includes('invert(1)')),mode==='dark');
   if(process.env.STORE_SCREENSHOTS&&[390,1440].includes(width))await page.screenshot({path:path.join(process.env.STORE_SCREENSHOTS,'store-'+mode+'-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:320,height:700});await page.getByRole('button',{name:'Details for Demo',exact:true}).click();
  assert(await page.locator('.theme-details-card').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  await page.locator('#details').click({position:{x:2,y:2}});assert(await page.locator('#details').isHidden());
  broken=false;catalog.themes.push({name:'New Theme',url:'https://github.com/example/new'});
  await page.evaluate(()=>window.__storeRefresh());await page.waitForFunction(()=>document.querySelector('#store-status').textContent==='4 themes');
  assert.strictEqual(await page.locator('#store-themes .store-card').count(),4);assert(await page.locator('#retry').isHidden());
  offline=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('cached entries'));
  assert.strictEqual(await page.locator('#store-themes .store-card').count(),4);assert(await page.locator('#retry').isVisible());
  offline=false;await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent==='4 themes');
  catalog={themes:[{name:'Unsafe',url:'javascript:alert(1)'}],skills:[]};await page.evaluate(()=>window.__storeRefresh());
  await page.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('Invalid URL'));
  assert.strictEqual(await page.locator('#store-themes .store-card').count(),4);
  assert.deepStrictEqual(errors,[]);await context.close();
  console.log('Dynamic alternating/object catalogs, real skills/package fallback, README safety/images, popup dismissal, responsive colors, auto-refresh, cached errors and retry passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
