/* Rouh's page, four genes for somebody new to Rouh (`rouh/easy_start.py`, night 56).
 *
 * Outside the chain, like app/first_week.js, and imported by app.js after it. The page is told which
 * are on, and the slash list, in `#rouhEasyStart`.
 *
 * - chat_ready: while "Chat is not set up yet" shows (`#chatSetup`), the server is asked whether chat
 *   can answer when the window comes back and every ten seconds, and the note goes the moment it can.
 * - home_screen: on a phone, in the browser, from the second visit, once: a notice offering to put
 *   Rouh on the home screen, with Install where the phone can do it and the steps on an iPhone.
 * - chat_save: Save this chat as a file, at the foot of Chat Options (`#saveChatBtn`), as a text file.
 * - slash_menu: a slash in the chat's empty box opens what can be done from the chat, in words,
 *   leaving out what a button under the box already does (`SLASH` in rouh/easy_start.py).
 */
import { $, el } from 'app/helpers.js';
import { CHATS } from 'app/chats.js';
import { notify } from 'app/notices.js';

/** @type {{on: string[], slash: {id: string, name: string, also: string}[]}} */
var EASY = (function () {
  try {
    var node = document.getElementById('rouhEasyStart');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], slash: Array.isArray(got.slash) ? got.slash : [] };
  } catch (err) { return { on: [], slash: [] }; }
}());

/** @param {string} name */
function easyOn(name) { return EASY.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function easyUsed(name, event, detail) {
  fetch('/api/easy-start', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* This browser's keeping: every read and write may be refused (a private window, storage turned off). */
/** @param {string} key */
function kept(key) { try { return window.localStorage.getItem('rouh.es.' + key); } catch (err) { return null; } }
/** @param {string} key @param {string} value */
function keep(key, value) { try { window.localStorage.setItem('rouh.es.' + key, value); } catch (err) { /* not kept */ } }

/** Inside See it on a phone's frame the page is a picture of the screen: nothing here acts. */
var FRAMED = (function () { try { return window.self !== window.top; } catch (err) { return true; } }());

/** Go to one of Rouh's own pages, as a link of its own would. @param {string} href */
function goInApp(href) {
  var a = /** @type {HTMLAnchorElement} */ (el('a'));
  a.href = href;
  a.setAttribute('data-inapp', '');
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- chat_ready ---------- */

var READY = { timer: 0, asking: false };

function readyAsk() {
  var box = $('chatSetup');
  if (!box || box.hidden || READY.asking || document.hidden) return;
  READY.asking = true;
  fetch('/api/easy-start/chat', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (got) {
      READY.asking = false;
      if (!got || !got.on || !got.ready || !box || box.hidden) return;
      box.hidden = true;
      readyStop();
      notify('Chat is set up.', { tone: 'success', body: 'Rouh can answer you now. Type a message below.' });
      easyUsed('chat_ready', 'readied', location.pathname);
    }).catch(function () { READY.asking = false; });
}

function readyStop() { if (READY.timer) { window.clearInterval(READY.timer); READY.timer = 0; } }

function readyWatch() {
  var box = $('chatSetup');
  if (!box || box.hidden) { readyStop(); return; }
  if (!READY.timer) READY.timer = window.setInterval(readyAsk, 10000);
}

if (easyOn('chat_ready') && !FRAMED) {
  var setupBox = $('chatSetup');
  if (setupBox) {
    new MutationObserver(readyWatch).observe(setupBox, { attributes: true, attributeFilter: ['hidden'] });
    readyWatch();
    window.addEventListener('focus', readyAsk);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) readyAsk(); });
  }
}

/* ---------- home_screen ---------- */

/** Opened from the home screen already, as an app of its own. */
function standalone() {
  var nav = /** @type {any} */ (navigator);
  return !!(nav.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
}

/** A phone, by what it is rather than by the window's width alone. */
function onPhone() {
  var ua = navigator.userAgent || '';
  var phoneish = /iPhone|iPod|Android.*Mobile|Mobile.*Android/i.test(ua);
  var touch = (navigator.maxTouchPoints || 0) > 0;
  return phoneish && touch && Math.min(window.screen.width, window.screen.height) < 600;
}

/** An iPhone or an iPod, where only the steps can be offered. */
function onIphone() { return /iPhone|iPod/i.test(navigator.userAgent || ''); }

var HOME = { prompt: /** @type {any} */ (null), offered: false };

function homeOffer() {
  if (HOME.offered) return;
  HOME.offered = true;
  keep('home', 'offered');
  if (HOME.prompt) {
    notify('Put Rouh on your home screen?', {
      tone: 'info', kind: 'home_screen', lasting: true,
      body: 'Rouh then opens like an app, from an icon of its own, without the browser around it.',
      action: { label: 'Install', run: function () {
        var p = HOME.prompt;
        HOME.prompt = null;
        if (!p) return;
        p.prompt();
        p.userChoice.then(function (/** @type {any} */ c) {
          if (c && c.outcome === 'accepted') easyUsed('home_screen', 'installed', 'Android');
        }).catch(function () {});
      } }
    });
    return;
  }
  notify('Put Rouh on your home screen?', {
    tone: 'info', kind: 'home_screen', lasting: true,
    body: onIphone()
      ? 'In Safari, press Share (the square with an arrow up), then Add to Home Screen. It opens like an app.'
      : 'In the browser\'s menu (the three dots), press Add to Home screen. It opens like an app.'
  });
}

if (easyOn('home_screen') && !FRAMED) {
  (function () {
    if (standalone()) {
      // Opened from the home screen after it was offered here: that is the use.
      if (kept('home') === 'offered') {
        keep('home', 'used');
        easyUsed('home_screen', 'opened', onIphone() ? 'iPhone' : 'phone');
      }
      return;
    }
    if (!onPhone() || kept('home')) return;
    var visits = (Number(kept('visits')) || 0) + 1;
    keep('visits', String(visits));
    if (visits < 2) return;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      HOME.prompt = e;
    });
    // A moment after the page has settled, so it is not the first thing in a newcomer's face.
    window.setTimeout(homeOffer, 6000);
  }());
}

