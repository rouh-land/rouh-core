/* Rouh's page, three genes for building Rouh faster (`rouh/build_faster.py`, night 55).
 *
 * Outside the chain, like app/build_proof.js, and imported by app.js after it. The page is told which
 * are on, and the workspace of Rouh's own code, in `#rouhBuildFaster`. Each opens Start a run with
 * its brief written; nothing starts until the person presses Start.
 *
 * - error_fix: a red error notice with nothing to press offers Fix it (`ON_ERROR` in
 *   app/notices.js): the error's words, the screen's address and the page's last script errors.
 * - run_undo: a run whose work landed has Take it back on its head (`#oneUndo`, drawn from the
 *   `rouh:run-head` event of `oneRenderHead` in app/runs.js): a revert of what it landed.
 * - chat_to_run: each of the person's own messages in the chat has Make it a run beside its
 *   buttons, with the message as the brief.
 * - world_ready is the server's and e2e.sh's alone.
 */
import { $, el } from 'app/helpers.js';
import { ON_ERROR } from 'app/notices.js';
import { oneStartOpen } from 'app/runs.js';

/** @type {{on: string[], code: string}} */
var FASTER = (function () {
  try {
    var node = document.getElementById('rouhBuildFaster');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], code: String(got.code || '') };
  } catch (err) { return { on: [], code: '' }; }
}());

