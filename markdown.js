/* Safe README rendering shared with the BEacon Store. */
(function () {
    'use strict';
    function el(tag, css, text) { const n=document.createElement(tag);if(css)n.className=css;if(text!==undefined)n.textContent=String(text);return n; }
    function imageUrl(value, options) {
        var target = value.trim().replace(/^<([^<>]+)>$/, '$1');
        if (/[\u0000-\u0020\u007f]/.test(target)) { return null; }
        var local = target.replace(/^(?:\.\/)+/, '');
        if (options.assetBase && options.images && options.images[local]) {
            return options.assetBase + encodeURIComponent(local);
        }
        try {
            var resolved = options.baseUrl ? new URL(target, options.baseUrl) : new URL(target);
            return /^https?:$/.test(resolved.protocol) && !resolved.username && !resolved.password ? resolved.href : null;
        } catch (err) { return null; }
    }
    function inline(node, text, options) {
        var pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
        var match, end = 0;
        while ((match = pattern.exec(text))) {
            node.appendChild(document.createTextNode(text.slice(end, match.index)));
            if (match[3] !== undefined) {
                if (match[1] === '!') {
                    var src = imageUrl(match[3], options);
                    if (src) {
                        var image = el('img', 'theme-readme-image'); image.src = src; image.alt = match[2];
                        image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
                        image.onerror = function () { this.hidden = true; };
                        node.appendChild(image);
                    } else { node.appendChild(document.createTextNode(match[2])); }
                } else if (/^https?:\/\//i.test(match[3])) {
                    var a = el('a', null, match[2]); a.href = match[3]; a.target = '_blank'; a.rel = 'noopener noreferrer'; node.appendChild(a);
                } else { node.appendChild(document.createTextNode(match[2])); }
            } else { node.appendChild(el(match[4] ? 'strong' : match[5] ? 'code' : 'em', null, match[4] || match[5] || match[6])); }
            end = pattern.lastIndex;
        }
        node.appendChild(document.createTextNode(text.slice(end)));
    }
    function markdown(node, text, options) {
        options = options || {};
        node.textContent = '';
        var lines = String(text || '').split(/\r?\n/), paragraph = [], code = null, list = null;
        function flush() {
            if (paragraph.length) { var p = el('p'); inline(p, paragraph.join(' '), options); node.appendChild(p); paragraph = []; }
        }
        lines.forEach(function (line) {
            if (/^```|^~~~/.test(line)) {
                flush(); list = null;
                if (code) { node.appendChild(el('pre', null, code.join('\n'))); code = null; } else { code = []; } return;
            }
            if (code) { code.push(line); return; }
            var h = line.match(/^(#{1,6})\s+(.+)$/), item = line.match(/^\s*(?:[-*+] |\d+\. )(.+)$/);
            if (h) { flush(); list = null; var heading = el('h' + h[1].length); inline(heading, h[2], options); node.appendChild(heading); }
            else if (item) { flush(); if (!list) { list = el('ul'); node.appendChild(list); } var li = el('li'); inline(li, item[1], options); list.appendChild(li); }
            else if (!line.trim()) { flush(); list = null; }
            else { list = null; paragraph.push(line); }
        });
        flush(); if (code) { node.appendChild(el('pre', null, code.join('\n'))); }
    }
    window.StoreMarkdown = markdown;
}());