/* ---------- chat_save ---------- */

/** The chat the box is in now. */
function chatNow() { return String(CHATS.active || CHATS.own || CHATS.general || ''); }

function chatSave() {
  var chat = chatNow();
  if (!chat) return;
  // Through the server, so the whole chat is in it and not only what this page has scrolled to.
  var a = /** @type {HTMLAnchorElement} */ (el('a'));
  // Named as the screen names it (the tab's title starts with the chat's name): General's own row is "New chat".
  var shown = String(document.title || '').split(' | ')[0].trim();
  a.href = '/api/easy-start/chat-file?chat=' + encodeURIComponent(chat) + (shown && shown !== 'Rouh' ? '&name=' + encodeURIComponent(shown) : '');
  a.setAttribute('download', '');
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  notify('Saving this chat as a file.', { tone: 'success', body: 'It is in your downloads, as plain text, every message with who said it and when.' });
}

/** Save this chat as a file, at the foot of Chat Options' left column, which is drawn anew each time. */
function saveRow() {
  var pop = $('readingPop');
  var main = pop ? pop.querySelector('.reading-main') : null;
  if (!main || main.querySelector('.es-save')) return;
  var sec = el('div', 'reading-sec es-save');
  var b = el('button', 'ctl small es-save-btn', 'Save this chat as a file');
  b.type = 'button';
  b.id = 'saveChatBtn';
  b.title = 'The whole chat as plain text, every message with who said it and when';
  b.addEventListener('click', chatSave);
  sec.appendChild(b);
  main.appendChild(sec);
}

if (easyOn('chat_save') && !FRAMED) {
  var readPop = $('readingPop');
  if (readPop) new MutationObserver(saveRow).observe(readPop, { childList: true, subtree: true });
}

/* ---------- slash_menu ---------- */

var input = /** @type {HTMLTextAreaElement | null} */ ($('input'));
var SL = { list: /** @type {HTMLElement | null} */ (null), shown: /** @type {{id: string, name: string, also: string}[]} */ ([]), at: 0 };

/** Whether an item can be done here, now. @param {string} id */
function slashCan(id) {
  if (id === 'save') return easyOn('chat_save');
  if (id === 'setup') { var box = $('chatSetup'); return !!box && !box.hidden; }
  return true;
}

/** What the words typed after the slash narrow it to. @param {string} q */
function slashMatch(q) {
  q = q.toLowerCase().trim();
  return EASY.slash.filter(function (s) {
    if (!slashCan(s.id)) return false;
    if (!q) return true;
    return (s.name + ' ' + s.also).toLowerCase().split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })
      || s.name.toLowerCase().indexOf(q) >= 0;
  });
}

