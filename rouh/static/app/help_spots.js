/* Help icons on the screen (`rouh/help_spots.py`): a small ? beside a word of Rouh's own.
 *
 * The owner, 25 November 2026: "one icon setting everywhere with hover/tap a sentence and a link to the
 * full guide ... if we click 'done' this icon disappears from that specific location". So:
 *
 * - The words are the Guide's (`spots` in rouh/handholding.json), handed to the page in `#rouhHelpSpots`.
 * - Where each sits is said here (`PLACES`): an element on screen, or the heading of one of Rouh's pages
 *   (`.run-heading > h3`) by the name it says (a spot's `heading`), which takes the place of What is this
 *   page? (`page_what`, app/first_help.js, which steps aside while this is on).
 * - Quiet: at most `most.desk` (3) on the main screen at a desk and `most.phone` (2) on a phone, the most
 *   basic first (`rank`); a page's own heading and a run's head always have theirs. Put one away and the
 *   next appears.
 * - Hover at a desk, or the keyboard, shows the card beside the icon; a press pins it; on a phone a tap
 *   opens it just above the message box. Got it puts that spot away for the person on every device; it
 *   also goes by itself once the thing it sits on was pressed `uses` (5) times in this browser, or once
 *   its tip is ticked in the Guide (the server's). Hide all help, with Undo; Show help again in About you.
 * - What the server could not be told (offline) is kept in this browser and told on the next chance.
 *
 * Outside the chain, like app/first_help.js, and imported by app.js after it.
 */
import { $ } from 'app/helpers.js';

/** @typedef {{name: string, say: string, lesson: string, title: string, route: string, section: string,
 *             rank: number, heading: string}} HelpSpot */
/** @typedef {{on: boolean, spots: Record<string, HelpSpot>, done: string[], off: boolean, read: number,
 *             total: number, most: {desk: number, phone: number}, uses: number}} HelpState */

/** @type {HelpState} */
var S = (function () {
  /** @type {HelpState} */
  var none = { on: false, spots: {}, done: [], off: false, read: 0, total: 0, most: { desk: 3, phone: 2 }, uses: 5 };
  try {
    var node = document.getElementById('rouhHelpSpots');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    if (!got || !got.on) return none;
    return { on: true, spots: got.spots || {}, done: Array.isArray(got.done) ? got.done : [], off: !!got.off,
             read: Number(got.read) || 0, total: Number(got.total) || 0, most: got.most || none.most,
             uses: Number(got.uses) || 5 };
  } catch (err) { return none; }
}());

/* Where each spot sits on the main screen and on the layers that are not a page of their own. `at` is
   the element it goes beside (the first one on screen wins), `how` is `end` (inside it, after its words),
   `after` (right after it) or `orb` (on the orb's rim); `use` is what pressing counts as using it; `layer`
   is never held back by the main screen's limit. */
/** @type {{spot: string, at: string, how: string, use?: string, layer?: boolean}[]} */
var PLACES = [
  { spot: 'orb', at: '#orbBox', how: 'orb', use: '#orbOpen' },
  { spot: 'chat', at: '#transcriptEmpty', how: 'end', use: '#sendBtn' },
  { spot: 'canvas', at: '#cardsEmpty .at-desk', how: 'end', use: '#cards .card, #canvasBar' },
  { spot: 'canvas', at: '#canvasCrumb', how: 'after', use: '#cards .card, #canvasBar' },
  { spot: 'notices', at: '#ntHead .nt-title h2', how: 'end', use: '#noticeBell', layer: true },
  { spot: 'run', at: '#oneTitle', how: 'after', layer: true },
  { spot: 'run', at: '#jobTitle', how: 'after', layer: true }
];

var KEY_USES = 'rouh.helpuse.v1';
var KEY_LATER = 'rouh.helplater.v1';
var DONE = /** @type {Record<string, boolean>} */ ({});
S.done.forEach(function (id) { DONE[id] = true; });

function phone() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
}
function canHover() {
  return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
}
/** @param {Element} node */
function onScreen(node) {
  if (!node.isConnected || !node.getClientRects().length) return false;
  var hid = node.closest('[hidden]');
  return !hid;
}
/** Under a page opened over the canvas (a `.canvas-layer`), what is on the canvas itself is out of
    sight. @param {Element} node */
function covered(node) {
  var panel = $('canvasPanel');
  if (!panel || !panel.contains(node) || node.closest('.canvas-layer')) return false;
  return Array.prototype.some.call(panel.querySelectorAll('.canvas-layer'), function (/** @type {Element} */ l) {
    return !l.hasAttribute('hidden') && l.getClientRects().length > 0;
  });
}
/** @param {string} id */
function wanted(id) { return S.on && !S.off && !DONE[id] && !!S.spots[id]; }

