/* First-use tips: what a button is, in words, while it is new to this person.
 *
 * Review 50 of the Guide, Petar, 22 November 2026, on the speech bubble at the top right (problem 298):
 * "in the beginning have a tooltip hover that explains what this is. after using it a couple times it
 * disappears. we have some similar mechanic with the navigation button - the orb. I think that should
 * become a universal feature for Rouh." And on the composer's small buttons, Auto and Full (problems 331
 * and 354): "hover for desktop. nothing extra for phones"; "auto and full can have hovers for desktop
 * until people click them".
 *
 * So any element with `data-first="<key>"` and `data-first-tip="<what it does, in plain words>"` (and
 * optionally `data-first-name`, the tip's first line) explains itself, quickly, when a mouse rests on it
 * or the keyboard brings the focus to it, until it has been pressed USES times in this browser, or the
 * tip has been seen SHOWS times without a press (by then it is known, or it is not wanted). After that
 * the element is as it always was: its own title or composer tip (app/tips.js asks `firstTipsOwn` and
 * steps aside only while this one is speaking for it). On a touch screen nothing extra is drawn: a press
 * there is the button's, and the button's own words say the rest once it is open.
 *
 * The orb in the corner has its own, older, version of this (`orbIntro` in app/orb.js: 25 presses), because
 * its tip also says how busy the machine is. Outside the chain, like app/tips.js, imported by app.js after it.
 */

var USES = 10;
var SHOWS = 20;
var WAIT = 350;
var KEY = 'rouh.first.v1';

/** @typedef {{u?: number, s?: number}} FirstCount */

/** @returns {Record<string, FirstCount>} */
function counts() {
  try {
    var got = JSON.parse(localStorage.getItem(KEY) || '{}');
    return got && typeof got === 'object' ? got : {};
  } catch (err) { return {}; }
}
/** @param {Record<string, FirstCount>} all */
function keep(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (err) { /* this visit only */ }
}
/** Whether the element is still new to this person. @param {Element | null} b */
function firstTipsOwn(b) {
  if (!b || !(b instanceof HTMLElement) || !b.dataset.first || !b.dataset.firstTip) return false;
  var c = counts()[b.dataset.first] || {};
  return (c.u || 0) < USES && (c.s || 0) < SHOWS;
}
/** @param {string} key @param {'u' | 's'} what */
function count(key, what) {
  var all = counts();
  var c = all[key] || {};
  c[what] = (c[what] || 0) + 1;
  all[key] = c;
  keep(all);
}

var tip = document.createElement('div');
tip.className = 'first-tip';
tip.id = 'firstTip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.appendChild(tip);
var ON = { timer: 0, el: /** @type {HTMLElement | null} */ (null), counted: '' };

function hide() {
  clearTimeout(ON.timer);
  tip.hidden = true;
  if (ON.el) {
    ON.el.removeAttribute('aria-describedby');
    // The browser's own tooltip, put away while this one spoke, is back.
    if (ON.el.dataset.firstTitle != null) {
      ON.el.setAttribute('title', ON.el.dataset.firstTitle);
      delete ON.el.dataset.firstTitle;
    }
  }
  ON.el = null;
}

/** @param {HTMLElement} b */
function show(b) {
  // Not offsetParent: a button fixed to the screen (the corner's switch) has none, and is on screen.
  if (!document.contains(b) || !b.getClientRects().length || !firstTipsOwn(b)) return;
  tip.textContent = '';
  var name = b.dataset.firstName || '';
  if (name) {
    var n = document.createElement('b');
    n.className = 'first-tip-name';
    n.textContent = name;
    tip.appendChild(n);
  }
  var t = document.createElement('span');
  t.className = 'first-tip-text';
  t.textContent = b.dataset.firstTip || '';
  tip.appendChild(t);
  tip.hidden = false;
  var r = b.getBoundingClientRect();
  var w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
  // Below a button in the top half of the screen, above one in the bottom half.
  var below = r.bottom + 8, above = r.top - h - 8;
  var y = r.top < window.innerHeight / 2 ? (below + h <= window.innerHeight - 8 ? below : above)
    : (above >= 8 ? above : below);
  tip.style.top = Math.round(y) + 'px';
  ON.el = b;
  b.setAttribute('aria-describedby', 'firstTip');
  // Never two tips at once: the browser's own, which comes late, waits until this one goes.
  var own = b.getAttribute('title');
  if (own != null) { b.dataset.firstTitle = own; b.removeAttribute('title'); }
  // One showing per resting on it, however long it rests.
  if (ON.counted !== b.dataset.first) {
    ON.counted = b.dataset.first || '';
    count(ON.counted, 's');
  }
}

/** @param {HTMLElement | null} b */
function soon(b) {
  hide();
  if (!b || !firstTipsOwn(b)) return;
  ON.timer = window.setTimeout(function () { show(b); }, WAIT);
}

/** @param {Event} e */
function target(e) {
  var t = e.target instanceof Element ? e.target : null;
  return t ? /** @type {HTMLElement | null} */ (t.closest('[data-first]')) : null;
}

document.addEventListener('pointerover', function (e) {
  if (/** @type {PointerEvent} */ (e).pointerType !== 'mouse') return;
  var b = target(e);
  if (b === ON.el) return;
  if (!b) { if (ON.el || ON.timer) hide(); ON.counted = ''; return; }
  soon(b);
});
document.addEventListener('focusin', function (e) {
  var b = target(e);
  if (b && b.matches(':focus-visible')) soon(b); else if (ON.el || ON.timer) hide();
});
document.addEventListener('focusout', function () { if (ON.el || ON.timer) hide(); });
// A press is a use: counted wherever it came from (a finger too), and the tip goes.
document.addEventListener('click', function (e) {
  var b = target(e);
  if (b && b.dataset.first) count(b.dataset.first, 'u');
  hide();
}, true);
window.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); }, true);
window.addEventListener('scroll', hide, true);

window.RouhFirstTips = { own: firstTipsOwn };

export { firstTipsOwn };
