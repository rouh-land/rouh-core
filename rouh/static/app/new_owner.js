/* Rouh's page, four genes for somebody setting Rouh up and finding their way (`rouh/new_owner.py`, night 54).
 *
 * Outside the chain, like app/first_help.js, and imported by app.js after it. The page is told which
 * are on, the steps, the tour and Rouh's pages in `#rouhNewOwner`:
 *
 * - key_steps: under each company on the Models page that has no key (`.prov-row` without `.on`,
 *   drawn by `providersDraw` in app/runs.js), a closed "No key yet? How to get one" with its steps
 *   and a link to where keys are made. It follows the rows as they are drawn again.
 * - show_around: the Guide's Show me around (handholdingpage.js sends `rouh:show-around`) points at
 *   each part of the screen in turn, with Back, Next and Done; Escape or the cross ends it.
 * - page_links: in Rouh's answers, the name of one of Rouh's own pages is a link that opens it, with
 *   what it is for as its title, the way a task's number is (`taskRefs` in app/transcript.js).
 * - key_clean is the server's alone (`rouh/new_owner.py`).
 */
import { $, el, linkTo } from 'app/helpers.js';
import { goToAddress } from 'app/cards.js';
import { narrow, setPane } from 'app/controls.js';

/** @type {{on: string[], steps: Record<string, {where: string, site: string, steps: string[]}>,
 *          tour: {at: string, title: string, says: string}[],
 *          pages: {name: string, route: string, common: boolean, plain: string}[]}} */
var OWNER = (function () {
  try {
    var node = document.getElementById('rouhNewOwner');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], steps: got.steps || {},
             tour: Array.isArray(got.tour) ? got.tour : [], pages: Array.isArray(got.pages) ? got.pages : [] };
  } catch (err) { return { on: [], steps: {}, tour: [], pages: [] }; }
}());

