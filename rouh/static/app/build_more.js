/* Rouh's page, four genes for building Rouh faster (`rouh/build_more.py`, night 57).
 *
 * Outside the chain, like app/build_flow.js, and imported by app.js after it. The page is told which
 * are on, and the workspace of Rouh's own code, in `#rouhBuildMore`.
 *
 * - screen_errors: each script error of this page, and each request Rouh's server answered with a
 *   failure, is sent to the server, which hands the newest to the next run of Rouh's code.
 * - request_broke: a request Rouh's server answered with a failure (500 and over) is said once as a
 *   notice with Fix it (Start a run on Rouh's code, the request and its answer written) or Copy,
 *   saying what it was for, that it was not done, and whether that matters. One that met Rouh
 *   starting again after a change waits for it and is sent again, and is never offered Fix it.
 * - screen_trouble: What went wrong here (the menu's link presses `#screenTroubleBtn`) lists what
 *   this screen had go wrong since it was opened, with Fix them in one run and Copy the details.
 * - brief_check: under Start a run's brief, on Rouh's code, four marks of what a good brief says,
 *   each ticked as its words are typed.
 */
import { sbSet } from 'app/controls.js';
import { $, el } from 'app/helpers.js';
import { notify } from 'app/notices.js';
import { oneStartOpen } from 'app/runs.js';
import { S } from 'app/socket.js';

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

/* Petar, 28 November 2026: "every time rouh evolves, and is down I get this notification. it
   feels wrong. first of all it doesn't tell me what couldn't happen. then i don't know if it
   will ever happen and how critical it was". While Rouh starts again after a change lands, the
   proxy in front of it (Caddy, `deploy/stack/compose.yml`, edge) answers every request 502, and
   the screen's own refreshes - the orb's load, what was read, the day's one thing - each came
   back as "could not do that" with Fix it. So now:

   - A request answered 502, 503 or 504 (the proxy saying Rouh is not there), or any 5xx while
     the socket says Rouh is Evolving (`S.renewing`), waits for Rouh to answer `/healthz` again
     and is sent again then, and the screen gets that answer as though nothing happened. Asking
     again is only for what cannot have been done twice: anything that only reads, and a change
     the proxy never handed to Rouh (502 or 503). Nothing is said if it then works.
   - If Rouh is not back within `AWAY_MS`, or the request was a change that may have reached it,
     one plain notice says what it was, that it was not done, whether that matters, and that it
     will not be tried again by itself. No Fix it: a restart is not a fault in the code.
   - A real fault (Rouh answered and failed, or failed again once back) says the same three
     things, and only then offers Fix it. */

var BROKE = { said: /** @type {string[]} */ ([]) };

//: How long a request waits for Rouh to come back from a restart before it is given up.
var AWAY_MS = 4 * 60 * 1000;
//: How often `/healthz` is asked while Rouh is away.
var AWAY_EVERY = 2000;

/** One shared wait for Rouh to answer again, however many requests are waiting on it.
 * @type {{back: Promise<boolean>|null, again: Record<string, Promise<Response>>}} */
var AWAY = { back: null, again: {} };

