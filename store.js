/* Buildless storefront: all catalog entries come from manifest.json. */
(function () {
    'use strict';
    const $ = selector => document.querySelector(selector);
    const cacheKey = '5x1-store-catalog-v1';
    let entries = [], category = 'themes', refreshing = null, opener = null, catalogError = '', cached = [];
    function el(tag, css, text) {
        const node = document.createElement(tag); if (css) node.className = css;
        if (text !== undefined) node.textContent = String(text); return node;
    }
    function safeUrl(value, base) {
        try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null; }
        catch (err) { return null; }
    }
    function parseCatalog(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid storefront manifest');
        const out = [];
        ['themes', 'skills'].forEach(section => {
            const list = data[section] || []; if (!Array.isArray(list)) throw new Error(section + ' must be an array');
            for (let i = 0; i < list.length; i++) {
                let item = list[i], name;
                if (typeof item === 'string') {
                    name = item;
                    if (!list[i + 1] || typeof list[i + 1] !== 'object') continue;
                    item = list[++i];
                } else if (item && typeof item === 'object') name = item.name;
                if (!item || typeof item.url !== 'string') throw new Error('Store entries need a URL');
                if (section === 'themes' && name === 'None' && item.url === '.') { out.push({name:'None',section,stock:true,url:null});continue; }
                const url = safeUrl(item.url, new URL('manifest.json', location.href));
                if (!url) throw new Error('Invalid URL for ' + (name || 'store entry'));
                if (url.hostname.toLowerCase() === 'github.com') url.protocol = 'https:';
                if (!out.some(e => e.section === section && e.url === url.href)) out.push({name:name || 'Untitled',section,url:url.href});
            }
            if (out.filter(e => e.section === section).length > 100) throw new Error('Too many ' + section + ' entries');
        });
        return out.sort((a,b) => Number(!!b.stock) - Number(!!a.stock));
    }
    async function text(url, optional, limit) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(url, {signal:controller.signal,cache:'no-cache',credentials:'omit'});
            if (optional && response.status === 404) return null;
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (Number(response.headers.get('content-length')) > limit) throw new Error('Metadata is too large');
            const value = await response.text(); if (value.length > limit) throw new Error('Metadata is too large');return value;
        } catch (err) { throw new Error(err.name === 'AbortError' ? 'Request timed out' : err.message); }
        finally { clearTimeout(timer); }
    }
    function locationFor(entry) {
        const url = safeUrl(entry.url);
        if (!url) throw new Error('Invalid repository URL');
        if (url.hostname.toLowerCase() === 'github.com') {
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length !== 2) throw new Error('Use a GitHub repository URL');
            parts[1] = parts[1].replace(/\.git$/, '');
            // HEAD follows the repository's default branch without API rate limits.
            return {base:'https://raw.githubusercontent.com/' + parts.map(encodeURIComponent).join('/') + '/HEAD/',repository:true};
        }
        return {base:new URL('./', url.href.endsWith('/') || /\.json$/i.test(url.pathname) ? url.href : url.href + '/').href,
            manifest:/\.json$/i.test(url.pathname) ? url.href : null,repository:false};
    }
    function paragraph(readme) {
        const lines = String(readme || '').split(/\r?\n/), result = []; let code = false;
        for (const line of lines) {
            if (/^```|^~~~/.test(line)) { code = !code; continue; }
            if (code || /^\s*#/.test(line)) continue;
            if (!line.trim()) { if (result.length) break; continue; }
            const clean = line.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').replace(/<[^>]*>/g,'');
            if (clean.trim()) result.push(clean);
        }
        return result.join(' ').slice(0,1000);
    }
    function readCache() {
        try {
            const data = JSON.parse(localStorage.getItem(cacheKey));
            if (!Array.isArray(data) || data.length > 200) return [];
            return data.filter(e => e && ['themes','skills'].includes(e.section) && (e.stock || safeUrl(e.url)) && typeof e.name === 'string');
        } catch (err) { return []; }
    }
    function writeCache() {
        try { localStorage.setItem(cacheKey, JSON.stringify(entries.map(e => { const item = Object.assign({},e);delete item.error;delete item.loading;return item; }))); }
        catch (err) { /* Browsing still works when storage is unavailable. */ }
    }
    async function metadata(entry) {
        if (entry.stock) return {description:"Jibo's stock face and menus.",readme:'Restore the stock appearance by selecting None in BEacon.'};
        const source = locationFor(entry);const base = source.base;
        const repository = source.repository ? new URL(entry.url).pathname.split('/').filter(Boolean) : null;
        const developer = repository ? repository[0] : '';
        async function popularity() {
            if (!repository) return {};
            if (entry.starsFetchedAt && Date.now() - entry.starsFetchedAt < 60 * 60 * 1000) return {developer,stars:entry.stars,starsFetchedAt:entry.starsFetchedAt};
            try {
                const repo = JSON.parse(await text('https://api.github.com/repos/' + repository.map(encodeURIComponent).join('/'),false,1024*1024));
                return {developer:repo.owner && repo.owner.login || developer,stars:typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,starsFetchedAt:Date.now()};
            } catch (err) { return {developer,stars:typeof entry.stars === 'number' ? entry.stars : null,starsFetchedAt:Date.now()}; }
        }
        const results = await Promise.allSettled([
            (async () => {
                let raw = await text(source.manifest || base+'manifest.json',entry.section === 'skills',65536);
                const packageMetadata = raw === null;
                if (raw === null) raw = await text(base+'package.json',false,65536);
                const data = JSON.parse(raw);
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid package manifest');
                if (!packageMetadata && data.type && data.type !== (entry.section === 'themes'?'theme':'skill')) throw new Error('Unexpected package type');
                return data;
            })(),
            text(base+'README.md',true,256*1024), popularity()
        ]);
        const manifest = results[0].status === 'fulfilled' ? results[0].value : entry;
        const readme = results[1].status === 'fulfilled' ? results[1].value || '' : entry.readme || '';
        const errors = results.slice(0,2).filter(r => r.status === 'rejected').map(r => r.reason.message);
        return Object.assign({}, results[2].status === 'fulfilled' ? results[2].value : {developer}, {name:typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name : entry.name,version:typeof manifest.version === 'string' ? manifest.version : '',supported:typeof manifest.supported === 'string' ? manifest.supported : '',
            description:paragraph(readme) || (typeof manifest.description === 'string' && manifest.description) || entry.description || 'No description available.',readme,
            readmeUrl:base+'README.md',bannerUrl:base+'banner.png',error:errors.join('; ')});
    }
    function details(entry, button) {
        opener = button;$('#details-title').textContent=entry.name;
        $('#details-meta').textContent=[entry.version && 'Version '+entry.version,entry.supported && 'Needs version '+entry.supported,entry.error && 'Metadata unavailable: '+entry.error].filter(Boolean).join(' · ');
        const link=$('#details-source');link.hidden=!!entry.stock;
        if (!entry.stock) { link.href=entry.url;link.textContent=new URL(entry.url).hostname==='github.com'?'View repository':'View source'; }
        window.StoreMarkdown($('#details-readme'),entry.readme || entry.description || 'No README available.',{baseUrl:entry.readmeUrl});
        $('#details').hidden=false;document.body.classList.add('has-dialog');$('#close-details').focus();
    }
    function closeDetails() {
        $('#details').hidden=true;document.body.classList.remove('has-dialog');
        if (opener && opener.isConnected) opener.focus();else $('[data-category="'+category+'"]').focus();
    }
    function card(entry) {
        const node=el('article','store-card'),banner=el('div','store-card-banner'+(entry.stock?' store-none-banner':''));
        if (entry.stock) {const image=el('img','store-none-icon');image.src='assets/cancel.svg';image.alt='';banner.appendChild(image);}
        else {
            const fallback=el('div','store-banner-fallback',entry.name.charAt(0).toUpperCase());fallback.setAttribute('aria-hidden','true');banner.appendChild(fallback);
            if(entry.bannerUrl && safeUrl(entry.bannerUrl)) {
                const image=el('img','store-banner-image');image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';
                image.onload=()=>{fallback.hidden=true;};image.onerror=()=>{image.hidden=true;fallback.hidden=false;};image.src=entry.bannerUrl;banner.appendChild(image);
            }
        }
        node.appendChild(banner);const content=el('div','store-card-content');content.appendChild(el('h2','store-card-name',entry.name));
        if (!entry.stock) { const publisher=el('p','store-publisher');publisher.appendChild(el('span',null,entry.developer || 'Independent developer'));publisher.appendChild(el('span',null,'★ '+(typeof entry.stars==='number'?entry.stars.toLocaleString():'—')));content.appendChild(publisher); }
        content.appendChild(el('p','store-description',entry.loading?'Loading description…':entry.description || (entry.error?'Metadata unavailable. Use Retry to try again.':'No description available.')));
        const actions=el('div','store-actions'),button=el('button','btn store-details','Details');button.type='button';button.setAttribute('aria-label','Details for '+entry.name);
        button.addEventListener('click',()=>details(entry,button));actions.appendChild(button);
        if (!entry.stock) {const link=el('a','store-source-link','View source');link.href=entry.url;link.target='_blank';link.rel='noopener noreferrer';actions.appendChild(link);}
        content.appendChild(actions);node.appendChild(content);return node;
    }
    function render() {
        ['themes','skills'].forEach(section=>{
            const grid=$('#store-'+section);grid.textContent='';const list=entries.filter(e=>e.section===section);
            list.forEach(entry=>grid.appendChild(card(entry)));
            if(!list.length && !refreshing)grid.appendChild(el('p','empty',catalogError?'The storefront could not be loaded. Use Retry to try again.':'No '+section+' listed yet.'));
        });
        const failures=entries.filter(e=>e.error && e.section===category).length;$('#retry').hidden=!catalogError && !failures;
        $('#store-status').textContent=catalogError?'Unable to refresh storefront: '+catalogError+(entries.length?'. Showing cached entries.':''):
            entries.some(e=>e.loading)?'Loading storefront…':entries.filter(e=>e.section===category).length+' '+category+(failures?' · Some metadata could not be loaded.':'');
    }
    function choose(section, focus) {
        category=section;$('.store-switch').classList.toggle('is-skills',section==='skills');
        document.querySelectorAll('.store-switch-tab').forEach(button=>{const selected=button.dataset.category===section;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected && focus)button.focus();});
        $('#store-themes').hidden=section!=='themes';$('#store-skills').hidden=section!=='skills';render();
        $('#skills-notice').hidden=section!=='skills';
    }
    function refresh() {
        if(refreshing)return refreshing;
        refreshing=(async()=>{
            catalogError='';$('#store-status').textContent='Loading storefront…';$('#retry').disabled=true;
            try {
                const catalog=parseCatalog(JSON.parse(await text(new URL('manifest.json',location.href),false,1024*1024)));
                entries=catalog.map(item=>Object.assign({},cached.find(e=>e.section===item.section && e.url===item.url && !!e.stock===!!item.stock)||{},item,{loading:true,error:''}));render();
                let next=0;
                async function worker(){while(next<entries.length){const entry=entries[next++];try{Object.assign(entry,await metadata(entry));}catch(err){entry.error=err.message;}entry.loading=false;render();}}
                await Promise.all([worker(),worker(),worker()]);writeCache();cached=entries.slice();
            } catch(err){catalogError=err.message;}
        })().finally(()=>{refreshing=null;$('#retry').disabled=false;render();});
        return refreshing;
    }
    document.querySelectorAll('.store-switch-tab').forEach(button=>{
        button.addEventListener('click',()=>choose(button.dataset.category));
        button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();choose(event.key==='Home'?'themes':event.key==='End'?'skills':category==='themes'?'skills':'themes',true);}});
    });
    $('#retry').addEventListener('click',refresh);$('#close-details').addEventListener('click',closeDetails);
    $('#details').addEventListener('click',event=>{if(event.target===$('#details'))closeDetails();});
    document.addEventListener('keydown',event=>{
        if($('#details').hidden)return;
        if(event.key==='Escape'){event.preventDefault();closeDetails();}
        if(event.key==='Tab'){
            const controls=Array.from($('#details').querySelectorAll('button,a[href]')).filter(n=>!n.hidden && n.getClientRects().length);
            const first=controls[0],last=controls[controls.length-1];
            if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
        }
    });
    cached=readCache();entries=cached.slice();render();refresh();
    setInterval(()=>{if(!document.hidden)refresh();},60*60*1000);
}());