/* ---------- telling the server ---------- */

/** @returns {{act: string, spot: string}[]} */
function later() {
  try { var got = JSON.parse(localStorage.getItem(KEY_LATER) || '[]'); return Array.isArray(got) ? got : []; }
  catch (err) { return []; }
}
/** @param {{act: string, spot: string}[]} list */
function keepLater(list) {
  try { localStorage.setItem(KEY_LATER, JSON.stringify(list.slice(-60))); } catch (err) { /* this visit only */ }
}
/** One thing done, told to the server; kept for later when it cannot be. @param {string} act @param {string} [spot]
    @param {boolean} [again] a retry, never kept twice */
function tell(act, spot, again) {
  var body = { act: act, spot: spot || '' };
  return fetch('/api/help-spots', { method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) {
      if (r.ok) return r.json().then(function (got) { taken(got); if (!again) sendLater(); return true; });
      return false;  // refused: nothing to try again
    })
    .catch(function () {
      if (!again && (act === 'got_it' || act === 'used' || act === 'hide_all' || act === 'unhide' || act === 'show_again')) {
        keepLater(later().concat([body]));
      }
      return false;
    });
}
function sendLater() {
  var list = later();
  if (!list.length) return;
  keepLater([]);
  list.reduce(function (/** @type {Promise<any>} */ p, b) {
    return p.then(function () { return tell(b.act, b.spot, true).then(function (ok) { if (!ok) keepLater(later().concat([b])); }); });
  }, Promise.resolve());
}
window.addEventListener('online', sendLater);

/** The server's word on what is put away. @param {any} got */
function taken(got) {
  if (!got || !got.on) return;
  S.off = !!got.off;
  S.read = Number(got.read) || 0;
  S.total = Number(got.total) || S.total;
  var now = /** @type {Record<string, boolean>} */ ({});
  (got.done || []).forEach(function (/** @type {string} */ id) { now[id] = true; });
  // A spot put away here and not yet told stays away.
  later().forEach(function (b) { if (b.act === 'got_it' || b.act === 'used') now[b.spot] = true; });
  DONE = now;
  soon();
}

/* ---------- the card ---------- */

var card = document.createElement('div');
card.className = 'help-card';
card.id = 'helpCard';
card.setAttribute('role', 'dialog');
card.setAttribute('aria-modal', 'false');
card.setAttribute('aria-labelledby', 'helpCardName');
card.setAttribute('aria-describedby', 'helpCardSay');
card.hidden = true;
card.innerHTML = '<p class="help-card-name" id="helpCardName"></p><p class="help-card-say" id="helpCardSay"></p>'
  + '<a class="help-card-more" id="helpCardMore" href="/guide"></a>'
  + '<div class="help-card-acts"><button type="button" class="help-card-all" id="helpCardAll">Hide all help</button>'
  + '<button type="button" class="ctl small primary help-card-done" id="helpCardDone">Got it</button></div>';
var toast = document.createElement('div');
toast.className = 'help-toast';
toast.setAttribute('role', 'status');
toast.hidden = true;
toast.innerHTML = '<span>Help icons put away. Bring them back in About you.</span>'
  + '<button type="button" class="ctl small" id="helpToastUndo">Undo</button>';
if (S.on) { document.body.appendChild(card); document.body.appendChild(toast); }

var OPEN = { icon: /** @type {HTMLButtonElement | null} */ (null), id: '', pinned: false, leave: 0, enter: 0,
             back: /** @type {Element | null} */ (null) };

