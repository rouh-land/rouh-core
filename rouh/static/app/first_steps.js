/* Rouh's page, four genes for somebody using Rouh for the first time (`rouh/first_steps.py`, night 52).
 *
 * Outside the chain, like app/newcomer.js, and imported by app.js after it. The page is told which
 * are on in `#rouhFirstSteps`:
 *
 * - type_anywhere: a letter typed while nothing has the cursor, no dialog is open and the
 *   conversation is on the screen goes into the conversation's box, with the letter.
 * - search_words, search_ask and search_settings are Search's (`app/search.js`): it asks
 *   `firstStepOn`, opens a setting with `settingOpen`, asks Rouh with `askRouh`, and reports their
 *   use with `firstStepUsed`, all from here.
 */
import { $ } from 'app/helpers.js';
import { goToAddress } from 'app/cards.js';
import { chatIsWanted, chatOnScreen, growInput, narrow, sendTyped, setPane, sidebarDone } from 'app/controls.js';

/** @type {{on: string[]}} */
var FIRST = (function () {
  try {
    var node = document.getElementById('rouhFirstSteps');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [] };
  } catch (err) { return { on: [] }; }
}());

/** @param {string} name */
function firstStepOn(name) { return FIRST.on.indexOf(name) >= 0; }

/** One of the four used: counted by the server. @param {string} name @param {string} [detail] */
function firstStepUsed(name, detail) {
  fetch('/api/first-steps', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, detail: String(detail || '') }) }).catch(function () {});
}

/** The conversation's box, brought on the screen. @returns {HTMLTextAreaElement | null} */
function boxOnScreen() {
  var box = /** @type {HTMLTextAreaElement | null} */ ($('input'));
  if (!box) return null;
  var app = $('app');
  if (app && app.classList.contains('no-chat')) chatIsWanted();
  if (narrow()) setPane('chat');
  return box;
}

/* search_ask: what was typed into Search, asked of Rouh in the conversation. @param {string} words */
function askRouh(words) {
  var say = String(words || '').trim();
  var box = boxOnScreen();
  if (!say || !box) return;
  box.value = say;
  growInput();
  box.focus();
  sendTyped();
  firstStepUsed('search_ask', say.slice(0, 80));
}

/* search_settings: a card of one of Anatomy's sections, opened at its section and lit a moment.
   @param {string} route @param {string} card */
function settingOpen(route, card) {
  sidebarDone();
  goToAddress(route);
  firstStepUsed('search_settings', card);
  var tries = 0;
  (function look() {
    var head = $(card);
    var shown = head && head.getClientRects().length > 0;
    if (!shown) {
      if (++tries < 40) setTimeout(look, 100);
      return;
    }
    var at = /** @type {HTMLElement} */ (head.closest('.setting-card') || head);
    // The section fills in what it reads after it is shown, which moves the card: it is scrolled
    // to again once that has settled.
    at.scrollIntoView({ block: 'start' });
    at.classList.add('setting-lit');
    setTimeout(function () { at.scrollIntoView({ block: 'start' }); }, 450);
    setTimeout(function () { at.scrollIntoView({ block: 'start' }); }, 1200);
    setTimeout(function () { at.classList.remove('setting-lit'); }, 3200);
  }());
}

/* type_anywhere: a letter typed into nothing goes into the conversation's box. */
var TYPED = false;
document.addEventListener('keydown', function (e) {
  if (!firstStepOn('type_anywhere')) return;
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (typeof e.key !== 'string' || e.key.length !== 1 || !/\p{L}/u.test(e.key)) return;
  var where = /** @type {Element | null} */ (document.activeElement);
  if (where && where !== document.body && where.closest && where.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], iframe, dialog, [role="menu"], ' +
    '[role="listbox"], .one-term-wrap, .web-screen, .menu')) return;
  if (document.querySelector('dialog[open], .menu:not([hidden])')) return;
  var box = /** @type {HTMLTextAreaElement | null} */ ($('input'));
  if (!box || box.disabled || !box.getClientRects().length || !chatOnScreen()) return;
  e.preventDefault();
  box.focus();
  var at = box.value.length;
  box.value = box.value + e.key;
  try { box.setSelectionRange(at + 1, at + 1); } catch (err) {}
  box.dispatchEvent(new Event('input', { bubbles: true }));
  growInput();
  if (!TYPED) { TYPED = true; firstStepUsed('type_anywhere', 'letter'); }
});

export { askRouh, firstStepOn, firstStepUsed, settingOpen };
