/* Rouh's page, four genes for somebody using Rouh for the first time (`rouh/first_help.py`, night 53).
 *
 * Outside the chain, like app/first_steps.js, and imported by app.js after it. The page is told which
 * are on, and the plain lines, in `#rouhFirstHelp`:
 *
 * - guide_answers: when a message could not be answered because chat is not set up, the server
 *   sends the Guide's lessons about it with the note (`chat_setup.guide`, PROTOCOL.md);
 *   app/socket.js says so with `rouh:chat-setup`, and they are drawn under the note's button.
 * - page_what: a (?) beside the name of one of Rouh's own pages (`.run-heading h3`) whose name has
 *   a plain line, which it says under the heading until pressed again, Escape or a press elsewhere.
 * - select_ask: words selected on one of Rouh's own pages (a canvas layer, never a workspace page,
 *   which has Ask AI, and never the conversation) offer Ask Rouh, which asks what they mean there.
 * - guide_search is the Guide's own search (`handholdingpage.js`), which reads `#rouhFirstHelp` itself.
 */
import { $, el } from 'app/helpers.js';
import { goToAddress } from 'app/cards.js';
import { chatIsWanted, growInput, narrow, sendTyped, setPane } from 'app/controls.js';

/** @type {{on: string[], plain: Record<string, string>, least: number, most: number}} */
var HELP = (function () {
  try {
    var node = document.getElementById('rouhFirstHelp');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    var sel = got.select || {};
    return { on: Array.isArray(got.on) ? got.on : [], plain: got.plain || {},
             least: Number(sel.least) || 2, most: Number(sel.most_words) || 12 };
  } catch (err) { return { on: [], plain: {}, least: 2, most: 12 }; }
}());

/** @param {string} name */
function helpOn(name) { return HELP.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function helpUsed(name, event, detail) {
  fetch('/api/first-help', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* ---------- guide_answers ---------- */

var BOOK = '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z"/>'
  + '<path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>';

window.addEventListener('rouh:chat-setup', function (e) {
  var said = /** @type {CustomEvent} */ (e).detail || {};
  var box = $('chatSetupGuide'), list = $('chatSetupGuideList');
  if (!box || !list) return;
  var guide = said.guide;
  if (!helpOn('guide_answers') || !guide || !Array.isArray(guide.lessons) || !guide.lessons.length) {
    box.hidden = true;
    return;
  }
  $('chatSetupGuideHead').textContent = String(guide.head || '');
  list.textContent = '';
  guide.lessons.forEach(function (/** @type {any} */ les) {
    var a = /** @type {HTMLAnchorElement} */ (el('a', null));
    a.href = String(les.route || '/guide');
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + BOOK + '</svg>';
    a.appendChild(el('span', null, String(les.title || 'A lesson')));
    a.addEventListener('click', function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
      ev.preventDefault();
      helpUsed('guide_answers', 'opened', String(les.id || ''));
      goToAddress(a.getAttribute('href') || '/guide');
    });
    var li = el('li', null);
    li.appendChild(a);
    list.appendChild(li);
  });
  box.hidden = false;
});

/* ---------- page_what ---------- */

/** The plain line for a heading's name, or ''. @param {HTMLElement} h3 */
function plainOf(h3) {
  var name = String(h3.textContent || '').trim();
  return Object.prototype.hasOwnProperty.call(HELP.plain, name) ? HELP.plain[name] : '';
}

/** @type {{button: HTMLButtonElement, said: HTMLElement} | null} */
var WHAT_OPEN = null;

function whatClose() {
  if (!WHAT_OPEN) return;
  WHAT_OPEN.button.setAttribute('aria-expanded', 'false');
  WHAT_OPEN.said.hidden = true;
  WHAT_OPEN = null;
}

/** Its (?) shown only while the heading names a page with a plain line. @param {HTMLElement} h3
    @param {HTMLButtonElement} button @param {HTMLElement} said */
function whatSync(h3, button, said) {
  var plain = plainOf(h3);
  button.hidden = !plain;
  if (!plain && WHAT_OPEN && WHAT_OPEN.button === button) whatClose();
  var name = String(h3.textContent || '').trim();
  button.title = 'What is ' + name + '?';
  button.setAttribute('aria-label', 'What is ' + name + '?');
  if (!said.hidden) said.textContent = plain;
}

function whatSetUp() {
  if (!helpOn('page_what')) return;
  document.querySelectorAll('.run-heading > h3').forEach(function (node, at) {
    var h3 = /** @type {HTMLElement} */ (node);
    var head = /** @type {HTMLElement} */ (h3.parentElement);
    if (head.querySelector(':scope > .page-what')) return;
    var button = /** @type {HTMLButtonElement} */ (el('button', 'page-what', '?'));
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    var said = el('p', 'page-what-said');
    said.id = 'pageWhat' + at;
    said.setAttribute('role', 'note');
    said.hidden = true;
    button.setAttribute('aria-controls', said.id);
    h3.after(button);
    // Under the whole header row, so it has the page's width on a phone too.
    var row = head.closest('.run-head');
    (row || head).after(said);
    head.classList.add('has-page-what');
    whatSync(h3, button, said);
    new MutationObserver(function () { whatSync(h3, button, said); })
      .observe(h3, { childList: true, characterData: true, subtree: true });
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (WHAT_OPEN && WHAT_OPEN.button === button) { whatClose(); return; }
      whatClose();
      said.textContent = plainOf(h3);
      said.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      WHAT_OPEN = { button: button, said: said };
      helpUsed('page_what', 'opened', String(h3.textContent || '').trim());
    });
  });
}
whatSetUp();
document.addEventListener('click', function (e) {
  if (!WHAT_OPEN) return;
  var t = /** @type {HTMLElement} */ (e.target);
  if (t && t.closest && t.closest('.page-what-said')) return;
  whatClose();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && WHAT_OPEN) {
    var back = WHAT_OPEN.button;
    whatClose();
    back.focus();
    e.stopPropagation();
  }
}, true);

