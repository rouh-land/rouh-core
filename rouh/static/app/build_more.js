/* Rouh's page, four genes for building Rouh faster (`rouh/build_more.py`, night 57).
 *
 * Outside the chain, like app/build_flow.js, and imported by app.js after it. The page is told which
 * are on, and the workspace of Rouh's own code, in `#rouhBuildMore`.
 *
 * - screen_errors: each script error of this page, and each request Rouh's server answered with a
 *   failure, is sent to the server, which hands the newest to the next run of Rouh's code.
 * - request_broke: a request Rouh's server answered with a failure (500 and over) is said once as a
 *   notice with Fix it (Start a run on Rouh's code, the request and its answer written) or Copy.
 * - screen_trouble: What went wrong here (the menu's link presses `#screenTroubleBtn`) lists what
 *   this screen had go wrong since it was opened, with Fix them in one run and Copy the details.
 * - brief_check: under Start a run's brief, on Rouh's code, four marks of what a good brief says,
 *   each ticked as its words are typed.
 */
import { sbSet } from 'app/controls.js';
import { $, el } from 'app/helpers.js';
import { notify } from 'app/notices.js';
import { oneStartOpen } from 'app/runs.js';

/** @type {{on: string[], code: string}} */
var MORE = (function () {
  try {
    var node = document.getElementById('rouhBuildMore');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], code: String(got.code || '') };
  } catch (err) { return { on: [], code: '' }; }
}());

