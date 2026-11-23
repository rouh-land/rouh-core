/* The composer's tooltips: what each button does and its key, after a short wait.
 *
 * Petar, 16 November 2026: the line of keys under the box took room at the bottom, so "put the
 * keyboard shortcuts on a delayed tooltip along with the explanation of what each button does". A
 * button on the composer's line says what it does in `data-tip` (and its key, when it has one, in
 * `data-key`); one that sets its `title` as it changes (the microphone, Send, the model) has it moved
 * into `data-tip` as it is set, so the browser's own tooltip, which comes late and never on a focus
 * from the keyboard, is never drawn over this one. Shown 600 ms after the pointer rests on a button or
 * the keyboard brings the focus to it, gone the moment either leaves, a button is pressed or Escape
 * is pressed. Outside the chain, like app/reading.js, and imported by app.js after it.
 *
 * Petar, 23 November 2026 (review 52 of the Guide, problems 359 and 362): a tip never covers the box the
 * person types in, so it sits above the whole composer; Stop's says "tap" on a phone and Esc only at a
 * desk (`data-tip-touch`); a press is not followed by the tip of the button that takes its place under a
 * pointer that has not moved (Send becomes Stop, and Stop Send again); and Send's tip is gone for good
 * once the person has sent a couple of messages (`SENT`, `SENT_ENOUGH`).
 */
import { $ } from 'app/helpers.js';

var WAIT = 600;
var line = $('composerControls');
var tip = document.createElement('div');
tip.className = 'composer-tip';
tip.id = 'composerTip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.appendChild(tip);
var TIP = { timer: 0, on: /** @type {HTMLElement | null} */ (null),
            pressed: /** @type {{x: number, y: number} | null} */ (null) };
/** Messages sent from this browser, kept until Send's tip is no longer needed. */
var SENT = 'rouh.sent.v1';
var SENT_ENOUGH = 2;

function sentCount() {
  try { return Number(localStorage.getItem(SENT) || 0) || 0; } catch (e) { return 0; }
}
/** A phone or a tablet: Stop is tapped there, and there is no Esc. */
function touchFirst() {
  return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 600px)').matches));
}

/** The button's title, moved to `data-tip`. @param {Element} b */
function adopt(b) {
  var t = b.getAttribute('title');
  if (t == null) return;
  if (t) /** @type {HTMLElement} */ (b).dataset.tip = t;
  b.removeAttribute('title');
}

function hide() {
  clearTimeout(TIP.timer);
  tip.hidden = true;
  if (TIP.on) TIP.on.removeAttribute('aria-describedby');
  TIP.on = null;
}

/** @param {HTMLElement} b */
function show(b) {
  var words = (touchFirst() && b.dataset.tipTouch) || b.dataset.tip || '';
  if (b.id === 'sendBtn' && sentCount() >= SENT_ENOUGH) return;
  // While a button is new, its first-use tip (app/firsttips.js) speaks for it instead.
  if (window.RouhFirstTips && window.RouhFirstTips.own(b)) return;
  if (!words || !document.contains(b) || b.offsetParent === null) return;
  tip.textContent = words;
  if (b.dataset.key && words.indexOf(b.dataset.key) < 0 && !touchFirst()) {
    var k = document.createElement('kbd');
    k.textContent = b.dataset.key;
    tip.appendChild(document.createTextNode(' '));
    tip.appendChild(k);
  }
  tip.hidden = false;
  var r = b.getBoundingClientRect();
  var w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
  // Above the whole composer, never over the box the person types in.
  var box = b.closest('.composer-box');
  var top = box ? Math.min(r.top, box.getBoundingClientRect().top) : r.top;
  var above = top - h - 8;
  tip.style.top = Math.round(above >= 8 ? above : r.bottom + 8) + 'px';
  TIP.on = b;
  b.setAttribute('aria-describedby', 'composerTip');
}

/** @param {HTMLElement | null} b */
function soon(b) {
  hide();
  if (!b) return;
  TIP.timer = window.setTimeout(function () { show(b); }, WAIT);
}

if (line) {
  line.querySelectorAll('[title]').forEach(adopt);
  new MutationObserver(function (changes) {
    changes.forEach(function (c) {
      if (c.type === 'attributes') adopt(/** @type {Element} */ (c.target));
      else c.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        var e = /** @type {Element} */ (n);
        if (e.hasAttribute('title')) adopt(e);
        e.querySelectorAll('[title]').forEach(adopt);
      });
    });
  }).observe(line, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  /** @param {Event} e */
  function target(e) {
    var t = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
    var b = t ? /** @type {HTMLElement | null} */ (t.closest('[data-tip]')) : null;
    return b && line && line.contains(b) ? b : null;
  }
  line.addEventListener('pointerover', function (e) {
    var p = /** @type {PointerEvent} */ (e);
    if (p.pointerType === 'touch') return;
    // The button under a pointer that has not moved since a press is the one that took the pressed
    // one's place: Stop after Send, Send after Stop. It was not pointed at.
    if (TIP.pressed && Math.abs(p.clientX - TIP.pressed.x) < 4 && Math.abs(p.clientY - TIP.pressed.y) < 4) return;
    var b = target(e);
    if (b !== TIP.on) soon(b);
  });
  line.addEventListener('pointermove', function (e) {
    var p = /** @type {PointerEvent} */ (e);
    if (TIP.pressed && (Math.abs(p.clientX - TIP.pressed.x) >= 4 || Math.abs(p.clientY - TIP.pressed.y) >= 4)) TIP.pressed = null;
  });
  line.addEventListener('pointerleave', function () { TIP.pressed = null; hide(); });
  line.addEventListener('pointerdown', function (e) {
    var p = /** @type {PointerEvent} */ (e);
    TIP.pressed = { x: p.clientX, y: p.clientY };
    hide();
  });
  // A message sent, by Send or by Enter: counted, and the tip goes.
  document.addEventListener('submit', function (e) {
    var form = /** @type {Element} */ (e.target);
    if (!form || form.id !== 'composer') return;
    var input = /** @type {HTMLTextAreaElement | null} */ ($('input'));
    if (input && !input.value.trim()) return;
    try { localStorage.setItem(SENT, String(Math.min(99, sentCount() + 1))); } catch (err) { /* this visit only */ }
    hide();
  }, true);
  line.addEventListener('focusin', function (e) {
    var b = target(e);
    if (b && b.matches(':focus-visible')) soon(b); else hide();
  });
  line.addEventListener('focusout', hide);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); }, true);
  window.addEventListener('scroll', hide, true);
}
