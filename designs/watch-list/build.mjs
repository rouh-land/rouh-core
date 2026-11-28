// Builds the watch list prototype (step 202-05 of task 202): one self-contained folder per state, from the
// real page script and styles and the stand-in API in mock.js, with made-up titles and people only.
//   node designs/watch-list/build.mjs [folder with watchlistpage.js and watchlistpage.css]
// The folder defaults to rouh/static; the first build read a staged copy, before the screen's code changed.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const src = process.argv[2] || path.join(here, '..', '..', 'rouh', 'static');
const js = fs.readFileSync(path.join(src, 'watchlistpage.js'), 'utf8');
const css = fs.readFileSync(path.join(src, 'watchlistpage.css'), 'utf8');
const mock = fs.readFileSync(path.join(here, 'mock.js'), 'utf8');
// Rouh's own dark tokens and controls, as the layer sits in Rouh (app.css); the list's light set is its own.
const rouh = `:root{--bg:#0a0c10;--bg-2:#0e1116;--panel:#12161c;--panel-2:#171c24;--line:#232a34;--line-soft:#1b2129;--text:#e7ecf3;
--dim:#8d9aac;--dimmer:#64707f;--accent:#5ec2ff;--accent-ink:#04121c;--accent-soft:rgba(94,194,255,.14);--warn:#f2b45e;
--bad:#ff7a70;--focus:#ffd76a;--radius:14px;--radius-s:9px;--shadow:0 1px 2px rgba(0,0,0,.5),0 12px 30px rgba(0,0,0,.35);color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:#0a0c10;color:var(--text);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.ctl{appearance:none;cursor:pointer;display:flex;align-items:center;gap:9px;background:var(--panel-2);border:1px solid var(--line);
color:var(--text);padding:9px 12px;border-radius:var(--radius-s);font:inherit;font-size:13px;text-align:left;width:100%;text-decoration:none}
.ctl:hover{border-color:var(--dim)}.ctl:disabled{opacity:.5;cursor:default}.ctl svg{flex:0 0 auto;color:var(--dim)}
.ctl.small{width:auto;padding:4px 10px;font-size:12px;color:var(--dim);background:transparent}.ctl.small:hover{color:var(--text)}
#watchView{position:relative;display:flex;flex-direction:column;height:100%;padding:16px 20px 0;max-width:1440px;margin:0 auto;
background:var(--bg);color:var(--text)}
@media (max-width:560px){#watchView{padding:12px 12px 0}}
.run-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px}
.run-head h3{margin:0;font-size:16px}.layer-x{appearance:none;border:0;background:none;color:var(--dim);font-size:24px;width:44px;height:44px;cursor:pointer}`;
const guestBar = `@media (prefers-color-scheme: light){:root{--bg:#f5f6f8;--line:#cfd5dd;--text:#12161c;--dim:#4b5664;--accent:#0a64a4;color-scheme:light}}
.bar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;background:var(--bg)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}.ttl{font-weight:650}.by{color:var(--dim);font-size:13px}.sp{flex:1}
.bar a{color:var(--accent);font-size:13px;min-height:44px;display:inline-flex;align-items:center}
body.guest #watchView{height:calc(100% - 65px)}@media (max-width:560px){.by{display:none}}`;
function page({ as = 'petar', set = 'full', title = 'Watch list', open = '', after = '', list = '', ro = false }) {
  const guest = as !== 'petar';
  const host = guest
    ? "{guest:true,api:'/shared/demo/watch/api/watch',href:function(n){return '?t='+n;},focus:function(){}}"
    : "{href:function(n){return '?t='+n;},focus:function(){}}";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${rouh}${guest ? guestBar : ''}
${css}
</style></head><body${guest ? ' class="guest"' : ''}>
${guest ? '<header class="bar"><span class="dot" aria-hidden="true"></span><span class="ttl">Alex and Mira</span><span class="by">Shared by Alex</span><span class="sp"></span><a href="#">Shared with you</a><a href="#">Sign out</a></header>' : ''}
<article id="watchView" class="wl-view" aria-label="Watch list">
${guest ? '' : '<div class="run-head"><h3>Watch list</h3><button id="watchClose" class="layer-x" type="button" aria-label="Close">&times;</button></div>'}
<div id="watchMeta" class="wl-sr"></div>
<div class="wl-wrap"><div id="watchBody" class="wl-body"></div></div></article>
<script>window.PROTO_AS=${JSON.stringify(as)};window.PROTO_SET=${JSON.stringify(set)};window.PROTO_RO=${ro};
try{localStorage.removeItem('rouh.watch.list');${list ? `localStorage.setItem('rouh.watch.list',${JSON.stringify(list)});` : ''}}catch(e){}
window.RouhWatchHost=${host};</script>
<script>${mock}</script>
<script>${js}</script>
<script>RouhWatch.shown(new URLSearchParams(location.search).get('t')||${JSON.stringify(open)});
${after ? `setTimeout(function(){${after}},150);` : ''}</script>
</body></html>`;
}
const states = {
  'a-evening': { title: 'Watch list' },
  'a-evening-title': { title: 'Harbour Lights - Watch list', open: '2' },
  'a-evening-filters': { title: 'Watch list, filtered', after: "document.getElementById('wlFilterB').click();" },
  'a-evening-today': { title: 'Watch list, three titles', set: 'small' },
  'a-evening-other': { title: 'Alex and Mira', as: 'maria' },
  'a-evening-shared': { title: 'Alex and Mira - Watch list', list: '1' },
  'a-evening-own': { title: 'With the kids - Watch list', list: '3' },
  'a-evening-lists': { title: 'Watch list, ten lists', set: 'many', list: '0' },
  'a-evening-again': { title: 'The Long Orbit - Watch list', open: '9' },
  'a-evening-pointer': { title: 'Watch list, a watched match', list: '1', after: "var s=document.getElementById('wlSearch');s.value='Iron';s.dispatchEvent(new Event('input'));setTimeout(function(){s.scrollIntoView({block:'start'});},50);" },
  'a-evening-empty': { title: 'Watch list, empty', set: 'empty' },
  'a-evening-look': { title: 'Alex and Mira, only to look', as: 'maria', ro: true },
  'a-evening-toast': { title: 'Watch list, just watched', list: '0', after: "document.querySelector('.wl-card .wl-quick').click();" },
  'a-evening-filtered': { title: 'Watch list, a tag on', list: '0', after: "document.getElementById('wlFilterB').click();setTimeout(function(){[].find.call(document.querySelectorAll('.wl-opt'),function(b){return /cosy/.test(b.textContent)}).click();setTimeout(function(){document.getElementById('wlFilterB').click();},100);},100);" },
};
for (const [dir, s] of Object.entries(states)) {
  fs.mkdirSync(path.join(here, dir), { recursive: true });
  fs.writeFileSync(path.join(here, dir, 'index.html'), page(s));
}
console.log('built', Object.keys(states).join(', '), 'from', src);