/** @param {string} name */
function moreOn(name) { return MORE.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function moreUsed(name, event, detail) {
  realFetch('/api/build-more', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/** Inside the phone frame (`phone_view`) the page is the person's screen, not a second desk. */
var FRAMED = (function () { try { return window.self !== window.top; } catch (err) { return true; } }());

/** The browser's own fetch, before this module wraps it. */
var realFetch = window.fetch.bind(window);

/** Everything that went wrong on this screen since it was opened, oldest first.
 * @type {{kind: string, what: string, where: string, at: number, times: number}[]} */
var SEEN = [];
var OPENED = Date.now();

/** Not Rouh's own, or nothing to fix (the same as `page_broke`'s, in app/build_flow.js). */
var NOISE = /ResizeObserver loop|Script error\.?$|^Load failed$|NetworkError|Failed to fetch|AbortError|The operation was aborted|play\(\) (request|failed)|NotAllowedError/i;

/** The screen, as a run is told it. */
function screenNow() { return location.pathname + location.search; }

/** Something went wrong: kept for What went wrong here, and sent for the next run's brief.
 * @param {string} kind 'script' or 'request' @param {string} what @param {string} where */
function seen(kind, what, where) {
  what = String(what || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!what) return;
  var same = SEEN.filter(function (s) { return s.kind === kind && s.what === what && s.where === where; })[0];
  if (same) { same.times += 1; same.at = Date.now(); }
  else { SEEN.push({ kind: kind, what: what, where: where, at: Date.now(), times: 1 }); if (SEEN.length > 50) SEEN.shift(); }
  if (moreOn('screen_errors')) {
    realFetch('/api/build-more/trouble', { method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, what: what, where: where, screen: screenNow() }) }).catch(function () {});
  }
}

/** Whether a file is one of this page's own scripts. @param {string} file */
function ours(file) {
  if (!file) return false;
  try { return new URL(file, location.href).origin === location.origin; } catch (err) { return false; }
}

var WATCH = !FRAMED && (moreOn('screen_errors') || moreOn('request_broke') || moreOn('screen_trouble'));

if (WATCH) {
  window.addEventListener('error', function (e) {
    if (!e.message || !ours(e.filename) || NOISE.test(e.message)) return;
    var file = String(e.filename).replace(/^https?:\/\/[^/]+/, '').replace(/^\/a\/[0-9a-f]+\//, 'rouh/static/');
    seen('script', String(e.message).replace(/^Uncaught\s+/, ''), file + ':' + e.lineno + ':' + e.colno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = r && r.message ? String(r.message) : String(r);
    var stack = r && r.stack ? String(r.stack) : '';
    if (!stack || stack.indexOf(location.origin) < 0 || NOISE.test(msg) || (r && r.name === 'AbortError')) return;
    var first = (stack.split('\n').filter(function (l) { return l.indexOf(location.origin) >= 0; })[0] || '').trim();
    seen('script', msg, first.replace(location.origin, '').replace(/^at\s+/, '').replace(/\/a\/[0-9a-f]+\//, 'rouh/static/'));
  });
}

/* ---------- request_broke ---------- */

var BROKE = { said: /** @type {string[]} */ ([]) };

/** The brief Fix it writes for one failed request.
 * @param {string} method @param {string} path @param {number} status @param {string} said */
function requestBrief(method, path, status, said) {
  var lines = [
    'A request of Rouh\'s own page failed, and the screen said so:',
    '',
    '> ' + method + ' ' + path + ' was answered ' + status + '.',
  ];
  if (said) lines.push('', 'What the server answered, the start of it:', '```', said, '```');
  lines.push('',
    'The screen: ' + screenNow() + ', at ' + new Date().toISOString() + ', in a window '
      + window.innerWidth + ' by ' + window.innerHeight + '.',
    'The browser: ' + navigator.userAgent + '.',
    '', 'Rouh\'s own log will have the error behind it. Drive the browser to that screen and watch it fail, '
      + 'fix the cause, watch it not fail, and land it.');
  return lines.join('\n');
}

/** Say it once a path, three a screen at most.
 * @param {string} method @param {string} path @param {number} status @param {string} said */
function requestSay(method, path, status, said) {
  var key = method + ' ' + path.split('?')[0];
  if (BROKE.said.indexOf(key) >= 0 || BROKE.said.length >= 3) return;
  BROKE.said.push(key);
  var details = requestBrief(method, path, status, said);
  /** @type {{label: string, run: () => void}} */
  var action = MORE.code ? {
    label: 'Fix it',
    run: function () {
      moreUsed('request_broke', 'opened', key + ' ' + status);
      oneStartOpen({ brief: details, space: MORE.code, agent: 'claude' });
    }
  } : {
    label: 'Copy the details',
    run: function () {
      moreUsed('request_broke', 'copied', key + ' ' + status);
      try { navigator.clipboard.writeText(details); } catch (err) { /* nothing copied */ }
      notify('The details are copied.', { tone: 'success', body: 'Paste them to whoever looks after this Rouh.' });
    }
  };
  notify('Rouh\'s server could not do that.', {
    tone: 'warning', kind: 'request_broke',
    body: 'What this screen asked of it failed (' + status + ').'
      + (MORE.code ? ' Fix it starts a run that finds and fixes the cause.' : ' Copy the details for whoever looks after this Rouh.'),
    action: action, for: 15000
  });
}

/** The page's own requests to Rouh's server, and none of these genes' own. @param {string} path */
function watched(path) {
  return path.indexOf('/api/') === 0 && path.indexOf('/api/build-more') !== 0;
}

if (WATCH) {
  window.fetch = function (input, init) {
    var url = '';
    var method = 'GET';
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      method = String((init && init.method) || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    } catch (err) { /* not one to look at */ }
    var got = realFetch(input, init);
    var at;
    try { at = new URL(url, location.href); } catch (err) { return got; }
    if (at.origin !== location.origin || !watched(at.pathname)) return got;
    var path = at.pathname + at.search;
    return got.then(function (r) {
      if (r.status >= 500) {
        var copy = r.clone();
        copy.text().then(function (text) {
          var said = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
          seen('request', method + ' ' + path.split('?')[0] + ' was answered ' + r.status
            + (said ? ': ' + said.slice(0, 160) : ''), path);
          if (moreOn('request_broke')) requestSay(method, path, r.status, said);
        }).catch(function () {});
      }
      return r;
    });
  };
}

/* ---------- screen_trouble ---------- */

/** Every line of what went wrong, as a run is told it. */
function troubleBrief() {
  var lines = ['These went wrong on Rouh\'s own screen, ' + screenNow() + ', since it was opened at '
    + new Date(OPENED).toISOString() + ':', ''];
  SEEN.forEach(function (s, i) {
    lines.push((i + 1) + '. ' + (s.kind === 'script' ? 'A script error: ' : 'A failed request: ') + s.what
      + (s.where && s.kind === 'script' ? ' (in ' + s.where + ')' : '') + (s.times > 1 ? ', ' + s.times + ' times' : '') + '.');
  });
  lines.push('', 'The window: ' + window.innerWidth + ' by ' + window.innerHeight + '. The browser: ' + navigator.userAgent + '.',
    '', 'Fix each in this one run: drive the browser to the screen, watch each fail, fix it, watch it not fail, and land it.');
  return lines.join('\n');
}

/** @param {number} t */
function clock(t) {
  var d = new Date(t);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function troubleOpen() {
  sbSet(false);
  var old = $('screenTrouble');
  if (old) old.remove();
  var dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'one-dialog trouble-dialog'));
  dlg.id = 'screenTrouble';
  dlg.setAttribute('aria-labelledby', 'screenTroubleHead');
  var form = el('form', 'trouble-form');
  form.setAttribute('method', 'dialog');
  var head = el('h2', null, 'What went wrong here');
  head.id = 'screenTroubleHead';
  form.appendChild(head);
  var n = SEEN.length;
  form.appendChild(el('p', 'trouble-say', n
    ? (n === 1 ? 'One thing went wrong' : n + ' things went wrong') + ' on this screen since it was opened at ' + clock(OPENED) + '.'
    : 'Nothing went wrong on this screen since it was opened at ' + clock(OPENED) + '.'));
  if (n) {
    var list = el('ol', 'trouble-list');
    SEEN.forEach(function (s) {
      var li = el('li', 'trouble-item');
      li.appendChild(el('span', 'trouble-kind', s.kind === 'script' ? 'Script error' : 'Failed request'));
      li.appendChild(el('span', 'trouble-what', s.what));
      li.appendChild(el('span', 'trouble-when', clock(s.at) + (s.times > 1 ? ', ' + s.times + ' times' : '')
        + (s.where && s.kind === 'script' ? ', in ' + s.where : '')));
      list.appendChild(li);
    });
    form.appendChild(list);
  } else {
    var none = el('p', 'trouble-none', 'If something looked wrong anyway, Change something here or Start a run says it in words.');
    form.appendChild(none);
  }
  var acts = el('div', 'one-actions');
  var close = el('button', 'ctl small' + (n ? '' : ' primary'), 'Close');
  close.setAttribute('value', 'close');
  if (n) {
    var copy = el('button', 'ctl small', 'Copy the details');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      try { navigator.clipboard.writeText(troubleBrief()); } catch (err) { /* nothing copied */ }
      copy.textContent = 'Copied';
    });
    acts.appendChild(copy);
  }
  acts.appendChild(close);
  if (n && MORE.code) {
    var fix = el('button', 'ctl small primary', n === 1 ? 'Fix it in a run' : 'Fix them in one run');
    fix.type = 'button';
    fix.addEventListener('click', function () {
      moreUsed('screen_trouble', 'fixed', n + ' on ' + location.pathname);
      var brief = troubleBrief();
      dlg.close();
      oneStartOpen({ brief: brief, space: MORE.code, agent: 'claude' });
    });
    acts.appendChild(fix);
  }
  form.appendChild(acts);
  dlg.appendChild(form);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { dlg.remove(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  moreUsed('screen_trouble', 'opened', n + ' on ' + location.pathname);
}

if (moreOn('screen_trouble') && !FRAMED) {
  var goTrouble = $('screenTroubleBtn');
  if (goTrouble) goTrouble.addEventListener('click', troubleOpen);
}

/* ---------- brief_check ---------- */

/** What a good brief says, each with the words that say it and what to add when it is missing. */
var MARKS = [
  { id: 'where', name: 'Where', miss: 'which screen or page, such as "on the Models page"',
    test: /(\/[a-z][\w\-/]*)|\b(on|in|at|under|beside|from)\s+(the|a|its|my|each|every)\s+\w+|\b(page|screen|menu|button|dialog|card|box|chat|notice|tab|settings|toggle|link|list|row|bar|panel)\b/i },
  { id: 'wrong', name: 'What is wrong', miss: 'what happens now, such as "nothing happens when I press it"',
    test: /\b(doesn'?t|does not|don'?t|didn'?t|isn'?t|is not|won'?t|can'?t|cannot|never|no longer|broken|breaks|wrong|fails?|failed|error|stuck|missing|gone|slow|hidden|cut off|overlap\w*|empty|nothing|only|too)\b|\b[45]\d\d\b/i },
  { id: 'should', name: 'What it should do', miss: 'what you want instead, such as "it should say why"',
    test: /\b(should|must|want|wanted|needs? to|instead|expect\w*|would like|make it|let me|so that|add|show|put|move|keep)\b/i },
  { id: 'see', name: 'How to see it', miss: 'how to see it done, such as "press Save with a wrong key"',
    test: /\b(press\w*|click\w*|tap\w*|type|open\w*|go to|drive|test|prove|check|try|see it|at (390|1440)|on a phone|on the desk|steps?)\b/i },
];

/** What the dialog's space picker says now. */
function spaceNow() {
  var pick = /** @type {HTMLSelectElement | null} */ ($('oneStartSpace'));
  return pick ? pick.value : '';
}

var CHECK = { complete: false };

/** @param {boolean} [typed] whether the person typed it, rather than a brief being written in for them */
function checkDraw(typed) {
  var row = $('briefCheck');
  var box = /** @type {HTMLTextAreaElement | null} */ ($('oneStartBrief'));
  if (!row || !box) return;
  var forCode = !!MORE.code && spaceNow() === MORE.code;
  row.hidden = !forCode;
  if (!forCode) return;
  var text = box.value;
  var missing = /** @type {string[]} */ ([]);
  MARKS.forEach(function (m) {
    var mark = row.querySelector('[data-mark="' + m.id + '"]');
    var met = m.test.test(text);
    if (mark) { mark.classList.toggle('met', met); mark.setAttribute('aria-label', m.name + (met ? ': said' : ': not said yet')); }
    if (!met) missing.push(m.miss);
  });
  var say = $('briefCheckSay');
  if (say) {
    say.textContent = !text.trim() ? 'A good brief says where, what is wrong, what it should do, and how to see it.'
      : missing.length ? 'Still to say: ' + missing[0] + '.' : 'It says all four. A run can start without guessing.';
  }
  var all = !!text.trim() && !missing.length;
  if (all && !CHECK.complete && typed) moreUsed('brief_check', 'complete', String(text.split('\n')[0]).slice(0, 120));
  CHECK.complete = all;
}

if (moreOn('brief_check') && MORE.code && !FRAMED) {
  (function () {
    var box = $('oneStartBrief');
    var dlg = $('oneStartDialog');
    if (!box || !dlg) return;
    var row = el('div', 'brief-check');
    row.id = 'briefCheck';
    row.hidden = true;
    var marks = el('ul', 'brief-check-marks');
    marks.setAttribute('aria-label', 'What a good brief says');
    MARKS.forEach(function (m) {
      var li = el('li', 'brief-check-mark');
      li.setAttribute('data-mark', m.id);
      var tick = el('span', 'brief-check-tick');
      tick.setAttribute('aria-hidden', 'true');
      li.append(tick, el('span', null, m.name));
      marks.appendChild(li);
    });
    var say = el('p', 'brief-check-say');
    say.id = 'briefCheckSay';
    say.setAttribute('aria-live', 'polite');
    row.append(marks, say);
    // Right under the box, above the pictures and the rest of the form.
    var at = box.closest('.field, label') || box;
    at.parentNode.insertBefore(row, at.nextSibling);
    box.addEventListener('input', function (e) { checkDraw(e.isTrusted); });
    var pick = $('oneStartSpace');
    if (pick) pick.addEventListener('change', function () { checkDraw(false); });
    new MutationObserver(function () {
      if (!(/** @type {HTMLDialogElement} */ (dlg)).open) return;
      CHECK.complete = false;
      checkDraw(false);
      window.setTimeout(function () { checkDraw(false); }, 400);
    }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  }());
}

export { troubleOpen };