function slashClose() {
  if (SL.list) SL.list.hidden = true;
  var form = $('composer');
  if (form) form.classList.remove('slash-open');
  SL.shown = [];
  if (input) { input.removeAttribute('aria-activedescendant'); input.setAttribute('aria-expanded', 'false'); }
}

function slashDraw() {
  if (!input || !SL.list) return;
  var list = SL.list;
  list.textContent = '';
  var form = $('composer');
  if (form) form.classList.add('slash-open');
  var head = el('li', 'slash-head', 'What you can do here. Enter does it, Escape goes back to writing.');
  head.setAttribute('role', 'presentation');
  list.appendChild(head);
  if (!SL.shown.length) {
    var none = el('li', 'slash-none', 'Nothing by that name. Delete the slash to write a message.');
    none.setAttribute('role', 'presentation');
    list.appendChild(none);
  }
  SL.shown.forEach(function (s, i) {
    var li = el('li', 'slash-item' + (i === SL.at ? ' on' : ''), s.name);
    li.id = 'slashItem' + i;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === SL.at ? 'true' : 'false');
    li.addEventListener('mousedown', function (e) { e.preventDefault(); });
    li.addEventListener('click', function () { slashDo(s); });
    list.appendChild(li);
  });
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (SL.shown.length) input.setAttribute('aria-activedescendant', 'slashItem' + SL.at);
}

/** @param {{id: string, name: string}} s */
function slashDo(s) {
  slashClose();
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  easyUsed('slash_menu', 'done', s.id);
  if (s.id === 'save') chatSave();
  else if (s.id === 'setup') {
    var go = /** @type {HTMLAnchorElement | null} */ ($('chatSetupGo'));
    goInApp(go && go.getAttribute('href') && go.getAttribute('href') !== '#' ? String(go.getAttribute('href')) : '/anatomy/behaviour/models');
  }
  else if (s.id === 'guide') goInApp('/guide');
}

if (easyOn('slash_menu') && input && EASY.slash.length && !FRAMED) {
  (function () {
    var box = /** @type {HTMLTextAreaElement} */ (input);
    var list = el('ul', 'slash-list');
    list.id = 'slashList';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'What you can do here');
    list.hidden = true;
    SL.list = list;
    var host = box.closest('form') || box.parentElement;
    if (!host) return;
    host.appendChild(list);
    box.setAttribute('aria-controls', 'slashList');
    box.setAttribute('aria-autocomplete', 'list');
    box.setAttribute('aria-expanded', 'false');
    box.addEventListener('input', function () {
      var v = box.value;
      if (v.charAt(0) !== '/' || /\n/.test(v) || v.length > 30) { slashClose(); return; }
      SL.shown = slashMatch(v.slice(1));
      SL.at = 0;
      slashDraw();
    });
    // In capture, before the box's own keys: Enter would send "/" to Rouh, and Up bring back the last message.
    box.addEventListener('keydown', function (e) {
      if (!SL.list || SL.list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!SL.shown.length) return;
        SL.at = (SL.at + (e.key === 'ArrowDown' ? 1 : SL.shown.length - 1)) % SL.shown.length;
        slashDraw();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (SL.shown[SL.at]) slashDo(SL.shown[SL.at]);
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        slashClose();
      }
    }, true);
    box.addEventListener('blur', function () { window.setTimeout(slashClose, 150); });
    // Said where it is found: in the box's own grey words, before what they say about Shift+Enter
    // (`hintPut` in app/chats.js), and again whenever whoever sets them sets them anew.
    var KEYS = ' · Shift+Enter for a new line';
    var MORE = ' · / for more';
    function slashHint() {
      var p = box.getAttribute('placeholder') || '';
      if (!p || p.indexOf(MORE) >= 0) return;
      var keys = p.slice(-KEYS.length) === KEYS;
      box.setAttribute('placeholder', (keys ? p.slice(0, -KEYS.length) : p) + MORE + (keys ? KEYS : ''));
    }
    new MutationObserver(slashHint).observe(box, { attributes: true, attributeFilter: ['placeholder'] });
    slashHint();
  }());
}

export { chatSave };