/* ---------- select_ask ---------- */

/** @type {HTMLButtonElement | null} */
var ASK_BUTTON = null;
var ASK = { words: '', page: '' };

function askButton() {
  if (ASK_BUTTON) return ASK_BUTTON;
  var b = /** @type {HTMLButtonElement} */ (el('button', 'select-ask'));
  b.type = 'button';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/>'
    + '<path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4M12 14.3v.2"/></svg>';
  b.appendChild(el('span', null, 'Ask Rouh what this means'));
  b.hidden = true;
  // Pressed before the selection is lost.
  b.addEventListener('mousedown', function (e) { e.preventDefault(); });
  b.addEventListener('click', askIt);
  document.body.appendChild(b);
  ASK_BUTTON = b;
  return b;
}

function askHide() { if (ASK_BUTTON) ASK_BUTTON.hidden = true; }

/** The name of the page of Rouh's own a node is on, or ''. @param {Node | null} node */
function ownPageOf(node) {
  var at = node && (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement);
  if (!at || !at.closest) return '';
  if (at.closest('input, textarea, [contenteditable="true"], [contenteditable=""], iframe, .transcript, '
    + '.col-chat, dialog, .menu, .select-ask, .one-term-wrap')) return '';
  var layer = at.closest('.canvas-layer');
  if (!layer) return '';
  var h3 = layer.querySelector('.run-heading > h3');
  return String((h3 && h3.textContent) || layer.getAttribute('aria-label') || '').trim();
}

function askLook() {
  if (!helpOn('select_ask')) return;
  var sel = window.getSelection();
  var words = sel && !sel.isCollapsed ? String(sel.toString()).replace(/\s+/g, ' ').trim() : '';
  var page = words ? ownPageOf(sel.anchorNode) : '';
  if (!words || !page || page !== ownPageOf(sel.focusNode) || words.length < HELP.least
      || words.split(' ').length > HELP.most || !/\p{L}/u.test(words)) { askHide(); return; }
  var rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) { askHide(); return; }
  ASK.words = words;
  ASK.page = page;
  var b = askButton();
  b.hidden = false;
  var w = b.offsetWidth, h = b.offsetHeight;
  var left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  var top = rect.bottom + 8 + h > window.innerHeight - 8 ? rect.top - h - 8 : rect.bottom + 8;
  b.style.left = Math.round(left) + 'px';
  b.style.top = Math.round(Math.max(8, top)) + 'px';
}

var ASK_TIMER = 0;
document.addEventListener('selectionchange', function () {
  clearTimeout(ASK_TIMER);
  ASK_TIMER = window.setTimeout(askLook, 250);
});
window.addEventListener('scroll', askHide, true);
window.addEventListener('resize', askHide);

function askIt() {
  var words = ASK.words, page = ASK.page;
  askHide();
  if (!words) return;
  var box = /** @type {HTMLTextAreaElement | null} */ ($('input'));
  if (!box) return;
  var app = $('app');
  if (app && app.classList.contains('no-chat')) chatIsWanted();
  if (narrow()) setPane('chat');
  box.value = 'What does “' + words + '” mean, on the ' + page + ' page?';
  growInput();
  box.focus();
  sendTyped();
  try { (window.getSelection() || { removeAllRanges: function () {} }).removeAllRanges(); } catch (err) {}
  helpUsed('select_ask', 'asked', page + ': ' + words);
}

export { helpOn, helpUsed };
