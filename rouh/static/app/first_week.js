/* Rouh's page, four genes for somebody's first week (`rouh/first_week.py`, night 55).
 *
 * Outside the chain, like app/new_owner.js, and imported by app.js after it. The page is told which
 * are on, and the text sizes, in `#rouhFirstWeek`. Everything they keep is in this browser.
 *
 * - draft_kept: what is typed in the chat's box and not sent is kept under that chat's own id, and
 *   put back in an empty box when the page, or that chat, comes back. Every way of sending clears it.
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
import { S } from 'app/socket.js';
import { ADDR } from 'app/address.js';

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

/* What was just sent, for ask_again's moment; and what each send means for last_again. */
var LAST = { text: '', chat: '', at: 0 };
if (form && input) {
  form.addEventListener('submit', function () {
    var text = input ? input.value.trim() : '';
    if (!text) return;
    var chat = chatNow();
    LAST = { text: text, chat: chat, at: Date.now() };
    if (weekOn('last_again')) keep('last.' + chat, text);
    RECALLED.text = '';
  }, true);
}

/* ---------- draft_kept ----------

   Petar, 27 November 2026: words he had already sent came back in the box after a reload and in
   new tabs, and in other chats than the one they were typed in. Three causes, each closed here.
   - The draft was kept under `chatNow()`, which before the page knew its chat was General's id,
     so what was typed in that first moment was General's, and General's came back in whatever
     chat a new tab opened. A draft is now kept and put back only under the real id of the chat
     on the screen (`draftChat`), never a fallback, and never at the front door or mid-switch.
   - Only a submit of the form cleared it, so a fork (Cmd+Enter), a held send and a picture left
     the words kept. Every way the box's words go now says so (`rouh:box-sent`, `boxSent` in
     app/controls.js), and that clears this chat's draft and any draft holding those very words.
   - A save that waited 300 ms could land after the chat changed, under the old chat with the new
     box. Each keystroke is now kept at once, and only while its chat is the one on the screen.
   The old keys (`rouh.fw.draft.*`) were filed under that fallback and are mostly words already
   sent, so they are dropped once, and drafts live under `rouh.fw.unsent.<chat id>`. */

var DRAFT = { chat: '', typed: false };
var DRAFT_PRE = 'unsent.';

/* The chat whose box this is, or '' while that is not certain. */
function draftChat() {
  if (!CHATS.active || S.switching || ADDR.front || ADDR.wanted) return '';
  return String(CHATS.active);
}

/** Every kept key that starts so, without the prefix. @param {string} start */
function keptKeys(start) {
  /** @type {string[]} */
  var out = [];
  try {
    for (var i = 0; i < window.localStorage.length; i++) {
      var k = window.localStorage.key(i) || '';
      if (k.indexOf(PREFIX + start) === 0) out.push(k.slice(PREFIX.length));
    }
  } catch (err) { /* nothing to list */ }
  return out;
}

/* Petar again, the same afternoon: words he had sent into a fork on the right were back in the
   box of the chat it came off. Three more ways, each closed here.
   - A tab opened before the morning's change runs the old code until it is reloaded, which kept
     words under `rouh.fw.draft.<chat>`, never let a fork's words go, and put them back on the way
     back to that chat. Those keys are now taken away the moment any tab of the new code sees one
     (`draftSweep`, every tick and on `storage`), so an old tab finds nothing to put back.
   - Up in an empty box (last_again) put the last message sent back in the box, and that was then
     kept as if it had been typed and not sent, so it came back after every reload and in every new
     tab. Words put back by Up are never kept.
   - Nothing remembered what had been said, so any copy left anywhere came back as unsent. This
     browser now keeps the last words said (`rouh.fw.said`, every way the box sends them,
     `rouh:box-sent`); kept words that are among them, or that the conversation on the screen
     shows as the person's own or as what a fork of it asked, are never put back, and are dropped.
     And words that are among them and appear in the box without the person typing them there -
     put back by any code, an old copy, a parked chat - are taken out again (`draftGuard`). Words
     handed back because they did not go (a fork refused, a held send that could not go) are
     taken off that list and kept as unsent (`rouh:box-back`). */

var SAID_MOST = 60;