/** @param {string} name */
function fasterOn(name) { return FASTER.on.indexOf(name) >= 0 && !!FASTER.code; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function fasterUsed(name, event, detail) {
  fetch('/api/build-faster', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* Which of the three opened Start a run last, so that pressing Start counts as its use. */
var OPENED = { by: '', what: '' };

/** Start a run, opened by one of the three. @param {string} by @param {string} brief @param {string} space @param {string} what */
function openStart(by, brief, space, what) {
  OPENED.by = by;
  OPENED.what = what;
  fasterUsed(by, 'opened', what);
  oneStartOpen({ brief: brief, space: space || FASTER.code, agent: 'claude' });
  var box = /** @type {HTMLTextAreaElement | null} */ ($('oneStartBrief'));
  // The cursor after the last line, where the person's own words go.
  if (box) { box.selectionStart = box.selectionEnd = box.value.length; box.scrollTop = box.scrollHeight; }
}

/** The line a brief ends with, left for the person's own words. */
var LEFT = 'Anything else:';

(function watchStart() {
  var form = $('oneStartForm');
  var dialog = /** @type {HTMLDialogElement | null} */ ($('oneStartDialog'));
  if (!form || !dialog) return;
  form.addEventListener('submit', function () {
    if (!OPENED.by) return;
    fasterUsed(OPENED.by, 'started', OPENED.what);
    OPENED.by = '';
  }, true);
  dialog.addEventListener('close', function () {
    // Closed with Start, the submit above came first; closed any other way, nothing was started.
    setTimeout(function () { OPENED.by = ''; }, 0);
  });
}());

/* ---------- error_fix ---------- */

/** The page's last few script errors, newest last, for the brief. @type {string[]} */
var SCRIPT_ERRORS = [];
window.addEventListener('error', function (e) {
  var where = e.filename ? ' (' + String(e.filename).replace(/^https?:\/\/[^/]+/, '') + ':' + e.lineno + ')' : '';
  SCRIPT_ERRORS.push(String(e.message || 'error') + where);
  if (SCRIPT_ERRORS.length > 5) SCRIPT_ERRORS.shift();
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e.reason;
  SCRIPT_ERRORS.push('Unhandled: ' + String(r && r.message ? r.message : r));
  if (SCRIPT_ERRORS.length > 5) SCRIPT_ERRORS.shift();
});

/** The brief Fix it writes. @param {string} title @param {string} body */
function errorBrief(title, body) {
  var said = (title + (body ? ' ' + body : '')).trim();
  var lines = [
    'Rouh showed this error on its own screen, and it should not have:',
    '',
    '> ' + said.replace(/\n+/g, ' '),
    '',
    'Where: ' + location.pathname + location.search + ' (the screen it was on), at ' + new Date().toISOString() + '.',
    'The window was ' + window.innerWidth + ' by ' + window.innerHeight + '.'
  ];
  if (SCRIPT_ERRORS.length) {
    lines.push('', 'The page\'s last script errors:');
    SCRIPT_ERRORS.forEach(function (s) { lines.push('- ' + s); });
  }
  lines.push('', 'Find where it comes from, drive the browser to it and watch it fail, fix the cause rather than '
    + 'hiding the notice, watch it not fail, and land it.', '', LEFT + ' ');
  return lines.join('\n');
}

/** An error about a key, credit or a limit is the account's to put right, not the code's. */
var NOT_CODE = /api key|valid key|credit|billing|quota|rate limit|spending limit|insufficient|offline|sign in again/i;

ON_ERROR.offer = function (title, body) {
  if (!fasterOn('error_fix') || NOT_CODE.test(title + ' ' + body)) return null;
  return { label: 'Fix it', run: function () { openStart('error_fix', errorBrief(title, body), FASTER.code, title.slice(0, 100)); } };
};

/* ---------- run_undo ---------- */

/** The run on the head now. @type {any} */
var HEAD = null;

/** The brief Take it back writes. @param {any} run */
function undoBrief(run) {
  var sha = String(run.landed || '');
  var files = Array.isArray(run.files) ? run.files.slice(0, 20) : [];
  var lines = [
    'Take back what an earlier run landed, because it is not wanted.',
    '',
    'The run: ' + String(run.id) + ', “' + String(run.title || 'untitled') + '”.',
    'It landed on ' + String(run.target || 'main') + ' at ' + sha + (run.deployed ? ', and it was deployed.' : '.'),
  ];
  if (files.length) {
    lines.push('The files it changed:');
    files.forEach(function (/** @type {any} */ f) { lines.push('- ' + String(f && f.path ? f.path : f)); });
  }
  lines.push('', 'Find every commit that run landed (`git log` ending at ' + sha.slice(0, 12) + ', the commits with its '
    + 'title or its Gene line), revert them with `git revert` newest first, keeping anything that landed after it '
    + 'and depends on it working, prove in a test world that the app starts and what it changed is gone, '
    + 'and land the revert.', '', LEFT + ' ');
  return lines.join('\n');
}

window.addEventListener('rouh:run-head', function (e) {
  var run = /** @type {CustomEvent} */ (e).detail;
  HEAD = run;
  var b = $('oneUndo');
  if (!b) return;
  b.hidden = !(fasterOn('run_undo') && run && run.kind === 'agent' && run.landed);
});

(function () {
  var b = $('oneUndo');
  if (!b) return;
  b.addEventListener('click', function () {
    if (!HEAD || !HEAD.landed) return;
    openStart('run_undo', undoBrief(HEAD), String(HEAD.space || ''), String(HEAD.id));
  });
}());

/* ---------- chat_to_run ---------- */

var RUN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5l11 7-11 7z"/></svg>';

/** The words of one of the person's messages, as written. @param {Element} turn */
function myWords(turn) {
  var parts = [];
  turn.querySelectorAll(':scope > .turn-body').forEach(function (b) {
    var t = (/** @type {HTMLElement} */ (b).innerText || '').trim();
    if (t) parts.push(t);
  });
  return parts.join('\n\n');
}

/** Make it a run, beside one message's buttons. @param {Element} row */
function addRunBtn(row) {
  if (row.querySelector('.act-makerun')) return;
  var b = el('button', 'act act-makerun');
  b.setAttribute('type', 'button');
  b.title = 'Make it a run: Start a run on Rouh\'s code with this message as the brief';
  b.setAttribute('aria-label', 'Make it a run');
  b.innerHTML = RUN_ICON;
  b.addEventListener('click', function () {
    var turn = row.parentElement;
    var words = turn ? myWords(turn) : '';
    if (!words) return;
    openStart('chat_to_run', words, FASTER.code, words.slice(0, 100));
  });
  // After Edit, before the clock: the clock is last of the person's own.
  var when = row.querySelector(':scope > .act-when');
  if (when) row.insertBefore(b, when); else row.appendChild(b);
}

function runBtns() {
  if (!fasterOn('chat_to_run')) return;
  var host = $('transcript');
  if (!host) return;
  host.querySelectorAll('.turn.user:not(.askai):not(.room-guest) > .turn-acts').forEach(addRunBtn);
}

(function () {
  var host = $('transcript');
  if (!host || !fasterOn('chat_to_run')) return;
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; runBtns(); });
  }).observe(host, { childList: true, subtree: true });
  runBtns();
}());