/** @param {HTMLButtonElement} icon @param {boolean} pin */
function show(icon, pin) {
  var id = icon.dataset.spot || '', s = S.spots[id];
  if (!s) return;
  clearTimeout(OPEN.leave);
  if (OPEN.icon && OPEN.icon !== icon) OPEN.icon.setAttribute('aria-expanded', 'false');
  var first = OPEN.id !== id;
  OPEN.icon = icon;
  OPEN.id = id;
  OPEN.pinned = pin || (OPEN.pinned && !first);
  icon.setAttribute('aria-expanded', 'true');
  $('helpCardName').textContent = s.name;
  $('helpCardSay').textContent = s.say;
  var more = /** @type {HTMLAnchorElement} */ ($('helpCardMore'));
  more.href = s.route || '/guide';
  more.textContent = s.title ? 'Read more in the Guide: ' + s.title : 'Open the Guide';
  // The Guide's own name needs no link to the Guide.
  more.hidden = !s.lesson && s.heading === 'Guide';
  card.hidden = false;
  place(icon);
  if (first) tell('opened', id);
  if (pin) $('helpCardDone').focus({ preventScroll: true });
}
/** @param {HTMLElement} icon */
function place(icon) {
  card.style.left = card.style.top = card.style.bottom = card.style.right = '';
  if (phone()) {
    // Just above the message box, never over it; at the foot of the screen where there is none.
    var box = $('composer'), foot = 8;
    if (box && onScreen(box)) {
      var r = box.getBoundingClientRect();
      if (r.top > window.innerHeight / 2) foot = Math.max(8, window.innerHeight - r.top + 8);
    }
    card.style.bottom = foot + 'px';
    return;
  }
  var at = icon.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
  var left = Math.min(Math.max(8, at.left - 12), window.innerWidth - w - 8);
  var top = at.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, at.top - h - 8);
  card.style.left = left + 'px';
  card.style.top = top + 'px';
}
/** @param {boolean} [back] put the focus back on the icon */
function close(back) {
  clearTimeout(OPEN.leave);
  var icon = OPEN.icon;
  if (!icon) return;
  icon.setAttribute('aria-expanded', 'false');
  OPEN.icon = null;
  OPEN.id = '';
  OPEN.pinned = false;
  card.hidden = true;
  // The focus put back is not a new arrival: it does not open the card again.
  if (back && icon.isConnected) { OPEN.back = icon; icon.focus({ preventScroll: true }); OPEN.back = null; }
}
function leaveSoon() {
  if (OPEN.pinned) return;
  clearTimeout(OPEN.leave);
  OPEN.leave = window.setTimeout(function () { if (!OPEN.pinned) close(); }, 300);
}
card.addEventListener('mouseenter', function () { clearTimeout(OPEN.leave); });
card.addEventListener('mouseleave', leaveSoon);

/** Put one away: here at once, on the server as soon as it answers. @param {string} id @param {string} how */
function putAway(id, how) {
  if (!id || DONE[id]) return;
  DONE[id] = true;
  S.read += 1;
  tell(how, id);
  sync();
}

$('helpCardDone').addEventListener('click', function () {
  var icon = OPEN.icon, id = OPEN.id, by = icon && icon.matches(':focus-within, :focus') || document.activeElement === $('helpCardDone');
  var host = icon && /** @type {HTMLElement | null} */ (icon.previousElementSibling || icon.parentElement);
  close();
  putAway(id, 'got_it');
  // Back to what it was beside, when that can hold the focus; otherwise nowhere in particular.
  if (by) {
    var to = host && host.closest('button, a[href], [tabindex]');
    if (to) /** @type {HTMLElement} */ (to).focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement !== document.body) /** @type {HTMLElement} */ (document.activeElement).blur();
  }
});
$('helpCardAll').addEventListener('click', function () {
  close();
  S.off = true;
  tell('hide_all');
  sync();
  toast.hidden = false;
  toastLater(8000);
  $('helpToastUndo').focus({ preventScroll: true });
});
/** Put the notice away in `ms`, but never while the pointer or the focus is on it. @param {number} ms */
function toastLater(ms) {
  clearTimeout(Number(toast.dataset.timer || 0));
  toast.dataset.timer = String(window.setTimeout(function () {
    if (toast.matches(':hover') || toast.contains(document.activeElement)) { toastLater(2000); return; }
    toast.hidden = true;
  }, ms));
}
$('helpToastUndo').addEventListener('click', function () {
  toast.hidden = true;
  S.off = false;
  tell('unhide');
  sync();
});
$('helpCardMore').addEventListener('click', function (e) {
  var me = /** @type {MouseEvent} */ (e);
  var id = OPEN.id, s = S.spots[id];
  tell('guide', id);
  if (me.ctrlKey || me.metaKey || me.shiftKey || me.button) return;
  var host = window.RouhHandholdingHost;
  if (!host || !host.show) return;
  e.preventDefault();
  close();
  if (s && s.section && window.RouhHandholding && window.RouhHandholding.aim) window.RouhHandholding.aim(s.section);
  host.show((s && s.route) || '/guide');
});

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || !OPEN.icon) return;
  var inside = card.contains(/** @type {Node} */ (e.target)) || e.target === OPEN.icon;
  if (!inside && !OPEN.pinned) { close(); return; }
  e.preventDefault();
  e.stopPropagation();
  close(inside);
}, true);
document.addEventListener('pointerdown', function (e) {
  var t = /** @type {Element} */ (e.target);
  if (!OPEN.icon || !t || !t.closest) return;
  if (t.closest('#helpCard') || t.closest('.help-spot')) return;
  close();
}, true);
window.addEventListener('resize', function () { if (OPEN.icon) place(OPEN.icon); });

