/* Apps, at /apps: the apps Rouh built and looks after for the person, the apps servers they run on,
   and setting one up (`rouh/apps_hosting.py`, `rouh/web/apps_hosting.py`).

   Petar, 28 November 2026: a person should know Rouh can build them any app, that they can and should
   have a server of their own for them, how to let Rouh set that server up, as near one click as can be,
   and then manage every app from one place, the ones on the side included.

   One page: the verdict first (are my apps answering?), then what needs the person, then the apps, each
   opening in place with its actions, then the servers, and the setup of a new one in place. With nothing
   yet, it says what Rouh can build and why the apps want a server of their own.

   The layer, its address and its row are app/runs.js's (`appsOpen`), handed over through
   `window.RouhAppsHost`, which also puts a request in the message box. */
(function () {
  'use strict';

  var R = { open: false, data: null, error: '', seq: 0, loading: false, row: 0, sheet: '', host: 'hostinger',
            setup: null, said: '', tone: '', busy: '', timer: 0, hs: { vps: null, error: '', loading: false, wipe: 0 },
            keep: '' };

  function host() { return window.RouhAppsHost || {}; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function btn(label, cls, onClick, opts) {
    var b = el('button', 'ctl small' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (opts && opts.title) { b.title = opts.title; }
    if (opts && opts.keep) { b.setAttribute('data-keep', opts.keep); }
    if (opts && opts.disabled) { b.disabled = true; }
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(b); });
    return b;
  }
  function svg(paths, cls) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'aps-ico' + (cls ? ' ' + cls : ''));
    s.innerHTML = paths;
    return s;
  }
  function csrf() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }

  /* ---- words ---- */

  function ago(t) {
    if (!t) { return 'never'; }
    var s = Date.now() / 1000 - t;
    if (s < 60) { return 'just now'; }
    if (s < 3600) { return Math.round(s / 60) + ' min ago'; }
    if (s < 86400) { return Math.round(s / 3600) + ' h ago'; }
    if (s < 86400 * 30) { return Math.round(s / 86400) + (Math.round(s / 86400) === 1 ? ' day ago' : ' days ago'); }
    return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function bare(url) { return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var STATE = {
    answering: { word: 'Answering', cls: 'good',
                 ico: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>' },
    down: { word: 'Not answering', cls: 'bad',
            ico: '<path d="M12 3.6l9 15.6H3z"/><path d="M12 9.6v4.6M12 16.9v.2"/>' },
    unknown: { word: 'Not checked yet', cls: 'dim',
               ico: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>' }
  };
  var SERVER_STATE = {
    ready: { word: 'Calling in', cls: 'good', ico: STATE.answering.ico },
    silent: { word: 'Silent', cls: 'bad', ico: STATE.down.ico },
    waiting: { word: 'Waiting to join', cls: 'wait', ico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>' },
    elsewhere: { word: 'Address checks only', cls: 'dim', ico: STATE.unknown.ico }
  };
  function mark(st, small) {
    var s = el('span', 'aps-mark ' + st.cls + (small ? ' small' : ''));
    s.appendChild(svg(st.ico));
    s.appendChild(el('span', 'aps-mark-w', st.word));
    return s;
  }

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
          else { R.data = j; R.error = ''; }
          if (R.open) { draw(); tick(); }
        });
      })
      .catch(function () {
        if (seq !== R.seq) { return; }
        R.loading = false;
        if (!R.data) { R.error = 'Rouh could not be reached. Try again in a moment.'; }
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
    var d = R.data || { apps: [], servers: [] };
    var moving = d.servers.some(function (s) { return s.state === 'waiting'; }) ||
      d.apps.some(function (a) {
        return a.commands.some(function (c) { return c.state === 'waiting' || c.state === 'sent' || c.state === 'running'; });
      });
    R.timer = setTimeout(function () { if (R.open && !R.busy) { load(true); } else { tick(); } }, moving ? 5000 : 60000);
  }

  function copy(text, b) {
    function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { b.textContent = 'Select it and copy'; });
    } else { b.textContent = 'Select it and copy'; }
  }

  function say(text) { if (host().say) { host().say(text); } }

  /* ---- the page ---- */

  function draw() {
    var body = $('appsBody');
    if (!body || !R.open) { return; }
    var keep = document.activeElement && body.contains(document.activeElement)
      ? document.activeElement.getAttribute('data-keep') : '';
    var typed = {};
    body.querySelectorAll('input[data-keep], textarea[data-keep]').forEach(function (i) { typed[i.getAttribute('data-keep')] = i.value; });
    var scroll = body.scrollTop;
    body.textContent = '';
    body.setAttribute('aria-busy', R.loading ? 'true' : 'false');
    meta();
    var page = el('div', 'aps-page');
    body.appendChild(page);
    if (R.error && !R.data) {
      page.appendChild(el('p', 'aps-error', R.error));
      page.appendChild(btn('Try again', '', function () { load(false); }));
      return;
    }
    if (!R.data) { page.appendChild(el('p', 'aps-loading', 'Reading your apps...')); return; }
    var d = R.data;
    if (R.said) {
      var s = el('p', 'aps-said ' + (R.tone === 'bad' ? 'bad' : 'ok'), R.said);
      s.setAttribute('role', R.tone === 'bad' ? 'alert' : 'status');
      page.appendChild(s);
    }
    if (R.sheet === 'setup') { page.appendChild(setupSheet(d)); }
    if (!d.apps.length && !d.servers.length && R.sheet !== 'setup' && R.sheet !== 'add') {
      page.appendChild(empty(d));
    } else {
      if (d.apps.length) { page.appendChild(verdict(d)); }
      if (d.needs.length) { page.appendChild(needs(d)); }
      page.appendChild(appsSection(d));
      page.appendChild(serversSection(d));
    }
    body.querySelectorAll('input[data-keep], textarea[data-keep]').forEach(function (i) {
      var k = i.getAttribute('data-keep');
      if (typed[k] != null && !i.value) { i.value = typed[k]; }
    });
    body.scrollTop = scroll;
    var again = R.keep || keep;
    R.keep = '';
    if (again) {
      var back = body.querySelector('[data-keep="' + again + '"]');
      // @ts-ignore - focusVisible is newer than the DOM types here
      if (back) { back.focus({ preventScroll: true, focusVisible: false }); }
    }
  }

  function meta() {
    var m = $('appsMeta');
    if (!m) { return; }
    var d = R.data;
    if (!d || (!d.apps.length && !d.servers.length)) { m.textContent = ''; return; }
    m.textContent = plural(d.apps.length, 'app', 'apps') + ', ' + plural(d.servers.length, 'server', 'servers');
  }

  /* With nothing yet: what Rouh builds, and why the apps want a home of their own. */
  function empty(d) {
    var box = el('section', 'aps-empty');
    box.appendChild(el('h4', 'aps-hero', 'Rouh can build you any app.'));
    box.appendChild(el('p', 'aps-lead', 'Tell it what you want, in your own words. Rouh writes it, puts it online at an address of yours, ' +
      'keeps it running and backed up, and changes it whenever you ask.'));
    var ideas = el('ul', 'aps-ideas');
    ideas.setAttribute('aria-label', 'Ideas to start from');
    d.ideas.forEach(function (idea) {
      var li = el('li');
      var b = btn(idea.name, 'aps-idea', function () { say(idea.say); }, { title: 'Put this in the message box: ' + idea.say });
      li.appendChild(b);
      ideas.appendChild(li);
    });
    box.appendChild(ideas);
    var home = el('div', 'aps-home');
    home.appendChild(svg('<rect x="3.5" y="4" width="17" height="6.5" rx="1.6"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.6"/><path d="M7 7.2h.1M7 16.8h.1"/>', 'aps-home-ico'));
    var words = el('div', 'aps-home-w');
    words.appendChild(el('h4', 'aps-h', 'Your apps need a server of their own'));
    words.appendChild(el('p', '', 'A small rented server, about 5 to 10 euros a month, that you own. Your apps live there, ' +
      'not on Rouh, so a guest opening your wedding page never comes near your mail and passwords, and your apps keep running while Rouh updates.'));
    var row = el('div', 'aps-actions');
    row.appendChild(btn('Set up an apps server', 'aps-strong', function () { openSetup(); }, { keep: 'setup-open' }));
    row.appendChild(btn('Add an app you already have', '', function () { R.sheet = 'add'; R.keep = 'add-name'; draw(); }));
    words.appendChild(row);
    home.appendChild(words);
    box.appendChild(home);
    return box;
  }

  function verdict(d) {
    var sec = el('section', 'aps-verdict');
    var down = d.apps.filter(function (a) { return a.state === 'down'; });
    var up = d.apps.filter(function (a) { return a.state === 'answering'; });
    var unknown = d.apps.length - down.length - up.length;
    var line;
    var st;
    if (!d.apps.length) { line = 'No apps yet.'; st = STATE.unknown; }
    else if (down.length === 1 && d.apps.length === 1) { line = 'Your app is not answering.'; st = STATE.down; }
    else if (down.length === 1) { line = '1 of your ' + d.apps.length + ' apps is not answering.'; st = STATE.down; }
    else if (down.length) { line = down.length + ' of your ' + d.apps.length + ' apps are not answering.'; st = STATE.down; }
    else if (!up.length) { line = d.apps.length === 1 ? 'Your app has not been checked yet.' : 'Your apps have not been checked yet.'; st = STATE.unknown; }
    else if (unknown) { line = up.length + ' of ' + d.apps.length + ' apps are answering; ' + unknown + ' not checked yet.'; st = STATE.answering; }
    else { line = d.apps.length === 1 ? 'Your app is answering.' : 'All ' + d.apps.length + ' apps are answering.'; st = STATE.answering; }
    var big = el('div', 'aps-verdict-line ' + st.cls);
    big.appendChild(svg(st.ico));
    big.appendChild(el('span', '', line));
    sec.appendChild(big);
    var sub = el('div', 'aps-verdict-sub');
    sub.appendChild(el('span', '', d.checked_at ? 'Checked by address ' + ago(d.checked_at) + ', every five minutes.' : 'Checked by address every five minutes.'));
    if (d.apps.length) {
      sub.appendChild(btn(R.busy === 'check' ? 'Checking...' : 'Check now', '', function () { post('/api/apps/check', {}, 'check'); },
                          { disabled: !!R.busy, keep: 'check-all' }));
    }
    sec.appendChild(sub);
    return sec;
  }

  function needs(d) {
    var sec = el('section', 'aps-sec aps-needs');
    sec.setAttribute('aria-labelledby', 'apNeedsH');
    var h = el('h4', 'aps-h', 'Needs you');
    h.id = 'apNeedsH';
    sec.appendChild(h);
    var list = el('ul', 'aps-need-list');
    d.needs.forEach(function (n) {
      var li = el('li', 'aps-need');
      li.appendChild(mark(n.kind === 'failed' ? { word: 'Failed', cls: 'bad', ico: STATE.down.ico } : n.kind === 'silent' ? SERVER_STATE.silent : STATE.down, true));
      var w = el('div', 'aps-need-w');
      w.appendChild(el('span', 'aps-need-said', n.said));
      var appN = n.app ? d.apps.filter(function (a) { return a.id === n.app; })[0] : null;
      var why = n.kind === 'down' && appN && appN.check_said ? appN.check_said + ' ' : '';
      if (why || n.since) { w.appendChild(el('span', 'aps-sub', why + (n.since ? 'Since ' + ago(n.since) + '.' : ''))); }
      li.appendChild(w);
      var acts = el('div', 'aps-need-acts');
      var app = n.app ? d.apps.filter(function (a) { return a.id === n.app; })[0] : null;
      if (app && n.kind === 'down' && app.managed) {
        acts.appendChild(btn('Restart', '', function () { doVerb(app, 'restart'); }, { disabled: !!R.busy }));
        if (app.previous_release) {
          acts.appendChild(btn('Roll back', '', function () { doVerb(app, 'rollback'); },
                               { disabled: !!R.busy, title: 'Back to ' + app.previous_release }));
        }
      }
      if (app && n.kind === 'backup' && app.managed) {
        acts.appendChild(btn('Back up now', '', function () { doVerb(app, 'backup'); }, { disabled: !!R.busy }));
      }
      if (app && app.managed && n.kind !== 'backup') {
        acts.appendChild(btn('Logs', '', function () { R.row = app.id; doVerb(app, 'logs'); }, { disabled: !!R.busy }));
      }
      if (app) {
        acts.appendChild(btn('Ask Rouh to fix it', '', function () {
          say('My app ' + app.name + ' (' + (app.url || app.slug) + ') ' + (n.kind === 'down' ? 'is not answering' : 'had a failed ' + n.said.split(' of ')[0].toLowerCase()) +
              '. Find out why and fix it.');
        }));
        acts.appendChild(btn('Open', '', function () { R.row = app.id; R.keep = 'row-' + app.id; draw(); scrollTo('aps-app-' + app.id); }));
      }
      li.appendChild(acts);
      list.appendChild(li);
    });
    sec.appendChild(list);
    return sec;
  }

  function scrollTo(id) {
    var n = $(id);
    if (n && n.scrollIntoView) { n.scrollIntoView({ block: 'nearest' }); }
  }

  /* ---- the apps ---- */

  function appsSection(d) {
    var sec = el('section', 'aps-sec');
    sec.setAttribute('aria-labelledby', 'apAppsH');
    var head = el('div', 'aps-sec-head');
    var h = el('h4', 'aps-h', 'Your apps');
    h.id = 'apAppsH';
    head.appendChild(h);
    head.appendChild(el('span', 'aps-n', String(d.apps.length)));
    sec.appendChild(head);
    if (d.apps.length) {
      var list = el('ul', 'aps-list');
      d.apps.forEach(function (a) { list.appendChild(appRow(a, d)); });
      sec.appendChild(list);
    } else {
      sec.appendChild(el('p', 'aps-none', 'No apps yet. Press Build a new app and say what it should do.'));
    }
    if (R.sheet === 'add') { sec.appendChild(addForm(d)); }
    else {
      var more = el('div', 'aps-actions');
      more.appendChild(btn('Add an app you already have', '', function () { R.sheet = 'add'; R.keep = 'add-name'; draw(); }, { keep: 'add-open' }));
      sec.appendChild(more);
    }
    return sec;
  }

  function where(a) {
    if (a.server) { return a.server; }
    return a.elsewhere ? a.elsewhere : 'Elsewhere';
  }

  function appRow(a, d) {
    var li = el('li', 'aps-app' + (R.row === a.id ? ' open' : '') + (a.state === 'down' ? ' is-down' : ''));
    li.id = 'aps-app-' + a.id;
    var top = el('div', 'aps-app-top');
    var toggle = el('button', 'aps-app-btn');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', R.row === a.id ? 'true' : 'false');
    toggle.setAttribute('aria-controls', 'aps-app-more-' + a.id);
    toggle.setAttribute('data-keep', 'row-' + a.id);
    toggle.addEventListener('click', function () { R.row = R.row === a.id ? 0 : a.id; R.keep = 'row-' + a.id; draw(); });
    toggle.appendChild(mark(STATE[a.state] || STATE.unknown));
    var name = el('span', 'aps-app-name', a.name);
    toggle.appendChild(name);
    toggle.appendChild(svg('<path d="M9 6l6 6-6 6"/>', 'aps-chev'));
    top.appendChild(toggle);
    if (a.url) {
      var open = el('a', 'aps-open', bare(a.url));
      open.href = a.url;
      open.target = '_blank';
      open.rel = 'noopener';
      open.title = 'Open ' + a.name + ' in a new tab';
      top.appendChild(open);
    }
    li.appendChild(top);
    var facts = el('dl', 'aps-facts');
    function fact(k, v, cls) {
      var f = el('div', 'aps-fact' + (cls ? ' ' + cls : ''));
      f.appendChild(el('dt', '', k));
      f.appendChild(el('dd', '', v));
      facts.appendChild(f);
    }
    fact('Runs on', where(a));
    fact('Updated', a.managed ? ago(a.released_at) : 'Not by Rouh');
    fact('Checked', a.checked_at ? ago(a.checked_at) : 'not yet');
    fact('Backed up', a.managed
      ? (a.backup_ok === false ? 'Failed ' + ago(a.backup_at) : ago(a.backup_at)) +
        (a.restore_test_at ? ', restore ' + (a.restore_test_ok === false ? 'failed ' : 'tested ') + ago(a.restore_test_at) : ', restore not tested yet')
      : 'Not by Rouh', a.backup_ok === false || a.restore_test_ok === false ? 'bad' : '');
    var pending = a.commands.filter(function (c) { return c.state === 'waiting' || c.state === 'sent' || c.state === 'running'; })[0];
    if (pending) { fact('Now', pending.said + (pending.state === 'running' ? ' running' : ' sent ' + ago(pending.asked_at)), 'wait'); }
    li.appendChild(facts);
    if (R.row === a.id) { li.appendChild(appMore(a, d)); }
    return li;
  }

  function doVerb(a, verb) {
    return post('/api/apps/' + a.id + '/do', { verb: verb }, verb + ':' + a.id);
  }

  function appMore(a, d) {
    var more = el('div', 'aps-more');
    more.id = 'aps-app-more-' + a.id;
    if (a.what) { more.appendChild(el('p', 'aps-what', a.what)); }
    var acts = el('div', 'aps-actions');
    if (a.url) {
      var o = el('a', 'ctl small', 'Open');
      o.href = a.url; o.target = '_blank'; o.rel = 'noopener';
      acts.appendChild(o);
    }
    var busy = !!R.busy || a.commands.some(function (c) { return c.state === 'waiting' || c.state === 'sent' || c.state === 'running'; });
    if (a.managed) {
      acts.appendChild(btn('Update', '', function () { doVerb(a, 'update'); },
                           { disabled: busy, title: 'The newest code to a test copy first, then live if it answers' }));
      acts.appendChild(btn('Restart', '', function () { doVerb(a, 'restart'); }, { disabled: busy }));
      acts.appendChild(btn('Roll back', '', function () { doVerb(a, 'rollback'); },
                           { disabled: busy || !a.previous_release, title: a.previous_release ? 'Back to ' + a.previous_release : 'There is no release before this one' }));
      acts.appendChild(btn('Logs', '', function () { doVerb(a, 'logs'); }, { disabled: busy }));
      acts.appendChild(btn('Back up now', '', function () { doVerb(a, 'backup'); }, { disabled: busy }));
    }
    acts.appendChild(btn('Ask Rouh to change it', '', function () {
      say('In my app ' + a.name + ' (' + (a.url || a.slug) + '), ');
    }));
    acts.appendChild(btn(R.busy === 'check:' + a.id ? 'Checking...' : 'Check now', '', function () {
      post('/api/apps/check', { app: a.id }, 'check:' + a.id);
    }, { disabled: !!R.busy }));
    more.appendChild(acts);
    if (!a.managed) {
      more.appendChild(el('p', 'aps-note', a.server_id
        ? 'Its server has not called in, so Rouh can only check its address for now.'
        : 'It runs ' + (a.elsewhere ? 'on ' + a.elsewhere : 'elsewhere') + ', so Rouh checks its address but cannot restart, update or back it up. Ask Rouh to move it onto your apps server to get all of that.'));
    }
    var dl = el('dl', 'aps-detail');
    function row(k, v) {
      if (!v && v !== 0) { return; }
      var r = el('div');
      r.appendChild(el('dt', '', k));
      var dd = el('dd', '', v);
      r.appendChild(dd);
      dl.appendChild(r);
    }
    row('Last check', a.checked_at ? ago(a.checked_at) + ': ' + (a.check_said || '') : 'Not yet');
    row('Address', a.url || 'None');
    if (a.managed) {
      row('Release', a.release ? a.release + ', ' + ago(a.released_at) : 'Not deployed yet');
      row('Test copy', a.test_url);
      row('Test restore', a.restore_test_at ? (a.restore_test_ok === false ? 'Failed ' : 'Worked ') + ago(a.restore_test_at) : 'Not yet');
      row('Memory', a.memory_mb ? a.memory_mb + ' MB of ' + (a.memory_limit || '512M') : '');
    }
    row('Last deploy failed', a.last_error);
    more.appendChild(dl);
    if (a.repo || a.deploy_key) {
      var tog = el('details', 'brown-toggle');
      tog.appendChild(el('summary', '', 'Its code'));
      var tb = el('div', 'brown-toggle-body');
      var dl2 = el('dl', 'aps-detail');
      [['Code', a.repo], ['Deploy key', a.deploy_key]].forEach(function (kv) {
        if (!kv[1]) { return; }
        var r = el('div');
        r.appendChild(el('dt', '', kv[0]));
        r.appendChild(el('dd', '', kv[1]));
        dl2.appendChild(r);
      });
      tb.appendChild(dl2);
      tog.appendChild(tb);
      more.appendChild(tog);
    }
    if (a.commands.length) {
      var h = el('h5', 'aps-h5', 'What Rouh did');
      more.appendChild(h);
      var cl = el('ul', 'aps-cmds');
      a.commands.forEach(function (c) {
        var li = el('li', 'aps-cmd ' + c.state);
        var top = el('div', 'aps-cmd-top');
        top.appendChild(el('span', 'aps-cmd-what', c.said));
        top.appendChild(el('span', 'aps-cmd-state', c.state === 'done' ? 'Done' : c.state === 'failed' ? 'Failed' : c.state === 'running' ? 'Running' : 'Sent, waiting for the server'));
        top.appendChild(el('span', 'aps-sub', ago(c.done_at || c.asked_at)));
        li.appendChild(top);
        if (c.output) {
          var pre = el('pre', 'aps-out', c.output);
          pre.tabIndex = 0;
          pre.setAttribute('aria-label', c.said + ' output');
          li.appendChild(pre);
        }
        cl.appendChild(li);
      });
      more.appendChild(cl);
    }
    var foot = el('div', 'aps-actions aps-foot');
    foot.appendChild(btn('Take it off the list', 'aps-quiet', function () {
      if (window.confirm('Take ' + a.name + ' off the list? Nothing on its server is stopped or deleted.')) {
        post('/api/apps/' + a.id + '/remove', {}, 'remove:' + a.id).then(function (j) { if (j) { R.row = 0; draw(); } });
      }
    }));
    more.appendChild(foot);
    return more;
  }

  function field(label, input, hint) {
    var f = el('label', 'aps-field');
    f.appendChild(el('span', 'aps-label', label));
    f.appendChild(input);
    if (hint) { f.appendChild(el('span', 'aps-hint', hint)); }
    return f;
  }
  function textInput(key, placeholder, type) {
    var i = el('input', 'aps-input');
    i.type = type || 'text';
    i.placeholder = placeholder || '';
    i.setAttribute('data-keep', key);
    i.autocomplete = 'off';
    return i;
  }

  function addForm(d) {
    var f = el('form', 'aps-form');
    f.setAttribute('aria-label', 'Add an app you already have');
    f.appendChild(el('h5', 'aps-h5', 'Add an app you already have'));
    var name = textInput('add-name', 'Notes');
    var url = textInput('add-url', 'https://notes.example.com', 'url');
    var sel = el('select', 'aps-input');
    sel.setAttribute('data-keep', 'add-server');
    var o0 = el('option', '', 'Elsewhere');
    o0.value = '';
    sel.appendChild(o0);
    d.servers.forEach(function (s) { var o = el('option', '', s.name); o.value = String(s.id); sel.appendChild(o); });
    var elsewhere = textInput('add-elsewhere', 'my old server');
    f.appendChild(field('Name', name));
    f.appendChild(field('Address', url, 'Rouh checks it every five minutes.'));
    f.appendChild(field('Runs on', sel));
    var where = field('Where, in your words', elsewhere);
    f.appendChild(where);
    sel.addEventListener('change', function () { where.hidden = !!sel.value; });
    var acts = el('div', 'aps-actions');
    var go = el('button', 'ctl small aps-strong', R.busy === 'add' ? 'Adding...' : 'Add');
    go.type = 'submit';
    go.disabled = !!R.busy;
    acts.appendChild(go);
    acts.appendChild(btn('Cancel', '', function () { R.sheet = ''; draw(); }));
    f.appendChild(acts);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      post('/api/apps/add', { name: name.value, url: url.value, server_id: sel.value,
                              elsewhere: sel.value ? '' : elsewhere.value }, 'add').then(function (j) { if (j) { R.sheet = ''; draw(); } });
    });
    return f;
  }

  /* ---- the servers ---- */

  function serversSection(d) {
    var sec = el('section', 'aps-sec');
    sec.setAttribute('aria-labelledby', 'apServersH');
    var head = el('div', 'aps-sec-head');
    var h = el('h4', 'aps-h', 'Your apps servers');
    h.id = 'apServersH';
    head.appendChild(h);
    head.appendChild(el('span', 'aps-n', String(d.servers.length)));
    sec.appendChild(head);
    if (!d.servers.some(function (s) { return s.standard; })) {
      sec.appendChild(el('p', 'aps-none', 'No apps server yet. One small server of your own holds a dozen apps, kept apart from Rouh and from each other.'));
    }
    var grid = el('ul', 'aps-servers');
    d.servers.forEach(function (s) { grid.appendChild(serverCard(s, d)); });
    if (d.servers.length) { sec.appendChild(grid); }
    if (R.sheet !== 'setup') {
      var acts = el('div', 'aps-actions');
      acts.appendChild(btn('Set up an apps server', d.servers.some(function (s) { return s.standard; }) ? '' : 'aps-strong',
                           function () { openSetup(); }, { keep: 'setup-open' }));
      sec.appendChild(acts);
    }
    return sec;
  }

  function serverCard(s, d) {
    var li = el('li', 'aps-server');
    var top = el('div', 'aps-server-top');
    top.appendChild(el('span', 'aps-server-name', s.name));
    top.appendChild(mark(SERVER_STATE[s.state] || SERVER_STATE.elsewhere, true));
    li.appendChild(top);
    var on = d.apps.filter(function (a) { return a.server_id === s.id; }).length;
    var lines = [s.host_name + (s.address ? ', ' + s.address : '')];
    if (s.state === 'ready' || s.state === 'silent') {
      lines.push('Last called in ' + ago(s.seen_at));
      if (s.memory_mb) {
        lines.push(Math.round((s.memory_free_mb || 0) / 1024 * 10) / 10 + ' of ' + Math.round(s.memory_mb / 1024 * 10) / 10 + ' GB memory free, ' +
                   (s.disk_free_gb || 0) + ' of ' + s.disk_gb + ' GB disk free');
      }
      lines.push(plural(on, 'app', 'apps'));
    } else if (s.state === 'elsewhere') {
      lines.push(plural(on, 'app', 'apps') + ', checked by address only');
      if (s.note) { lines.push(s.note); }
    }
    lines.forEach(function (t) { li.appendChild(el('p', 'aps-server-line', t)); });
    if (s.state === 'waiting') {
      if (R.sheet === 'setup' && R.setup && R.setup.server && R.setup.server.id === s.id) {
        li.appendChild(el('p', 'aps-wait', 'Its setup line is in Set up an apps server, above.'));
      } else { li.appendChild(waitingBox(s)); }
    }
    var acts = el('div', 'aps-actions');
    if (s.state === 'ready' || s.state === 'silent') {
      acts.appendChild(btn('Ask for a report', '', function () { post('/api/apps/servers/' + s.id + '/check', {}, 'srv:' + s.id); }, { disabled: !!R.busy }));
    }
    acts.appendChild(btn(s.state === 'waiting' ? 'Cancel' : 'Take it off the list', 'aps-quiet', function () {
      var q = s.state === 'waiting' ? 'Cancel ' + s.name + '? Its setup line stops working.'
        : 'Take ' + s.name + ' off the list? It can no longer call in. The server itself keeps running; nothing on it is deleted.';
      if (window.confirm(q)) { post('/api/apps/servers/' + s.id + '/remove', {}, 'rm:' + s.id); }
    }));
    li.appendChild(acts);
    return li;
  }

  var SETUPS = {};
  function waitingBox(s) {
    var box = el('div', 'aps-waiting');
    var got = SETUPS[s.id];
    if (!got) {
      box.appendChild(el('p', 'aps-sub', 'Reading its setup line...'));
      fetch('/api/apps/servers/' + s.id + '/setup', { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) { SETUPS[s.id] = j; draw(); } });
      return box;
    }
    box.appendChild(lineBlock(got));
    return box;
  }

  function lineBlock(got, bootSaid) {
    var wrap = el('div', 'aps-line-wrap');
    if (!got.reachable) {
      wrap.appendChild(el('p', 'aps-said bad', 'This Rouh has no address on the internet yet (' + (got.base || 'none') + '), so a server cannot reach it. ' +
        'Connect Rouh to rouh.land or give it a domain first.'));
    }
    wrap.appendChild(el('span', 'aps-label', 'The line to paste on the server'));
    var row = el('div', 'aps-line');
    var code = el('code', 'aps-code', got.line);
    code.tabIndex = 0;
    row.appendChild(code);
    row.appendChild(btn('Copy', 'aps-strong', function (b) { copy(got.line, b); }, { keep: 'copy-line' }));
    wrap.appendChild(row);
    var fold = el('details', 'aps-fold');
    fold.appendChild(el('summary', '', 'The same as a first-boot script'));
    if (bootSaid) { fold.appendChild(el('p', 'aps-sub', bootSaid)); }
    var row2 = el('div', 'aps-line');
    var pre = el('pre', 'aps-code', got.boot);
    pre.tabIndex = 0;
    row2.appendChild(pre);
    row2.appendChild(btn('Copy', '', function (b) { copy(got.boot, b); }));
    fold.appendChild(row2);
    wrap.appendChild(fold);
    var wait = el('p', 'aps-wait');
    wait.appendChild(svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="40 14"/>', 'aps-spin'));
    wait.appendChild(el('span', '', 'Waiting for the server to call in. This page turns to Ready by itself; the setup takes about five minutes.'));
    wrap.appendChild(wait);
    return wrap;
  }

  function openSetup() {
    R.sheet = 'setup';
    R.setup = null;
    R.keep = 'host-' + R.host;
    draw();
    scrollTo('apSetup');
  }

  function setupSheet(d) {
    var sec = el('section', 'aps-sec aps-setup');
    sec.id = 'apSetup';
    sec.setAttribute('aria-labelledby', 'apSetupH');
    var head = el('div', 'aps-sec-head');
    var h = el('h4', 'aps-h', 'Set up an apps server');
    h.id = 'apSetupH';
    head.appendChild(h);
    head.appendChild(btn('Close', 'aps-quiet aps-push', function () { R.sheet = ''; R.setup = null; draw(); }));
    sec.appendChild(head);
    sec.appendChild(el('p', 'aps-lead', 'Buy a small server at a host, then paste one line on it. Rouh installs everything: a separate user, database and ' +
      'memory limit for each app, HTTPS addresses, nightly backups that are test-restored, and a way back for every update.'));
    var pick = el('fieldset', 'aps-hosts');
    pick.appendChild(el('legend', 'aps-label', 'Where will you rent it?'));
    d.hosts.forEach(function (hst) {
      var lab = el('label', 'aps-host' + (R.host === hst.id ? ' on' : ''));
      var r = el('input');
      r.type = 'radio';
      r.name = 'aps-host';
      r.value = hst.id;
      r.checked = R.host === hst.id;
      r.setAttribute('data-keep', 'host-' + hst.id);
      r.addEventListener('change', function () { R.host = hst.id; R.setup = null; R.keep = 'host-' + hst.id; draw(); });
      lab.appendChild(r);
      var w = el('span', 'aps-host-w');
      var nm = el('span', 'aps-host-name', hst.name);
      if (hst.recommended) { nm.appendChild(el('span', 'aps-tag', 'Easiest')); }
      w.appendChild(nm);
      w.appendChild(el('span', 'aps-sub', hst.why));
      lab.appendChild(w);
      pick.appendChild(lab);
    });
    sec.appendChild(pick);
    var hst = d.hosts.filter(function (x) { return x.id === R.host; })[0] || d.hosts[0];
    var steps = el('ol', 'aps-steps');
    hst.steps.forEach(function (t) { steps.appendChild(el('li', '', t)); });
    sec.appendChild(steps);
    var plan = el('p', 'aps-sub', hst.plan + ' ');
    if (hst.buy) {
      var a = el('a', '', 'Open ' + hst.name);
      a.href = hst.buy; a.target = '_blank'; a.rel = 'noopener';
      plan.appendChild(a);
    }
    sec.appendChild(plan);
    if (R.setup) {
      sec.appendChild(lineBlock(R.setup, hst.boot));
    } else {
      var acts = el('div', 'aps-actions');
      acts.appendChild(btn(R.busy === 'new' ? 'Making it...' : 'Make my setup line', 'aps-strong', function () {
        post('/api/apps/servers/new', { host: hst.id }, 'new').then(function (j) {
          if (j && j.got) { R.setup = j.got; SETUPS[j.got.server.id] = j.got; R.keep = 'copy-line'; draw(); }
        });
      }, { disabled: !!R.busy, keep: 'make-line' }));
      sec.appendChild(acts);
      sec.appendChild(el('p', 'aps-sub', 'The line works once, for one server, for seven days. Rouh never buys a server for you.'));
    }
    if (hst.id === 'hostinger') { sec.appendChild(hostingerBox(d, hst)); }
    return sec;
  }

  /* With a Hostinger API token, Rouh sets up a VPS the person already bought, with one press. */
  function hostingerBox(d, hst) {
    var fold = el('details', 'aps-fold aps-token');
    if (d.tokens.hostinger || R.hs.vps) { fold.open = true; }
    fold.appendChild(el('summary', '', 'Or let Rouh do it with a Hostinger API token'));
    var inner = el('div', 'aps-token-in');
    if (!d.tokens.hostinger) {
      var p = el('p', 'aps-sub', 'Make a token in hPanel, Profile, API, and paste it here. Rouh keeps it sealed and never shows it again. ');
      var a = el('a', '', 'Open hPanel API');
      a.href = hst.token_url; a.target = '_blank'; a.rel = 'noopener';
      p.appendChild(a);
      inner.appendChild(p);
      var f = el('form', 'aps-line');
      var i = textInput('hs-token', 'Hostinger API token', 'password');
      i.setAttribute('aria-label', 'Hostinger API token');
      f.appendChild(i);
      var go = el('button', 'ctl small aps-strong', R.busy === 'token' ? 'Checking...' : 'Save');
      go.type = 'submit';
      go.disabled = !!R.busy;
      f.appendChild(go);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = i.value;
        i.value = '';
        post('/api/apps/hostinger/token', { token: t }, 'token').then(function (j) { if (j) { listVps(); } });
      });
      inner.appendChild(f);
    } else {
      var top = el('div', 'aps-actions');
      top.appendChild(el('span', 'aps-sub', 'Token ending ' + d.tokens.hostinger.last4 + ', saved ' + ago(d.tokens.hostinger.saved_at) + '.'));
      top.appendChild(btn(R.hs.loading ? 'Reading...' : 'Show my VPSs', '', function () { listVps(); }, { disabled: R.hs.loading }));
      top.appendChild(btn('Forget the token', 'aps-quiet', function () { R.hs.vps = null; post('/api/apps/hostinger/forget', {}, 'forget'); }));
      inner.appendChild(top);
      if (R.hs.error) { inner.appendChild(el('p', 'aps-said bad', R.hs.error)); }
      if (R.hs.vps) { inner.appendChild(vpsList(R.hs.vps)); }
    }
    fold.appendChild(inner);
    return fold;
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

  function vpsList(vps) {
    var wrap = el('div', 'aps-vps');
    if (!vps.length) {
      wrap.appendChild(el('p', 'aps-sub', 'No VPS in this Hostinger account yet. Buy one, then press Show my VPSs again.'));
      return wrap;
    }
    var ul = el('ul', 'aps-vps-list');
    vps.forEach(function (v) {
      var li = el('li', 'aps-vps-row');
      var w = el('div', 'aps-vps-w');
      w.appendChild(el('span', 'aps-app-name', v.hostname || ('VPS ' + v.id)));
      w.appendChild(el('span', 'aps-sub', [v.plan, v.ip, v.fresh ? 'not installed yet' : (v.template || 'installed')].filter(Boolean).join(', ')));
      li.appendChild(w);
      if (v.ours) {
        li.appendChild(el('span', 'aps-sub', 'Already your apps server'));
      } else if (v.fresh) {
        li.appendChild(btn(R.busy === 'hs:' + v.id ? 'Setting up...' : 'Set it up', 'aps-strong', function () {
          post('/api/apps/hostinger/setup', { vm: v.id }, 'hs:' + v.id).then(function (j) { if (j) { R.hs.vps = null; R.sheet = ''; draw(); } });
        }, { disabled: !!R.busy }));
      } else if (R.hs.wipe === v.id) {
        var f = el('form', 'aps-wipe');
        f.appendChild(el('p', 'aps-said bad', 'Everything on ' + v.hostname + ' will be erased. Type its name to go on.'));
        var i = textInput('wipe-' + v.id, v.hostname);
        i.setAttribute('aria-label', 'Type ' + v.hostname + ' to erase it and set it up');
        f.appendChild(i);
        var go = el('button', 'ctl small aps-danger', 'Erase and set up');
        go.type = 'submit';
        f.appendChild(go);
        f.appendChild(btn('Cancel', '', function () { R.hs.wipe = 0; draw(); }));
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          post('/api/apps/hostinger/setup', { vm: v.id, wipe: true, confirm: i.value }, 'hs:' + v.id)
            .then(function (j) { if (j) { R.hs.vps = null; R.hs.wipe = 0; R.sheet = ''; draw(); } });
        });
        li.appendChild(f);
      } else {
        li.appendChild(btn('Erase and set up...', '', function () { R.hs.wipe = v.id; R.keep = 'wipe-' + v.id; draw(); }));
      }
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return wrap;
  }

  /* ---- the layer ---- */

  function shown() {
    R.open = true;
    if (!R.data && !R.loading) { load(false); } else { draw(); load(true); }
  }
  function hidden() { R.open = false; clearTimeout(R.timer); }

  window.RouhApps = { shown: shown, hidden: hidden, reload: function () { return load(true); } };

  var x = $('appsClose');
  if (x) { x.addEventListener('click', function () { if (host().close) { host().close(); } }); }
  var b = $('appsBuild');
  if (b) { b.addEventListener('click', function () { say('Build me an app that '); }); }
}());
