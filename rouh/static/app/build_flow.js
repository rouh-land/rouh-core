/* Rouh's page, three genes for building Rouh faster (`rouh/build_flow.py`, night 56).
 *
 * Outside the chain, like app/build_faster.js, and imported by app.js after it. The page is told which
 * are on, the workspace of Rouh's own code and how many briefs are saved, in `#rouhBuildFlow`.
 *
 * - page_broke: a script error of Rouh's own page is said once, as a notice with Fix it (Start a run
 *   on Rouh's code with the error written) or, where this Rouh has no code to change, Copy the details.
 * - phone_view: See it on a phone (the menu's link presses `#phoneViewBtn`): the screen you are on,
 *   live, in a phone-sized frame; Escape or Close puts it away.
 * - run_later: Start a run on Rouh's code has Save for later, and says how many are saved, with Add
 *   them to put them into the brief.
 * - errors_brief is the server's alone.
 */
import { sbSet } from 'app/controls.js';
import { $, el } from 'app/helpers.js';
import { notify } from 'app/notices.js';
import { oneStartOpen } from 'app/runs.js';

/** @type {{on: string[], code: string, saved: number}} */
var FLOW = (function () {
  try {
    var node = document.getElementById('rouhBuildFlow');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], code: String(got.code || ''), saved: Number(got.saved) || 0 };
  } catch (err) { return { on: [], code: '', saved: 0 }; }
}());

