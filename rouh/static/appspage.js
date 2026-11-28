/* Apps, at /apps: the apps Rouh built and looks after for the person, where each runs, the apps server
   they belong on, and setting one up (`rouh/apps_hosting.py`, `rouh/web/apps_hosting.py`).

   Designed from the person's journeys before any of this was written (designs/apps/: journeys.md,
   ia.md, states.md, the prototype and HANDOFF.md; task 169, step 169-19). Five views, each its own
   address so a notice about one app opens it:

     /apps            the Dashboard: the verdict first, then Needs you with each fix beside its line,
                      the next step while there is no apps server, where everything lives, and the
                      apps grouped by place, with what is true for a whole place said once
     /apps/<name>     one app: its state, its fixes or commands, its facts, what Rouh did
     /apps/setup      setting up an apps server, and the servers
     /apps/plan       the moving plan
     /apps/add        adding an app that already runs somewhere

   The layer, its address and its row are app/runs.js's (`appsOpen`), handed over through
   `window.RouhAppsHost`, which also puts a request in the message box. */
(function () {
  'use strict';

  var R = { open: false, view: '', data: null, error: '', seq: 0, loading: false, busy: '', said: '', tone: '',
            timer: 0, host: 'hostinger', confirm: '', checking: false, lines: {}, hs: { vps: null, error: '', loading: false, wipe: 0 } };

  function host() { return window.RouhAppsHost || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function csrf() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }

  /* ---- words ---- */

  function now() { return (R.data && R.data.now && Math.abs(R.data.now - Date.now() / 1000) < 600) ? Date.now() / 1000 : Date.now() / 1000; }
  function ago(t) {
    if (!t) { return 'never'; }
    var s = now() - t;
    if (s < 60) { return 'just now'; }
    if (s < 3600) { return Math.round(s / 60) + ' min ago'; }
    if (s < 86400) { return Math.round(s / 3600) + ' h ago'; }
    if (s < 86400 * 30) { var d = Math.round(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago'); }
    return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function clock(t) { return new Date(t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  function bare(url) { return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var ICON = {
    good: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
    bad: '<path d="M12 3.6l9 15.6H3z"/><path d="M12 9.6v4.6M12 16.9v.2"/>',
    dim: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
    wait: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    disk: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M9.5 10l5 5M14.5 10l-5 5"/>',
    xc: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    doc: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/>',
    chev: '<path d="M9 6l6 6-6 6"/>', back: '<path d="M15 6l-6 6 6 6"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>'
  };
  function ico(n, cls) { return '<svg class="aps-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>'; }

  var APP_ST = { answering: ['good', 'good', 'Answering'], down: ['bad', 'bad', 'Not answering'], unknown: ['dim', 'dim', 'Not checked yet'] };
  var SRV_ST = { ready: ['good', 'good', 'Calling in'], silent: ['bad', 'bad', 'Silent'], waiting: ['wait', 'wait', 'Waiting to join'],
                 elsewhere: ['dim', 'dim', 'Checked by address only'] };
  var CMD_ST = { done: ['good', 'good', 'Done'], failed: ['bad', 'bad', 'Failed'], running: ['wait', 'wait', 'Running'],
                 sent: ['wait', 'wait', 'Sent'], waiting: ['wait', 'wait', 'Waiting'] };
  function st(map, s, fallback) {
    var m = map[s] || map[fallback];
    return '<span class="aps-st ' + m[0] + '">' + ico(m[1]) + esc(m[2]) + '</span>';
  }

  /* ---- what the data says, counted in one place so every view agrees ---- */

  function D() { return R.data || { apps: [], servers: [], needs: [], pages: [], hosts: [], ideas: [], plan: { steps: [] } }; }
  function server(id) { return D().servers.filter(function (s) { return s.id === id; })[0]; }
  function appBy(key) { return D().apps.filter(function (a) { return a.slug === key || String(a.id) === String(key); })[0]; }
  function serverState(s) { return s.standard ? s.state : (s.state === 'waiting' ? 'waiting' : 'elsewhere'); }
  function ready() { return !!D().ready; }
  function pending(a) {
    return a.commands.filter(function (c) { return c.verb !== 'logs' && (c.state === 'waiting' || c.state === 'sent' || c.state === 'running'); })[0];
  }
  function failedOf(a) {
    return a.commands.filter(function (c) { return c.state === 'failed' && c.verb !== 'logs' && now() - (c.done_at || 0) < 86400; })[0];
  }
  /** Places, in the bar's order: the apps servers, every other server, apps elsewhere, Rouh's own server. */
  function places() {
    var d = D(), list = [], shade = ['b', 'c'];
    d.servers.filter(function (s) { return s.standard && s.state !== 'waiting'; }).forEach(function (s) {
      list.push({ server: s, cls: 'a', apps: d.apps.filter(function (a) { return a.server_id === s.id; }) });
    });
    d.servers.filter(function (s) { return !s.standard; }).forEach(function (s, i) {
      list.push({ server: s, cls: shade[i % 2], apps: d.apps.filter(function (a) { return a.server_id === s.id; }) });
    });
    var loose = d.apps.filter(function (a) { return !a.server_id || !server(a.server_id); });
    if (loose.length) { list.push({ name: 'Elsewhere', cls: 'c', apps: loose }); }
    if (d.pages && d.pages.length) { list.push({ name: 'Rouh’s own server', cls: 'd', pages: d.pages, apps: [] }); }
    // An apps server shows even empty (its apps go there); another computer with no app on it only on Servers.
    return list.filter(function (p) { return p.pages || p.apps.length || (p.server && p.server.standard); });
  }
  function moveParts() {
    var st2 = (D().plan && D().plan.steps) || [], a = st2.filter(function (x) { return x.kind === 'app'; }).length, p = st2.length - a;
    return [a ? plural(a, 'app', 'apps') : '', p ? plural(p, 'page', 'pages') : ''].filter(Boolean).join(' and ');
  }
  /** Where an app's data is, without the database's own words (the app's facts keep them whole). */
  function plainData(t) {
    t = String(t || '');
    if (/cannot reach/i.test(t)) { return 'unknown, as Rouh cannot look inside that server'; }
    return t.replace(/PostgreSQL database, [a-z0-9_]+, and its files,/i, 'database and files,').replace(/PostgreSQL database, [a-z0-9_]+,/i, 'database,');
  }
  function toMove() { return (D().plan && D().plan.steps || []).length; }

  /* ---- reading and writing ---- */

  function load(quiet) {
    var seq = ++R.seq;
    R.loading = !quiet;
    if (!quiet) { R.error = ''; draw(); }
    return fetch('/api/apps', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login?next=/apps'; return null; }
        return r.json().catch(function () { return null; }).then(function (j) {
          if (seq !== R.seq) { return; }
          R.loading = false;
          if (!r.ok || !j) { R.error = (j && j.error) || 'Your apps could not be read. Try again in a moment.'; }
          else { R.data = j; R.error = ''; R.stale = false; }
          if (R.open) { draw(); tick(); }
        });
      })
      .catch(function () {
        if (seq !== R.seq) { return; }
        R.loading = false;
        if (!R.data) { R.error = 'Rouh could not be reached. Try again in a moment.'; } else { R.stale = true; }
        if (R.open) { draw(); tick(); }
      });
  }

  function post(path, body, busy) {
    if (R.busy) { return Promise.resolve(null); }
    R.busy = busy || path;
    R.said = '';
    draw();
    return fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                         headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
                         body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          R.busy = '';
          if (j && j.apps) { R.data = j; }
          R.said = (j && (j.error || j.said)) || (r.ok ? '' : 'That did not work. Try again.');
          R.tone = r.ok ? 'ok' : 'bad';
          draw();
          tick();
          return r.ok ? j : null;
        });
      })
      .catch(function () {
        R.busy = '';
        R.said = 'Rouh could not be reached. Try again in a moment.';
        R.tone = 'bad';
        draw();
        return null;
      });
  }

  /* While something is on its way (a command, a server joining), read again every five seconds;
     otherwise every minute, so the verdict stays true while the page is open. */
  function tick() {
    clearTimeout(R.timer);
    if (!R.open) { return; }
    var d = D();
    var moving = d.servers.some(function (s) { return s.state === 'waiting'; }) ||
      d.apps.some(function (a) { return a.commands.some(function (c) { return c.state === 'waiting' || c.state === 'sent' || c.state === 'running'; }); });
    R.timer = setTimeout(function () { if (R.open && !R.busy) { load(true); } else { tick(); } }, moving ? 5000 : 60000);
  }

  function say(text) { if (host().say) { host().say(text); } }
  function go(view) {
    R.view = view || '';
    R.confirm = '';
    R.said = '';
    R.hs.wipe = 0;
    draw();
    if (host().view) { host().view(R.view); }
    var body = $('appsBody');
    if (body) { body.scrollTop = 0; }
    var to = body && body.querySelector('.aps-back, h2');
    if (to) { to.setAttribute('tabindex', '-1'); to.focus({ preventScroll: true }); }
  }

  /* ---- the page ---- */

  function draw() {
    var body = $('appsBody');
    if (!body || !R.open) { return; }
    // A redraw (every minute, or after a press) keeps what was typed, where the focus was and the scroll.
    var typed = {}, focus = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
    var focusKey = focus ? (focus.id || focus.getAttribute('data-key') || '') : '';
    body.querySelectorAll('input[id], textarea[id], select[id]').forEach(function (i) { typed[i.id] = i.value; });
    var open = {};
    body.querySelectorAll('details[data-key]').forEach(function (x) { open[x.getAttribute('data-key')] = x.open; });
    var scroll = body.scrollTop;
    body.setAttribute('aria-busy', R.loading ? 'true' : 'false');
    meta();
    body.innerHTML = '<div class="aps-page">' + page() + '</div>';
    Object.keys(typed).forEach(function (id) { var i = $(id); if (i && i.type !== 'radio') { i.value = typed[id]; } });
    body.querySelectorAll('details[data-key]').forEach(function (x) { var k = x.getAttribute('data-key'); if (k in open) { x.open = open[k]; } });
    wire(body);
    body.scrollTop = scroll;
    if (focusKey) {
      var back = $(focusKey) || body.querySelector('[data-key="' + focusKey + '"]');
      if (back) { back.focus({ preventScroll: true }); }
    }
  }

  function meta() {
    var m = $('appsMeta');
    var d = R.data;
    if (m) {
      m.textContent = d ? [plural(d.apps.length, 'app', 'apps'),
        d.pages && d.pages.length ? plural(d.pages.length, 'page with data', 'pages with data') : ''].filter(Boolean).join(' and ') : '';
    }
    var b = $('appsBuild');
    // One primary per view: Build a new app only when the apps server is ready and nothing needs the person.
    if (b) {
      b.classList.toggle('aps-strong', !!(d && d.ready && !d.needs.length && !R.view));
      b.title = 'Ask Rouh to make a new app for you: it puts the request in the message box';
    }
  }

  function page() {
    if (R.error && !R.data) {
      return '<p class="aps-said bad" role="alert">' + esc(R.error) + '</p><button class="ctl" type="button" data-do="reload">Try again</button>';
    }
    if (!R.data) { return '<p class="aps-note">Reading your apps…</p>'; }
    var h = '';
    if (R.stale) { h += '<p class="aps-said bad" role="status">Rouh could not be reached just now. This is what it said last.</p>'; }
    if (R.said) { h += '<p class="aps-said ' + (R.tone === 'bad' ? 'bad' : 'ok') + '" role="' + (R.tone === 'bad' ? 'alert' : 'status') + '">' + esc(R.said) + '</p>'; }
    var v = R.view;
    if (v === 'setup' || v === 'servers') { return h + viewSetup(); }
    if (v === 'plan') { return h + viewPlan(); }
    if (v === 'add') { return h + viewAdd(); }
    if (v && appBy(v)) { return h + viewApp(appBy(v)); }
    if (v && !appBy(v)) { h += '<p class="aps-said bad" role="status">There is no app called ' + esc(v) + ' on the list. Here are all of them.</p>'; }
    return h + viewHome();
  }

  function back() { return '<button class="ctl small aps-quiet aps-back" type="button" data-do="go" data-view="">' + ico('back') + 'All apps</button>'; }

  /* -- the Dashboard -- */

  function viewHome() {
    var d = D();
    if (!d.apps.length && !d.servers.length && !(d.pages && d.pages.length)) { return viewEmpty(); }
    var needs = d.needs, down = d.apps.filter(function (a) { return a.state === 'down'; });
    var up = d.apps.filter(function (a) { return a.state === 'answering'; });
    var cls = 'good', line;
    if (!d.apps.length) { cls = 'dim'; line = 'No apps yet.'; }
    else if (down.length) {
      cls = 'bad';
      line = (down.length === 1 ? down[0].name + ' is not answering' : down.length + ' apps are not answering') +
        (up.length ? '; ' + up.length + ' of ' + d.apps.length + (up.length === 1 ? ' is.' : ' are.') : '.');
    }
    else if (!up.length) { cls = 'dim'; line = d.apps.length === 1 ? 'Your app has not been checked yet.' : 'Your apps have not been checked yet.'; }
    else if (up.length < d.apps.length) {
      cls = 'dim';
      var un = d.apps.filter(function (a) { return a.state !== 'answering'; });
      line = up.length + ' of ' + d.apps.length + ' apps are answering; ' + (un.length === 1 ? un[0].name + ' has' : un.length + ' have') + ' not been checked yet.';
    } else { line = d.apps.length === 1 ? 'Your app is answering.' : 'All ' + d.apps.length + ' apps are answering.'; }
    line += needs.length ? ' ' + plural(needs.length, 'thing needs', 'things need') + ' you.' : ' Nothing needs you.';
    if (cls === 'good' && needs.length) { cls = 'warn'; }
    var h = '<section class="aps-verdict ' + cls + '" aria-label="Are your apps answering">' + ico(cls === 'good' ? 'good' : cls === 'dim' ? 'dim' : 'bad', 'big') +
      '<div><h2>' + esc(line) + '</h2><p><span>Rouh opens each app’s page every five minutes. Last look: ' + (R.busy === 'check' ? 'now' : ago(d.checked_at)) + '.</span>' +
      '<button class="ctl small" type="button" data-do="check" data-key="check"' + (R.busy ? ' disabled' : '') + '>' + (R.busy === 'check' ? 'Checking…' : 'Check now') + '</button></p></div></section>';
    if (needs.length) { h += needsBox(needs); }
    if (!ready()) { h += nextStep(); }
    h += whereBox();
    places().forEach(function (p) { h += placeBox(p); });
    h += '<div class="aps-foot"><div class="aps-acts"><button class="ctl" type="button" data-do="go" data-view="add">Add an app you already have</button>' +
      (d.servers.length ? '<button class="ctl" type="button" data-do="go" data-view="setup">' + (ready() ? 'Servers' : 'Servers and setup') + '</button>' : '') + '</div>' + about() + '</div>';
    return h;
  }

  function needsBox(needs) {
    var h = '<section aria-labelledby="apsNeedsH"><h3 id="apsNeedsH" class="aps-h">Needs you <span class="aps-count">' + needs.length + '</span></h3><div class="aps-needs">';
    needs.forEach(function (n) {
      var a = n.app ? D().apps.filter(function (x) { return x.id === n.app; })[0] : null, busy = a && pending(a);
      var mark = n.kind === 'backup' ? 'disk' : n.kind === 'failed' ? 'xc' : 'bad';
      var detail = n.kind === 'failed' && a && a.last_error ? a.last_error + '. ' : '';
      h += '<div class="aps-need"><div class="aps-need-t">' + ico(mark) + '<div><b>' + esc(n.said) + '</b><span>' + esc(detail) +
        (n.since ? 'Since ' + clock(n.since) + ', ' + ago(n.since) + '.' : '') +
        (busy ? ' ' + esc(busy.said) + ': ' + (busy.state === 'running' ? 'running now.' : 'sent, waiting for the server.') : '') +
        '</span></div></div><div class="aps-acts">';
      if (n.kind === 'down' && a) {
        if (a.managed) {
          h += verbBtn(a, 'restart', 'Restart', busy) + verbBtn(a, 'rollback', 'Roll back', busy || !a.previous_release) +
            '<button class="ctl small" type="button" data-do="logs" data-app="' + esc(a.slug) + '">Logs</button>';
        }
        h += '<button class="ctl small" type="button" data-do="fix" data-app="' + esc(a.slug) + '">Ask Rouh to fix it</button>';
        if (a.url) { h += '<a class="ctl small aps-quiet" href="' + esc(a.url) + '" target="_blank" rel="noopener">Open</a>'; }
      } else if (n.kind === 'backup' && a) {
        h += verbBtn(a, 'backup', 'Back up now', busy) + '<button class="ctl small aps-quiet" type="button" data-do="go" data-view="' + esc(a.slug) + '">More</button>';
      } else if (n.kind === 'failed' && a) {
        // The release before is still live after a failed update, so rolling back is not offered here.
        h += '<button class="ctl small" type="button" data-do="logs" data-app="' + esc(a.slug) + '">Logs</button>' +
          '<button class="ctl small" type="button" data-do="fix" data-app="' + esc(a.slug) + '">Ask Rouh to fix it</button>';
      } else if (n.kind === 'silent' || (n.kind === 'failed' && n.server)) {
        h += '<button class="ctl small" type="button" data-do="report" data-server="' + n.server + '"' + (R.busy ? ' disabled' : '') + '>Ask for a report</button>';
      }
      h += '</div></div>';
    });
    return h + '</div></section>';
  }

  function verbBtn(a, verb, label, off, primary) {
    return '<button class="ctl ' + (primary ? '' : 'small') + (primary ? ' aps-strong' : '') + '" type="button" data-do="verb" data-app="' + esc(a.slug) + '" data-verb="' + verb +
      '" data-key="' + verb + '-' + a.id + '"' + (off || R.busy ? ' disabled' : '') + '>' + (R.busy === verb + ':' + a.id ? 'Sending…' : esc(label)) + '</button>';
  }

  function nextStep() {
    var waiting = D().servers.filter(function (s) { return s.state === 'waiting'; })[0];
    // A line made while Rouh has no address cannot work, so it is not progress (critic round 5).
    var at = waiting && D().reachable ? 2 : 0;
    var steps = ['Pick a company', 'Rent a small server', 'Paste one line on it', 'Ready by itself'];
    var said = waiting ? (D().reachable ? waiting.name + ' has its setup line. It turns Ready by itself once the line has run on it.'
        : waiting.name + ' has a setup line, but it cannot work until Rouh has its address on the internet.')
      : D().apps.length ? 'Your apps run on computers where Rouh can only see whether they open. A server of your own lets Rouh update them, restart them, undo a bad update and back them up.'
        : 'Before Rouh builds your first app, it needs a small server of yours to put it on. Rouh sets it up; you only rent it.';
    var first = !D().reachable ? noAddress() : '';
    return '<section class="aps-next" aria-labelledby="apsNextH"><div class="aps-next-top"><div><b id="apsNextH">Next: your own apps server</b><p>' + esc(said) + '</p>' +
      '<p class="aps-cost">Setting it up here is free. The server costs about 5 to 10 euros a month, paid to the company you rent it from, not to Rouh.</p></div>' +
      '<button class="ctl' + (first ? ' aps-quiet' : ' aps-strong') + '" type="button" data-do="go" data-view="setup">' + (waiting && !first ? 'See the setup line' : 'Set up an apps server') + '</button></div>' + first +
      '<ol class="aps-track" aria-label="Setting up an apps server">' + steps.map(function (s, i) {
        return '<li class="' + (i < at ? 'done' : i === at ? 'now' : '') + '"><span class="aps-dot" aria-hidden="true">' + (i < at ? ico('good') : i + 1) + '</span>' + s +
          (i < at ? '<span class="aps-sr"> (done)</span>' : i === at ? '<span class="aps-sr"> (you are here)</span>' : '') + '</li>';
      }).join('') + '</ol></section>';
  }

  /** What must come before a server can join: this Rouh needs an address on the internet (Vesela, trial 65). */
  function noAddress() {
    return '<div class="aps-notice">' + ico('bad') + '<div><b>First, Rouh needs an address on the internet.</b> A new server has to reach Rouh to join it, and this Rouh has none yet. ' +
      'Connect it to rouh.land in Settings, then come back here.</div><a class="ctl aps-strong" href="/settings/account">Connect Rouh to rouh.land</a></div>';
  }

  function whereBox() {
    var pl = places(), segs = '', legend = '';
    if (!ready()) {
      segs += '<div class="aps-seg empty" title="Your apps server: not set up yet">0</div>';
      legend += '<li><span class="aps-sw empty"></span>Your apps server, not set up yet</li>';
    }
    pl.forEach(function (p) {
      var c = p.pages ? p.pages.length : p.apps.length;
      if (c) { segs += '<div class="aps-seg ' + p.cls + '" style="flex:' + c + ' 1 0">' + c + '</div>'; }
      legend += '<li><span class="aps-sw ' + p.cls + '"></span>' + esc(p.server ? p.server.name : p.name) + ': ' +
        (p.pages ? plural(c, 'page', 'pages') : plural(c, 'app', 'apps')) + '</li>';
    });
    var mv = toMove();
    return '<section aria-labelledby="apsWhereH"><h3 id="apsWhereH" class="aps-h">Where your apps live</h3>' +
      '<div class="aps-bar" role="img" aria-label="' + esc(pl.map(function (p) { return (p.server ? p.server.name : p.name) + ': ' + (p.pages ? p.pages.length : p.apps.length); }).join(', ')) + '">' + segs + '</div>' +
      '<ul class="aps-legend">' + legend + '</ul>' +
      '<div class="aps-plan-line"><span>' + (mv ? '<b>' + mv + ' to move onto your apps server</b> (' + moveParts() + '). None moved yet, and nothing moves until you say.'
        : '<b>Everything is on your apps server.</b>') + '</span>' +
      (mv ? '<button class="ctl small" type="button" data-do="go" data-view="plan">See the moving plan</button>' : '') + '</div></section>';
  }

  function placeBox(p) {
    var h = '<section class="aps-place" aria-label="' + esc(p.server ? p.server.name : p.name) + '">';
    if (p.pages) {
      h += '<div class="aps-place-h"><span class="aps-sw d"></span><b>' + esc(p.name) + '</b><span class="aps-tag">' +
        plural(p.pages.length, 'page with its own data', 'pages with their own data') + '</span><span class="aps-grow"></span>' +
        '<span class="aps-st dim">' + ico('dim') + 'To move</span></div>' +
        '<p class="aps-place-say">Workspace pages that keep data are apps too. They run on Rouh’s own server for now.</p><ul class="aps-rows">';
      p.pages.forEach(function (pg) {
        h += '<li class="aps-row page"><span class="aps-st dim">' + ico('doc') + 'Page</span><span class="aps-nm">' + esc(pg.name) +
          '<small>' + esc(pg.keeps || pg.data_at) + '</small></span><a class="aps-addr" href="' + esc(pg.href) + '">Open page</a>' +
          '<span class="aps-when">Changed ' + ago(pg.updated_at) + '</span><span></span></li>';
      });
      return h + '</ul></section>';
    }
    var s = p.server, m = !!(s && s.standard && (s.state === 'ready' || s.state === 'silent'));
    h += '<div class="aps-place-h"><span class="aps-sw ' + p.cls + '"></span><b>' + esc(s ? s.name : p.name) + '</b><span class="aps-tag">' +
      esc(s ? (s.standard ? 'Your apps server' : 'Another computer') : 'Not on a server Rouh knows') + '</span>' +
      '<span class="aps-grow"></span>' + (s ? st(SRV_ST, serverState(s), 'elsewhere') : '') + '</div>';
    if (!m) {
      var cannot = p.apps.some(function (a) { return /cannot reach/i.test(a.data_at || ''); });
      h += '<p class="aps-place-say">Rouh sees whether these open, but cannot update, restart or back them up here.' +
        (cannot ? ' It cannot look inside this computer, so it does not know where their data is kept.' : '') +
        ' That is fine while they work; ' + (ready() ? 'Rouh can move them onto your apps server when you say.' : 'your own apps server lets Rouh look after them.') + '</p>';
    }
    h += '<ul class="aps-rows">';
    if (!p.apps.length) { h += '<li class="aps-none">No apps on it yet. Ask Rouh to build one, or to move one here.</li>'; }
    p.apps.forEach(function (a) {
      var busy = pending(a), fail = failedOf(a);
      var sub = busy ? '<small>' + esc(busy.said) + ': ' + (busy.state === 'running' ? 'running' : 'sent') + '</small>'
        : fail ? '<small class="aps-st bad">' + ico('xc') + esc(fail.said) + ' failed ' + ago(fail.done_at) + '</small>'
          : a.what ? '<small>' + esc(a.what) + '</small>' : '';
      var when = m ? (a.backup_ok === false ? '<span class="aps-st bad">' + ico('disk') + 'Backup failed</span>' : 'Backed up ' + ago(a.backup_at)) + '<br>' +
        (a.restore_test_ok === false ? '<span class="aps-st bad">' + ico('disk') + 'Restore test failed</span>' : 'Restore tested ' + ago(a.restore_test_at))
        : 'Checked ' + ago(a.checked_at);
      h += '<li class="aps-row" data-do="go" data-view="' + esc(a.slug) + '">' + st(APP_ST, a.state, 'unknown') +
        '<span class="aps-nm">' + esc(a.name) + sub + '</span>' +
        (a.url ? '<a class="aps-addr" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(bare(a.url)) + '</a>' : '<span class="aps-addr aps-note">No address yet</span>') +
        '<span class="aps-when' + (m ? ' kept' : '') + '">' + when + '</span>' +
        '<button class="aps-chev" type="button" aria-label="Open ' + esc(a.name) + '" data-do="go" data-view="' + esc(a.slug) + '" data-key="row-' + a.id + '">' + ico('chev') + '</button></li>';
    });
    return h + '</ul></section>';
  }

  function ideasList() {
    return '<ul class="aps-ideas" aria-label="Ideas to start from">' + (D().ideas || []).map(function (i, k) {
      return '<li><button class="ctl" type="button" data-do="idea" data-i="' + k + '">' + esc(i.name) + '</button></li>';
    }).join('') + '</ul>';
  }

  function whyList() {
    return '<ul class="aps-why"><li><b>Kept apart from your keys</b>Rouh’s server holds your mail and accounts. A guest opening your wedding page never comes near it.</li>' +
      '<li><b>Up while Rouh changes</b>Rouh restarts and changes all the time. Your apps keep running while it does.</li>' +
      '<li><b>Yours</b>A small rented server, about 5 to 10 euros a month, that you own and can take anywhere.</li></ul>';
  }

  function about() {
    return '<details class="aps-fold" data-key="about"><summary>What Apps is, ideas, and why a server of its own</summary><div>' +
      '<p>Rouh can build you any app. Tell it what you want in your own words: it writes it, puts it online at an address of yours, keeps it running and backed up, and changes it whenever you ask.</p>' +
      whyList() + '<p>Ideas to start from:</p>' + ideasList() +
      '<p><a href="/guide/lesson/apps-why">The Guide: Your apps</a></p></div></details>';
  }

  function viewEmpty() {
    return '<section class="aps-hero"><h2>Rouh can build you any app.</h2><p>Tell it what you want, in your own words. Rouh writes it, puts it online at an address of yours, keeps it running and backed up, and changes it whenever you ask.</p>' +
      ideasList() + '</section><section aria-labelledby="apsWhyH"><h3 id="apsWhyH" class="aps-h">Why your apps get a server of their own</h3>' + whyList() + '</section>' +
      nextStep() + '<div class="aps-acts"><button class="ctl" type="button" data-do="go" data-view="add">Add an app you already have</button>' +
      '<a class="ctl aps-quiet" href="/guide/lesson/apps-why">The Guide: Your apps</a></div>';
  }

  /* -- one app -- */

  function viewApp(a) {
    var s = server(a.server_id), m = !!a.managed, busy = pending(a);
    var line = a.state === 'down' ? a.name + ' is not answering' + (a.down_since ? ', since ' + clock(a.down_since) + '.' : '.')
      : a.state === 'answering' ? a.name + ' is answering.' : a.name + ' has not been checked yet.';
    var h = back() + '<p class="aps-note aps-on">' + esc(s ? 'On ' + s.name : a.elsewhere ? 'On ' + a.elsewhere : 'Elsewhere') + '</p>';
    h += '<section class="aps-verdict ' + (a.state === 'down' ? 'bad' : a.state === 'answering' ? 'good' : 'dim') + '">' +
      ico(a.state === 'down' ? 'bad' : a.state === 'answering' ? 'good' : 'dim', 'big') + '<div><h2>' + esc(line) + '</h2><p><span>' +
      esc(a.check_said || '') + ' Checked ' + ago(a.checked_at) + '.</span><button class="ctl small" type="button" data-do="checkone" data-app="' + esc(a.slug) +
      '" data-key="checkone"' + (R.busy ? ' disabled' : '') + '>' + (R.busy === 'check:' + a.id ? 'Checking…' : 'Check now') + '</button></p></div></section>';
    if (busy) {
      var silent = s && s.state === 'silent';
      h += '<div class="aps-live" role="status"><span class="aps-spin" aria-hidden="true"></span><span><b>' + esc(busy.said) + '</b>: ' +
        (silent ? esc(s.name) + ' has not called in; it takes it when it does.' : busy.state === 'running' ? 'running on ' + esc(s ? s.name : 'its server') + ' now.'
          : 'sent, ' + esc(s ? s.name : 'its server') + ' takes it within a minute.') + ' The other commands wait until it finishes.</span></div>';
    }
    var openRow = '<div class="aps-acts">' + (a.url ? '<a class="ctl' + (a.state === 'down' ? '' : ' aps-strong') + '" href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
      ico('ext') + 'Open ' + esc(bare(a.url)) + '</a>' : '') +
      '<button class="ctl" type="button" data-do="' + (a.state === 'down' ? 'fix' : 'change') + '" data-app="' + esc(a.slug) + '">' +
      (a.state === 'down' ? 'Ask Rouh to fix it' : 'Ask Rouh to change it') + '</button></div>';
    if (!(m && a.state === 'down')) { h += openRow; }
    if (m && s && s.state === 'silent') {
      h += '<div class="aps-notice">' + ico('bad') + '<div>' + esc(s.name) + ' has not called in for ' + esc(ago(s.seen_at).replace(' ago', '')) +
        '. A command waits until it does. <button class="ctl small" type="button" data-do="report" data-server="' + s.id + '">Ask for a report</button></div></div>';
    }
    if (m) {
      h += '<section aria-labelledby="apsRunH"><h3 id="apsRunH" class="aps-h">Run it</h3><div class="aps-acts">' +
        verbBtn(a, 'restart', 'Restart', busy, a.state === 'down' && !busy).replace('ctl small', 'ctl') +
        verbBtn(a, 'update', 'Update', busy).replace('ctl small', 'ctl') +
        verbBtn(a, 'rollback', a.previous_release ? 'Roll back to ' + a.previous_release : 'Roll back', busy || !a.previous_release).replace('ctl small', 'ctl') +
        '<button class="ctl" type="button" data-do="verb" data-app="' + esc(a.slug) + '" data-verb="logs" data-key="logs-' + a.id + '"' + (R.busy ? ' disabled' : '') + '>Logs</button>' +
        verbBtn(a, 'backup', 'Back up now', busy).replace('ctl small', 'ctl') + '</div>' +
        '<p class="aps-note">Update puts the newest code on a test copy first, and live only if the test copy answers.</p></section>';
      if (a.state === 'down') { h += openRow; }
    } else {
      h += '<div class="aps-notice">' + ico('dim') + '<div>On ' + esc(s ? s.name : 'a server Rouh does not know') +
        ' Rouh can only check its address: it cannot update, restart, roll back or back it up. ' +
        (ready() ? 'Your apps server is ready, so Rouh can move it there.' : 'Once your apps server is set up, Rouh can move it there.') + '</div>' +
        (ready() ? '<button class="ctl" type="button" data-do="move" data-name="' + esc(a.name) + '">Ask Rouh to move it</button>'
          : '<button class="ctl" type="button" data-do="go" data-view="setup">Set up an apps server</button>') + '</div>';
    }
    var facts = [['What it is', esc(a.what)], ['Address', a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.url) + '</a>' : ''],
      ['Runs on', esc(s ? s.name + ' (' + s.host_name + ')' : a.elsewhere)], ['Its data', esc(a.data_at || 'Not said yet')]];
    if (m) {
      facts.push(['Release', esc(a.release ? a.release + ', ' + ago(a.released_at) : 'Not deployed yet')]);
      facts.push(['Last backup', a.backup_ok === false ? '<span class="aps-st bad">' + ico('disk') + 'Failed ' + ago(a.backup_at) + '</span>' : a.backup_at ? 'Worked ' + ago(a.backup_at) : 'Not yet']);
      facts.push(['Test restore', a.restore_test_ok === false ? '<span class="aps-st bad">' + ico('disk') + 'Failed ' + ago(a.restore_test_at) + '</span>' : a.restore_test_at ? 'Worked ' + ago(a.restore_test_at) : 'Not yet']);
      facts.push(['Memory', esc(a.memory_mb ? a.memory_mb + ' MB' + (a.memory_limit ? ' of ' + a.memory_limit : '') : '')]);
      facts.push(['Test copy', a.test_url ? '<a href="' + esc(a.test_url) + '" target="_blank" rel="noopener">' + esc(bare(a.test_url)) + '</a>' : '']);
      facts.push(['Code', esc(a.repo)]);
      facts.push(['Deploy key', a.deploy_key ? '<code class="aps-code">' + esc(a.deploy_key) + '</code>' : '']);
      facts.push(['Last deploy failed', esc(a.last_error)]);
    }
    h += '<section aria-labelledby="apsFactH"><h3 id="apsFactH" class="aps-h">About it</h3><dl class="aps-facts">' + facts.filter(function (f) { return f[1]; }).map(function (f) {
      return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>';
    }).join('') + '</dl></section>';
    if (a.commands.length) {
      h += '<section aria-labelledby="apsDidH"><h3 id="apsDidH" class="aps-h">What Rouh did</h3><ul class="aps-cmds">' + a.commands.map(function (c, i) {
        return '<li><div class="aps-cmd-top"><b>' + esc(c.said) + '</b>' + st(CMD_ST, c.state, 'waiting') + '<span class="aps-note">' + ago(c.asked_at) + ', by ' +
          esc(c.asked_by === 'page' ? 'you, here' : c.asked_by) + '</span></div>' +
          (c.output ? '<details data-key="out-' + c.id + '"' + (c.verb === 'logs' && i === 0 ? ' open' : '') + '><summary>Show what the server said</summary><pre class="aps-code">' + esc(c.output) + '</pre></details>' : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    h += R.confirm === 'app-' + a.id
      ? '<div class="aps-confirm"><span>Take ' + esc(a.name) + ' off the list? Nothing on its server is stopped.</span><button class="ctl aps-danger" type="button" data-do="remove" data-app="' + esc(a.slug) + '">Take it off</button><button class="ctl" type="button" data-do="unconfirm" data-key="keep">Keep it</button></div>'
      : '<div><button class="ctl aps-quiet aps-edge" type="button" data-do="confirm" data-what="app-' + a.id + '" data-key="off">Take it off the list</button></div>';
    return h;
  }

  /* -- setting up an apps server, and the servers -- */

  function viewSetup() {
    var d = D(), waiting = d.servers.filter(function (s) { return s.state === 'waiting'; })[0];
    var h = back();
    if (ready() && !waiting) {
      var main = d.servers.filter(function (x) { return x.standard && x.state !== 'waiting'; })[0];
      h += '<section class="aps-verdict ' + (main.state === 'silent' ? 'bad' : 'good') + '">' + ico(main.state === 'silent' ? 'bad' : 'good', 'big') + '<div><h2>' +
        esc(main.state === 'silent' ? main.name + ' has not called in for ' + ago(main.seen_at).replace(' ago', '') + '.' : 'Your apps server ' + main.name + ' is calling in.') +
        '</h2><p><span>It calls Rouh every 30 seconds and takes the commands waiting for it.</span></p></div></section>';
      h += serversBox() + '<details class="aps-fold" data-key="another"><summary>Set up another apps server</summary><div class="aps-stack">' + setupGuide(waiting) + '</div></details>';
      return h;
    }
    h += setupGuide(waiting);
    if (d.servers.length) { h += serversBox(); }
    return h;
  }

  function setupGuide(waiting) {
    var d = D(), hst = d.hosts.filter(function (x) { return x.id === R.host; })[0] || d.hosts[0];
    var unreachable = !d.reachable && !(waiting && R.lines[waiting.id] && R.lines[waiting.id].reachable);
    var h = '<section class="aps-verdict dim aps-plain"><div><h2>Rent a small server, paste one line on it, and it turns Ready by itself.</h2>' +
      '<p><span>Rouh installs everything on it: a separate space for each app, backups every night that are tested, and secure addresses. Rouh never rents or buys a server for you.</span></p></div></section>';
    if (unreachable) { h += noAddress(); }
    var got0 = waiting ? R.lines[waiting.id] : null;
    if (waiting && got0 && got0.reachable) { unreachable = false; }
    h += '<fieldset class="aps-hosts"><legend>Which company will you rent it from?</legend><p class="aps-cost">Each costs about 5 to 10 euros a month for a small server, paid to them, not to Rouh. Hostinger is recommended: it is quick to rent, and with its token Rouh can set the server up for you with one press.</p>' + d.hosts.map(function (x) {
      return '<div class="aps-host"><input type="radio" name="aps-host" id="aps-h-' + x.id + '" value="' + x.id + '"' + (x.id === hst.id ? ' checked' : '') + ' data-do="host">' +
        '<label for="aps-h-' + x.id + '"><b>' + esc(x.name) + (x.recommended ? ' <span class="aps-pill">Recommended</span>' : '') + '</b><span>' + esc(x.why) + '</span></label></div>';
    }).join('') + '</fieldset>';
    h += '<section aria-labelledby="apsStepsH"><h3 id="apsStepsH" class="aps-h">At ' + esc(hst.name) + '</h3><p class="aps-note">' + esc(hst.plan) +
      (hst.buy ? ' <a href="' + esc(hst.buy) + '" target="_blank" rel="noopener">Open ' + esc(hst.name) + '</a>' : '') + '</p><ol class="aps-steps">' +
      hst.steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></section>';
    var got = waiting ? R.lines[waiting.id] : null;
    if (waiting && !got) {
      fetch('/api/apps/servers/' + waiting.id + '/setup', { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) { R.lines[waiting.id] = j; draw(); } });
    }
    if (!waiting) {
      h += '<div class="aps-acts"><button class="ctl' + (unreachable ? '' : ' aps-strong') + '" type="button" data-do="makeline" data-key="makeline"' + (R.busy || unreachable ? ' disabled' : '') + '>' +
        (R.busy === 'new' ? 'Making it…' : 'Make my setup line') + '</button></div><p class="aps-note">' +
        (unreachable ? 'This waits until Rouh has its address on the internet, above.' : 'The line works once, for one server, for seven days.') + '</p>';
    } else if (unreachable) {
      h += '<div class="aps-notice">' + ico('wait') + '<div><b>' + esc(waiting.name) + '</b> has a setup line, but it cannot work until Rouh has its address on the internet, above. ' +
        'Once it has, the line is shown here to paste. You can also cancel it under Your servers.</div></div>';
    } else if (!got) {
      h += '<p class="aps-note">Reading the setup line of ' + esc(waiting.name) + '…</p>';
    } else {
      h += '<section aria-labelledby="apsLineH"><h3 id="apsLineH" class="aps-h">The line to paste on ' + esc(waiting.name) + '</h3><div class="aps-line"><code class="aps-code" tabindex="0">' + esc(got.line) +
        '</code><button class="ctl' + (unreachable ? '' : ' aps-strong') + '" type="button" data-do="copy" data-text="line" data-key="copy-line">Copy</button></div>' +
        '<details class="aps-fold" data-key="boot"><summary>The same as a first-boot script</summary><div><p>' + esc(hst.boot) + '</p><div class="aps-line"><pre class="aps-code" tabindex="0">' +
        esc(got.boot) + '</pre><button class="ctl" type="button" data-do="copy" data-text="boot">Copy</button></div></div></details>' +
        '<p class="aps-note">Open your server’s command window (Hostinger calls it Browser terminal), paste the line and press Enter. It works once, for one server, for seven days.</p></section>' +
        '<div class="aps-live" role="status"><span class="aps-spin" aria-hidden="true"></span><span><b>' + esc(waiting.name) +
        '</b> is waiting for the server to call in. This page turns to Ready by itself; the setup takes about five minutes.</span></div>';
    }
    if (hst.id === 'hostinger') { h += hostinger(); }
    return h;
  }

  function serversBox() {
    var d = D();
    return '<section aria-labelledby="apsSrvH"><h3 id="apsSrvH" class="aps-h">Your servers <span class="aps-count">' + d.servers.length + '</span></h3><div class="aps-servers">' +
      d.servers.map(function (s) {
        var on = d.apps.filter(function (a) { return a.server_id === s.id; }).length;
        var facts = s.state === 'waiting' ? 'Setup line made ' + ago(s.made_at) + (s.join_until ? ', good until ' + new Date(s.join_until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
          : plural(on, 'app', 'apps') + (s.os ? ', ' + s.os : '') + (s.cpus ? ', ' + s.cpus + ' CPUs' : '') + (s.memory_mb ? ', ' + Math.round(s.memory_mb / 1024) + ' GB memory' : '') +
            (s.disk_gb ? ', ' + (s.disk_free_gb != null ? s.disk_free_gb + ' of ' : '') + s.disk_gb + ' GB disk free' : '') + (s.seen_at ? ', last called in ' + ago(s.seen_at) : '');
        var acts = R.confirm === 'srv-' + s.id
          ? '<button class="ctl small aps-danger" type="button" data-do="srvoff" data-server="' + s.id + '">Take it off</button><button class="ctl small" type="button" data-do="unconfirm">Keep it</button>'
          : (s.standard && s.state !== 'waiting' ? '<button class="ctl small" type="button" data-do="report" data-server="' + s.id + '"' + (R.busy ? ' disabled' : '') + '>Ask for a report</button>' : '') +
            '<button class="ctl small aps-quiet" type="button" data-do="confirm" data-what="srv-' + s.id + '">' + (s.state === 'waiting' ? 'Cancel the setup line' : 'Take it off the list') + '</button>';
        return '<div class="aps-server"><div class="aps-server-top"><b>' + esc(s.name) + '</b>' + st(SRV_ST, serverState(s), 'elsewhere') + '</div><p>' +
          esc(s.host_name + (s.address ? ', ' + s.address : '')) + '</p><p>' + esc(facts) + '</p>' + (s.note ? '<p>' + esc(s.note) + '</p>' : '') +
          (R.confirm === 'srv-' + s.id ? '<p class="aps-said bad">' + (s.state === 'waiting' ? 'Cancel the setup line of ' + esc(s.name) + '?' : 'Take ' + esc(s.name) + ' off the list? Nothing on it is stopped.') + '</p>' : '') +
          '<div class="aps-acts">' + acts + '</div></div>';
      }).join('') + '</div></section>';
  }

  function hostinger() {
    var d = D(), tok = d.tokens && d.tokens.hostinger;
    var h = '<details class="aps-fold" data-key="hostinger"' + (tok || R.hs.vps ? ' open' : '') + '><summary>Or let Rouh do it with a Hostinger API token</summary><div class="aps-stack">';
    if (!tok) {
      h += '<p>Make a token in hPanel, Profile, API, and paste it here. Rouh keeps it sealed and never shows it again. ' +
        '<a href="https://hpanel.hostinger.com/profile/api" target="_blank" rel="noopener">Open hPanel API</a></p>' +
        '<form class="aps-line" data-do="token"><div class="aps-field aps-grow"><label for="aps-token">Hostinger API token</label><input id="aps-token" type="password" autocomplete="off"></div>' +
        '<button class="ctl" type="submit"' + (R.busy ? ' disabled' : '') + '>' + (R.busy === 'token' ? 'Checking…' : 'Save') + '</button></form>';
    } else {
      h += '<p>Token ending ' + esc(tok.last4) + ', saved ' + ago(tok.saved_at) + '.</p><div class="aps-acts"><button class="ctl" type="button" data-do="vps"' + (R.hs.loading ? ' disabled' : '') + '>' +
        (R.hs.loading ? 'Reading…' : 'Show my VPSs') + '</button><button class="ctl small aps-quiet" type="button" data-do="forget">Forget the token</button></div>';
      if (R.hs.error) { h += '<p class="aps-said bad">' + esc(R.hs.error) + '</p>'; }
      if (R.hs.vps) {
        if (!R.hs.vps.length) { h += '<p class="aps-note">No VPS in this Hostinger account yet. Buy one, then press Show my VPSs again.</p>'; }
        else {
          h += '<ul class="aps-cmds">' + R.hs.vps.map(function (v) {
            var r = '<li><div class="aps-cmd-top"><b>' + esc(v.hostname || 'VPS ' + v.id) + '</b><span class="aps-note">' + esc([v.plan, v.ip, v.fresh ? 'not installed yet' : (v.template || 'installed')].filter(Boolean).join(', ')) + '</span></div>';
            if (v.ours) { r += '<p class="aps-note">Already your apps server.</p>'; }
            else if (v.fresh) { r += '<div class="aps-acts"><button class="ctl" type="button" data-do="hsset" data-vm="' + v.id + '"' + (R.busy ? ' disabled' : '') + '>' + (R.busy === 'hs:' + v.id ? 'Setting up…' : 'Set it up') + '</button></div>'; }
            else if (R.hs.wipe === v.id) {
              r += '<form class="aps-confirm" data-do="wipe" data-vm="' + v.id + '"><span>Everything on ' + esc(v.hostname) + ' will be erased. Type its name to go on.</span>' +
                '<div class="aps-field aps-grow"><label for="aps-wipe">Its name</label><input id="aps-wipe" autocomplete="off"></div>' +
                '<button class="ctl aps-danger" type="submit" disabled data-name="' + esc(v.hostname) + '">Erase and set up</button><button class="ctl" type="button" data-do="unwipe">Cancel</button></form>';
            } else { r += '<div class="aps-acts"><button class="ctl" type="button" data-do="wipeask" data-vm="' + v.id + '">Erase and set up…</button></div>'; }
            return r + '</li>';
          }).join('') + '</ul>';
        }
      }
    }
    return h + '</div></details>';
  }

  /* -- the moving plan -- */

  function viewPlan() {
    var d = D(), steps = (d.plan && d.plan.steps) || [];
    var h = back() + '<section class="aps-verdict dim aps-plain"><div><h2>' + (steps.length ? steps.length + ' to move onto your apps server: ' + moveParts() + '. None moved yet.' : 'Everything is on your apps server.') +
      '</h2><p><span>' + esc(d.plan ? d.plan.said : '') + '</span></p></div></section>';
    var target = d.servers.filter(function (x) { return x.standard && x.state !== 'waiting'; })[0];
    var silent = target && target.state === 'silent';
    if (silent) {
      h += '<div class="aps-notice">' + ico('bad') + '<div>' + esc(target.name) + ' has not called in for ' + esc(ago(target.seen_at).replace(' ago', '')) +
        ', so nothing moves onto it until it does.</div><button class="ctl" type="button" data-do="report" data-server="' + target.id + '">Ask for a report</button></div>';
    }
    if (!ready()) {
      h += '<div class="aps-notice">' + ico('dim') + '<div>Your apps server is not set up yet, so nothing can move.</div>' +
        '<button class="ctl aps-strong" type="button" data-do="go" data-view="setup">Set up an apps server</button></div>';
    }
    if (!steps.length) { return h; }
    h += '<dl class="aps-facts"><dt>How an app moves</dt><dd>Rouh copies its data to your apps server and starts it there. Only when the new copy works does Rouh send its address there and stop the old one, so nothing is lost if the copy does not work.</dd>' +
      '<dt>How a page with data moves</dt><dd>It becomes a small app with a database of its own on the apps server, its data copied over. The page in the workspace stays and links to it.</dd></dl>';
    h += '<ol class="aps-plan">' + steps.map(function (st2) {
      var data = st2.kind === 'app' ? ((appBy(String(st2.id)) || {}).data_at || '') : ((d.pages.filter(function (p) { return p.rel === st2.rel; })[0] || {}).keeps || '');
      return '<li><div><b>' + esc(st2.name) + '</b><span>' + (st2.kind === 'app' ? 'App' : 'Page') + ' on ' + esc(st2.from) + '. Data: ' + esc(plainData(data) || 'where it is kept is not said yet') + '</span></div>' +
        (ready() && !silent ? '<button class="ctl small" type="button" data-do="move" data-name="' + esc(st2.name) + '">Ask Rouh to move it</button>' : '') + '</li>';
    }).join('') + '</ol>';
    return h;
  }

  /* -- adding an app -- */

  function viewAdd() {
    var d = D();
    return back() + '<h2 class="aps-title">Add an app you already have</h2><p class="aps-note">For an app that already runs somewhere. Rouh checks its address every five minutes and lists it here.</p>' +
      '<form class="aps-form" data-do="add"><div class="aps-field"><label for="aps-an">Name</label><input id="aps-an" required autocomplete="off" placeholder="Notes"></div>' +
      '<div class="aps-field"><label for="aps-au">Address</label><input id="aps-au" type="url" required placeholder="https://notes.example.com"><small>Rouh checks it every five minutes.</small></div>' +
      '<div class="aps-field"><label for="aps-as">Where it runs</label><select id="aps-as">' + d.servers.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') +
      '<option value="">Somewhere else</option></select></div>' +
      '<div class="aps-field" id="aps-aw"' + (d.servers.length ? ' hidden' : '') + '><label for="aps-ae">Where, in your words</label><input id="aps-ae" autocomplete="off" placeholder="my old server"></div>' +
      '<div class="aps-acts"><button class="ctl aps-strong" type="submit"' + (R.busy ? ' disabled' : '') + '>' + (R.busy === 'add' ? 'Adding…' : 'Add it') + '</button>' +
      '<button class="ctl" type="button" data-do="go" data-view="">Cancel</button></div></form>';
  }

  /* ---- presses ---- */

  function copy(text, b) {
    function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { b.textContent = 'Select it and copy'; });
    } else { b.textContent = 'Select it and copy'; }
  }

  function listVps() {
    R.hs.loading = true;
    R.hs.error = '';
    draw();
    fetch('/api/apps/hostinger/vps', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (got) {
        R.hs.loading = false;
        if (got.ok) { R.hs.vps = got.j.vps || []; } else { R.hs.error = (got.j && got.j.error) || 'Hostinger could not be read.'; }
        draw();
      })
      .catch(function () { R.hs.loading = false; R.hs.error = 'Rouh could not be reached.'; draw(); });
  }

  function act(n, e) {
    var d = n.getAttribute('data-do'), a = n.getAttribute('data-app') ? appBy(n.getAttribute('data-app')) : null;
    switch (d) {
      case 'reload': load(false); break;
      case 'go': go(n.getAttribute('data-view') || ''); break;
      case 'idea': say((D().ideas[+n.getAttribute('data-i')] || {}).say || 'Build me an app that '); break;
      case 'check': post('/api/apps/check', {}, 'check'); break;
      case 'checkone': post('/api/apps/check', { app: a.id }, 'check:' + a.id); break;
      case 'verb': post('/api/apps/' + a.id + '/do', { verb: n.getAttribute('data-verb') }, n.getAttribute('data-verb') + ':' + a.id); break;
      case 'logs':
        if (R.view !== a.slug) { go(a.slug); }
        post('/api/apps/' + a.id + '/do', { verb: 'logs' }, 'logs:' + a.id);
        break;
      case 'fix': say('My app ' + a.name + ' (' + (a.url || a.slug) + ') is not answering. Find out why and fix it.'); break;
      case 'change': say('In my app ' + a.name + ' (' + (a.url || a.slug) + '), '); break;
      case 'move': say('Move ' + n.getAttribute('data-name') + ' onto my apps server.'); break;
      case 'report': post('/api/apps/servers/' + n.getAttribute('data-server') + '/check', {}, 'srv:' + n.getAttribute('data-server')); break;
      case 'confirm': R.confirm = n.getAttribute('data-what'); draw(); break;
      case 'unconfirm': R.confirm = ''; draw(); break;
      case 'remove':
        post('/api/apps/' + a.id + '/remove', {}, 'remove:' + a.id).then(function (j) { if (j) { go(''); R.said = j.said || (a.name + ' is off the list.'); draw(); } });
        break;
      case 'srvoff': R.confirm = ''; post('/api/apps/servers/' + n.getAttribute('data-server') + '/remove', {}, 'rm:' + n.getAttribute('data-server')); break;
      case 'host': R.host = n.value; draw(); break;
      case 'makeline':
        post('/api/apps/servers/new', { host: R.host }, 'new').then(function (j) {
          if (j && j.got && j.got.server) { R.lines[j.got.server.id] = { line: j.got.line, boot: j.got.boot, reachable: j.got.reachable, base: j.got.base }; draw(); }
        });
        break;
      case 'copy': {
        var w = D().servers.filter(function (s) { return s.state === 'waiting'; })[0], got = w && R.lines[w.id];
        if (got) { copy(n.getAttribute('data-text') === 'boot' ? got.boot : got.line, n); }
        break;
      }
      case 'token': {
        var t = ($('aps-token') || {}).value || '';
        if (!t.trim()) { break; }
        post('/api/apps/hostinger/token', { token: t.trim() }, 'token').then(function (j) { if (j) { listVps(); } });
        break;
      }
      case 'vps': listVps(); break;
      case 'forget': R.hs.vps = null; post('/api/apps/hostinger/forget', {}, 'forget'); break;
      case 'hsset': {
        var vm = +n.getAttribute('data-vm');
        post('/api/apps/hostinger/setup', { vm: vm }, 'hs:' + vm).then(function (j) { if (j) { R.hs.vps = null; draw(); } });
        break;
      }
      case 'wipeask': R.hs.wipe = +n.getAttribute('data-vm'); draw(); { var wi = $('aps-wipe'); if (wi) { wi.focus(); } } break;
      case 'unwipe': R.hs.wipe = 0; draw(); break;
      case 'wipe': {
        var vm2 = +n.getAttribute('data-vm'), typed = (($('aps-wipe') || {}).value || '').trim();
        post('/api/apps/hostinger/setup', { vm: vm2, wipe: true, confirm: typed }, 'hs:' + vm2)
          .then(function (j) { if (j) { R.hs.vps = null; R.hs.wipe = 0; draw(); } });
        break;
      }
      case 'add': {
        var sid = ($('aps-as') || {}).value || '';
        post('/api/apps/add', { name: $('aps-an').value, url: $('aps-au').value, server_id: sid, elsewhere: sid ? '' : ($('aps-ae') || {}).value || '' }, 'add')
          .then(function (j) { if (j) { var said = j.said; go(''); R.said = said; R.tone = 'ok'; draw(); } });
        break;
      }
    }
  }

  function wire(root) {
    root.querySelectorAll('[data-do]').forEach(function (n) {
      var evt = n.tagName === 'FORM' ? 'submit' : n.tagName === 'INPUT' ? 'change' : 'click';
      n.addEventListener(evt, function (e) {
        if (evt === 'submit') { e.preventDefault(); }
        // A link inside a row opens the app's address, not the row.
        if (e.target && e.target.closest && e.target.closest('a') && n.tagName !== 'A') { return; }
        e.stopPropagation();
        act(n, e);
      });
    });
    var sel = root.querySelector('#aps-as');
    if (sel) { sel.addEventListener('change', function () { var w = $('aps-aw'); if (w) { w.hidden = !!sel.value; } }); }
    var wp = root.querySelector('#aps-wipe');
    if (wp) {
      wp.addEventListener('input', function () {
        var b = wp.form && wp.form.querySelector('button[type=submit]');
        if (b) { b.disabled = wp.value.trim() !== b.getAttribute('data-name'); }
      });
    }
  }

  /* ---- the layer ---- */

  function shown(view) {
    R.open = true;
    R.view = view || '';
    if (!R.data && !R.loading) { load(false); } else { draw(); load(true); }
  }
  function hidden() { R.open = false; clearTimeout(R.timer); }

  window.RouhApps = { shown: shown, hidden: hidden, go: function (view) { R.view = view || ''; R.confirm = ''; draw(); },
                      reload: function () { return load(true); } };

  var x = $('appsClose');
  if (x) { x.addEventListener('click', function () { if (host().close) { host().close(); } }); }
  var b = $('appsBuild');
  if (b) { b.addEventListener('click', function () { say('Build me an app that '); }); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && R.open && R.view && !e.defaultPrevented) {
      var t = e.target;
      if (t && t.closest && t.closest('#appsView') && !(t.tagName === 'INPUT' && t.value)) { e.preventDefault(); e.stopPropagation(); go(''); }
    }
  }, true);
}());