/* ---------- the icons ---------- */

/** @param {string} id */
function makeIcon(id) {
  var s = S.spots[id];
  var b = /** @type {HTMLButtonElement} */ (document.createElement('button'));
  b.type = 'button';
  b.className = 'help-spot';
  b.dataset.spot = id;
  b.textContent = '?';
  b.setAttribute('aria-label', 'What is ' + s.name.replace(/^The /, 'the ') + '?');
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-controls', 'helpCard');
  b.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (OPEN.icon === b && OPEN.pinned) close(true); else show(b, true);
  });
  // The orb and the rows under it act on a press of their own: this one is the icon's alone.
  b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  b.addEventListener('mouseenter', function () {
    if (!canHover() || phone() || (OPEN.pinned && OPEN.icon !== b)) return;
    clearTimeout(OPEN.leave);
    clearTimeout(OPEN.enter);
    OPEN.enter = window.setTimeout(function () { if (b.isConnected) show(b, false); }, 150);
  });
  b.addEventListener('mouseleave', function () { clearTimeout(OPEN.enter); leaveSoon(); });
  b.addEventListener('focus', function () { if (OPEN.back !== b && !OPEN.pinned && b.matches(':focus-visible')) show(b, false); });
  b.addEventListener('blur', function () {
    window.setTimeout(function () {
      if (!OPEN.pinned && OPEN.icon === b && !card.contains(document.activeElement) && !b.matches(':hover')) close();
    }, 0);
  });
  return b;
}

/** Where each spot that should show is now, with the main screen's limit kept. */
function wantedNow() {
  /** @type {{id: string, host: Element, how: string}[]} */
  var out = [];
  if (!S.on || S.off) return out;
  /** @type {{id: string, host: Element, how: string, rank: number, at: number}[]} */
  var main = [];
  var seen = /** @type {Record<string, boolean>} */ ({});
  PLACES.forEach(function (p, at) {
    if (seen[p.spot] || !wanted(p.spot)) return;
    var host = document.querySelector(p.at);
    if (!host || !onScreen(host) || covered(host)) return;
    if (p.how === 'orb') {
      var layer = $('orbLayer');
      if (!layer || layer.getAttribute('data-orb') !== 'corner') return;
    }
    seen[p.spot] = true;
    var row = { id: p.spot, host: host, how: p.how, rank: S.spots[p.spot].rank || 2, at: at };
    if (p.layer) out.push(row); else main.push(row);
  });
  main.sort(function (a, b) { return a.rank - b.rank || a.at - b.at; });
  out = out.concat(main.slice(0, phone() ? S.most.phone : S.most.desk));
  // A page's heading, by the name it says.
  var byName = /** @type {Record<string, string>} */ ({});
  Object.keys(S.spots).forEach(function (id) { if (S.spots[id].heading) byName[S.spots[id].heading] = id; });
  document.querySelectorAll('.run-heading > h3').forEach(function (h3) {
    var name = String(h3.textContent || '').trim();
    var id = byName[name];
    if (!id || seen[id] || !wanted(id) || !onScreen(h3)) return;
    seen[id] = true;
    out.push({ id: id, host: h3, how: 'heading' });
  });
  return out;
}

/** The icon of a spot where it is now, if any. @param {Element} host @param {string} how @param {string} id */
function iconAt(host, how, id) {
  var sel = '.help-spot[data-spot="' + id + '"]';
  if (how === 'end') return host.querySelector(':scope > ' + sel);
  if (how === 'orb') { var layer = $('orbLayer'); return layer ? layer.querySelector(':scope > ' + sel) : null; }
  var next = host.nextElementSibling;
  return next && next.matches(sel) ? next : null;
}

var SYNCING = false;
function sync() {
  if (SYNCING) return;
  SYNCING = true;
  try {
    var want = wantedNow();
    var keep = /** @type {Element[]} */ ([]);
    want.forEach(function (w) {
      var icon = iconAt(w.host, w.how, w.id);
      if (!icon) {
        icon = makeIcon(w.id);
        if (w.how === 'orb') {
          // The orb's round box clips what is in it, so its icon is on the orb's layer, kept at its rim.
          icon.classList.add('help-spot-orb');
          var layer = $('orbLayer');
          if (layer) layer.appendChild(icon);
          follow();
        } else if (w.how === 'end') w.host.appendChild(icon);
        else w.host.after(icon);
        if (w.how === 'heading' && w.host.parentElement) w.host.parentElement.classList.add('has-help-spot');
      }
      keep.push(icon);
    });
    document.querySelectorAll('.help-spot').forEach(function (icon) {
      if (keep.indexOf(icon) >= 0) return;
      if (OPEN.icon === icon) close();
      var row = icon.parentElement;
      icon.remove();
      if (row && row.classList.contains('has-help-spot') && !row.querySelector(':scope > .help-spot')) row.classList.remove('has-help-spot');
    });
    if (OPEN.icon && !OPEN.icon.isConnected) close();
    drawCard();
  } finally {
    // What this did to the page is its own, not a change to answer.
    if (watcher) watcher.takeRecords();
    SYNCING = false;
  }
}
var SOON = 0;
function soon() {
  if (SOON) return;
  SOON = window.setTimeout(function () { SOON = 0; sync(); }, 250);
}

