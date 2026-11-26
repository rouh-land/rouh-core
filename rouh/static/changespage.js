/* Meta, Changes, at /anatomy/meta/changes (`rouh/codechanges.py`, `rouh/web/changes.py`).

   Task 98, step 98-23: in a container a Rouh has a protected core beside it, which checks every
   change of the Rouh's own code before it goes live, keeps an undo point for each, and puts the
   code back by itself (the doctor) when Rouh stops answering right after a change. This page is
   where the person sees it: the code that runs, every undo point with Put back, what is waiting
   for a newer core, and what the doctor last did. Nothing here changes the person's data.

   Drawn into `#changesBody` from `/api/settings/changes`; Settings tells it when it shows and
   when it is left (`settingsPages` in app/runs.js).

   Its first card is Rouh's updates (task 140, step 140-18, `rouh/code_update.py`, from
   `/api/settings/updates`): how this Rouh takes new releases of Rouh (Ride along, Update when I
   press, My own path), the version it has and the newest, what is new, the button that updates it
   now, and how the last update went.

   Above it, only when it is so, "Your Rouh is stuck" (task 98, gap G20, 25 November 2026,
   `code_update.stuck_public`): the change the update stopped at, why, how many wait behind it and
   whether security fixes are among them, with Unstuck, the owner's press that has the protected core
   bring this Rouh to the newest release as one undo point (guard/rouh_guard/unstuck.py). */
