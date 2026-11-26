/* Rouh's page, four genes for somebody's first week (`rouh/first_week.py`, night 55).
 *
 * Outside the chain, like app/new_owner.js, and imported by app.js after it. The page is told which
 * are on, and the text sizes, in `#rouhFirstWeek`. Everything they keep is in this browser.
 *
 * - draft_kept: what is typed in the chat's box and not sent is kept per chat, and put back in an
 *   empty box when the page, or that chat, comes back. Sending clears it.
 * - ask_again: a message turned away because chat was not set up (`rouh:chat-setup`, sent by
 *   `chatSetupShow` in app/socket.js) is kept; once chat is set up, a card over the box offers
 *   Ask it now and Never mind.
 * - text_size: Chat text size, on About You: Normal, Bigger or Biggest, for the chat's messages
 *   and its box, kept on this device.
 * - last_again: the Up arrow in the chat's empty box brings back the last message sent in that
 *   chat; Escape takes it away again while it is unchanged.
 */
import { $, el } from 'app/helpers.js';
import { CHATS } from 'app/chats.js';

/** @type {{on: string[], sizes: {id: string, name: string, scale: number}[]}} */
var WEEK = (function () {
  try {
    var node = document.getElementById('rouhFirstWeek');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], sizes: Array.isArray(got.sizes) ? got.sizes : [] };
  } catch (err) { return { on: [], sizes: [] }; }
}());