/** Words as compared: spaces folded, ends trimmed. @param {string} text */
function norm(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

/** @returns {string[]} */
function saidList() {
  try {
    var got = JSON.parse(kept('said') || '[]');
    return Array.isArray(got) ? got.filter(function (t) { return typeof t === 'string' && !!t; }) : [];
  } catch (err) { return []; }
}
/** @param {string} text */
function saidHas(text) { var n = norm(text); return !!n && saidList().indexOf(n) >= 0; }
/** @param {string} text */
function saidAdd(text) {
  var n = norm(text);
  if (!n) return;
  var list = saidList().filter(function (t) { return t !== n; });
  list.push(n);
  keep('said', JSON.stringify(list.slice(-SAID_MOST)));
}
/** @param {string} text */
function saidDrop(text) {
  var n = norm(text);
  var list = saidList();
  if (list.indexOf(n) < 0) return;
  keep('said', JSON.stringify(list.filter(function (t) { return t !== n; })));
}

/* Whether the conversation on the screen shows these words as said: one of the person's own
   messages, or the question a fork of it was asked with. @param {string} text */
function shownSaid(text) {
  var n = norm(text);
  if (!n) return false;
  var t = $('transcript');
  var nodes = t ? Array.prototype.slice.call(t.querySelectorAll('.turn.user .turn-body, .fork-mark-asked')) : [];
  for (var i = 0; i < nodes.length; i++) {
    var shown = norm(nodes[i].textContent || '');
    if (shown && (shown === n || (n.length >= 40 && shown.indexOf(n) === 0))) return true;
  }
  return false;
}

/* What the person last put in the box with their own hands (typing, pasting, dictating into it),
   and the words last put back from what was kept. */
var BOX = { typed: '', restored: '', restoredChat: '' };

/* Kept as the box holds it now, only into the chat it was typed in, while that is on the screen. */
function draftSave() {
  if (!input) return;
  // Up's copy of the last message sent is not words left unsent.
  if (RECALLED.text && input.value === RECALLED.text) return;
  var chat = draftChat();
  if (!chat || chat !== DRAFT.chat) { DRAFT.typed = !!input.value.trim(); return; }
  DRAFT.typed = false;
  keep(DRAFT_PRE + chat, input.value.trim() ? input.value : null);
}

/* The chat on the screen changed, or became certain: put its own words back in an empty box. */
function draftPut() {
  if (!input || !weekOn('draft_kept')) return;
  var chat = draftChat();
  if (chat === DRAFT.chat) return;
  var was = DRAFT.chat;
  DRAFT.chat = chat;
  if (!chat) return;
  // Typed while the page was still finding its chat: they are this chat's, the one now open.
  if (!was && DRAFT.typed && input.value.trim()) { draftSave(); return; }
  DRAFT.typed = false;
  if (input.value.trim()) return;
  var words = kept(DRAFT_PRE + chat);
  if (!words) return;
  // Already said, here or anywhere: not unsent, and not kept any longer.
  if (saidHas(words) || shownSaid(words)) { keep(DRAFT_PRE + chat, null); return; }
  BOX.restored = words;
  BOX.restoredChat = chat;
  fillBox(words);
  weekUsed('draft_kept', 'restored', words.length + ' characters');
}

/** @param {string} text */
function draftSent(text) {
  DRAFT.typed = false;
  BOX.typed = '';
  BOX.restored = '';
  var chat = draftChat() || DRAFT.chat;
  if (chat) keep(DRAFT_PRE + chat, null);
  var said = norm(text);
  if (!said) return;
  saidAdd(said);
  // And the same words kept under any other chat: they have been said.
  keptKeys(DRAFT_PRE).forEach(function (k) {
    var v = kept(k);
    if (v != null && norm(v) === said) keep(k, null);
  });
}

/* Words handed back to the box because they did not go: unsent after all, and this chat's. */
/** @param {string} text */
function draftBack(text) {
  saidDrop(text);
  if (!input) return;
  BOX.typed = input.value;
  var chat = draftChat();
  if (chat && chat === DRAFT.chat && input.value.trim()) keep(DRAFT_PRE + chat, input.value);
}

/* The old code's keys, wherever an old tab has just written one. */
function draftSweep() { keptKeys('draft.').forEach(function (k) { keep(k, null); }); }

/* Said words in the box that the person did not put there go again, whatever put them back. */
function draftGuard() {
  if (!input) return;
  var v = input.value;
  if (!v.trim() || v === BOX.typed || (RECALLED.text && v === RECALLED.text)) return;
  var restored = BOX.restored && v === BOX.restored;
  if (!saidHas(v) && !(restored && shownSaid(v))) return;
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  var chat = draftChat();
  if (chat) keep(DRAFT_PRE + chat, null);
  if (restored && BOX.restoredChat) keep(DRAFT_PRE + BOX.restoredChat, null);
  BOX.restored = '';
  saidAdd(v);
}

draftSweep();
if (input && weekOn('draft_kept')) {
  input.addEventListener('input', function (e) {
    // Only what a person does: words put in by the page come as an event of its own.
    if (e.isTrusted && input) { BOX.typed = input.value; BOX.restored = ''; }
    draftSave();
  });
  document.addEventListener('rouh:box-sent', function (e) {
    var d = /** @type {CustomEvent} */ (e).detail || {};
    draftSent(String(d.text || ''));
  });
  document.addEventListener('rouh:box-back', function (e) {
    var d = /** @type {CustomEvent} */ (e).detail || {};
    draftBack(String(d.text || ''));
  });
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(PREFIX + 'draft.') === 0) draftSweep();
  });
  // The chat is known a moment after the page opens, and changes when another is opened.
  window.setInterval(function () { draftSweep(); draftPut(); draftGuard(); }, 500);
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
