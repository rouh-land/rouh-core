/* Rouh's page, four genes for somebody using Rouh for the first time (`rouh/newcomer.py`, night 51).
 *
 * Outside the chain, like app/tips.js, and imported by app.js after it. The page is told which are
 * on, and the plain lines still to show, in `#rouhNewcomer`:
 *
 * - nav_plain: the column of each navigation group's links starts with one plain sentence of what
 *   is in it, with Got it, which puts it away for this person on every device (POST /api/newcomer).
 * - keys_list: ? pressed outside a text box, a terminal or a dialog lists every key Rouh answers
 *   to, and what each does.
 * - search_typos and search_lessons are Search's (`app/search.js`): it reports their use with
 *   `newcomerUsed` from here.
 */
import { $, el } from 'app/helpers.js';

/** @type {{on: string[], plain?: Record<string, string>}} */
var NEW = (function () {
  try {
    var node = document.getElementById('rouhNewcomer');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], plain: got.plain || {} };
  } catch (err) { return { on: [], plain: {} }; }
}());

/** @param {string} name */
function newcomerOn(name) { return NEW.on.indexOf(name) >= 0; }

/** One of the four used: counted by the server. @param {string} name @param {string} [detail] */
function newcomerUsed(name, detail) {
  fetch('/api/newcomer', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, detail: String(detail || '') }) }).catch(function () {});
}

/* nav_plain: one plain line at the top of each group's links, until Got it. */
(function () {
  if (!newcomerOn('nav_plain')) return;
  var lines = NEW.plain || {};
  Object.keys(lines).forEach(function (group) {
    var panel = $('navGroup-' + group);
    if (!panel) return;
    var box = el('div', 'nav-plain');
    box.id = 'navPlain-' + group;
    box.appendChild(el('p', 'nav-plain-text', lines[group]));
    var ok = el('button', 'nav-plain-ok', 'Got it');
    ok.type = 'button';
    ok.setAttribute('aria-label', 'Got it: hide this line about ' + (panel.getAttribute('aria-label') || group));
    ok.addEventListener('click', function () {
      box.remove();
      newcomerUsed('nav_plain', group);
    });
    box.appendChild(ok);
    panel.insertBefore(box, panel.firstChild);
  });
}());

/* keys_list: ? lists the keys Rouh answers to. */
var MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
var CMD = MAC ? '⌘' : 'Ctrl+';

/** @returns {[string, string][]} Each key, and what it does, in the order a newcomer needs them. */
function keysRows() {
  return [
    [CMD + 'K', 'Search everything: chats, tasks, pages, runs and Rouh’s own pages'],
    [CMD + 'B', 'Show or hide the navigation'],
    ['Enter', 'Send what you typed'],
    ['Shift+Enter', 'A new line in what you are typing'],
    [CMD + 'Enter', 'Fork the chat: send it as a side chat of its own'],
    ['Ctrl+Shift+Space', 'Start or stop dictation'],
    ['Escape', 'Close what is open over the canvas, one step at a time; while Rouh is answering, stop the answer'],
    ['1 to 4', 'Answer a conflict card with the choice of that number'],
    ['Arrow keys', 'Move between the navigation’s groups, and between the rows of Search'],
    ['?', 'This list'],
  ];
}

function keysDialog() {
  var dlg = /** @type {HTMLDialogElement | null} */ ($('keysDialog'));
  if (dlg) return dlg;
  dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'one-dialog keys-dialog'));
  dlg.id = 'keysDialog';
  dlg.setAttribute('aria-labelledby', 'keysHead');
  var form = el('form', 'keys-form');
  form.setAttribute('method', 'dialog');
  var head = el('h2', null, 'Keys Rouh answers to');
  head.id = 'keysHead';
  form.appendChild(head);
  form.appendChild(el('p', 'hint', 'On a desk’s keyboard. On a phone, every one of these is a button too.'));
  var list = el('dl', 'keys-list');
  keysRows().forEach(function (row) {
    var dt = el('dt');
    dt.appendChild(el('kbd', null, row[0]));
    list.appendChild(dt);
    list.appendChild(el('dd', null, row[1]));
  });
  form.appendChild(list);
  var acts = el('div', 'one-actions');
  var close = el('button', 'ctl small primary', 'Close');
  close.setAttribute('value', 'close');
  acts.appendChild(close);
  form.appendChild(acts);
  dlg.appendChild(form);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  document.body.appendChild(dlg);
  return dlg;
}

function keysShow() {
  var dlg = keysDialog();
  if (dlg.open) return;
  dlg.showModal();
  newcomerUsed('keys_list', 'opened');
}

document.addEventListener('keydown', function (e) {
  if (e.key !== '?' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!newcomerOn('keys_list')) return;
  var where = /** @type {Element | null} */ (document.activeElement);
  if (where && where.closest && where.closest('input, textarea, select, dialog, [contenteditable="true"], .one-term-wrap, .web-screen.mine')) return;
  if (document.querySelector('dialog[open]')) return;
  e.preventDefault();
  keysShow();
});

export { keysShow, newcomerOn, newcomerUsed };