/** @param {string} name */
function ownerOn(name) { return OWNER.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function ownerUsed(name, event, detail) {
  fetch('/api/new-owner', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* ---------- key_steps ---------- */

var OUT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16L16 8M9 8h7v7"/></svg>';

/** The closed "No key yet?" under one company's row. @param {string} id */
function keyHow(id) {
  var s = OWNER.steps[id];
  var box = /** @type {HTMLDetailsElement} */ (el('details', 'prov-how'));
  box.setAttribute('data-how', id);
  var sum = el('summary', null, 'No key yet? How to get one');
  box.appendChild(sum);
  var body = el('div', 'prov-how-body');
  var ol = el('ol', 'prov-how-steps');
  s.steps.forEach(function (t) { ol.appendChild(el('li', null, t)); });
  body.appendChild(ol);
  var a = /** @type {HTMLAnchorElement} */ (el('a', 'prov-how-open'));
  a.href = s.where;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Open ' + s.site + ' ';
  a.insertAdjacentHTML('beforeend', OUT);
  body.appendChild(a);
  box.appendChild(body);
  box.addEventListener('toggle', function () { if (box.open) ownerUsed('key_steps', 'opened', id); });
  return box;
}

function keySteps() {
  var box = $('modelProviders');
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('.prov-row[data-provider]'), function (/** @type {HTMLElement} */ row) {
    var id = row.getAttribute('data-provider') || '';
    var how = row.querySelector('.prov-how');
    var want = !row.classList.contains('on') && !!OWNER.steps[id] && !!row.querySelector('.prov-form');
    if (want && !how) row.appendChild(keyHow(id));
    else if (!want && how) how.remove();
  });
}

if (ownerOn('key_steps')) {
  var keyWatch = new MutationObserver(function () { keySteps(); });
  var keyStart = function () {
    var box = $('modelProviders');
    if (!box) return;
    keyWatch.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    keySteps();
  };
  keyStart();
}

/* ---------- show_around ---------- */

/** @type {{at: number, stops: {node: HTMLElement, title: string, says: string}[], ring: HTMLElement|null,
 *          card: HTMLElement|null, back: Element|null}} */
var TOUR = { at: -1, stops: [], ring: null, card: null, back: null };

/** Whether a part of the screen is there to point at. @param {HTMLElement} n */
function shown(n) {
  if (!n || n.hidden || n.closest('[hidden]')) return false;
  var r = n.getBoundingClientRect();
  return r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0
    && r.top < window.innerHeight && r.left < window.innerWidth;
}

function tourStops() {
  var out = [];
  OWNER.tour.forEach(function (s) {
    var n = /** @type {HTMLElement|null} */ (document.querySelector(s.at));
    if (n && shown(n)) out.push({ node: n, title: s.title, says: s.says });
  });
  return out;
}

function tourPlace() {
  var stop = TOUR.stops[TOUR.at], ring = TOUR.ring, card = TOUR.card;
  if (!stop || !ring || !card) return;
  var r = stop.node.getBoundingClientRect(), pad = 6;
  var top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
  var w = Math.min(window.innerWidth - 8, r.right + pad) - left, h = Math.min(window.innerHeight - 8, r.bottom + pad) - top;
  ring.style.top = top + 'px'; ring.style.left = left + 'px';
  ring.style.width = w + 'px'; ring.style.height = h + 'px';
  var cw = Math.min(340, window.innerWidth - 32);
  card.style.width = cw + 'px';
  var ch = card.offsetHeight;
  // Below the part when it fits, above it when that fits, else over its middle.
  var y = top + h + 10;
  if (y + ch > window.innerHeight - 8) y = top - ch - 10;
  if (y < 8) y = Math.max(8, Math.min(window.innerHeight - ch - 8, top + h / 2 - ch / 2));
  var x = Math.max(16, Math.min(window.innerWidth - cw - 16, left + w / 2 - cw / 2));
  card.style.top = y + 'px'; card.style.left = x + 'px';
}

function tourDraw() {
  var stop = TOUR.stops[TOUR.at], card = TOUR.card;
  if (!stop || !card) return;
  card.textContent = '';
  var head = el('div', 'tour-head');
  head.appendChild(el('span', 'tour-count', (TOUR.at + 1) + ' of ' + TOUR.stops.length));
  var x = /** @type {HTMLButtonElement} */ (el('button', 'tour-x', '×'));
  x.type = 'button';
  x.setAttribute('aria-label', 'End the tour');
  x.addEventListener('click', function () { tourEnd(false); });
  head.appendChild(x);
  card.appendChild(head);
  var h = el('h3', 'tour-title', stop.title);
  h.id = 'tourTitle';
  card.appendChild(h);
  var p = el('p', 'tour-says', stop.says);
  p.id = 'tourSays';
  card.appendChild(p);
  var row = el('div', 'tour-btns');
  if (TOUR.at > 0) {
    var b = /** @type {HTMLButtonElement} */ (el('button', 'ctl small', 'Back'));
    b.type = 'button';
    b.addEventListener('click', function () { tourGo(TOUR.at - 1); });
    row.appendChild(b);
  }
  var last = TOUR.at === TOUR.stops.length - 1;
  var n = /** @type {HTMLButtonElement} */ (el('button', 'ctl small primary', last ? 'Done' : 'Next'));
  n.type = 'button';
  n.addEventListener('click', function () { if (last) tourEnd(true); else tourGo(TOUR.at + 1); });
  row.appendChild(n);
  card.appendChild(row);
  tourPlace();
  n.focus({ preventScroll: true });
}

/** @param {number} i */
function tourGo(i) {
  if (i < 0 || i >= TOUR.stops.length) return;
  TOUR.at = i;
  tourDraw();
}

/** @param {KeyboardEvent} e */
function tourKey(e) {
  if (TOUR.at < 0) return;
  if (e.key === 'Escape') { e.preventDefault(); tourEnd(false); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); tourGo(TOUR.at + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tourGo(TOUR.at - 1); }
}

/** @param {boolean} whole */
function tourEnd(whole) {
  if (TOUR.at < 0) return;
  if (whole) ownerUsed('show_around', 'finished', String(TOUR.stops.length));
  TOUR.at = -1;
  if (TOUR.ring) TOUR.ring.remove();
  if (TOUR.card) TOUR.card.remove();
  TOUR.ring = TOUR.card = null;
  document.removeEventListener('keydown', tourKey, true);
  window.removeEventListener('resize', tourPlace);
  var back = /** @type {HTMLElement|null} */ (TOUR.back);
  TOUR.back = null;
  if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
}

function tourStart() {
  if (!ownerOn('show_around') || TOUR.at >= 0) return;
  // On a phone the chat and the canvas take turns on the screen: the tour is of the chat's side,
  // where a newcomer talks to Rouh, once it is there.
  if (narrow()) { setPane('chat'); window.setTimeout(tourBegin, 350); }
  else tourBegin();
}

function tourBegin() {
  if (TOUR.at >= 0) return;
  var stops = tourStops();
  if (!stops.length) return;
  TOUR.stops = stops;
  TOUR.back = document.activeElement;
  var ring = el('div', 'tour-ring');
  ring.setAttribute('aria-hidden', 'true');
  var card = el('div', 'tour-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tourTitle');
  card.setAttribute('aria-describedby', 'tourSays');
  document.body.appendChild(ring);
  document.body.appendChild(card);
  TOUR.ring = ring; TOUR.card = card;
  document.addEventListener('keydown', tourKey, true);
  window.addEventListener('resize', tourPlace);
  ownerUsed('show_around', 'started', String(stops.length));
  tourGo(0);
}
window.addEventListener('rouh:show-around', tourStart);

/* ---------- page_links ---------- */

var PAGE_SKIP = 'a, code, pre, button, sup.cites, .sources-list, .turn-acts, .card-head, .tool, .task-ref, .page-ref';
/** @type {RegExp|null} */
var PAGE_MARK = null;
/** @type {Record<string, {name: string, route: string, common: boolean, plain: string}>} */
var PAGE_BY = {};
if (ownerOn('page_links') && OWNER.pages.length) {
  OWNER.pages.forEach(function (p) { PAGE_BY[p.name] = p; });
  var alt = OWNER.pages.map(function (p) { return p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
  PAGE_MARK = new RegExp('(?<![\\w-])(' + alt + ')(?![\\w-])', 'g');
}

/** Whether the name at `at` begins a sentence. @param {string} text @param {number} at */
function sentenceStart(text, at) {
  var before = text.slice(0, at).replace(/[\s"'(“*_]+$/, '');
  return !before || /[.!?:\n]$/.test(before);
}

/** @param {{name: string, route: string, plain: string}} p */
function pageLink(p) {
  var a = /** @type {HTMLAnchorElement} */ (el('a', 'page-ref', p.name));
  linkTo(a, p.route);
  a.title = p.plain ? p.name + ': ' + p.plain : 'Open ' + p.name;
  a.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    ownerUsed('page_links', 'opened', p.name);
    goToAddress(p.route);
  });
  return a;
}

/** @param {Text} node */
function pageText(node) {
  var text = node.nodeValue || '', m, last = 0, any = false;
  var parts = document.createDocumentFragment();
  if (!PAGE_MARK) return;
  PAGE_MARK.lastIndex = 0;
  while ((m = PAGE_MARK.exec(text))) {
    var p = PAGE_BY[m[1]];
    if (!p || (p.common && sentenceStart(text, m.index))) continue;
    parts.appendChild(document.createTextNode(text.slice(last, m.index)));
    parts.appendChild(pageLink(p));
    last = m.index + m[0].length;
    any = true;
  }
  if (!any || !node.parentNode) return;
  parts.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(parts, node);
}

/** @param {Element} root */
function pageRefs(root) {
  var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var hits = [], node;
  while ((node = walk.nextNode())) {
    if (node.parentElement && node.parentElement.closest(PAGE_SKIP)) continue;
    if (PAGE_MARK) { PAGE_MARK.lastIndex = 0; if (PAGE_MARK.test(node.nodeValue || '')) hits.push(node); }
  }
  hits.forEach(function (n) { pageText(/** @type {Text} */ (n)); });
}

var pageTimer = 0;
function pageSweep() {
  pageTimer = 0;
  // Rouh's answers only: the person's own words are left as they typed them. Each rendering of an
  // answer is a new block, so one already done is marked and a redrawn one is done again.
  Array.prototype.forEach.call(document.querySelectorAll('.turn:not(.user) .rendered > :not([data-pages])'),
    function (/** @type {HTMLElement} */ b) { b.setAttribute('data-pages', '1'); pageRefs(b); });
}
if (PAGE_MARK) {
  new MutationObserver(function () {
    if (!pageTimer) pageTimer = window.setTimeout(pageSweep, 120);
  }).observe(document.body, { childList: true, subtree: true });
  pageSweep();
}

export { tourStart };