/** Rouh answering `/healthz` with its database up: true when it does, false after `AWAY_MS`. */
function rouhBack() {
  if (AWAY.back) return AWAY.back;
  var until = Date.now() + AWAY_MS;
  AWAY.back = new Promise(function (resolve) {
    function ask() {
      realFetch('/healthz', { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (said) {
          if (said && said.ok) { resolve(true); return; }
          if (Date.now() >= until) { resolve(false); return; }
          setTimeout(ask, AWAY_EVERY);
        });
    }
    setTimeout(ask, 800);
  });
  AWAY.back.then(function () { AWAY.back = null; });
  return AWAY.back;
}

/** What a request was for, in the person's words, from where it went.
 * @type {[RegExp, string][]} */
var WHAT = [
  [/^\/api\/machine\/load/, 'how busy this machine is, for the orb'],
  [/^\/api\/reading/, 'which messages of this chat you have read'],
  [/^\/api\/brief\/one-thing/, "the day's one thing"],
  [/^\/api\/brief/, 'the morning brief'],
  [/^\/api\/easy-start/, 'the getting-started tips'],
  [/^\/api\/transcript/, "this chat's earlier messages"],
  [/^\/api\/threads/, 'the list of chats'],
  [/^\/api\/canvas/, 'the cards on the canvas'],
  [/^\/api\/workspace|^\/api\/task-docs|^\/api\/task-time/, 'the tasks and their files'],
  [/^\/api\/offline/, "this device's offline copy"],
  [/^\/api\/settings/, 'your settings'],
  [/^\/api\/reminders/, 'your reminders'],
  [/^\/api\/goals|^\/api\/quests/, 'your goals'],
  [/^\/api\/decisions/, 'a decision'],
  [/^\/api\/comments/, 'comments'],
  [/^\/api\/usage/, 'usage and costs'],
  [/^\/api\/job|^\/api\/one\//, 'a run'],
  [/^\/api\/share/, 'sharing'],
  [/^\/api\/rules/, 'the rules'],
  [/^\/api\/highlights/, 'highlights'],
  [/^\/api\/notifications/, 'the notifications'],
  [/^\/api\/page-pdf|^\/api\/page-gdoc/, 'a copy of a page'],
];

/** @param {string} path */
function whatFor(path) {
  var p = path.split('?')[0];
  for (var i = 0; i < WHAT.length; i++) if (WHAT[i][0].test(p)) return WHAT[i][1];
  return 'something this screen asked for (' + p + ')';
}

/** Only reads, so asking twice changes nothing. @param {string} method */
function onlyReads(method) { return method === 'GET' || method === 'HEAD'; }

/** The brief Fix it writes for one failed request.
 * @param {string} method @param {string} path @param {number} status @param {string} said @param {string} how */
function requestBrief(method, path, status, said, how) {
  var lines = [
    'A request of Rouh\'s own page failed, and the screen said so:',
    '',
    '> ' + method + ' ' + path + ' (' + whatFor(path) + ') was answered ' + status + '.',
  ];
  if (how) lines.push('', how);
  if (said) lines.push('', 'What the server answered, the start of it:', '```', said, '```');
  lines.push('',
    'The screen: ' + screenNow() + ', at ' + new Date().toISOString() + ', in a window '
      + window.innerWidth + ' by ' + window.innerHeight + '.',
    'The browser: ' + navigator.userAgent + '.',
    '', 'Rouh\'s own log will have the error behind it. Drive the browser to that screen and watch it fail, '
      + 'fix the cause, watch it not fail, and land it.');
  return lines.join('\n');
}

/** Say a real fault once a path, three a screen at most: what it was, that it was not done and
 * will not be tried again, whether that matters, and Fix it.
 * @param {string} method @param {string} path @param {number} status @param {string} said @param {string} how */
function requestSay(method, path, status, said, how) {
  var key = method + ' ' + path.split('?')[0];
  if (BROKE.said.indexOf(key) >= 0 || BROKE.said.length >= 3) return;
  BROKE.said.push(key);
  var details = requestBrief(method, path, status, said, how);
  var reads = onlyReads(method);
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
  var what = whatFor(path);
  notify(reads ? 'Part of this screen could not load.' : 'Something you did was not done.', {
    tone: 'warning', kind: 'request_broke',
    body: (reads ? 'Loading ' : 'Saving ') + what + ' hit an error in Rouh (' + status + ') and will not be retried. '
      + (reads ? 'Nothing you did is lost; this screen may be out of date. ' : 'Do it again if you need it. ')
      + (MORE.code ? 'Fix it starts a run to fix the cause.' : 'Copy the details for whoever looks after this Rouh.'),
    action: action, for: 15000
  });
}

/** Rouh stayed away longer than a request could wait, or a change may have reached it as it
 * went: said once a path, plainly, and with nothing to fix. @param {string} method @param {string} path @param {boolean} cut */
function awaySay(method, path, cut) {
  var key = 'away ' + method + ' ' + path.split('?')[0];
  if (BROKE.said.indexOf(key) >= 0) return;
  BROKE.said.push(key);
  var what = whatFor(path);
  if (onlyReads(method)) {
    notify('Rouh is taking long to come back.', {
      tone: 'info', kind: 'request_away',
      body: 'It is restarting after a change, so ' + what + ' did not refresh. Nothing is lost: it refreshes once Rouh is back.',
      for: 12000
    });
  } else {
    notify(cut ? 'Rouh restarted while saving.' : 'Rouh was restarting: not saved.', {
      tone: 'warning', kind: 'request_away',
      body: (cut ? 'Saving ' + what + ' may not have finished. ' : 'Saving ' + what + ' did not reach it. ')
        + 'It will not be retried: do it again once Rouh is back.',
      for: 20000
    });
  }
}

/** The page's own requests to Rouh's server, and none of these genes' own. @param {string} path */
function watched(path) {
  return path.indexOf('/api/') === 0 && path.indexOf('/api/build-more') !== 0;
}

/** The answer came from the proxy, not from Rouh: Rouh was not there. @param {number} status */
function proxyAway(status) { return status === 502 || status === 503 || status === 504; }

/** The request once more, as it was first sent; null when its body cannot be sent twice.
 * @param {RequestInfo|URL} input @param {RequestInit|undefined} init @param {Request|null} spare */
function sendAgain(input, init, spare) {
  if (init && init.body && typeof ReadableStream === 'function' && init.body instanceof ReadableStream) return null;
  if (spare) return realFetch(spare, init);
  return realFetch(input, init);
}

/** Wait for Rouh, then ask again; the same reading asked many times while away is asked once.
 * @param {string} key @param {() => Promise<Response>|null} again @param {AbortSignal|null|undefined} signal
 * @returns {Promise<Response|null>} null when Rouh did not come back in time */
function afterBack(key, again, signal) {
  var waited = rouhBack().then(function (back) {
    if (!back) return null;
    if (key && AWAY.again[key]) return AWAY.again[key].then(function (r) { return r.clone(); });
    var p = again();
    if (!p) return null;
    if (key) {
      AWAY.again[key] = p;
      p.then(function () { delete AWAY.again[key]; }, function () { delete AWAY.again[key]; });
      return p.then(function (r) { return r.clone(); });
    }
    return p;
  });
  if (!signal) return waited;
  return new Promise(function (resolve, reject) {
    var gone = function () { reject(new DOMException('The operation was aborted.', 'AbortError')); };
    if (signal.aborted) { gone(); return; }
    signal.addEventListener('abort', gone, { once: true });
    waited.then(resolve, reject);
  });
}

if (WATCH) {
  window.fetch = function (input, init) {
    var url = '';
    var method = 'GET';
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      method = String((init && init.method) || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    } catch (err) { /* not one to look at */ }
    var at;
    try { at = new URL(url, location.href); } catch (err) { return realFetch(input, init); }
    if (at.origin !== location.origin || !watched(at.pathname)) return realFetch(input, init);
    var path = at.pathname + at.search;
    // A Request is used up by sending it: a copy is kept in case it is sent again.
    /** @type {Request|null} */
    var spare = null;
    try { if (input instanceof Request) spare = input.clone(); } catch (err) { spare = null; }
    var signal = (init && init.signal) || (input instanceof Request ? input.signal : null);
    /** @param {Response} r @param {string} how */
    var fault = function (r, how) {
      var copy = r.clone();
      copy.text().then(function (text) {
        var said = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
        seen('request', method + ' ' + path.split('?')[0] + ' was answered ' + r.status
          + (said ? ': ' + said.slice(0, 160) : ''), path);
        if (moreOn('request_broke')) requestSay(method, path, r.status, said, how);
      }).catch(function () {});
    };
    return realFetch(input, init).then(function (r) {
      if (r.status < 500) return r;
      var away = proxyAway(r.status) || S.renewing;
      if (!away) { fault(r, ''); return r; }
      // Asked again only when doing it twice cannot do it twice: a reading, or a change the
      // proxy never handed to Rouh. A 504, or a 5xx from Rouh itself as it went, may have been done.
      var safe = onlyReads(method) || r.status === 502 || r.status === 503;
      if (!safe) { awaySay(method, path, true); return r; }
      return afterBack(onlyReads(method) ? method + ' ' + path : '', function () {
        return sendAgain(input, init, spare && spare.clone());
      }, signal).then(function (again) {
        if (!again) { awaySay(method, path, false); return r; }
        if (again.status >= 500) fault(again, 'It was first answered ' + r.status + ', as though Rouh was starting again,'
          + ' was sent again once Rouh\'s /healthz answered, and failed again.');
        return again;
      });
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