(function () {
  'use strict';

  var C = { open: false, data: null, busy: false, error: '', said: '', confirm: 0, timer: 0 };
  /* Rouh's updates: their own answer, apart from the protected core's, so either can be slow. */
  var U = { data: null, busy: false, error: '', said: '', loaded: false, ask: false };
  /* Unstuck's own press: working, and what it said. */
  var S = { busy: false, error: '', said: '', name: '' };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function button(text, cls, act) {
    var b = el('button', 'ctl small' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', act);
    return b;
  }
  function csrfToken() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }
  function when(at) {
    if (!at) return '';
    var d = new Date(at * 1000);
    return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function short(c) { return String(c || '').slice(0, 12); }
  /* While Rouh takes released changes, each one starts it again (an undo point a change), so the page
     cannot reach it for a minute or so each time. That is the update going on, not a fault. */
  var RESTARTING = 'Rouh is starting again on a change it just took. This page comes back by itself in a minute or two.';
  function updating() {
    var d = U.data;
    return !!(d && (d.busy || d.pending || (d.run && d.run.going))) || !!(C.data && C.data.busy);
  }
  function unreachable() { return updating() ? RESTARTING : 'Rouh could not be reached.'; }

  function call(method, url, body) {
    if (method === 'POST') { C.busy = true; draw(); }
    return fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                        body: method === 'POST' ? JSON.stringify(body || {}) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (method === 'POST') C.busy = false;
          if (j && (j.guard !== undefined)) C.data = j;
          if (!r.ok) C.error = (j && j.error) || 'That did not work. Try again.';
          else if (method === 'POST') { C.error = ''; C.said = (j && j.said) || ''; }
          else C.error = '';
          draw();
          return j;
        });
      })
      .catch(function () { C.busy = false; C.error = unreachable(); draw(); });
  }
  function load() { loadUpdates(false); return call('GET', '/api/settings/changes'); }

  function updatesCall(method, url, body) {
    if (method === 'POST') { U.busy = true; draw(); }
    return fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                        body: method === 'POST' ? JSON.stringify(body || {}) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          U.busy = false;
          U.loaded = true;
          if (j && j.mode) U.data = j;
          if (!r.ok) U.error = (j && j.error) || 'That did not work. Try again.';
          else if (method === 'POST') { U.error = ''; U.said = (j && j.said) || ''; }
          else U.error = '';
          draw();
          return j;
        });
      })
      .catch(function () { U.busy = false; U.loaded = true; U.error = unreachable(); draw(); });
  }
  function loadUpdates(look) {
    if (look) { U.said = ''; U.error = ''; }
    return updatesCall('GET', '/api/settings/updates' + (look ? '?look=1' : '')).then(function (j) {
      if (look && j && j.mode && !U.error) {
        U.said = j.check_error ? '' : j.release_from === 'github'
          ? 'rouh.land did not answer, so the release was read from GitHub just now, its signature checked.'
          : 'Asked rouh.land just now.';
        draw();
      }
      return j;
    });
  }

  function card(title, sub) {
    var s = el('section', 'setting-card hb-card');
    var h = el('h4', 'hb-h', title);
    if (sub) h.appendChild(el('span', 'hb-h-sub', sub));
    s.appendChild(h);
    return s;
  }

  function drawState(page, d) {
    var notes = [];
    if (d.busy) notes.push(['ch-busy', 'The protected core is ' + d.busy + '…']);
    if (d.code && d.code.clean === false) {
      notes.push(['ch-warn', 'There is work in the code that is not committed. It does not run; ' +
        'at the next start it is kept on a branch of its own.']);
    }
    notes.forEach(function (n) { page.appendChild(el('p', n[0], n[1])); });
  }

  function drawDoctor(page, d) {
    var n = d.notice;
    var cur = (d.code && d.code.point) || null;
    if (!n || !cur || cur.n !== n.point) return;
    var s = card('The doctor put the code back');
    s.classList.add('ch-doctor');
    s.appendChild(el('p', '', n.said || ''));
    if (n.from && d.admin) {
      var acts = el('div', 'hb-actions');
      acts.appendChild(button('Put the change back', '', function () { undo(n.from); }));
      s.appendChild(acts);
    }
    page.appendChild(s);
  }

  function drawWaiting(page, d) {
    if (!d.pending || !d.pending.length) return;
    var s = card('Waiting for a Rouh update');
    var ul = el('ul', 'hb-list ch-list');
    d.pending.forEach(function (p) {
      var li = el('li', 'hb-beat ch-row');
      li.appendChild(el('div', 'ch-why', p.why || short(p.commit)));
      var needs = Object.keys(p.needs || {}).map(function (g) { return g + ' needs ' + p.needs[g]; });
      li.appendChild(el('div', 'ch-sub', needs.join(' · ') + ' · this core is ' + (d.version || '?')));
      ul.appendChild(li);
    });
    s.appendChild(ul);
    page.appendChild(s);
  }

  var MODE_LINES = {
    ride: 'Takes each new release by itself, at a quiet moment, at most once a day.',
    press: 'Nothing comes in until you press Update to the newest Rouh.',
    own: 'Never looks for releases by itself. You can still press the button.'
  };

  function updatesHeadline(d) {
    if (d.makes_releases) return 'This Rouh makes Rouh’s releases.';
    if (d.run && d.run.going) return 'Updating Rouh, in a run you can follow…';
    if (d.busy) return 'Updating Rouh…';
    if (d.pending) return 'Checking the update before it goes live…';
    if (d.ledger && d.ledger.waiting) return d.ledger.waiting + ' change' + (d.ledger.waiting === 1 ? ' is' : 's are') + ' waiting.';
    if (!d.newest) return d.on_its_own ? 'This Rouh is on its own, so it does not look for releases by itself.'
      : 'The newest release of Rouh is not known yet.';
    if (d.up_to_date) return 'This Rouh is up to date.';
    return 'A newer Rouh is ready.';
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Your Rouh is stuck, and Unstuck. Drawn first, so the reason the updates are not moving is the
     first thing read; after an Unstuck it says how that went, with what was left out. */
  function drawStuck(page) {
    var d = U.data;
    var st = d && d.stuck;
    if (!st) return;
    var w = st.where, last = st.unstuck;
    if (S.name && last && last.name === S.name) { S.said = ''; S.name = ''; }
    var going = !!(last && last.going) || !!(S.name && w);
    var done = !going && last && last.finished_at && !w;
    var failed = !going && last && last.finished_at && !last.ok && w;
    var s = card(going ? 'Unsticking your Rouh' : done ? (last.ok ? 'Your Rouh is unstuck' : 'Unstuck did not finish')
      : 'Your Rouh is stuck');
    s.classList.add('st-card');
    if (!going && !done) s.classList.add('st-stuck');
    s.setAttribute('aria-busy', going ? 'true' : 'false');
    if (going) {
      var g = el('p', 'st-lead', 'Working: ' + ((last && last.going && last.step) || 'copying the database first') + '…');
      g.setAttribute('role', 'status');
      s.appendChild(g);
      s.appendChild(el('p', 'ch-sub', 'Rouh starts again on it once the protected core has checked it. This page comes back by itself.'));
      page.appendChild(s);
      return;
    }
    if (done) {
      var lead = el('p', 'st-lead', last.ok ? 'It has the newest release, and updates come in again.' : (last.said || ''));
      lead.setAttribute('role', 'status');
      s.appendChild(lead);
      if (last.ok) drawOutcome(s, last);
      page.appendChild(s);
      return;
    }
    var sec = w.security || 0;
    var head = 'Updates stopped at one change that does not fit this Rouh, and ' +
      plural(w.behind, 'later change waits', 'later changes wait') + ' behind it' +
      (sec ? ', ' + plural(sec, 'security fix', 'security fixes') + ' among them.' : '.');
    var lp = el('p', 'st-lead', head);
    lp.setAttribute('role', 'status');
    s.appendChild(lp);
    var dl = el('dl', 'hb-ask-dl ch-dl st-dl');
    [['Stuck at', w.purpose || short(w.master)],
     ['Why', w.reason || 'It could not be taken.'],
     ['Waiting', plural(w.behind, 'change', 'changes') + ' after it' + (w.since ? ', since ' + when(w.since) : '')]
    ].forEach(function (row) { dl.appendChild(el('dt', '', row[0])); dl.appendChild(el('dd', '', row[1])); });
    s.appendChild(dl);
    if (sec) {
      var sp = el('p', 'st-sec');
      sp.appendChild(el('span', 'st-tag', 'Security'));
      sp.appendChild(document.createTextNode(' ' + (w.security_itself ? 'The change it stopped at is a security fix. ' : '') +
        plural(sec, 'security fix is', 'security fixes are') + ' not in this Rouh yet. Updates come in strictly in order, so none comes in around a stuck one.'));
      s.appendChild(sp);
    }
    if (failed) s.appendChild(el('p', 'hb-say bad', 'The last Unstuck, ' + when(last.finished_at) + ', did not finish: ' + (last.said || '')));
    s.appendChild(el('p', 'ch-sub', 'Unstuck brings in the newest release at once, keeps your own changes where they fit, and names anything ' +
      'left out (it stays in the history). A copy of the database is taken first, and Put back undoes it.'));
    var say = S.busy ? 'Starting Unstuck…' : (S.error || S.said);
    if (say) s.appendChild(el('p', 'hb-say' + (S.error && S.error !== RESTARTING ? ' bad' : ''), say));
    var acts = el('div', 'hb-actions cu-actions');
    if (!st.admin) {
      s.appendChild(el('p', 'cu-why', 'Only an administrator of this Rouh can press Unstuck.'));
    } else if (U.ask === true) {
      acts.appendChild(el('span', 'ch-ask', 'Bring this Rouh to the newest release now? It takes a few minutes, and Rouh starts again on it.'));
      acts.appendChild(button('Unstuck now', 'primary', unstickNow));
      acts.appendChild(button('Cancel', '', function () { U.ask = false; draw(); }));
    } else {
      var b = button('Unstuck', 'primary', function () { U.ask = true; S.error = ''; S.said = ''; draw(); });
      b.disabled = !!st.why_not || S.busy;
      if (st.why_not) b.setAttribute('aria-describedby', 'stWhyNot');
      acts.appendChild(b);
    }
    s.appendChild(acts);
    if (st.why_not && st.admin) {
      var wn = el('p', 'cu-why', st.why_not);
      wn.id = 'stWhyNot';
      s.appendChild(wn);
    }
    if (st.by_hand && st.admin) {
      var hand = el('div', 'st-hand');
      [['On a Mac, in Terminal', st.by_hand.mac], ['On Linux, on the machine', st.by_hand.linux]].forEach(function (row) {
        hand.appendChild(el('p', 'cu-sub-h', row[0]));
        hand.appendChild(el('code', 'st-code', row[1]));
      });
      s.appendChild(hand);
    }
    page.appendChild(s);
  }

  function drawOutcome(s, last) {
    var dl = el('dl', 'hb-ask-dl ch-dl st-dl');
    var rows = [];
    if (last.point) rows.push(['Undo point', String(last.point) + (last.before ? ' (Put back on ' + last.before + ' undoes it)' : '')]);
    if (last.own) rows.push(['Yours kept', plural(last.own, 'change of its own', 'changes of its own')]);
    var left = (last.dropped || []).concat(last.kept || []);
    rows.push(['Left out', (last.dropped || []).length ? (last.dropped || []).join(', ') + ' (still in its history)' : 'Nothing']);
    if ((last.kept || []).length) rows.push(['Kept as yours', last.kept.join(', ')]);
    rows.forEach(function (row) { dl.appendChild(el('dt', '', row[0])); dl.appendChild(el('dd', '', row[1])); });
    s.appendChild(dl);
    if (!left.length && last.said) s.appendChild(el('p', 'ch-sub', last.said));
  }

  /* The press, apart from the updates card's own calls, so its answer is said on this card alone. */
  function unstickNow() {
    U.ask = false;
    S.busy = true; S.error = ''; S.said = '';
    draw();
    fetch('/api/settings/updates/unstuck', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() }, body: '{}' })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          S.busy = false;
          if (j && j.mode) U.data = j;
          if (!r.ok) S.error = (j && j.error) || 'That did not work. Try again.';
          else { S.said = (j && j.said) || ''; S.name = (j && j.name) || ''; }
          draw();
          window.setTimeout(function () { loadUpdates(false); }, 4000);
        });
      })
      .catch(function () { S.busy = false; S.error = unreachable(); draw(); });
  }

  function drawUpdates(page) {
    var d = U.data;
    var s = card('Rouh’s updates');
    s.classList.add('cu-card');
    s.setAttribute('aria-busy', U.busy ? 'true' : 'false');
    if (!d) {
      s.appendChild(el('p', 'hb-empty', U.error || (U.loaded ? 'Not known yet.' : 'Looking…')));
      page.appendChild(s);
      return;
    }
    var lead = el('p', 'cu-lead' + (d.newest && !d.up_to_date && !d.makes_releases ? ' new' : ''), updatesHeadline(d));
    lead.setAttribute('role', 'status');
    s.appendChild(lead);

    var dl = el('dl', 'hb-ask-dl ch-dl cu-dl');
    var rows = [];
    if (d.current && d.current.label) {
      rows.push(['You have', d.current.label + (d.current.own_commits
        ? ', with ' + d.current.own_commits + ' change' + (d.current.own_commits === 1 ? '' : 's') + ' of its own' : '')]);
    }
    if (d.newest) rows.push(['Newest', d.newest.label]);
    if (d.newest && d.release_from === 'github') rows.push(['Read from', 'GitHub, signed: rouh.land did not answer']);
    if (d.makes_releases && d.publishing) rows.push(['Releases', d.publishing.said || 'None published from here yet.']);
    rows.forEach(function (row) { dl.appendChild(el('dt', '', row[0])); dl.appendChild(el('dd', '', row[1])); });
    if (rows.length) s.appendChild(dl);
    s.appendChild(el('p', 'ch-sub', 'Changes come from Rouh’s shared main branch, in order, after checks on the early-test Rouhs.'));
    if (d.run && d.run.going) s.appendChild(runLine(d.run));

    var ledger = d.ledger;
    if (ledger && ledger.changes && ledger.changes.length) {
      var counts = ledger.counts || {};
      s.appendChild(el('p', 'cu-sub-h', (counts.copied || 0) + ' copied exactly · ' +
        (counts.adapted || 0) + ' adapted · ' + (ledger.waiting || 0) + ' waiting'));
      var record = el('details', 'brown-toggle');
      record.open = !!U.ledgerOpen;
      record.addEventListener('toggle', function () { if (record.isConnected) U.ledgerOpen = record.open; });
      record.appendChild(el('summary', '', 'Every change since this Rouh was installed'));
      var body = el('div', 'brown-toggle-body');
      var list = el('ol', 'hb-list ch-list');
      ledger.changes.forEach(function (change) {
        var item = el('li', 'hb-beat ch-row');
        item.appendChild(el('div', 'ch-why', change.purpose || short(change.master)));
        item.appendChild(el('div', 'ch-sub', (change.urgent && change.status !== 'copied' && change.status !== 'adapted'
          ? 'Urgent security update · ' : '') + change.status_label));
        if (change.reason) item.appendChild(el('p', '', change.reason));
        list.appendChild(item);
      });
      body.appendChild(list);
      record.appendChild(body);
      s.appendChild(record);
    } else {
      s.appendChild(el('p', 'ch-sub', 'The record of copied, adapted and waiting changes begins with the first update.'));
    }

    if (d.whats_new && d.whats_new.length && !d.up_to_date) {
      s.appendChild(el('p', 'cu-sub-h', 'What is new'));
      var ul = el('ul', 'cu-new');
      d.whats_new.forEach(function (line) { ul.appendChild(el('li', '', line)); });
      s.appendChild(ul);
    }

    var say = U.busy ? 'Working…' : (U.error || U.said);
    if (d.busy && d.busy.step && !(d.run && d.run.going)) say = 'Updating: ' + d.busy.step + '…';
    if (say) s.appendChild(el('p', 'hb-say' + (U.error && U.error !== RESTARTING ? ' bad' : ''), say));

    var acts = el('div', 'hb-actions cu-actions');
    if (d.admin && !d.makes_releases) {
      var can = !d.why_not && !U.busy;
      var go = button('Update to the newest Rouh', d.stuck && d.stuck.where ? '' : 'primary', function () {
        updatesCall('POST', '/api/settings/updates/now', {}).then(function () {
          window.setTimeout(function () { loadUpdates(false); }, 5000);
        });
      });
      go.disabled = !can;
      if (!can && d.why_not && !(d.up_to_date)) go.setAttribute('aria-describedby', 'cuWhyNot');
      if (d.newest && !d.up_to_date) acts.appendChild(go);
    }
    var look = button(d.on_its_own ? 'Look for a newer Rouh' : 'Look again', '', function () {
      U.busy = true; draw();
      loadUpdates(true);
    });
    acts.appendChild(look);
    s.appendChild(acts);
    if (d.newest && d.why_not && !d.up_to_date && !d.makes_releases && !d.busy && !d.pending) {
      var why = el('p', 'cu-why', d.why_not);
      why.id = 'cuWhyNot';
      s.appendChild(why);
    }
    if (d.check_error && !d.newest) s.appendChild(el('p', 'cu-why', d.check_error));

    var box = el('fieldset', 'cu-modes');
    box.appendChild(el('legend', 'cu-sub-h', 'How new releases come'));
    Object.keys(d.modes || {}).forEach(function (k) {
      var lab = el('label', 'cu-mode' + (d.mode === k ? ' on' : ''));
      var r = el('input');
      r.type = 'radio'; r.name = 'cuMode'; r.value = k; r.checked = d.mode === k;
      r.disabled = !d.admin || U.busy;
      r.addEventListener('change', function () {
        if (r.checked) updatesCall('POST', '/api/settings/updates/mode', { mode: k });
      });
      var text = el('span', 'cu-mode-text');
      text.appendChild(el('span', 'cu-mode-name', d.modes[k] + (k === 'ride' ? ' (the default)' : '')));
      text.appendChild(el('span', 'cu-mode-line', MODE_LINES[k] || ''));
      lab.appendChild(r);
      lab.appendChild(text);
      box.appendChild(lab);
    });
    if (d.on_its_own && d.mode === 'ride') {
      box.appendChild(el('p', 'cu-why', 'This Rouh is on its own, so it never rides along: it asks rouh.land only when you press a button here.'));
    }
    if (!d.admin) box.appendChild(el('p', 'cu-why', 'Only an administrator of this Rouh changes how its code is updated.'));
    s.appendChild(box);

    var last = d.last;
    if (last) {
      var lp = el('p', 'cu-last' + (last.ok ? '' : ' bad'));
      lp.appendChild(el('span', 'cu-last-h', 'Last update, ' + when(last.at) + ': '));
      lp.appendChild(document.createTextNode(lastLine(last)));
      if (last.run && !(d.run && d.run.going)) {
        lp.appendChild(document.createTextNode(' '));
        lp.appendChild(runLink(last.run, 'The update’s run, step by step'));
      }
      s.appendChild(lp);
    }
    s.appendChild(el('p', 'settings-help', 'Every update is a run of its own that you can follow. Each change is ' +
      'fitted to this Rouh and checked before it becomes an undo point, and the update stops at the first change that ' +
      'cannot be taken. Database changes are rehearsed on a copy first, with a full backup and checks that existing memory is kept.'));
    page.appendChild(s);
  }

  /* The update's run: every update is one (`code_update.start_run`), and its own page shows each
     step, tool call and result as it goes. */
  function runLink(id, text) {
    var a = el('a', 'cu-run-link', text);
    a.href = '/run/' + encodeURIComponent(id);
    return a;
  }
  function runLine(run) {
    var p = el('p', 'hb-say cu-run');
    p.setAttribute('role', 'status');
    p.appendChild(document.createTextNode('In the run ' + run.id + (run.progress ? ': ' + run.progress : '.') + ' '));
    p.appendChild(runLink(run.id, 'Follow the update’s run'));
    return p;
  }

  function lastLine(last) {
    if (Object.prototype.hasOwnProperty.call(last, 'waiting')) {
      var stop = last.stopped_at;
      var t0 = last.said || 'The record above shows what came in and what is waiting.';
      if (stop && stop.purpose) t0 += ' Stopped at “' + stop.purpose + '”: ' + String(stop.reason || 'it could not be taken').replace(/\.$/, '') +
        '. Nothing after it was taken, so this Rouh runs the code it had before it.';
      return t0;
    }
    if (!last.ok) return 'did not update to ' + (last.label || 'the newest release') + ': ' + (last.said || '');
    var t = 'updated to ' + (last.label || 'the newest release') + '.';
    (last.kept || []).forEach(function (k) {
      var who = (k.genes || ['a change of its own']).join(' and ');
      t += ' ' + who.charAt(0).toUpperCase() + who.slice(1) + ' stayed as it was in ' + k.file + '.';
    });
    return t;
  }

  function drawPoints(page, d) {
    var s = card('Undo points');
    if (!d.points || !d.points.length) {
      s.appendChild(el('p', 'hb-empty', 'None yet.'));
      page.appendChild(s);
      return;
    }
    var ol = el('ol', 'hb-list ch-list');
    d.points.forEach(function (p) {
      var li = el('li', 'hb-beat ch-row' + (p.current ? ' current' : ''));
      var top = el('div', 'ch-top');
      top.appendChild(el('span', 'ch-n', String(p.n)));
      top.appendChild(el('span', 'ch-why', p.why || 'no description'));
      if (p.current) top.appendChild(el('span', 'hb-pill ch-pill', 'Runs now'));
      li.appendChild(top);
      var sub = [short(p.commit), when(p.at), p.by || '',
                 p.checked ? p.checked.passed + ' checks passed' : ''];
      if (p.doctored) sub.push('put back by the doctor');
      li.appendChild(el('div', 'ch-sub', sub.filter(Boolean).join(' · ')));
      if (!p.current && d.admin) {
        var acts = el('div', 'hb-actions');
        if (C.confirm === p.n) {
          acts.appendChild(el('span', 'ch-ask', 'Put the code back to this point? Your data stays as it is.'));
          acts.appendChild(button('Put back', 'primary', function () { undo(p.n); }));
          acts.appendChild(button('Cancel', '', function () { C.confirm = 0; draw(); }));
        } else {
          acts.appendChild(button('Put back to this', '', function () { C.confirm = p.n; draw(); }));
        }
        li.appendChild(acts);
      }
      ol.appendChild(li);
    });
    s.appendChild(ol);
    page.appendChild(s);
  }

  function drawCore(page, d) {
    var s = card('The protected core', d.version ? 'rouh-guard ' + d.version : '');
    s.appendChild(el('p', 'settings-help', 'The parts of Rouh that its own changes cannot reach: the key ' +
      'proxy, the checks every change must pass, and the doctor. Only signed releases update them.'));
    var doc = d.doctor || {};
    var dl = el('dl', 'hb-ask-dl ch-dl');
    var health = doc.failing_since ? 'not answering since ' + when(doc.failing_since)
      : (doc.last_ok ? 'answering' : 'not looked at yet');
    [['Rouh', health],
     ['The doctor', 'goes back after ' + (doc.patience_minutes || 5) + ' minutes without an answer, within ' +
       (doc.window_minutes || 30) + ' minutes of a change'],
     ['Contracts', Object.keys(d.contracts || {}).map(function (k) { return k + ' ' + d.contracts[k].join(', '); }).join(' · ')]
    ].forEach(function (row) { dl.appendChild(el('dt', '', row[0])); dl.appendChild(el('dd', '', row[1])); });
    s.appendChild(dl);
    page.appendChild(s);
  }

  function draw() {
    var body = $('changesBody');
    if (!body || !C.open) return;
    body.setAttribute('aria-busy', C.busy ? 'true' : 'false');
    body.textContent = '';
    var page = el('div', 'hb-page ch-page');
    var say = C.busy ? 'Working…' : (C.error || C.said);
    if (say) page.appendChild(el('p', 'hb-say' + (C.error && C.error !== RESTARTING ? ' bad' : ''), say));
    var d = C.data;
    if (!d) {
      if (!C.error) page.appendChild(el('p', 'hb-empty', 'Asking the protected core…'));
    } else if (!d.guard || d.answering === false) {
      drawStuck(page);
      drawUpdates(page);
      var s = card('Changes');
      s.appendChild(el('p', 'settings-help', d.said || ''));
      page.appendChild(s);
    } else {
      drawDoctor(page, d);
      drawState(page, d);
      drawStuck(page);
      drawUpdates(page);
      drawWaiting(page, d);
      drawPoints(page, d);
      drawCore(page, d);
    }
    body.appendChild(page);
  }

  function undo(n) {
    C.confirm = 0;
    call('POST', '/api/settings/changes/undo', { point: n }).then(function () {
      // Rouh starts again on the code put back; read the page again once it answers.
      window.setTimeout(load, 8000);
    });
  }

  function shownNow() {
    if (C.open) return;
    C.open = true;
    C.error = '';
    C.said = '';
    C.confirm = 0;
    draw();
    load();
    window.clearInterval(C.timer);
    C.timer = window.setInterval(function () { if (C.open && !C.busy) load(); }, 15000);
  }

  function hiddenNow() {
    C.open = false;
    window.clearInterval(C.timer);
  }

  window.RouhChanges = { shown: shownNow, hidden: hiddenNow, reload: load };
})();
