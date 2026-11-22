/* Live (task 189, Rouh Link; called Connections and a page of its own until 22 November 2026, when
   Petar asked: "can we rename Connections to Live ?! ... when I click it - it goes to a page without
   navigation etc. can we make it a page that fits in the same framework everything else does?").

   A layer on the canvas in Rouh's own frame (`liveOpen` in app/runs.js, at /live, and at /link for
   every link already sent). Live spaces come first, with Start a live space; then Connect and the
   Rouhs this one is connected to; then, less often, a link someone sent, a contact's Rouh,
   hand-offs, agreed meetings and who else may reach this Rouh. Ended spaces and cut connections
   wait behind Show ended and Show cut. A live space opens in the same layer: its own page,
   embedded (`/link/space/<id>?in=rouh`), under the layer's head with Back to Live.

   Every press is one call to this Rouh (/api/link...), and the page is drawn again from its answer.
   The layer, its address and its row in the navigation are app/runs.js's, handed over through
   `window.RouhLiveHost`. */
(function () {
  'use strict';

  var API = window.LINK_API || {
    get: function (path) { return fetch(path, { credentials: 'same-origin', cache: 'no-store' }).then(answer); },
    post: function (path, body) {
      return fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json',
        'X-CSRFToken': csrf() }, body: JSON.stringify(body || {}) }).then(answer);
    }
  };
  function csrf() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }
  function answer(r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.error || ('Rouh answered ' + r.status)); e.status = r.status; throw e; }
      return j;
    });
  }
  function host() { return window.RouhLiveHost || {}; }
  function go(href) {
    if (host().go) host().go(href); else location.href = href;
  }

  var S = null;
  var L = { open: false, wired: false, timer: 0, accept: '', showEnded: false, showCut: false, sub: '' };
  var $ = function (id) { return document.getElementById('lv-' + id); };
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function btn(text, cls, onclick, attrs) {
    var a = { class: 'ctl' + (cls ? ' ' + cls : ''), type: 'button', text: text, onclick: onclick };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return el('button', a);
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function toast(words) {
    var t = $('toast'); if (!t) return;
    t.textContent = words; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 6000);
  }
  function fail(e) { toast(e && e.message ? e.message : 'That did not work.'); }
  function initials(name) {
    var n = String(name || '?').replace(/·.*/, '').trim().split(/\s+/);
    return ((n[0] || '?')[0] + ((n[1] || '')[0] || '')).toUpperCase();
  }
  function when(at) {
    if (!at) return '';
    return new Date(at * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // A space's address in Rouh: /link/space/<id>, the one every link already sent uses.
  function spaceHref(id) { return '/link/space/' + encodeURIComponent(id); }
  // A link pressed plainly goes there inside Rouh; Cmd or Ctrl still opens a tab of its own.
  function inRouh(a) {
    a.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
      ev.preventDefault(); go(a.getAttribute('href'));
    });
    return a;
  }

  var OLD_PEER = { cut: true, refused: true, blocked: true };

  function load() {
    return API.get('/api/link').then(function (st) { S = st; draw(); }).catch(function (e) {
      $('lead').textContent = 'Your Rouh could not be asked just now.';
      $('leadMore').textContent = e && e.message ? e.message : '';
    });
  }

  function draw() {
    if (!S) return;
    if (!S.born) {
      $('lead').textContent = 'Your Rouh is not born yet, so it has no name to work with other Rouhs.';
      $('leadMore').textContent = 'Its birth gives it a name and a key: Anatomy, Your Rouh, Connect to rouh.land.';
      $('content').hidden = true;
      if (host().meta) host().meta('');
      return;
    }
    $('content').hidden = false;
    var connected = S.peers.filter(function (p) { return p.state === 'connected'; });
    var asks = S.peers.filter(function (p) { return p.state === 'asked'; });
    var invited = S.spaces.filter(function (s) { return s.state === 'invited'; });
    var live = S.spaces.filter(function (s) { return s.state === 'live'; });
    var waiting = asks.length + invited.length;
    var lead = ', is in ' + plural(live.length, 'live space', 'live spaces') +
      ' and connected to ' + plural(connected.length, 'Rouh', 'Rouhs');
    if (waiting) lead += '; ' + waiting + ' need' + (waiting === 1 ? 's' : '') + ' you';
    // The Rouh's name kept on one line ("Dignified Cumulus ·y5q6").
    var leadEl = clear($('lead'));
    leadEl.appendChild(document.createTextNode('Your Rouh, '));
    leadEl.appendChild(el('span', { class: 'lv-keep', text: String(S.me.name).replace(/ ·/, '\u00a0·') }));
    leadEl.appendChild(document.createTextNode(lead + '.'));
    $('leadMore').textContent = S.me.address ? 'Other Rouhs reach it at ' + S.me.address.replace(/^https?:\/\//, '') + '.'
      : 'It has no address other Rouhs can reach yet: Anatomy, Your Rouh, Your Rouh’s URL.';
    if (host().meta) host().meta(waiting ? waiting + ' waiting' : '');
    drawNeeds(asks, invited);
    // One primary press a view: what waits first, else Start, which is the page's own.
    $('start').className = 'ctl' + (waiting ? '' : ' lv-go');
    drawSpaces();
    drawPeers();
    drawInvites();
    drawOff();
    drawMeetCals();
    drawHandoffs();
    if (L.accept && !draw.accepted) {
      draw.accepted = true;
      $('bringLink').value = L.accept;
      var box = $('bringBox');
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' });
      $('bringLink').focus({ preventScroll: true });
    }
  }

  function levelWord(id) {
    var l = (S.levels || []).filter(function (x) { return x.id === id; })[0];
    return l ? l.word : String(id || '');
  }

  function levelSelect(p, onchange) {
    var sel = el('select', { 'aria-label': 'Trust level for ' + p.name });
    S.levels.forEach(function (l) { sel.appendChild(el('option', { value: l.id, text: l.word, selected: l.id === p.trust })); });
    sel.addEventListener('change', function () { onchange(sel.value); });
    return sel;
  }

  function peerAct(label, body, said) {
    return API.post('/api/link/peer/' + encodeURIComponent(label), body).then(function () { if (said) toast(said); return load(); }).catch(fail);
  }

  function drawNeeds(asks, invited) {
    var box = clear($('needs'));
    $('needsBox').hidden = !(asks.length || invited.length);
    var first = true;
    asks.forEach(function (p) {
      var level = p.trust || 'known';
      box.appendChild(el('div', { class: 'lv-item' }, [
        el('span', { class: 'lv-av rouh', 'aria-hidden': 'true', text: initials(p.name) }),
        el('div', { class: 'lv-what' }, [el('span', { class: 'lv-name', text: p.name + (p.via === 'stranger' ? ', a Rouh you do not know,' : '') + ' asks to connect.' }),
          el('span', { class: 'lv-sub', text: p.address || 'reached by the mailbox' }),
          p.note ? el('span', { class: 'lv-sub', text: p.note }) : null]),
        el('div', { class: 'lv-acts' }, [
          levelSelect(p, function (v) { level = v; }),
          btn('Connect', first ? 'lv-go' : '', function () { peerAct(p.label, { act: 'yes', level: level }, 'Connected to ' + p.name + '.'); }),
          btn('No', 'lv-quiet', function () { peerAct(p.label, { act: 'cut' }, 'Said no.'); })
        ])
      ]));
      first = false;
    });
    invited.forEach(function (s) {
      var open = inRouh(el('a', { class: 'ctl' + (first ? ' lv-go' : ''), href: spaceHref(s.space_id), text: 'Open' }));
      box.appendChild(el('div', { class: 'lv-item' }, [
        el('span', { class: 'lv-av rouh', 'aria-hidden': 'true', text: initials(holderName(s.holder)) }),
        el('div', { class: 'lv-what' }, [el('span', { class: 'lv-name', text: 'You are asked into ' + (/^live /i.test(s.kind_word) ? 'a ' : 'a live ') + s.kind_word.toLowerCase() + ': “' + s.title + '”.' }),
          el('span', { class: 'lv-sub', text: 'Held by ' + holderName(s.holder) + '’s Rouh' })]),
        el('div', { class: 'lv-acts' }, [open])
      ]));
      first = false;
    });
  }

  function holderName(label) {
    var p = (S.peers || []).filter(function (x) { return x.label === label; })[0];
    return p ? p.name.split(' ·')[0] : label;
  }

  function spaceRow(s) {
    var old = s.state === 'ended';
    return el('div', { class: 'lv-item' + (old ? ' lv-old' : '') }, [
      el('span', { class: 'lv-av', 'aria-hidden': 'true', text: (s.kind_word || '?')[0] }),
      el('div', { class: 'lv-what' }, [inRouh(el('a', { class: 'lv-name', href: spaceHref(s.space_id), text: s.title || 'Untitled' })),
        el('span', { class: 'lv-sub' }, [el('span', { class: 'lv-state ' + (old ? 'off' : 'on'), text: old ? 'Ended' : 'Live' }),
          ' · ' + s.kind_word + ', ' + (s.mine ? 'held by your Rouh' : 'held by ' + holderName(s.holder) + '’s Rouh') + ', ',
          el('span', { class: 'lv-keep', text: plural(s.members.length, 'Rouh', 'Rouhs') + ' in it' })])])
    ]);
  }

  function drawSpaces() {
    var box = clear($('spaces'));
    var live = S.spaces.filter(function (s) { return s.state === 'live'; });
    var ended = S.spaces.filter(function (s) { return s.state === 'ended'; });
    if (!live.length) {
      box.appendChild(el('p', { class: 'lv-note', text: ended.length
        ? 'No live space open now. Start one above, then ask a connected Rouh in.'
        : 'No live space yet. Start one above, then ask a connected Rouh in.' }));
    }
    live.forEach(function (s) { box.appendChild(spaceRow(s)); });
    var more = $('endedToggle');
    more.hidden = !ended.length;
    more.textContent = (L.showEnded ? 'Hide ended' : 'Show ended') + ' (' + ended.length + ')';
    more.setAttribute('aria-expanded', L.showEnded ? 'true' : 'false');
    var old = clear($('ended'));
    old.hidden = !(L.showEnded && ended.length);
    if (L.showEnded) ended.forEach(function (s) { old.appendChild(spaceRow(s)); });
  }

  function peerRow(p, box) {
    var stateWords = { connected: 'Connected', waiting: 'Waiting for its person', cut: 'Cut', blocked: 'Blocked', refused: 'Said no', noted: 'A contact’s Rouh, not connected yet' }[p.state] || p.state;
    var acts = el('div', { class: 'lv-acts' });
    if (p.state === 'connected') {
      acts.appendChild(levelSelect(p, function (v) { peerAct(p.label, { act: 'trust', level: v }, p.name + ' is ' + v + ' now.'); }));
      var side = el('select', { 'aria-label': 'Side for ' + p.name });
      [['', 'Either side'], ['work', 'Work'], ['personal', 'Personal']].forEach(function (o) { side.appendChild(el('option', { value: o[0], text: o[1], selected: o[0] === (p.silo || '') })); });
      side.addEventListener('change', function () { peerAct(p.label, { act: 'silo', silo: side.value }, 'Side changed.'); });
      acts.appendChild(side);
      acts.appendChild(btn('Cut', 'lv-cut', function () { peerAct(p.label, { act: 'cut' }, 'Cut. It can no longer reach your Rouh.'); }));
    }
    if (p.state === 'noted') acts.appendChild(btn('Connect', '', function () { connectAddress(p.address); }));
    if (p.state === 'blocked') acts.appendChild(btn('Unblock', '', function () { peerAct(p.label, { act: 'unblock' }, 'Unblocked.'); }));
    else acts.appendChild(btn('Block', 'lv-quiet lv-cut', function () { peerAct(p.label, { act: 'block' }, 'Blocked.'); }));
    acts.appendChild(btn('The log', 'lv-quiet', function () { openLog(p); }));
    var row = el('div', { class: 'lv-item' + (OLD_PEER[p.state] ? ' lv-old' : '') });
    if (p.state === 'connected' && p.trust === 'delegate') acts.appendChild(btn('Write a grant', 'lv-quiet', function () { grantForm(p, row); }));
    var theirs = (S.grants || []).filter(function (g) { return g.peer === p.label && g.active; });
    var grantsBox = el('div', { class: 'lv-acts', style: 'display:grid;gap:6px' });
    theirs.forEach(function (g) {
      grantsBox.appendChild(el('div', { class: 'lv-grant' }, [
        el('p', {}, [el('strong', { text: g.direction === 'out' ? 'Your grant: ' : 'Their grant to your Rouh: ' }), g.words]),
        g.direction === 'out' ? btn('Withdraw', 'lv-cut', function () {
          API.post('/api/link/grant', { act: 'withdraw', grant_id: g.grant_id }).then(function () { toast('Withdrawn. Nothing more is decided under it.'); load(); }).catch(fail); }) : null]));
    });
    var on = p.state === 'connected';
    row.appendChild(el('span', { class: 'lv-av rouh', 'aria-hidden': 'true', text: initials(p.name) }));
    row.appendChild(el('div', { class: 'lv-what' }, [el('span', { class: 'lv-name', text: p.name }),
      el('span', { class: 'lv-sub' }, [el('span', { class: 'lv-state ' + (on ? 'on' : 'off'), text: stateWords }),
        (on ? ', ' + p.trust_word + (p.silo ? ', ' + p.silo : '') : '') + (p.since ? ', since ' + when(p.since) : '')])]));
    row.appendChild(acts);
    if (theirs.length) row.appendChild(grantsBox);
    box.appendChild(row);
  }

  function drawPeers() {
    var box = clear($('peers'));
    var current = S.peers.filter(function (p) { return p.state !== 'asked' && !OLD_PEER[p.state]; });
    var old = S.peers.filter(function (p) { return OLD_PEER[p.state]; });
    if (!current.length) {
      box.appendChild(el('div', { class: 'lv-empty' }, [el('strong', { text: old.length ? 'No Rouh connected now' : 'No Rouh connected yet' }),
        el('p', { text: 'Make a connect link above and send it to someone with a Rouh, or bring a link they sent you.' })]));
    }
    current.forEach(function (p) { peerRow(p, box); });
    var more = $('cutToggle');
    more.hidden = !old.length;
    more.textContent = (L.showCut ? 'Hide cut' : 'Show cut') + ' (' + old.length + ')';
    more.setAttribute('aria-expanded', L.showCut ? 'true' : 'false');
    var oldBox = clear($('cut'));
    oldBox.hidden = !(L.showCut && old.length);
    if (L.showCut) old.forEach(function (p) { peerRow(p, oldBox); });
  }

  function drawInvites() {
    var box = clear($('invites'));
    var open = (S.invites || []).filter(function (i) { return i.open; });
    if (!open.length) return;
    box.appendChild(el('h4', { text: 'Links not used yet' }));
    open.forEach(function (i) {
      box.appendChild(el('div', { class: 'lv-row-f' }, [el('span', { class: 'lv-grow lv-sub', text: levelWord(i.trust) + (i.for_label ? ', for ' + i.for_label + ' only' : '') + ', good until ' + when(i.expires_at) }),
        btn('Withdraw', 'small', function () { API.post('/api/link/invite/withdraw', { id: i.id }).then(function () { toast('Withdrawn. That link no longer works.'); load(); }).catch(fail); })]));
    });
  }

  function drawOff() {
    var st = S.settings || {};
    $('strangers').checked = !!st.strangers;
    $('openNet').checked = !!st.open_network;
    $('findable').checked = !!st.findable_by_email;
    ['strangers', 'openNet', 'findable'].forEach(function (id) { $(id).disabled = !!st.held; });
    $('mostMembers').value = String(st.most_members || 5);
    $('findEmail').hidden = !st.open_network;
    $('heldWhy').textContent = st.held ? st.held_why : 'You choose. Each stays off until you turn it on.';
  }

  // Where an agreed meeting goes, one calendar per side (`meeting.book_calendar`).
  var CALS = null;
  var SIDE_WORD = { work: 'Work', personal: 'Personal' };
  function loadCalendars() {
    return API.get('/api/link/calendars').then(function (got) { CALS = got; drawMeetCals(); })
      .catch(function () { CALS = { connected: true, calendars: [], fallback: {}, trouble: 'Your calendars could not be read.' }; drawMeetCals(); });
  }
  function calName(id) {
    var c = ((CALS && CALS.calendars) || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '';
  }
  function drawMeetCals() {
    if (!CALS || !S || !S.born) return;
    if (CALS.admin === false) { $('meetCalBox').hidden = true; return; }
    $('meetCalBox').hidden = false;
    var st = S.settings || {}, list = CALS.calendars || [], fb = CALS.fallback || {};
    $('meetCalSaid').textContent = !CALS.connected ? 'Connect Google in Anatomy to choose where agreed meetings go.'
      : CALS.trouble ? CALS.trouble
      : !list.length ? 'None of your calendars can be written to by Rouh.'
      : 'Only calendars Rouh can add events to. A Personal meeting never goes in a Work calendar by itself.';
    [['calWork', 'work'], ['calPersonal', 'personal']].forEach(function (pair) {
      var sel = $(pair[0]), side = pair[1], chosen = st['book_calendar_' + side] || '';
      if (document.activeElement === sel) return;
      clear(sel);
      var first = fb[side] ? 'Not chosen: ' + (calName(fb[side]) || fb[side])
        : side === 'work' ? 'Not chosen: the usual calendar' : 'Not chosen: not put in a calendar';
      sel.appendChild(el('option', { value: '', text: first }));
      list.forEach(function (c) {
        var tag = c.side && SIDE_WORD[c.side] ? ' (' + SIDE_WORD[c.side] + ')' : '';
        sel.appendChild(el('option', { value: c.id, text: c.name + tag }));
      });
      if (chosen && !list.some(function (c) { return c.id === chosen; }))
        sel.appendChild(el('option', { value: chosen, text: 'Can no longer be written to: ' + chosen }));
      sel.value = chosen;
      sel.disabled = !CALS.connected || !list.length;
    });
  }
  function chooseCal(side) {
    var sel = $(side === 'work' ? 'calWork' : 'calPersonal'), body = {};
    body['book_calendar_' + side] = sel.value;
    API.post('/api/link/settings', body).then(function (st) {
      S.settings = st; sel.blur();
      var fb = (CALS && CALS.fallback || {})[side], into = sel.value ? calName(sel.value) || sel.value : fb ? calName(fb) || fb : side === 'work' ? 'the usual calendar' : '';
      toast(into ? SIDE_WORD[side] + '-side meetings go in ' + into + ' now.' : SIDE_WORD[side] + '-side meetings are not put in a calendar until you choose one.');
      drawMeetCals();
    }).catch(function (e) { fail(e); sel.blur(); drawMeetCals(); });
  }

  // A written grant to a delegate: what it may decide for you, with its limits, shown to both people.
  function grantForm(p, row) {
    var mins = el('select', { 'aria-label': 'Longest meeting' });
    [30, 60, 90, 120].forEach(function (m) { mins.appendChild(el('option', { value: m, text: 'Up to ' + m + ' minutes', selected: m === 60 })); });
    var week = el('select', { 'aria-label': 'Most a week' });
    [1, 3, 5, 10].forEach(function (m) { week.appendChild(el('option', { value: m, text: 'At most ' + m + ' a week', selected: m === 5 })); });
    var f = el('form', { class: 'lv-form lv-acts lv-grant', onsubmit: function (ev) {
      ev.preventDefault();
      API.post('/api/link/grant', { label: p.label, what: 'meetings', limits: { most_minutes: +mins.value, most_a_week: +week.value,
        days: [0, 1, 2, 3, 4], from_hour: 9, to_hour: 18 } }).then(function (g) { toast('Written and shown to ' + p.name + ': ' + g.words); f.remove(); load(); }).catch(fail);
    } }, [el('p', { text: p.name.split(' ·')[0] + '’s Rouh may agree meetings for you, weekdays 9:00 to 18:00:' }),
      el('div', { class: 'lv-row-f' }, [mins, week]), el('p', { class: 'lv-note', text: 'Never money. Withdraw it here at any time.' }),
      el('div', { class: 'lv-row-f' }, [el('button', { class: 'ctl', type: 'submit', text: 'Write the grant' }),
        btn('Cancel', 'lv-quiet', function () { f.remove(); })])]);
    row.appendChild(f);
  }

  function peerName(label) {
    var p = (S.peers || []).filter(function (x) { return x.label === label; })[0];
    return p ? p.name : label;
  }

  function drawHandoffs() {
    var box = clear($('handoffs'));
    var list = S.handoffs || [];
    if (!list.length) box.appendChild(el('p', { class: 'lv-note', text: 'Nothing handed over yet.' }));
    list.forEach(function (h) {
      var f = h.form || {}, row = el('div', { class: 'lv-grant' });
      if (h.kind === 'handoff.brief') {
        row.appendChild(el('p', {}, [el('strong', { text: 'A brief from ' + peerName(h.peer) + ': ' }), String(f.need || ''),
          ' (budget: ' + (f.budget_band || 'ask') + (f.by_when ? ', by ' + f.by_when : '') + ')']));
        if (h.state === 'new') {
          var amount = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Amount', placeholder: 'Amount', style: 'width:110px' });
          var cur = el('select', { 'aria-label': 'Currency', style: 'width:auto' });
          ['EUR', 'BGN', 'USD', 'GBP'].forEach(function (c) { cur.appendChild(el('option', { value: c, text: c })); });
          row.appendChild(el('form', { class: 'lv-row-f', onsubmit: function (ev) { ev.preventDefault();
            API.post('/api/link/handoff', { act: 'quote', brief_id: h.id.split(':')[1], amount: parseFloat(amount.value) || 0, currency: cur.value })
              .then(function () { toast('Quote sent. A person decides on it there.'); load(); }).catch(fail); } },
            [amount, cur, el('button', { class: 'ctl', type: 'submit', text: 'Send a quote' })]));
        } else row.appendChild(el('span', { class: 'lv-sub', text: h.said || h.state }));
      } else if (h.kind === 'handoff.quote') {
        row.appendChild(el('p', {}, [el('strong', { text: 'A quote from ' + peerName(h.peer) + ': ' }), f.amount + ' ' + f.currency + (f.words ? ', ' + f.words : '')]));
      } else if (h.kind === 'a2a.note') {
        row.appendChild(el('p', {}, [el('strong', { text: 'A note from an agent outside (' + (f.from_agent || 'unnamed') + '): ' }), String(f.text || '')]));
      } else if (h.kind === 'money.proposal') {
        row.appendChild(el('p', {}, [el('strong', { text: peerName(h.peer) + ' proposes ' + f.amount + ' ' + f.currency + ': ' }), String(f.for || '')]));
        row.appendChild(el('a', { href: '/link/money/' + encodeURIComponent(h.id), text: h.state === 'agreed' ? 'You agreed' : 'Read it' }));
      }
      box.appendChild(row);
    });
    var sel = clear($('briefTo'));
    (S.peers || []).filter(function (p) { return p.state === 'connected'; }).forEach(function (p) { sel.appendChild(el('option', { value: p.label, text: p.name })); });
    $('briefForm').hidden = !sel.options.length;
    $('briefNone').hidden = !!sel.options.length;
  }

  function makeLink() {
    var body = { trust: $('newTrust').value, for_label: $('newFor').value.trim(), silo: $('newSide').value };
    API.post('/api/link/invite', body).then(function (got) {
      $('linkOut').hidden = false;
      $('linkText').textContent = got.link;
      var qr = clear($('linkQr'));
      if (got.qr) { qr.innerHTML = got.qr; qr.hidden = false; } else qr.hidden = true;
      $('copyLink').onclick = function () {
        (navigator.clipboard ? navigator.clipboard.writeText(got.link) : Promise.reject()).then(function () { toast('Copied.'); }, function () { toast('Select the link and copy it.'); });
      };
      load();
    }).catch(fail);
  }

  function connectAddress(address) {
    API.post('/api/link/connect', { address: address, trust: 'known' }).then(function (p) {
      toast(p.state === 'connected' ? 'Connected to ' + p.name + '.' : 'Asked ' + p.name + '; waiting for its person.'); load();
    }).catch(fail);
  }

  function openLog(p) {
    $('logTitle').textContent = 'The log with ' + p.name;
    $('logDrawer').hidden = false; $('scrim').hidden = false;
    clear($('logMine')).appendChild(el('li', { text: 'Reading…' }));
    clear($('logTheirs'));
    API.get('/api/link/peer/' + encodeURIComponent(p.label) + '/log').then(function (got) {
      fill($('logMine'), got.mine, false);
      fill($('logTheirs'), got.theirs, true);
      if (got.theirs_said) $('logTheirs').appendChild(el('li', { text: got.theirs_said }));
    }).catch(fail);
    $('logClose').focus();
  }
  function fill(ul, entries, theirs) {
    clear(ul);
    (entries || []).slice().reverse().forEach(function (e) {
      var d = new Date(e.at * 1000);
      ul.appendChild(el('li', {}, [el('span', { class: 'lv-when', text: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }),
        el('span', { class: theirs && e.holds === false ? 'lv-broken' : '', text: e.plain + (theirs && e.holds === false ? ' (its signature does not hold)' : '') })]));
    });
    if (!(entries || []).length) ul.appendChild(el('li', { text: 'Nothing yet.' }));
  }
  function logOpen() { return $('logDrawer') && !$('logDrawer').hidden; }
  function closeLog() { $('logDrawer').hidden = true; $('scrim').hidden = true; }

  function wire() {
    if (L.wired || !$('content')) return;
    L.wired = true;
    $('makeLink').addEventListener('click', makeLink);
    $('endedToggle').addEventListener('click', function () { L.showEnded = !L.showEnded; drawSpaces(); });
    $('cutToggle').addEventListener('click', function () { L.showCut = !L.showCut; drawPeers(); });
    $('bring').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var link = $('bringLink').value.trim(); if (!link) return;
      $('bringGo').disabled = true;
      API.post('/api/link/accept', { link: link, trust: $('bringTrust').value }).then(function (p) {
        $('bringLink').value = ''; L.accept = ''; toast('Connected to ' + p.name + '.'); load();
      }).catch(fail).then(function () { $('bringGo').disabled = false; });
    });
    $('calWork').addEventListener('change', function () { chooseCal('work'); });
    $('calPersonal').addEventListener('change', function () { chooseCal('personal'); });
    $('mostMembers').addEventListener('change', function () {
      API.post('/api/link/settings', { most_members: +$('mostMembers').value }).then(function () { toast('Spaces hold at most ' + $('mostMembers').value + ' Rouhs now.'); load(); }).catch(fail);
    });
    $('findEmail').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var e = $('findWho').value.trim(); if (!e) return;
      $('findSaid').textContent = 'Asking rouh.land…';
      API.post('/api/link/find', { email: e }).then(function (got) {
        if (!got.found) { $('findSaid').textContent = 'No Rouh that chose to be found by that email.'; return; }
        $('findSaid').textContent = 'Found ' + got.address.replace(/^https:\/\//, '') + '.';
        $('contactAddress').value = got.address; $('contactAddress').focus();
      }).catch(function (e2) { $('findSaid').textContent = e2.message; });
    });
    $('briefForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var need = $('briefNeed').value.trim(); if (!need) return;
      API.post('/api/link/handoff', { act: 'brief', label: $('briefTo').value, need: need, budget_band: $('briefBudget').value })
        .then(function () { $('briefNeed').value = ''; toast('Brief handed over, in its fixed form.'); load(); }).catch(fail);
    });
    $('fromContact').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var a = $('contactAddress').value.trim(); if (a) connectAddress(a);
    });
    /* A Live page (kind `html`, `rouh/link/pagein.py`) starts blank or from HTML pasted here; its
       title may be left empty, and is then the pasted page's own, or "A new page". */
    function pasting() { var p = document.querySelector('input[name="lv-pageFrom"]:checked'); return !!p && p.value === 'paste'; }
    function showPageFrom() {
      var lp = $('spaceKind').value === 'html';
      $('pageFrom').hidden = !lp;
      $('pageHtml').hidden = !(lp && pasting());
      $('spaceTitle').placeholder = lp ? 'What it is about (or leave it to the page)' : 'What it is about';
    }
    $('spaceKind').addEventListener('change', showPageFrom);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="lv-pageFrom"]'), function (r) {
      r.addEventListener('change', function () { showPageFrom(); if (pasting()) $('pageHtml').focus(); });
    });
    $('newSpace').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = $('spaceTitle').value.trim();
      var kind = $('spaceKind').value;
      var body = { title: t, kind: kind, silo: $('spaceSide').value };
      if (kind === 'html') {
        if (pasting()) {
          body.html = $('pageHtml').value;
          if (!body.html.trim()) { toast('Paste the page’s HTML first, or pick Blank page.'); $('pageHtml').focus(); return; }
        }
      } else if (!t) { toast('Say what it is about first.'); $('spaceTitle').focus(); return; }
      $('start').disabled = true;
      API.post('/api/link/spaces', body).then(function (got) { $('spaceTitle').value = ''; go(got.url); })
        .catch(fail).then(function () { $('start').disabled = false; });
    });
    ['strangers', 'openNet', 'findable'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var body = {}; body[{ strangers: 'strangers', openNet: 'open_network', findable: 'findable_by_email' }[id]] = $(id).checked;
        API.post('/api/link/settings', body).then(function () { load(); }).catch(function (e) { fail(e); load(); });
      });
    });
    $('logClose').addEventListener('click', closeLog);
    $('scrim').addEventListener('click', closeLog);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && L.open && logOpen()) { ev.stopPropagation(); closeLog(); }
    }, true);
  }

  window.RouhLive = {
    /* The layer is up: the hub, or `accept` a link brought by /link/accept?link=. */
    shown: function (accept) {
      wire();
      if (accept) { L.accept = String(accept); draw.accepted = false; }
      var first = !L.open;
      L.open = true;
      load().then(function () { if (first || !CALS) loadCalendars(); });
      clearInterval(L.timer);
      L.timer = setInterval(function () { if (L.open && !document.hidden) load(); }, 20000);
    },
    hidden: function () {
      L.open = false;
      clearInterval(L.timer);
      if (logOpen()) closeLog();
    },
    /* Escape closes the log first, when it is open; the host asks before closing the layer. */
    closing: function () { if (logOpen()) { closeLog(); return false; } return true; }
  };
})();
