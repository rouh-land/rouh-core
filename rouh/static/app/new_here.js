/* Rouh's page, four genes for somebody new to Rouh (`rouh/new_here.py`, night 57).
 *
 * Outside the chain, like app/easy_start.js, and imported by app.js after it, and by app/runs.js
 * for key_kept. The page is told which are on in `#rouhNewHere`.
 *
 * - key_kept: on the Models page a refused key stays in its box with the reason under it
 *   (`keyKeptRefused` in app/runs.js asks `newHereOn`).
 * - caps_lock and show_password work on the pages in front of the sign-in
 *   (rouh/static/new_here_signin.js); what they kept in this tab's session is counted here, once
 *   the person is in.
 * - tap_choices: when Rouh's newest answer asks which of a short list you want, each choice is a
 *   button under it, and a press sends it as your answer.
 */
import { $, el } from 'app/helpers.js';

/** @type {{on: string[]}} */
var HERE = (function () {
  try {
    var node = document.getElementById('rouhNewHere');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [] };
  } catch (err) { return { on: [] }; }
}());

/** @param {string} name */
function newHereOn(name) { return HERE.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} [detail] */
function newHereUsed(name, event, detail) {
  fetch('/api/new-here', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* ---------- caps_lock and show_password: what the sign-in kept ---------- */

[['caps_lock', 'warned'], ['show_password', 'shown']].forEach(function (pair) {
  try {
    var key = 'rouh.nh.' + pair[0];
    if (!sessionStorage.getItem(key)) return;
    sessionStorage.removeItem(key);
    if (newHereOn(pair[0])) newHereUsed(pair[0], pair[1], 'on the sign-in');
  } catch (err) { /* no storage: nothing kept */ }
});

/* ---------- tap_choices ---------- */

/** The most choices that are buttons, and the longest one, in letters. */
var MOST = 6;
var LONGEST = 100;

/** A list item's words as an answer: its bold start when it has one, else the item up to a dash or
 *  a colon when it goes on to explain itself. @param {Element} li */
function choiceWords(li) {
  var whole = String(li.textContent || '').replace(/\s+/g, ' ').trim();
  var lead = li.firstElementChild;
  if (lead && /^(STRONG|B)$/.test(lead.tagName)) {
    var bold = String(lead.textContent || '').replace(/\s+/g, ' ').trim();
    if (bold && whole.indexOf(bold) === 0) whole = bold;
  }
  if (whole.length > 40) {
    var cut = whole.split(/\s[-–]\s|:\s/)[0];
    if (cut && cut.length >= 2) whole = cut;
  }
  return whole.replace(/[.;,:]+$/, '').trim();
}

/** Everything said after a node in the answer, its own later siblings and its holders'.
 * @param {Element} node @param {Element} body */
function textAfter(node, body) {
  var said = '';
  for (var at = node; at && at !== body; at = at.parentElement) {
    for (var n = at.nextElementSibling; n; n = n.nextElementSibling) said += ' ' + (n.textContent || '');
  }
  return said.replace(/\s+/g, ' ').trim();
}

/** The choices the newest answer offers, or none: a short list with a question just before or after
 *  it, at the end of the answer. @param {Element} body @returns {string[]} */
function choicesIn(body) {
  var lists = body.querySelectorAll('ol, ul');
  if (!lists.length) return [];
  var list = lists[lists.length - 1];
  if (list.querySelector('ol, ul')) return [];
  var items = Array.prototype.filter.call(list.children, function (/** @type {Element} */ c) { return c.tagName === 'LI'; });
  if (items.length < 2 || items.length > MOST) return [];
  var words = items.map(choiceWords);
  if (words.some(function (/** @type {string} */ w) { return !w || w.length > LONGEST; })) return [];
  var after = textAfter(list, body);
  var before = list.previousElementSibling ? String(list.previousElementSibling.textContent || '').trim() : '';
  // Asked after the list ("Which of these?"), or just before it ("Which would you like?"), and the list
  // the last thing said but that question.
  var asked = after ? (after.length <= 240 && /\?$/.test(after)) : /\?\s*$|\?[^.!?]*:\s*$/.test(before);
  if (!asked) return [];
  // The same words twice is not a choice between them.
  return words.filter(function (/** @type {string} */ w, /** @type {number} */ i) { return words.indexOf(w) === i; });
}

var TAP = { timer: 0 };

function tapDraw() {
  var t = $('transcript');
  if (!t) return;
  var turns = t.querySelectorAll(':scope > .turn');
  var last = turns.length ? turns[turns.length - 1] : null;
  // Only the newest answer, and only once it has stopped being written.
  t.querySelectorAll('.tap-choices').forEach(function (row) { if (!last || row.parentNode !== last) row.remove(); });
  if (!last || !last.classList.contains('assistant') || last.classList.contains('typing')) return;
  if (t.querySelector('.turn.typing') || last.querySelector('.tap-choices')) return;
  var bodies = last.querySelectorAll(':scope > .turn-body:not(.dots)');
  var body = bodies.length ? bodies[bodies.length - 1] : null;
  if (!body) return;
  var choices = choicesIn(body);
  if (choices.length < 2) return;
  var row = el('div', 'tap-choices');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Answer with a press');
  choices.forEach(function (words) {
    var b = el('button', 'tap-choice', words);
    b.type = 'button';
    b.title = 'Send "' + words + '" as your answer';
    b.addEventListener('click', function () { tapSend(words); });
    row.appendChild(b);
  });
  body.parentNode.insertBefore(row, body.nextSibling);
}

/** Send the choice as the person's answer, as if typed and sent. @param {string} words */
function tapSend(words) {
  var box = /** @type {HTMLTextAreaElement | null} */ ($('input'));
  var form = /** @type {HTMLFormElement | null} */ ($('composer'));
  if (!box || !form) return;
  box.value = words;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelectorAll('#transcript .tap-choices').forEach(function (row) { row.remove(); });
  newHereUsed('tap_choices', 'tapped', words);
  if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
}

if (newHereOn('tap_choices')) {
  var tr = $('transcript');
  if (tr) {
    new MutationObserver(function (changes) {
      // Its own row coming and going is not a change of the answer.
      var ours = changes.every(function (c) {
        var all = Array.prototype.slice.call(c.addedNodes).concat(Array.prototype.slice.call(c.removedNodes));
        return all.length > 0 && all.every(function (/** @type {Node} */ n) {
          return n instanceof Element && n.classList.contains('tap-choices');
        });
      });
      if (ours) return;
      window.clearTimeout(TAP.timer);
      TAP.timer = window.setTimeout(tapDraw, 700);
    }).observe(tr, { childList: true, subtree: true });
    window.setTimeout(tapDraw, 700);
  }
}

export { newHereOn, newHereUsed };