/** @param {string} name */
function flowOn(name) { return FLOW.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function flowUsed(name, event, detail) {
  fetch('/api/build-flow', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/** Inside the phone frame the page is the person's screen, not a second desk: nothing here is offered. */
var FRAMED = (function () { try { return window.self !== window.top; } catch (err) { return true; } }());

/* ---------- page_broke ---------- */

var BROKE = { said: /** @type {string[]} */ ([]), expect: false };

/** Not Rouh's own, or nothing to fix: an extension's script, another site's, the browser's own noise. */
var NOISE = /ResizeObserver loop|Script error\.?$|^Load failed$|NetworkError|Failed to fetch|AbortError|The operation was aborted|play\(\) (request|failed)|NotAllowedError/i;

/** The brief Fix it writes. @param {string} what @param {string} where @param {string} stack */
function brokeBrief(what, where, stack) {
  var lines = [
    'A script on Rouh\'s own page failed, and the screen said so:',
    '',
    '> ' + what,
    '',
    'In: ' + (where || 'the page') + '.',
    'The screen: ' + location.pathname + location.search + ', at ' + new Date().toISOString()
      + ', in a window ' + window.innerWidth + ' by ' + window.innerHeight + '.',
    'The browser: ' + navigator.userAgent + '.'
  ];
  if (stack) lines.push('', 'Where it was called from:', '```', stack.split('\n').slice(0, 12).join('\n'), '```');
  lines.push('', 'Drive the browser to that screen and watch it fail, fix the cause, watch it not fail, and land it.');
  return lines.join('\n');
}

/** Say it once. @param {string} what @param {string} where @param {string} stack */
function brokeSay(what, where, stack) {
  what = String(what || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'An error with no words';
  var key = what + '|' + where;
  if (BROKE.said.indexOf(key) >= 0 || BROKE.said.length >= 3) return;
  BROKE.said.push(key);
  var details = brokeBrief(what, where, stack);
  // Said to a person: the browser's "Uncaught" is noise, and the error is a sentence of its own.
  var plain = what.replace(/^Uncaught\s+/, '');
  if (!/[.!?]$/.test(plain)) plain += '.';
  /** @type {{label: string, run: () => void}} */
  var action = FLOW.code ? {
    label: 'Fix it',
    run: function () {
      flowUsed('page_broke', 'opened', what);
      BROKE.expect = true;
      oneStartOpen({ brief: details, space: FLOW.code, agent: 'claude' });
    }
  } : {
    label: 'Copy the details',
    run: function () {
      flowUsed('page_broke', 'copied', what);
      try { navigator.clipboard.writeText(details); } catch (err) { /* nothing copied */ }
      notify('The details are copied.', { tone: 'success', body: 'Paste them to whoever looks after this Rouh.' });
    }
  };
  notify('Something on this screen stopped working.', {
    tone: 'warning', kind: 'page_broke',
    body: 'A part of the page failed: ' + plain + (FLOW.code ? ' Fix it starts a run that finds and fixes it.' : ''),
    action: action, for: 15000
  });
}

/** Whether a file is one of this page's own scripts. @param {string} file */
function ours(file) {
  if (!file) return false;
  try { return new URL(file, location.href).origin === location.origin; } catch (err) { return false; }
}

if (flowOn('page_broke') && !FRAMED) {
  window.addEventListener('error', function (e) {
    // A picture or a script that did not load is an event with no message and no file: not this.
    if (!e.message || !ours(e.filename) || NOISE.test(e.message)) return;
    var file = String(e.filename).replace(/^https?:\/\/[^/]+/, '').replace(/^\/a\/[0-9a-f]+\//, 'rouh/static/');
    var stack = e.error && e.error.stack ? String(e.error.stack) : '';
    brokeSay(String(e.message), file + ':' + e.lineno + ':' + e.colno, stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = r && r.message ? String(r.message) : String(r);
    var stack = r && r.stack ? String(r.stack) : '';
    // Only a failure that came out of the page's own code says where; anything else is not ours.
    if (!stack || stack.indexOf(location.origin) < 0 || NOISE.test(msg) || (r && r.name === 'AbortError')) return;
    var first = (stack.split('\n').filter(function (l) { return l.indexOf(location.origin) >= 0; })[0] || '').trim();
    brokeSay(msg, first.replace(location.origin, '').replace(/^at\s+/, ''), stack);
  });
  window.addEventListener('rouh:run-started', function (e) {
    var m = /** @type {CustomEvent} */ (e).detail || {};
    if (!BROKE.expect) return;
    BROKE.expect = false;
    if (m.ok && m.id) flowUsed('page_broke', 'started', String(m.id));
  });
  var dlgB = $('oneStartDialog');
  if (dlgB) dlgB.addEventListener('close', function () { window.setTimeout(function () { BROKE.expect = false; }, 4000); });
}

/* ---------- phone_view ---------- */

/** The phone's size: an iPhone's, as every change is proved at. */
var PHONE = { w: 390, h: 844 };

function phoneOpen() {
  if (window.innerWidth < 700) {
    notify('This screen is already a phone\'s width.', { tone: 'info' });
    return;
  }
  // The menu it was pressed in goes, so the screen it shows is the one behind it.
  sbSet(false);
  var old = $('phoneView');
  if (old) old.remove();
  var dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'phone-view'));
  dlg.id = 'phoneView';
  dlg.setAttribute('aria-labelledby', 'phoneViewHead');
  var head = el('div', 'phone-view-head');
  var h = el('h2', '', 'On a phone');
  h.id = 'phoneViewHead';
  var size = el('span', 'phone-view-size', PHONE.w + ' by ' + PHONE.h);
  var again = el('button', 'ctl small', 'Reload');
  again.type = 'button';
  var shut = el('button', 'ctl small primary', 'Close');
  shut.type = 'button';
  head.append(h, size, again, shut);
  var frame = /** @type {HTMLIFrameElement} */ (el('iframe', 'phone-view-frame'));
  frame.title = 'This screen as a phone shows it';
  frame.width = String(PHONE.w);
  frame.height = String(PHONE.h);
  frame.src = location.pathname + location.search;
  var fit = el('div', 'phone-view-fit');
  fit.appendChild(frame);
  dlg.append(head, fit);
  document.body.appendChild(dlg);
  function scale() {
    var room = window.innerHeight - 120;
    var k = Math.min(1, room / PHONE.h);
    frame.style.transform = 'scale(' + k + ')';
    fit.style.width = Math.round(PHONE.w * k) + 'px';
    fit.style.height = Math.round(PHONE.h * k) + 'px';
  }
  scale();
  window.addEventListener('resize', scale);
  // The page in the frame takes the keyboard when it loads (its chat box), so Escape there closes it too.
  frame.addEventListener('load', function () {
    try {
      var inner = frame.contentWindow;
      if (inner) inner.addEventListener('keydown', function (e) { if (e.key === 'Escape') dlg.close(); });
    } catch (err) { /* another origin: Close still works */ }
  });
  again.addEventListener('click', function () { frame.src = location.pathname + location.search; });
  shut.addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { window.removeEventListener('resize', scale); dlg.remove(); });
  dlg.showModal();
  shut.focus();
  flowUsed('phone_view', 'opened', location.pathname);
}

if (flowOn('phone_view') && !FRAMED) {
  var goPhone = $('phoneViewBtn');
  if (goPhone) goPhone.addEventListener('click', phoneOpen);
}

/* ---------- run_later ---------- */

/** What the dialog's space picker says now. */
function spaceNow() {
  var pick = /** @type {HTMLSelectElement | null} */ ($('oneStartSpace'));
  return pick ? pick.value : '';
}

/** The brief's box. */
function briefBox() { return /** @type {HTMLTextAreaElement | null} */ ($('oneStartBrief')); }

/** Put words in the brief as if typed, so it is kept as a draft would be. @param {string} text */
function briefSet(text) {
  var box = briefBox();
  if (!box) return;
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.focus();
  box.selectionStart = box.selectionEnd = box.value.length;
}

/** The row over the buttons: how many are saved, and Add them. @param {number} n */
function laterDraw(n) {
  var row = $('runLaterRow');
  var save = $('runLaterSave');
  var forCode = !!FLOW.code && spaceNow() === FLOW.code;
  if (save) save.hidden = !forCode;
  if (!row) return;
  row.hidden = !(forCode && n > 0);
  var say = $('runLaterSay');
  if (say) say.textContent = n === 1 ? 'One brief is saved for the next run.' : n + ' briefs are saved for the next run.';
  var add = $('runLaterAdd');
  if (add) add.textContent = n === 1 ? 'Add it' : 'Add them';
}

function laterRefresh() {
  laterDraw(FLOW.saved);
  if (!FLOW.code || spaceNow() !== FLOW.code) return;
  fetch('/api/build-flow/later', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (got) {
      if (!got || !Array.isArray(got.saved)) return;
      FLOW.saved = got.saved.length;
      laterDraw(FLOW.saved);
    }).catch(function () {});
}

/** POST to the saved briefs. @param {any} body */
function laterPost(body) {
  return fetch('/api/build-flow/later', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.ok ? r.json() : null; });
}

function laterSave() {
  var box = briefBox();
  var text = box ? box.value.trim() : '';
  if (!text) { if (box) box.focus(); return; }
  laterPost({ brief: text }).then(function (got) {
    if (!got) { notify('It could not be saved for later.', { tone: 'error' }); return; }
    FLOW.saved = Number(got.saved) || FLOW.saved + 1;
    briefSet('');
    var dlg = /** @type {HTMLDialogElement | null} */ ($('oneStartDialog'));
    if (dlg && dlg.open) dlg.close();
    notify('Saved for the next run.', { tone: 'success',
      body: (FLOW.saved === 1 ? 'It is the only one saved.' : FLOW.saved + ' are saved now.')
        + ' The next time you start a run on Rouh\'s code, Add them puts them into its brief.' });
  }).catch(function () { notify('It could not be saved for later.', { tone: 'error' }); });
}

function laterAdd() {
  laterPost({ take: true }).then(function (got) {
    var taken = got && Array.isArray(got.taken) ? got.taken : [];
    if (!taken.length) { FLOW.saved = 0; laterDraw(0); return; }
    var box = briefBox();
    var now = box ? box.value.trim() : '';
    var list = taken.map(function (/** @type {string} */ t, /** @type {number} */ i) {
      return (i + 1) + '. ' + String(t).trim().replace(/\n/g, '\n   ');
    }).join('\n\n');
    var text = now
      ? now + '\n\nAnd, in the same run, what I saved for it:\n\n' + list
      : 'Do each of these in one run, one commit each where they are separate:\n\n' + list;
    briefSet(text);
    FLOW.saved = 0;
    laterDraw(0);
  }).catch(function () {});
}

if (flowOn('run_later') && FLOW.code && !FRAMED) {
  (function () {
    var form = $('oneStartForm');
    var actions = form ? form.querySelector('.one-actions') : null;
    var dlg = $('oneStartDialog');
    if (!form || !actions || !dlg) return;
    var row = el('div', 'run-later');
    row.id = 'runLaterRow';
    row.setAttribute('role', 'status');
    row.hidden = true;
    var say = el('p', 'run-later-say');
    say.id = 'runLaterSay';
    var add = el('button', 'ctl small', 'Add them');
    add.type = 'button';
    add.id = 'runLaterAdd';
    add.addEventListener('click', laterAdd);
    row.append(say, add);
    actions.parentNode.insertBefore(row, actions);
    var save = el('button', 'ctl small', 'Save for later');
    save.type = 'button';
    save.id = 'runLaterSave';
    save.title = 'Keep this brief, and add it to the next run on Rouh\'s code';
    save.hidden = true;
    save.addEventListener('click', laterSave);
    var go = $('oneStartGo');
    actions.insertBefore(save, go);
    var pick = $('oneStartSpace');
    if (pick) pick.addEventListener('change', function () { laterDraw(FLOW.saved); });
    // Each time the dialog opens; the picker is filled a moment after, so look again then.
    new MutationObserver(function () {
      if (!(/** @type {HTMLDialogElement} */ (dlg)).open) return;
      laterRefresh();
      window.setTimeout(function () { laterDraw(FLOW.saved); }, 400);
    }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  }());
}

export { phoneOpen };