/* The orb's icon keeps to the orb's top left as it is dragged, flicked or moved, frame by frame while it
   is there. */
var FOLLOWING = false;
function follow() {
  if (FOLLOWING) return;
  FOLLOWING = true;
  var tick = 0;
  var step = function () {
    var icon = /** @type {HTMLElement | null} */ (document.querySelector('#orbLayer > .help-spot-orb'));
    var box = $('orbBox');
    if (!icon || !box) { FOLLOWING = false; return; }
    var r = box.getBoundingClientRect();
    // Top left: the top right is where the orb shows its own red dot.
    var x = Math.round(r.left - 1) + 'px', y = Math.round(r.top - 1) + 'px';
    if (icon.style.left !== x) icon.style.left = x;
    if (icon.style.top !== y) icon.style.top = y;
    // The orb's layer is hidden and the circle itself made visible: the icon is seen when the circle is.
    // Read a few times a second, not every frame.
    if (!(tick++ % 10)) {
      var seen = r.width > 0 ? getComputedStyle(box).visibility : 'hidden';
      if (icon.style.visibility !== seen) icon.style.visibility = seen;
    }
    window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

/* ---------- used enough, it goes by itself ---------- */

/** @returns {Record<string, number>} */
function uses() {
  try { var got = JSON.parse(localStorage.getItem(KEY_USES) || '{}'); return got && typeof got === 'object' ? got : {}; }
  catch (err) { return {}; }
}
document.addEventListener('click', function (e) {
  var t = /** @type {Element} */ (e.target);
  if (!S.on || !t || !t.closest || t.closest('.help-spot, #helpCard')) return;
  var counted = /** @type {Record<string, boolean>} */ ({});
  PLACES.forEach(function (p) {
    if (!p.use || counted[p.spot] || DONE[p.spot] || !t.closest(p.use)) return;
    counted[p.spot] = true;
    var all = uses();
    all[p.spot] = (all[p.spot] || 0) + 1;
    try { localStorage.setItem(KEY_USES, JSON.stringify(all)); } catch (err) { /* counted this visit only */ }
    if (all[p.spot] >= S.uses) putAway(p.spot, 'used');
  });
}, true);

/* ---------- About you: Help on the screen ---------- */

function drawCard() {
  var box = $('helpSpotsCard');
  if (!box) return;
  box.hidden = !S.on;
  if (!S.on) return;
  var read = Math.min(S.read, S.total);
  $('helpSpotsCount').textContent = S.off ? 'All help icons are put away.'
    : read + ' of ' + S.total + ' read' + (read >= S.total ? ': nothing left to show.' : '.');
  /** @type {HTMLElement} */ ($('helpSpotsBar')).style.width = (S.off || !S.total ? 0 : Math.round(read / S.total * 100)) + '%';
  /** @type {HTMLButtonElement} */ ($('helpSpotsAgain')).disabled = !S.off && read === 0;
  /** @type {HTMLButtonElement} */ ($('helpSpotsHide')).disabled = S.off;
}
var again = $('helpSpotsAgain'), hide = $('helpSpotsHide');
if (again) again.addEventListener('click', function () {
  S.off = false;
  S.read = 0;
  DONE = {};
  try { localStorage.removeItem(KEY_USES); } catch (err) { /* nothing kept */ }
  tell('show_again');
  sync();
  $('helpSpotsCount').textContent = 'Every help icon is back: ' + S.total + ' to read.';
});
if (hide) hide.addEventListener('click', function () {
  S.off = true;
  tell('hide_all');
  sync();
});

/* ---------- watching the page ---------- */

/** @type {MutationObserver | null} */
var watcher = null;
if (S.on) {
  watcher = new MutationObserver(function () { if (!SYNCING) soon(); });
  watcher.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['hidden', 'data-orb'] });
  window.addEventListener('resize', soon);
  sync();
  sendLater();
}

window.RouhHelpSpots = { on: S.on, sync: sync };