/** @param {string} name */
function weekOn(name) { return WEEK.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function weekUsed(name, event, detail) {
  fetch('/api/first-week', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* This browser's keeping: every read and write may be refused (a private window, storage turned off). */
var PREFIX = 'rouh.fw.';
/** @param {string} key */
function kept(key) { try { return window.localStorage.getItem(PREFIX + key); } catch (err) { return null; } }
/** @param {string} key @param {string | null} value */
function keep(key, value) {
  try {
    if (value == null || value === '') window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch (err) { /* nothing kept, nothing lost */ }
}

var input = /** @type {HTMLTextAreaElement | null} */ ($('input'));
var form = /** @type {HTMLFormElement | null} */ ($('composer'));

/** The chat the box is in now. */
function chatNow() { return String(CHATS.active || CHATS.own || CHATS.general || 'conversation'); }

/** Put words in the box as if typed, so it grows to them. @param {string} text */
function fillBox(text) {
  if (!input) return;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
}

/* What was just sent, for ask_again's moment; and what each send means for the other three. */
var LAST = { text: '', chat: '', at: 0 };
if (form && input) {
  form.addEventListener('submit', function () {
    var text = input ? input.value.trim() : '';
    if (!text) return;
    var chat = chatNow();
    LAST = { text: text, chat: chat, at: Date.now() };
    if (weekOn('draft_kept')) keep('draft.' + chat, null);
    if (weekOn('last_again')) keep('last.' + chat, text);
    RECALLED.text = '';
  }, true);
}

/* ---------- draft_kept ---------- */

var DRAFT = { chat: '', timer: 0 };

function draftPut() {
  if (!input || !weekOn('draft_kept')) return;
  var chat = chatNow();
  if (chat === DRAFT.chat) return;
  DRAFT.chat = chat;
  if (input.value.trim()) return;
  var words = kept('draft.' + chat);
  if (!words) return;
  fillBox(words);
  weekUsed('draft_kept', 'restored', words.length + ' characters');
}

if (input && weekOn('draft_kept')) {
  input.addEventListener('input', function () {
    clearTimeout(DRAFT.timer);
    var chat = chatNow();
    DRAFT.chat = chat;
    DRAFT.timer = window.setTimeout(function () {
      if (input) keep('draft.' + chat, input.value.trim() ? input.value : null);
    }, 300);
  });
  // The chat is known a moment after the page opens, and changes when another is opened.
  window.setInterval(draftPut, 700);
  draftPut();
}

/* ---------- last_again ---------- */

var RECALLED = { text: '' };

if (input && weekOn('last_again')) {
  input.addEventListener('keydown', function (e) {
    if (!input || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
    if (e.key === 'ArrowUp' && !input.value) {
      var last = kept('last.' + chatNow());
      if (!last) return;
      e.preventDefault();
      RECALLED.text = last;
      fillBox(last);
      weekUsed('last_again', 'recalled', last.length + ' characters');
    } else if (e.key === 'Escape' && RECALLED.text && input.value === RECALLED.text) {
      e.preventDefault();
      e.stopPropagation();
      RECALLED.text = '';
      fillBox('');
    }
  });
}

/* ---------- ask_again ---------- */

/** @returns {string[]} */
function unanswered() {
  try {
    var got = JSON.parse(kept('unanswered') || '[]');
    return Array.isArray(got) ? got.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];
  } catch (err) { return []; }
}
/** @param {string[]} list */
function unansweredKeep(list) { keep('unanswered', list.length ? JSON.stringify(list.slice(-3)) : null); }

function chatReady() {
  var box = $('chatSetup');
  return !box || box.hidden;
}

function askDraw() {
  var setup = $('chatSetup');
  var card = $('askAgainCard');
  var list = weekOn('ask_again') && chatReady() ? unanswered() : [];
  if (!list.length) { if (card) card.remove(); return; }
  if (!card) {
    card = el('section', 'ask-again');
    card.id = 'askAgainCard';
    card.setAttribute('aria-label', 'What you asked before chat was set up');
    if (setup && setup.parentNode) setup.parentNode.insertBefore(card, setup.nextSibling);
    else return;
  }
  card.textContent = '';
  card.appendChild(el('p', 'ask-again-head', list.length === 1 ? 'You asked this before chat was set up'
    : 'You asked these before chat was set up'));
  card.appendChild(el('p', 'ask-again-say', 'Chat works now. Ask it now, and Rouh answers it.'));
  list.forEach(function (text) {
    var row = el('div', 'ask-again-row');
    var q = el('blockquote', 'ask-again-q', text.length > 280 ? text.slice(0, 280) + '…' : text);
    row.appendChild(q);
    var acts = el('div', 'ask-again-acts');
    var go = el('button', 'ctl small primary', 'Ask it now');
    go.setAttribute('type', 'button');
    go.addEventListener('click', function () {
      unansweredKeep(unanswered().filter(function (t) { return t !== text; }));
      askDraw();
      fillBox(text);
      weekUsed('ask_again', 'asked', text.length + ' characters');
      if (form) { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); }
    });
    var no = el('button', 'ctl small', 'Never mind');
    no.setAttribute('type', 'button');
    no.addEventListener('click', function () {
      unansweredKeep(unanswered().filter(function (t) { return t !== text; }));
      askDraw();
    });
    acts.appendChild(go);
    acts.appendChild(no);
    row.appendChild(acts);
    card.appendChild(row);
  });
}

if (weekOn('ask_again')) {
  window.addEventListener('rouh:chat-setup', function () {
    // Turned away just now: the message just sent is the one that was not answered.
    if (!LAST.text || Date.now() - LAST.at > 60000) return;
    var list = unanswered().filter(function (t) { return t !== LAST.text; });
    list.push(LAST.text);
    unansweredKeep(list);
    askDraw();
  });
  var setupBox = $('chatSetup');
  if (setupBox) new MutationObserver(askDraw).observe(setupBox, { attributes: true, attributeFilter: ['hidden'] });
  askDraw();
}

/* ---------- text_size ---------- */

/** @param {string} id */
function sizeApply(id) {
  var root = document.documentElement;
  WEEK.sizes.forEach(function (s) { root.classList.toggle('fw-ts-' + s.id, s.id === id && s.id !== 'normal'); });
}

function sizeNow() {
  var id = kept('textsize') || 'normal';
  return WEEK.sizes.some(function (s) { return s.id === id; }) ? id : 'normal';
}

function sizeCard() {
  var section = document.querySelector('.settings-section[data-section="about-you"]');
  if (!section || $('fwTextSize')) return;
  var card = el('section', 'setting-card fw-size');
  card.id = 'fwTextSize';
  card.setAttribute('aria-labelledby', 'fwTextSizeHead');
  var h = el('h4', null, 'Chat text size');
  h.id = 'fwTextSizeHead';
  card.appendChild(h);
  card.appendChild(el('p', 'settings-help', 'How big the words of the chat are, its messages and the box you type in, on this device.'));
  var row = el('div', 'fw-size-row');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-labelledby', 'fwTextSizeHead');
  WEEK.sizes.forEach(function (s) {
    var b = el('button', 'fw-size-btn', s.name);
    b.setAttribute('type', 'button');
    b.setAttribute('role', 'radio');
    b.setAttribute('data-size', s.id);
    b.style.fontSize = Math.round(14 * s.scale) + 'px';
    b.addEventListener('click', function () {
      if (sizeNow() === s.id) return;
      keep('textsize', s.id === 'normal' ? null : s.id);
      sizeApply(s.id);
      sizePaint();
      weekUsed('text_size', 'changed', s.id);
    });
    row.appendChild(b);
  });
  card.appendChild(row);
  var first = section.querySelector(':scope > .setting-card');
  if (first && first.nextSibling) section.insertBefore(card, first.nextSibling); else section.appendChild(card);
  sizePaint();
}

function sizePaint() {
  var now = sizeNow();
  document.querySelectorAll('#fwTextSize .fw-size-btn').forEach(function (b) {
    var on = b.getAttribute('data-size') === now;
    b.setAttribute('aria-checked', String(on));
    /** @type {HTMLElement} */ (b).tabIndex = on ? 0 : -1;
  });
}

if (weekOn('text_size') && WEEK.sizes.length) {
  sizeApply(sizeNow());
  sizeCard();
}
