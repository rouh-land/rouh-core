/* The Guide, at /guide (Handholding, at /handholding, until 21 November 2026): the guided way into Rouh for someone who has never seen it
   (`rouh/handholding.py`, `rouh/web/handholding.py`, the words in `rouh/handholding.json`).

   Petar, 20 November 2026: "I want to be able to put a person that has never seen rouh and step
   by step the guide should lead him to using the absolute maximum of rouh." Reworked the same day on
   his review of the first version: one source, a lesson is a step; a lesson is a card that opens
   into its own page, at its own address, with a way back to where you came from; no Try saying,
   which put words in a chat nobody could find again; pictures in every lesson.

   One page, Your path (headed Learning and Understanding Rouh), since 23 November 2026, when Enabling Rouh
   and Pro tips were folded into it as tips labelled Setup and Pro tip, and their addresses sent on to it:
   - Your path: where the person stands and their next tip, a search over every tip, then the eight
     stages, all closed at first, each with the topics inside it in plain words, and each opening
     into its tips' cards. Lessons are called tips on every page since 22 November 2026 (review 49):
     a card shows a symbol, not a screenshot, and where it stands in its own stage, never out of
     every tip there is. There is no card of the tip to carry on with at the top any more.
   And every lesson's own page, `/guide/lesson/<id>`: breadcrumbs, Back, the cover, the
   how-to with numbered pictures, Things you can say, a feature's real switch where it has one, and
   one bar held at the foot: the reading line, Previous, and Done, next.

   Back goes to where the person came from: the browser's own back when the lesson was opened by a
   press inside this page session (so the page, its scroll and the card are as they were); else the
   address's `?from=` (path, lesson-<id>); else the lesson's stage on Your path.

   Every word is the data file's; this only draws it. Done is kept per person on the server; a
   lesson Rouh can see for itself (a connection that is live, a first task) is ticked by itself and
   marked Detected. The layer, its address and its row in the navigation are app/runs.js's
   (`handholdingOpen`), handed over through `window.RouhHandholdingHost`. */
(function () {
  'use strict';

  var H = {
    open: false, page: '', lesson: '', from: '', data: null, error: '', loading: false, seq: 0,
    // Which stages are open on the path, by id; a lesson whose save failed, with its words.
    stages: {}, failed: {}, arrived: false, said: '',
    // The address a press inside this page asked for: arriving there, Back is the browser's own.
    pressed: '', viaPress: false,
    // Each page's scroll, and the lesson to bring back into view on returning to it.
    scroll: {}, back: '',
    // The feature switches as their own pages read them.
    feat: {}, featRead: false,
    // What is typed in the path's search box.
    find: ''
  };

  function host() { return window.RouhHandholdingHost || {}; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function button(text, cls, fn) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  var SVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  /** A line drawing of 24 by 24. */
  function glyph(inner, size) {
    var s = svg('svg', { viewBox: '0 0 24 24', width: String(size || 20), height: String(size || 20),
                         fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
                         'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = inner || '';
    return s;
  }
  var TICK = '<path d="M6 12.5l4 4 8-9"/>';
  /** Leaves the Guide for another page of Rouh. */
  var OUT = '<path d="M5 12h13M13 7l5 5-5 5"/>';
  /** Opens in a new tab: a box with an arrow leaving it (review 50, problem 401). */
  var AWAY = '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>';
  /** A link from a tip to another part of Rouh: it opens in a new tab, says so with its glyph and its
      name, and is quieter than the tip's own words, so the person reads on and keeps their place here
      (review 50, problem 401, Petar: "open those in new tabs ... an icon that gives indication it will
      open in a new tab ... make it less intrusive"). */
  function away(href, text, cls) {
    var a = el('a', cls || 'hh-away');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(el('span', '', text));
    a.appendChild(glyph(AWAY, 14));
    a.setAttribute('aria-label', text + ' (opens in a new tab)');
    a.title = 'Opens in a new tab, so this tip stays open here';
    return a;
  }
  /** A link: an address in Rouh opens in Rouh, a web address in a new tab. `mine` marks a press
      inside the Guide, so Back on the place it opens is the browser's own. */
  function link(href, text, cls, mine) {
    var a = el('a', cls || 'hh-link', text);
    a.href = href;
    if (/^https?:\/\//.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) { return; }
        if (!host().go) { return; }
        e.preventDefault();
        go(href, mine);
      });
    }
    return a;
  }
  function go(href, mine) {
    if (!host().go) { return; }
    remember();
    H.pressed = mine ? href.split('#')[0] : '';
    host().go(href);
  }
  /** Where this page is scrolled to, kept for coming back to it. */
  function remember() {
    var body = $('handholdingBody');
    if (body && H.open) { H.scroll[placeKey()] = body.scrollTop; }
  }
  function placeKey() { return H.lesson ? 'lesson/' + H.lesson : H.page; }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---- the data ---- */

  function content() { return (H.data && H.data.content) || { stages: [], pages: [] }; }
  function pages() { return content().pages || []; }
  function pageDef(id) {
    var all = pages();
    var want = id === undefined ? H.page : id;
    return all.filter(function (p) { return p.id === want; })[0] || all[0] || { id: '', views: [] };
  }
  /** Every lesson in the order of the path, each with its stage and its place. */
  function all() {
    var out = [];
    (content().stages || []).forEach(function (s) {
      (s.lessons || []).forEach(function (l) { out.push({ stage: s, lesson: l, i: out.length }); });
    });
    return out;
  }
  function find(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) { if (list[i].lesson.id === id) { return list[i]; } }
    return null;
  }
  function detected(id) { return !!(H.data && H.data.detected && H.data.detected[id]); }
  /** What Rouh sees already there for a tip, which the person may not have made: never done by itself. */
  function already(id) { return (H.data && H.data.already && !isDoneNoAlready(id) && H.data.already[id]) || ''; }
  function isDoneNoAlready(id) { return detected(id) || skipped(id) || ticked(id); }
  function ticked(id) { return !!(H.data && H.data.progress && H.data.progress[id] > 0); }
  /** An optional lesson the person said is not for them: done, as far as the path is concerned. */
  function skipped(id) { return !!(H.data && H.data.progress && H.data.progress[id] < 0); }
  /** A connection whose live state Rouh knows is done only when Rouh sees it connected. */
  function liveOnly(l) {
    var key = l && l.connection && l.connection.key;
    var s = key ? status(key) : null;
    return !!(s && s.kind !== 'unknown');
  }
  function isDone(l) { return detected(l.id) || skipped(l.id) || (ticked(l.id) && !liveOnly(l)); }
  /** The person's next tip: the first on the path not done yet (review 50, problem 346), or null. */
  function nextTip() {
    var list = all();
    for (var i = 0; i < list.length; i++) { if (!isDone(list[i].lesson)) { return list[i]; } }
    return null;
  }
  function stageCounts(stage) {
    var ls = stage.lessons || [];
    return { done: ls.filter(isDone).length, all: ls.length };
  }
  function status(key) {
    var st = H.data && H.data.status;
    if (!key) { return null; }
    if (!st || !st[key]) { return { kind: 'unknown', words: 'Status unknown' }; }
    return st[key];
  }
  /** A stage as the person reads it: a topic (Petar, 23 November 2026). Ids, addresses and ticks keep stage. */
  function stageName(stage) { return 'Topic ' + stage.n + ', ' + stage.title; }
  function lessonHref(id, from) { return '/guide/lesson/' + id + (from ? '?from=' + from : ''); }
  /** What the place a lesson was opened from is called, and its address. */
  function origin(from, x) {
    var m = /^lesson-([a-z0-9-]+)$/.exec(from || '');
    if (m && find(m[1])) {
      var o = find(m[1]);
      return { words: o.lesson.title, href: lessonHref(o.lesson.id, ''), key: from };
    }
    var p = pages().filter(function (q) { return q.id === from; })[0];
    if (p) { return { words: 'the guide', href: '/guide/' + p.id, key: from }; }
    var path = pageWith('path');
    return { words: x ? stageName(x.stage) : 'the guide', href: '/guide/' + (path ? path.id : ''),
             key: 'stage', stage: x ? x.stage.id : '' };
  }
  function pageWith(view) {
    return pages().filter(function (p) { return (p.views || []).indexOf(view) >= 0; })[0] || null;
  }

  /* ---- reading and saving ---- */

  function load() {
    var seq = ++H.seq;
    H.loading = !H.data;
    H.error = '';
    if (!H.data) { draw(); }
    return fetch('/api/handholding', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return null; }).then(function (j) {
          if (seq !== H.seq) { return; }
          H.loading = false;
          if (!r.ok || !j || !j.content) {
            H.error = (j && j.error) || 'The Guide could not be read. Try again in a moment.';
          } else {
            var first = !H.data;
            H.data = j;
            if (!H.page && !H.lesson) { H.page = pageDef().id; place(); }
            if (!H.arrived) { arrive(); }
            if (first) { draw(); settle(); return; }
          }
          draw();
        });
      })
      .catch(function () {
        if (seq !== H.seq) { return; }
        H.loading = false;
        H.error = 'The Guide could not be read. Check the connection and try again.';
        draw();
      });
  }
  /** The first drawing with data: every stage closed, a short list of their names (review 49, problem 324). */
  function arrive() {
    H.arrived = true;
  }
  function place() { if (host().place) { host().place(H.page, H.lesson, H.from); } }

  function save(id, done, skip) {
    var before = H.data.progress[id];
    var saw = H.data.detected && H.data.detected[id];
    if (done) { H.data.progress[id] = (skip ? -1 : 1) * Date.now() / 1000; } else { delete H.data.progress[id]; }
    // Not done in the person's word is not done, whatever Rouh saw (the server keeps it so).
    if (!done && saw) { delete H.data.detected[id]; }
    delete H.failed[id];
    H.said = skip ? 'Left out: not for you.' : done ? 'Marked done.' : 'Marked not done.';
    draw();
    fetch('/api/handholding/progress', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: id, done: !!done, skip: !!skip })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j || !j.progress) { var e = new Error(''); e.said = (j && j.error) || ''; throw e; }
        H.data.progress = j.progress;
        draw();
      });
    }).catch(function (e) {
      if (before !== undefined) { H.data.progress[id] = before; } else { delete H.data.progress[id]; }
      if (saw) { H.data.detected[id] = saw; }
      H.failed[id] = (e && e.said) || 'That could not be saved. Check the connection and try again.';
      H.said = H.failed[id];
      draw();
    });
  }

  /* ---- drawing ---- */

  function draw() {
    var body = $('handholdingBody');
    if (!body || !H.open) { return; }
    var keep = document.activeElement && body.contains(document.activeElement) ? focusKey(document.activeElement) : '';
    var top = body.scrollTop;
    body.textContent = '';
    body.setAttribute('aria-busy', H.loading ? 'true' : 'false');
    var page = el('div', 'hh-page');
    body.appendChild(page);
    if (H.loading && !H.data) { page.appendChild(el('p', 'hh-wait', 'Reading your path')); return; }
    if (!H.data) {
      var e = el('div', 'hh-empty');
      e.appendChild(el('p', 'hh-empty-big', 'The Guide is not here yet'));
      e.appendChild(el('p', 'hh-empty-small', H.error));
      e.appendChild(button('Try again', 'hh-quiet', function () { load(); }));
      page.appendChild(e);
      return;
    }
    var tipX = H.lesson ? find(H.lesson) : null;
    body.classList.toggle('hh-body-tip', !!tipX);
    if (H.lesson) {
      page.appendChild(lessonPage(H.lesson));
    } else {
      var def = pageDef();
      // A page the Guide no longer has (Enabling Rouh, Pro tips) is this one: its address says so.
      if (def.id && H.page !== def.id) { H.page = def.id; place(); }
      (def.views || []).forEach(function (v) {
        var words = (content().sections || {})[v];
        var drawn = VIEWS[v] ? VIEWS[v](words ? { title: words.title, lede: words.lede || '' } : def) : null;
        if (drawn) { page.appendChild(drawn); }
      });
    }
    var live = el('p', 'hh-sr', H.said);
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    page.appendChild(live);
    if (tipX) { body.appendChild(footBar(tipX)); }
    body.scrollTop = top;
    if (H.lesson) { hookReading(); reading(); }
    if (keep) {
      var back = body.querySelector('[data-k="' + keep + '"]');
      if (back) { back.focus({ preventScroll: true }); }
    }
  }
  /** Each control that can hold focus carries a key, so a redraw puts focus back where it was. */
  function focusKey(n) { return (n && n.getAttribute && n.getAttribute('data-k')) || ''; }
  function k(n, key) { n.setAttribute('data-k', key); return n; }

  /** After arriving somewhere: the scroll it had, the card just come back from in view and
      focused, or the top with the heading focused. */
  function settle() {
    var body = $('handholdingBody');
    if (!body) { return; }
    // The card of the lesson just come back from; on a lesson's page, its Next step or Previous.
    var card = H.back ? (body.querySelector('[data-k="card-' + H.back + '"]') ||
                         body.querySelector('a[href^="/guide/lesson/' + H.back + '?"]')) : null;
    var kept = H.scroll[placeKey()];
    if (card) {
      if (kept !== undefined) { body.scrollTop = kept; }
      var r = card.getBoundingClientRect(), b = body.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom) { card.scrollIntoView({ block: 'center' }); }
      card.focus({ preventScroll: true });
    } else {
      body.scrollTop = !H.viaPress && kept !== undefined ? kept : 0;
      var h = body.querySelector('h3[tabindex]');
      if (h) { h.focus({ preventScroll: true }); }
    }
    H.back = '';
    if (H.lesson) { reading(); }
  }

  /* ---- a picture ---- */

  function letter(n) { return String.fromCharCode(64 + Number(n || 1)); }
  function src(p) { return '/static/' + String(p || '').replace(/^\/+/, ''); }
  /** A picture: lazy, its own size kept so nothing jumps, and a designed blank with its words if
      it does not load. With `marks`, numbered callouts drawn over it and the same numbers below. */
  function picture(p, cls, withLegend) {
    // A cut-out of the screen (`cut`) is shown at its own size at most (review 50, problems 407 and 410).
    var fig = el('figure', 'hh-fig' + (cls ? ' ' + cls : '') + (p.cut ? ' hh-cut' : ''));
    var frame = el('div', 'hh-shot');
    if (p.w && p.h) { frame.style.aspectRatio = p.w + ' / ' + p.h; frame.style.setProperty('--hh-ar', String(p.w / p.h)); }
    var im = el('img');
    im.src = src(p.src);
    im.alt = p.alt || '';
    // A picture with numbered callouts is what a step teaches from: loaded at once, never left an empty
    // frame with only its letters while the page waits to scroll to it (review 52, problem 351).
    im.loading = withLegend ? 'eager' : 'lazy';
    im.decoding = 'async';
    if (p.w && p.h) { im.width = p.w; im.height = p.h; }
    // Its letters and rings are shown with the picture, never over an empty frame.
    frame.classList.add('hh-shot-wait');
    im.addEventListener('load', function () { frame.classList.remove('hh-shot-wait'); });
    im.addEventListener('error', function () {
      frame.textContent = '';
      frame.classList.add('hh-shot-none');
      frame.appendChild(glyph('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 15l5-4 4 3 3-2 5 4"/>', 24));
      frame.appendChild(el('span', 'hh-shot-alt', p.alt || 'The picture could not be shown.'));
    });
    frame.appendChild(im);
    var marks = withLegend ? (p.marks || []) : [];
    marks.forEach(function (m) {
      // A ring round what to press (review 52, problem 350): `w` and `h` its size, centred on x and y.
      if (m.ring) {
        var ring = el('span', 'hh-ring');
        ring.style.left = (m.x - m.ring.w / 2) + '%';
        ring.style.top = (m.y - m.ring.h / 2) + '%';
        ring.style.width = m.ring.w + '%';
        ring.style.height = m.ring.h + '%';
        ring.setAttribute('aria-hidden', 'true');
        frame.appendChild(ring);
      }
      // Near an edge, the number goes on the side that has room.
      var dot = el('span', 'hh-dot' + (m.x > 88 ? ' hh-dot-l' : '') + (m.y < 12 ? ' hh-dot-b' : ''));
      dot.appendChild(el('span', 'hh-dot-n', letter(m.n)));
      // A ring's letter sits on its edge, never on the word it rings.
      dot.style.left = (m.ring ? m.x + m.ring.w / 2 : m.x) + '%';
      dot.style.top = (m.ring ? m.y - m.ring.h / 2 : m.y) + '%';
      dot.setAttribute('aria-hidden', 'true');
      frame.appendChild(dot);
    });
    fig.appendChild(frame);
    if (marks.length) {
      var ol = el('ol', 'hh-legend');
      ol.setAttribute('aria-label', 'In the picture');
      marks.forEach(function (m) {
        var li = el('li');
        li.appendChild(el('span', 'hh-legend-n', letter(m.n)));
        li.appendChild(el('span', '', m.label));
        ol.appendChild(li);
      });
      fig.appendChild(ol);
    }
    if (p.caption) { fig.appendChild(el('figcaption', 'hh-cap', p.caption)); }
    return fig;
  }

  /* ---- a lesson's card: a true summary of its page, and the whole card is the link ---- */

  function badge(s) {
    var b = el('span', 'hh-badge hh-badge-' + s.kind);
    var shape = { live: TICK, attention: '<path d="M12 7v6M12 16.5v.5"/>',
                  off: '<circle cx="12" cy="12" r="5"/>', unknown: '<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M12 16.5v.5"/>' };
    if (s.kind !== 'count') { b.appendChild(glyph(shape[s.kind] || shape.unknown, 14)); }
    b.appendChild(el('span', '', s.words));
    return b;
  }
  /** The state of a lesson in words and a shape: Done, Detected, Not for me, Optional, a badge. */
  /** A connection's badge: what Rouh sees, or for one it cannot see (the phone), what was ticked. */
  function connBadge(l) {
    if (l.connection.key) { return status(l.connection.key); }
    return isDone(l) && !skipped(l.id) ? { kind: 'live', words: 'Set up' } : { kind: 'off', words: 'Not set up' };
  }
  function stateChips(l) {
    var w = el('span', 'hh-chips-state');
    // Setup or Pro tip: what kind of tip it is, before its state.
    if (l.tag) { w.appendChild(el('span', 'hh-tag', l.tag)); }
    if (detected(l.id)) {
      var d = el('span', 'hh-state hh-state-done');
      d.appendChild(glyph(TICK, 14));
      d.appendChild(el('span', '', 'Done'));
      w.appendChild(d);
    } else if (skipped(l.id)) {
      w.appendChild(el('span', 'hh-state', 'Not for me'));
    } else if (isDone(l)) {
      var t = el('span', 'hh-state hh-state-done');
      t.appendChild(glyph(TICK, 14));
      t.appendChild(el('span', '', 'Done'));
      w.appendChild(t);
    } else {
      // The one tip to do next, marked in words and a shape of its own (review 50, problem 346).
      var nx = nextTip();
      if (nx && nx.lesson.id === l.id) {
        var n = el('span', 'hh-state hh-state-next');
        n.appendChild(glyph('<path d="M5 12h12M12 7l5 5-5 5"/>', 14));
        n.appendChild(el('span', '', 'Your next tip'));
        w.appendChild(n);
      }
      if (l.optional) { w.appendChild(el('span', 'hh-state', 'Optional')); }
    }
    if (l.connection) { w.appendChild(badge(connBadge(l))); }
    return w;
  }
  /** A tip's symbol: a line drawing on a tile, big enough to read at a card's size (review 49, problem
      325). The screenshots are inside the tip. */
  function art(l) {
    var tile = el('span', 'hh-art');
    tile.setAttribute('aria-hidden', 'true');
    var g = (content().glyphs || {})[l.glyph || ''];
    tile.appendChild(glyph(g || '<circle cx="12" cy="12" r="8"/>', 34));
    return tile;
  }
  /** Where a tip stands in its stage: "Tip 2 of 7". Never out of every tip there is (problem 301). */
  function spot(x) {
    var ls = x.stage.lessons || [];
    var n = 0;
    for (var i = 0; i < ls.length; i++) { if (ls[i].id === x.lesson.id) { n = i + 1; break; } }
    return 'Tip ' + n + ' of ' + ls.length;
  }
  function card(x, from, withStage) {
    var l = x.lesson;
    var nx = nextTip();
    var isNext = !isDone(l) && nx && nx.lesson.id === l.id;
    var a = k(link(lessonHref(l.id, from), '', 'hh-card' + (isDone(l) ? ' done' : '') + (isNext ? ' next' : ''), true), 'card-' + l.id);
    var seen = already(l.id);
    a.setAttribute('aria-label', (isDone(l) ? 'Done. ' : isNext ? 'Your next tip. ' : '') + l.title + '.' +
                   (seen ? ' Already there: ' + seen : ''));
    var tile = art(l);
    // A finished tip carries a green tick on its symbol too, so a glance down the list shows it (problem 398).
    if (isDone(l) && !skipped(l.id)) {
      var tk = el('span', 'hh-art-tick');
      tk.appendChild(glyph(TICK, 14));
      tile.appendChild(tk);
    }
    a.appendChild(tile);
    var w = el('span', 'hh-card-words');
    var meta = el('span', 'hh-card-meta');
    meta.appendChild(el('span', 'hh-card-n', withStage ? stageName(x.stage) + ', ' + spot(x).toLowerCase() : spot(x)));
    meta.appendChild(el('span', 'hh-min', l.minutes + ' min'));
    w.appendChild(meta);
    w.appendChild(el('span', 'hh-card-t', l.title));
    if (detected(l.id)) {
      // Done because Rouh saw it, said in words: what it saw.
      w.appendChild(el('span', 'hh-card-why', 'Done: ' + H.data.detected[l.id]));
    } else if (seen) {
      w.appendChild(el('span', 'hh-card-why', 'Already there: ' + seen + ' It counts as done once you have tried it yourself.'));
    }
    var st = stateChips(l);
    if (st.childNodes.length) { w.appendChild(st); }
    a.appendChild(w);
    return a;
  }

  /* ---- Your path: progress and the next tip, a search, then the stages, each closed until pressed ---- */

  /* The Guide's search reads a question (`rouh/first_help.py`, guide_search): when no tip has every word
     typed, it looks again with only the words that matter, and a word with an ending on it ("reminders")
     is found as the word ("reminder"). The words that only carry a question come in `#rouhFirstHelp`. */
  var ASKED = (function () {
    try {
      var node = document.getElementById('rouhFirstHelp');
      var got = node ? JSON.parse(node.textContent || '{}') : {};
      var on = Array.isArray(got.on) && got.on.indexOf('guide_search') >= 0;
      var stop = {};
      (Array.isArray(got.stop) ? got.stop : []).forEach(function (w) { stop[w] = true; });
      return { on: on, stop: stop, said: '', timer: 0 };
    } catch (e) { return { on: false, stop: {}, said: '', timer: 0 }; }
  }());
  /** The words that matter in a question, each as the start of a word (its ending taken off). */
  function asked(q) {
    var out = [];
    (q.toLowerCase().match(/[a-z0-9]+/g) || []).forEach(function (w) {
      if (w.length < 3 || ASKED.stop[w]) { return; }
      var stem = w.length > 5 ? w.replace(/(ings|ing|ies|es|ed|s)$/, '') : w.replace(/s$/, '');
      if (stem.length >= 3 && out.indexOf(stem) < 0) { out.push(stem); }
    });
    return out;
  }
  /** Said once a question found tips the words as typed did not: counted by the server. */
  function askedUsed(q, n) {
    clearTimeout(ASKED.timer);
    ASKED.timer = setTimeout(function () {
      if (ASKED.said === q) { return; }
      ASKED.said = q;
      fetch('/api/first-help', { method: 'POST', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch: 'guide_search', event: 'found', detail: q.slice(0, 80) + ': ' + n }) })
        .catch(function () {});
    }, 1500);
  }

  /** Every tip whose words have all the words typed, in the order of the path; or, while guide_search is
      on and none has, every tip with all the words that matter in what was typed. */
  function found(q) {
    var got = foundWords(q.toLowerCase().split(/\s+/).filter(Boolean));
    if (got.length || !ASKED.on) { return got; }
    var words = asked(q);
    if (!words.length || words.join(' ') === q.toLowerCase().trim()) { return got; }
    got = foundWords(words);
    if (got.length) { askedUsed(q, got.length); }
    return got;
  }
  function foundWords(words) {
    return all().filter(function (x) {
      var l = x.lesson;
      var hay = [l.title, l.tag || '', (l.summary || []).join(' '), x.stage.title, x.stage.topics || '',
                 (l.says || []).join(' '), (l.parts || []).map(function (p) { return p.name + ' ' + p.text; }).join(' '),
                 howSteps(l).map(function (h) { return typeof h === 'string' ? h : h.text; }).join(' '),
                 (l.keys || []).map(function (r) { return r.join(' '); }).join(' '),
                 (l.points || []).map(function (p) { return p.text; }).join(' '), (l.closing || []).join(' '),
                 (l.sections || []).map(function (c) { return [c.title].concat(c.text || [], c.after || [], (c.swatches || []).map(function (w) { return w.words; })).join(' '); }).join(' ')].join(' ').toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) {
      // A tip whose own title has the words comes before one that only mentions them.
      var ta = words.every(function (w) { return a.lesson.title.toLowerCase().indexOf(w) >= 0; }) ? 0 : 1;
      var tb = words.every(function (w) { return b.lesson.title.toLowerCase().indexOf(w) >= 0; }) ? 0 : 1;
      return ta - tb || a.i - b.i;
    });
  }

  function findBox() {
    var wrap = el('div', 'hh-find');
    var lab = el('label', 'hh-sr', 'Search the tips');
    lab.htmlFor = 'hh-find-box';
    wrap.appendChild(lab);
    wrap.appendChild(glyph('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', 18));
    var box = k(el('input', 'hh-find-box'), 'find');
    box.id = 'hh-find-box';
    box.type = 'search';
    box.placeholder = 'Search tips: rules, email, 30-06';
    box.autocomplete = 'off';
    box.value = H.find;
    box.addEventListener('input', function () {
      var at = box.selectionStart;
      H.find = box.value;
      draw();
      var again = $('hh-find-box');
      if (again) { again.focus({ preventScroll: true }); try { again.setSelectionRange(at, at); } catch (e) { /* a search box may refuse */ } }
    });
    wrap.appendChild(box);
    return wrap;
  }

  /** Where the person stands, above the stages (review 50, problem 346, Petar: "open up guide at the main page
      where you see a good overview of what has been completed and what not. Maybe some slightly different
      indicator telling you what is your next step"): how many tips are done, and the next one, which a press
      shows in its place on the list, its stage opened, rather than opening it, so the list stays the overview. */
  function overview() {
    var list = all();
    var done = list.filter(function (x) { return isDone(x.lesson); }).length;
    var box = el('div', 'hh-overview');
    var top = el('div', 'hh-ov-top');
    var said = el('p', 'hh-ov-count');
    said.appendChild(el('b', '', String(done)));
    said.appendChild(document.createTextNode(' of ' + list.length + ' tips done'));
    top.appendChild(said);
    var bar = el('span', 'hh-bar hh-ov-bar');
    var fill = el('span', 'hh-bar-fill');
    fill.style.width = (list.length ? Math.round(done * 100 / list.length) : 0) + '%';
    bar.appendChild(fill);
    top.appendChild(bar);
    box.appendChild(top);
    var nx = nextTip();
    if (!nx) {
      box.appendChild(el('p', 'hh-ov-next-words', 'Every tip on the path is done.'));
      return box;
    }
    var b = k(button('', 'hh-ov-next', function () { showTip(nx.lesson.id); }), 'ov-next');
    b.appendChild(glyph('<path d="M5 12h12M12 7l5 5-5 5"/>', 18));
    var w = el('span', 'hh-ov-next-w');
    w.appendChild(el('span', 'hh-ov-next-k', done ? 'Your next tip' : 'Start here'));
    w.appendChild(el('span', 'hh-ov-next-t', nx.lesson.title));
    w.appendChild(el('span', 'hh-ov-next-s', stageName(nx.stage)));
    b.appendChild(w);
    b.setAttribute('aria-label', (done ? 'Show your next tip on the list: ' : 'Show where to start on the list: ') +
                   nx.lesson.title + ', ' + stageName(nx.stage));
    box.appendChild(b);
    return box;
  }
  /** A tip's card on the list, its stage opened, brought into view and focused. */
  function showTip(id) {
    var x = find(id);
    if (!x) { return; }
    H.find = '';
    H.stages[x.stage.id] = true;
    draw();
    var c = document.querySelector('[data-k="card-' + id + '"]');
    if (c) {
      c.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      c.focus({ preventScroll: true });
    }
  }

  function pathView(def) {
    var sec = el('section', 'hh-sec hh-path');
    sec.id = 'hh-path';
    sec.setAttribute('aria-labelledby', 'hh-path-h');
    heading(sec, 'hh-path-h', def, 'Your path');
    if (def && def.intro) { sec.appendChild(el('p', 'hh-intro', def.intro)); }
    // Where the person stands and their next tip first, then the search, then the stages (Petar, 23 November 2026).
    sec.appendChild(overview());
    sec.appendChild(findBox());
    var q = H.find.trim();
    if (q) {
      var got = found(q);
      var said = el('p', 'hh-count', got.length ? got.length + ' ' + plural(got.length, 'tip', 'tips') + ' with “' + q + '”'
        : 'No tip has “' + q + '”. Try another word, such as rules, email or task.');
      said.setAttribute('aria-live', 'polite');
      sec.appendChild(said);
      var ul = el('ul', 'hh-cards');
      got.forEach(function (y) {
        var item = el('li');
        item.appendChild(card(y, 'path', true));
        ul.appendChild(item);
      });
      sec.appendChild(ul);
      if (!got.length) {
        sec.appendChild(k(button('Clear the search', 'hh-quiet', function () { H.find = ''; draw(); }), 'find-clear'));
      }
      return sec;
    }
    var ol = el('ol', 'hh-stages');
    (content().stages || []).forEach(function (stage) {
      var sc = stageCounts(stage);
      var open = !!H.stages[stage.id];
      var full = sc.done === sc.all && sc.all;
      var li = el('li', 'hh-stage' + (open ? ' open' : '') + (full ? ' all' : ''));
      li.id = 'hh-stage-' + stage.id;
      var mark = el('span', 'hh-mark');
      mark.setAttribute('aria-hidden', 'true');
      if (full) { mark.appendChild(glyph(TICK, 16)); } else { mark.textContent = String(stage.n); }
      li.appendChild(mark);
      var box = el('div', 'hh-stage-box');
      var hd = el('h4', 'hh-stage-h');
      var t = k(button('', 'hh-stage-t', function () { H.stages[stage.id] = !open; draw(); }), 'stage-' + stage.id);
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.setAttribute('aria-controls', 'hh-stage-body-' + stage.id);
      var tw = el('span', 'hh-stage-words');
      tw.appendChild(el('span', 'hh-stage-n', 'Topic ' + stage.n));
      tw.appendChild(el('span', 'hh-stage-name', stage.title));
      // What is inside, in plain words, so the right stage is found without opening each (problem 412).
      if (stage.topics) { tw.appendChild(el('span', 'hh-stage-topics', stage.topics)); }
      t.appendChild(tw);
      var meter = el('span', 'hh-stage-meter');
      meter.appendChild(el('span', 'hh-stage-count', sc.done + ' of ' + sc.all + ' done'));
      // One mark per tip, in order: a green tick for each done, a ring for the next (review 50, problem 398).
      var pips = el('span', 'hh-pips');
      pips.setAttribute('aria-hidden', 'true');
      var nxt = nextTip();
      (stage.lessons || []).forEach(function (les) {
        var d = isDone(les);
        var pip = el('span', 'hh-pip' + (d ? ' done' : nxt && nxt.lesson.id === les.id ? ' next' : ''));
        if (d) { pip.appendChild(glyph(TICK, 10)); }
        pips.appendChild(pip);
      });
      meter.appendChild(pips);
      if (nxt && nxt.stage.id === stage.id && !full) {
        tw.appendChild(el('span', 'hh-stage-next', 'Your next tip is in this topic'));
      }
      t.appendChild(meter);
      t.appendChild(glyph('<path d="M7 10l5 5 5-5"/>', 18));
      hd.appendChild(t);
      box.appendChild(hd);
      var body = el('div', 'hh-stage-body');
      body.id = 'hh-stage-body-' + stage.id;
      body.hidden = !open;
      if (open) {
        var grid = el('ul', 'hh-cards');
        all().filter(function (y) { return y.stage.id === stage.id; }).forEach(function (y) {
          var item = el('li');
          item.appendChild(card(y, 'path'));
          grid.appendChild(item);
        });
        body.appendChild(grid);
      }
      box.appendChild(body);
      li.appendChild(box);
      ol.appendChild(li);
    });
    sec.appendChild(ol);
    return sec;
  }

  /* ---- a feature's switch, on its own tip (on Enabling Rouh until 23 November 2026) ----
     Each read and flipped through the very address its own Settings page uses. */
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j) { throw new Error((j && j.error) || ''); }
        return j;
      });
    });
  }
  function postJSON(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j) { throw new Error((j && j.error) || ''); }
          return j;
        });
      });
  }
  var SWITCHES = {
    // Anatomy, Meta, What Rouh keeps and runs, and the Heartbeat's own settings (`rouh/lean.py`).
    heartbeat: {
      read: function () {
        return getJSON('/api/anatomy/keeps').then(function (j) {
          var it = (j.items || []).filter(function (x) { return x.id === 'heartbeat'; })[0];
          if (!it) { throw new Error(''); }
          return { on: it.mode === 'on' };
        });
      },
      write: function (on) { return postJSON('/api/anatomy/keeps', { item: 'heartbeat', mode: on ? 'on' : 'off', where: 'heartbeat' }); }
    },
    // Anatomy, Behaviour, Morning brief settings (`rouh/morning_brief.py`).
    brief: {
      read: function () { return getJSON('/api/settings/brief').then(function (j) { return { on: !!j.on }; }); },
      write: function (on) { return postJSON('/api/settings/brief', { on: !!on }); }
    },
    // Connections, Email and calendar, New mail (`rouh/mail_alerts.py`).
    mail_alerts: {
      read: function () {
        return getJSON('/api/settings/mail-alerts').then(function (j) {
          var a = j.alerts || {};
          return { on: !!a.on, why: a.on ? '' : (a.why_not || '') };
        });
      },
      write: function (on) { return postJSON('/api/settings/mail-alerts/' + (on ? 'on' : 'off'), {}); }
    }
  };
  function readFeatures() {
    H.featRead = true;
    (content().features || []).forEach(function (f) {
      var sw = SWITCHES[f.switch];
      if (!sw) { H.feat[f.id] = { failed: true }; return; }
      H.feat[f.id] = { loading: true };
      sw.read().then(function (got) { H.feat[f.id] = got; draw(); })
        .catch(function () { H.feat[f.id] = { failed: true }; draw(); });
    });
  }
  function flip(f, on) {
    var sw = SWITCHES[f.switch];
    var st = H.feat[f.id] || {};
    st.busy = true;
    st.said = '';
    H.feat[f.id] = st;
    draw();
    sw.write(on).then(function (j) {
      return sw.read().then(function (got) {
        got.said = (j && j.said) || (f.name + ' is ' + (got.on ? 'on' : 'off') + '.');
        H.feat[f.id] = got;
        H.said = got.said;
        draw();
      });
    }).catch(function (e) {
      st.busy = false;
      st.said = (e && e.message) || 'That could not be changed here. Open its Settings page and try there.';
      st.bad = true;
      H.said = st.said;
      draw();
    });
  }
  /** The real switch of a feature, on the tip about it: its name, the switch and its state. */
  function featurePanel(f) {
    if (!H.featRead) { readFeatures(); }
    var st = H.feat[f.id] || { loading: true };
    var li = el('section', 'hh-feat');
    li.setAttribute('aria-labelledby', 'hh-feat-' + f.id);
    var top = el('div', 'hh-feat-top');
    var words = el('div', 'hh-feat-words');
    var name = el('h4', 'hh-h3', f.name);
    name.id = 'hh-feat-' + f.id;
    words.appendChild(name);
    top.appendChild(words);
    var ctl = el('div', 'hh-feat-ctl');
    if (st.loading) {
      ctl.appendChild(el('span', 'hh-feat-state', 'Reading'));
    } else if (st.failed) {
      ctl.appendChild(badge({ kind: 'unknown', words: 'Status unknown' }));
    } else {
      var b = k(button('', 'hh-switch' + (st.on ? ' on' : ''), function () { flip(f, !st.on); }), 'sw-' + f.id);
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', st.on ? 'true' : 'false');
      b.setAttribute('aria-labelledby', 'hh-feat-' + f.id);
      b.disabled = !!st.busy || (!st.on && !!st.why);
      b.appendChild(el('span', 'hh-switch-knob'));
      ctl.appendChild(b);
      ctl.appendChild(el('span', 'hh-feat-state', st.busy ? 'Changing' : st.on ? 'On' : 'Off'));
    }
    top.appendChild(ctl);
    li.appendChild(top);
    if (st.failed) {
      li.appendChild(el('p', 'hh-feat-note', 'Rouh could not read this setting here, so there is no switch for it. Its own page has it.'));
    } else if (!st.loading && !st.on && st.why) {
      li.appendChild(el('p', 'hh-feat-note', st.why));
    } else if (!st.loading && !st.on && f.off) {
      li.appendChild(el('p', 'hh-feat-note', f.off));
    }
    if (st.said) { li.appendChild(el('p', 'hh-feat-note' + (st.bad ? ' hh-feat-bad' : ''), st.said)); }
    return li;
  }

  /** A tip's numbered points, each in its own words. */
  function pointsList(l) {
    var ol = el('ol', 'hh-points');
    l.points.forEach(function (pt, i) {
      var li = k(el('li'), 'point-' + i);
      li.appendChild(document.createTextNode(pt.text));
      ol.appendChild(li);
    });
    return ol;
  }

  /** The marks of the orb's twigs, drawn, never a character a font may not have. */
  var SHAPES = {
    chevron: '<path d="M9 6l6 6-6 6"/>',
    square: '<rect x="6" y="6" width="12" height="12"/>',
    triangle: '<path d="M12 5l7 13H5z" fill="currentColor"/>',
    bars: '<path d="M9 5v14M15 5v14"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
    diamond: '<path d="M12 4l8 8-8 8-8-8z"/>',
    ring: '<circle cx="12" cy="12" r="6"/>',
    filled: '<rect x="6" y="6" width="12" height="12" fill="currentColor"/>'
  };
  /** A legend: each colour as a short line with its mark, and what it stands for. */
  function swatchList(rows, label) {
    var ul = el('ul', 'hh-swatches');
    if (label) { ul.setAttribute('aria-label', label); }
    rows.forEach(function (r) {
      var li = el('li');
      var sw = el('span', 'hh-swatch' + (r.dashed ? ' dashed' : ''));
      sw.setAttribute('aria-hidden', 'true');
      sw.style.setProperty('--sw', r.color);
      var mk = el('span', 'hh-swatch-mark');
      mk.style.color = r.color;
      if (SHAPES[r.mark]) { mk.appendChild(glyph(SHAPES[r.mark], 14)); }
      sw.appendChild(mk);
      li.appendChild(sw);
      li.appendChild(el('span', 'hh-swatch-t', r.words));
      ul.appendChild(li);
    });
    return ul;
  }

  /** A tip's table of keys: what to press, and what it does. */
  function keysTable(rows) {
    var box = el('div', 'hh-keys-box');
    var t = el('table', 'hh-keys');
    var hd = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', '', 'Press'));
    hr.appendChild(el('th', '', 'What it does'));
    hd.appendChild(hr);
    t.appendChild(hd);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      var kc = el('td');
      kc.appendChild(el('kbd', 'hh-kbd', r[0]));
      tr.appendChild(kc);
      tr.appendChild(el('td', '', r[1]));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.appendChild(t);
    return box;
  }

  /** Things you can say: plain words in two light columns, nothing to press. */
  function says(list, cls) {
    var ul = el('ul', 'hh-says' + (cls ? ' ' + cls : ''));
    list.forEach(function (s) { ul.appendChild(el('li', '', '“' + s + '”')); });
    return ul;
  }

  /* ---- words explained where they stand (review 49, problem 433) ----
     Petar, 22 November 2026: "as a rule, we should attempt to not mention terms that are a later lesson. or
     we should have a hover/click with definition/explanation. or both of those." Both: a card's words keep
     to plain words (the data file's `terms_note`), and on a tip's page the first time a word of Rouh's own
     (`terms` in the data file) stands in a tip other than the one that teaches it, it is a button that opens
     what it means in plain words, with the tip that teaches it. Its meaning is its hover too. */

  function terms() { return content().terms || {}; }
  /** One paragraph's words, with each Rouh word not yet explained on this page made a button; what a word
      means opens under the paragraph, so the sentence is never cut in two. */
  function rich(tag, cls, text, me, used) {
    var out = document.createDocumentFragment();
    var p = el(tag, cls);
    out.appendChild(p);
    var after = [];
    var t = terms(), names = Object.keys(t).filter(function (w) { return t[w] && t[w].lesson !== me && !used[w.toLowerCase()]; });
    var rest = String(text || '');
    while (names.length) {
      var best = null;
      names.forEach(function (w) {
        // A word marked `case` is only itself with its capital: Boxes, the safe, never a message box.
        var m = new RegExp('\\b(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')s?\\b', t[w].case ? '' : 'i').exec(rest);
        if (m && (!best || m.index < best.m.index)) { best = { w: w, m: m }; }
      });
      if (!best) { break; }
      used[best.w.toLowerCase()] = true;
      names = names.filter(function (w) { return w !== best.w; });
      p.appendChild(document.createTextNode(rest.slice(0, best.m.index)));
      var tb = termButton(best.m[0], best.w, t[best.w]);
      p.appendChild(tb.button);
      after.push(tb.means);
      rest = rest.slice(best.m.index + best.m[0].length);
    }
    p.appendChild(document.createTextNode(rest));
    after.forEach(function (m) { out.appendChild(m); });
    return out;
  }
  var termSeq = 0;
  /** The hover of a word of Rouh's own: its name and what it means, in the look of every first-use tip. */
  var TT = { el: null };
  function termTip(b, key, def) {
    if (!TT.el) {
      TT.el = el('div', 'first-tip hh-termtip');
      TT.el.setAttribute('role', 'tooltip');
      TT.el.id = 'hh-termtip';
      document.body.appendChild(TT.el);
    }
    var t = TT.el;
    t.textContent = '';
    t.appendChild(el('b', 'first-tip-name', key.charAt(0).toUpperCase() + key.slice(1)));
    t.appendChild(el('span', 'first-tip-text', def.means));
    t.hidden = false;
    var r = b.getBoundingClientRect();
    var w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
    var y = r.top - h - 8;
    t.style.top = Math.round(y >= 8 ? y : r.bottom + 8) + 'px';
    b.setAttribute('aria-describedby', 'hh-termtip');
  }
  function termTipHide() { if (TT.el) { TT.el.hidden = true; } }
  function termButton(said, key, def) {
    var id = 'hh-term-' + (++termSeq);
    var b = k(button(said, 'hh-term', function () {
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      means.hidden = !open;
    }), 'term-' + key.toLowerCase());
    // Its meaning is its hover at a desk (review 50, problem 348: "keep the words, let's have definitions as
    // hovers"); on a phone a tap opens it under the paragraph, as a press does anywhere.
    b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { termTip(b, key, def); } });
    b.addEventListener('pointerleave', termTipHide);
    b.addEventListener('focus', function () { if (b.matches(':focus-visible')) { termTip(b, key, def); } });
    b.addEventListener('blur', termTipHide);
    b.addEventListener('click', termTipHide);
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', id);
    var means = el('p', 'hh-term-means');
    means.id = id;
    means.hidden = true;
    means.appendChild(el('span', '', def.means + ' '));
    return { button: b, means: means };
  }

  /* ---- one lesson's page ---- */

  /** What Rouh already remembers of the person, in one line, with the page that lists it (review 49,
      problem 428): the rules they gave it and the words it knows of theirs, counted by the server. */
  function remembers() {
    var r = (H.data && H.data.remembers) || null;
    var p = el('p', 'hh-remembers');
    if (!r) {
      p.appendChild(el('span', '', 'Everything Rouh keeps of you is on your rules page. '));
    } else {
      var n = r.rules || 0, w = r.words || 0;
      var said = n ? 'Rouh already keeps ' + n + ' ' + plural(n, 'rule', 'rules') + ' you gave it'
        : 'Rouh keeps no rule of yours yet: the ones you give appear on your rules page';
      said += w ? (n ? ', and knows ' : '. It knows ') + w + ' ' + plural(w, 'word', 'words') + ' of yours. ' : '. ';
      p.appendChild(el('span', '', said));
    }
    p.appendChild(k(away('/rules?mine=1', 'See your rules'), 'remembers'));
    if (r && r.words) {
      p.appendChild(el('span', '', ' · '));
      p.appendChild(k(away('/synapse/vocabulary', 'See your words'), 'remembers-words'));
    }
    return p;
  }

  function lessonPage(id) {
    var x = find(id);
    var wrap = el('article', 'hh-lesson');
    var from = origin(H.from, x);
    var back = k(button('', 'hh-back', goBack), 'back');
    back.appendChild(glyph('<path d="M15 6l-6 6 6 6"/>', 18));
    back.appendChild(el('span', '', 'Back'));
    back.setAttribute('aria-label', 'Back to ' + from.words);
    back.title = 'Back to ' + from.words;
    back.setAttribute('aria-keyshortcuts', 'Escape');
    if (!x) {
      wrap.appendChild(crumbs(null));
      var e = el('div', 'hh-empty');
      e.appendChild(el('p', 'hh-empty-big', 'There is no such tip'));
      e.appendChild(el('p', 'hh-empty-small', 'It may have been renamed. Every tip is on your path.'));
      var p = pageWith('path');
      if (p) { e.appendChild(k(link('/guide/' + p.id, 'Open your path', 'hh-quiet'), 'nolesson')); }
      wrap.appendChild(e);
      return wrap;
    }
    var l = x.lesson;
    var top = el('div', 'hh-ltop');
    top.appendChild(back);
    top.appendChild(crumbs(x));
    wrap.appendChild(top);
    var on = orbNote();
    if (on) { wrap.appendChild(on); }
    if (l.cover) { wrap.appendChild(picture(l.cover, 'hh-cover', false)); }
    var head = el('header', 'hh-lhead');
    var meta = el('p', 'hh-lmeta');
    meta.appendChild(el('span', '', stageName(x.stage) + ', ' + spot(x).toLowerCase()));
    meta.appendChild(el('span', '', 'About ' + l.minutes + ' ' + plural(l.minutes, 'minute', 'minutes')));
    if (l.optional) { meta.appendChild(el('span', '', 'Optional')); }
    if (l.tag) { meta.appendChild(el('span', 'hh-tag', l.tag)); }
    var h = k(el('h3', 'hh-h1', l.title), 'h-lesson');
    h.setAttribute('tabindex', '-1');
    h.id = 'hh-lesson-h';
    head.appendChild(h);
    // Under the title, quiet. A tip has no line of what it teaches, and links to no other tip: only
    // Back and the breadcrumbs above, and Previous and Done, next below, move between tips (Petar, 23 November 2026).
    head.appendChild(meta);
    wrap.appendChild(head);
    var used = {};
    (l.summary || []).forEach(function (s) { wrap.appendChild(rich('p', 'hh-para', s, l.id, used)); });
    if (l.points && l.points.length) { wrap.appendChild(pointsList(l)); }
    // A tip in sections, each a heading, its words, a picture and a legend of colours and marks.
    (l.sections || []).forEach(function (sc, i) {
      var h = k(el('h4', 'hh-h2', sc.title), 'section-' + i);
      wrap.appendChild(h);
      (sc.text || []).forEach(function (t) { wrap.appendChild(rich('p', 'hh-para', t, l.id, used)); });
      if (sc.image) { wrap.appendChild(picture(sc.image, 'hh-secfig', true)); }
      if (sc.swatches && sc.swatches.length) { wrap.appendChild(swatchList(sc.swatches, sc.swatches_label)); }
      (sc.after || []).forEach(function (t) { wrap.appendChild(rich('p', 'hh-para', t, l.id, used)); });
    });
    (l.closing || []).forEach(function (c) { wrap.appendChild(el('p', 'hh-para', c)); });
    if (l.keys && l.keys.length) { wrap.appendChild(keysTable(l.keys)); }
    var feat = l.feature ? (content().features || []).filter(function (f) { return f.id === l.feature; })[0] : null;
    if (feat) { wrap.appendChild(featurePanel(feat)); }
    if (l.remembers) { wrap.appendChild(remembers()); }
    if (l.connection) { wrap.appendChild(connectionFacts(l)); }
    if (l.parts && l.parts.length) { wrap.appendChild(partsList(l, used)); }
    if (l.how_tabs && l.how_tabs.length) {
      wrap.appendChild(el('h4', 'hh-h2', 'How'));
      wrap.appendChild(howTabs(l, used));
    } else if (l.how && l.how.length) {
      var hh = el('h4', 'hh-h2', 'How');
      wrap.appendChild(hh);
      wrap.appendChild(howList(l, l.how, used, 'how-'));
    }
    if (l.says && l.says.length) {
      var sh = el('h4', 'hh-h2', 'Things you can say');
      wrap.appendChild(sh);
      if (H.data && H.data.chat) { wrap.appendChild(noChat(l, H.data.chat)); }
      var note = content().talk_note;
      // Where to say it, on every tip but the one that teaches it (`not_on`).
      if (l.talk && note && note.not_on !== l.id) { wrap.appendChild(el('p', 'hh-talknote', note.text)); }
      // Samples, said to be samples (review 49, problem 436): never somebody else's work seen as one's own.
      wrap.appendChild(el('p', 'hh-talknote', 'Examples only: say them with your own names, tasks and times.'));
      wrap.appendChild(says(l.says));
    }
    if (l.open && l.open.href) {
      var op = el('p', 'hh-open');
      var oa = k(away(l.open.href, l.open.words || 'Open ' + l.open.label, 'hh-quiet hh-away-btn'), 'open');
      op.appendChild(oa);
      wrap.appendChild(op);
    }
    var nt = tipNote(l);
    if (nt) { wrap.appendChild(nt); }
    // Where the tip's words end: the reading line is measured to here.
    wrap.appendChild(el('div', 'hh-end'));
    return wrap;
  }

  /** The numbered steps of a tip's How. */
  function howList(l, steps, used, key) {
    var ol = el('ol', 'hh-how');
    steps.forEach(function (s, i) {
      var li = el('li');
      var words = typeof s === 'string' ? s : s.text;
      li.appendChild(rich('p', 'hh-how-t', words, l.id, used));
      if (s && s.image) { li.appendChild(picture(s.image, '', true)); }
      k(li, key + i);
      ol.appendChild(li);
    });
    return ol;
  }
  /** Every step of a tip's How, in one list: its own, or every tab's (`how_tabs`). */
  function howSteps(l) {
    if (l.how_tabs && l.how_tabs.length) {
      return [].concat.apply([], l.how_tabs.map(function (t) { return t.how || []; }));
    }
    return l.how || [];
  }
  /** A phone, or a tablet: the tab a tip's How opens on there (review 52, problem 353). */
  function onPhone() {
    return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(max-width: 600px)').matches));
  }
  /** A How in tabs, one for a phone and one for a computer (Petar, 23 November 2026, review 52 of the
      Guide, problem 353: "have 2 tabs to split between mobile and desktop. show default open the one at
      which the person is using it"). The tab picked is kept while the page is open. */
  function howTabs(l, used) {
    H.howTab = H.howTab || {};
    var tabs = l.how_tabs;
    var mine = tabs.filter(function (t) { return t.id === (onPhone() ? 'phone' : 'desk'); })[0] || tabs[0];
    var on = H.howTab[l.id] || mine.id;
    var box = el('div', 'hh-tabs');
    var bar = el('div', 'hh-tabbar');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'How, on a phone or on a computer');
    box.appendChild(bar);
    var btns = [], panels = [];
    function choose(id, focus) {
      H.howTab[l.id] = id;
      tabs.forEach(function (t, i) {
        var sel = t.id === id;
        btns[i].setAttribute('aria-selected', sel ? 'true' : 'false');
        btns[i].tabIndex = sel ? 0 : -1;
        panels[i].hidden = !sel;
        if (sel && focus) { btns[i].focus(); }
      });
    }
    tabs.forEach(function (t, i) {
      var b = k(el('button', 'hh-tab'), 'howtab-' + t.id);
      b.type = 'button';
      b.id = 'hh-howtab-' + l.id + '-' + t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'hh-howpanel-' + l.id + '-' + t.id);
      b.appendChild(el('span', '', t.name));
      if (t.id === mine.id) { b.appendChild(el('span', 'hh-tab-note', 'you are on this')); }
      b.addEventListener('click', function () { choose(t.id, false); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { return; }
        e.preventDefault();
        choose(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id, true);
      });
      bar.appendChild(b);
      btns.push(b);
      var panel = el('div', 'hh-tabpanel');
      panel.id = 'hh-howpanel-' + l.id + '-' + t.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', b.id);
      panel.appendChild(howList(l, t.how || [], used, 'how-' + t.id + '-'));
      box.appendChild(panel);
      panels.push(panel);
    });
    choose(on, false);
    return box;
  }

  /** While the chat cannot answer (review 51, problem 372): said in plain words, the one button that
      sets it up, and another way to do this lesson without it - its own words, else its own page. */
  function noChat(l, chat) {
    var box = k(el('div', 'hh-nochat'), 'nochat');
    box.setAttribute('role', 'note');
    box.appendChild(el('p', 'hh-nochat-head', 'The chat cannot answer yet'));
    box.appendChild(el('p', 'hh-nochat-t', chat.said + ' ' + chat.cost));
    var go = k(link(chat.href, chat.button, 'hh-main hh-nochat-go'), 'nochat-go');
    box.appendChild(go);
    var other = l.without_chat || (l.open && l.open.href
      ? 'Without the chat, you can still look at it on its own page:'
      : 'This one is done by talking to Rouh, so it waits until the chat is set up.');
    var p = el('p', 'hh-nochat-t hh-nochat-other');
    p.appendChild(el('span', '', other + ' '));
    if (!l.without_chat && l.open && l.open.href) {
      p.appendChild(k(link(l.open.href, l.open.words || 'Open ' + l.open.label, 'hh-link'), 'nochat-open'));
    }
    box.appendChild(p);
    return box;
  }

  /** Guide > Stage > Lesson. */
  function crumbs(x) {
    var nav = el('nav', 'hh-crumbs');
    nav.setAttribute('aria-label', 'Breadcrumbs');
    var ol = el('ol');
    var path = pageWith('path');
    var li = el('li');
    li.appendChild(k(link('/guide/' + (path ? path.id : ''), 'Guide', 'hh-crumb', true), 'crumb-root'));
    ol.appendChild(li);
    if (x) {
      var st = el('li');
      var a = k(link('/guide/' + (path ? path.id : ''), stageName(x.stage), 'hh-crumb', true), 'crumb-stage');
      a.addEventListener('click', function () { H.stages[x.stage.id] = true; H.back = x.lesson.id; }, true);
      st.appendChild(a);
      ol.appendChild(st);
      var me = el('li');
      var here = el('span', 'hh-crumb-here', x.lesson.title);
      here.setAttribute('aria-current', 'page');
      me.appendChild(here);
      ol.appendChild(me);
    }
    nav.appendChild(ol);
    return nav;
  }

  function goBack() {
    var x = find(H.lesson);
    var o = origin(H.from, x);
    if (H.viaPress && window.history.length > 1) {
      remember();
      H.back = H.lesson;
      if (x) { H.stages[x.stage.id] = true; }
      window.history.back();
      return;
    }
    if (o.stage) { H.stages[o.stage] = true; }
    // Back to Your path lands on the list, with this tip's stage open and its card in view (review 50,
    // problem 397), never on the top of the page.
    var path = pageWith('path');
    if (x && path && o.href === '/guide/' + path.id) { H.stages[x.stage.id] = true; }
    H.back = H.lesson;
    go(o.href, false);
  }

  function connectionFacts(l) {
    var c = l.connection;
    var box = el('div', 'hh-conn');
    var s = c.key ? status(c.key) : null;
    var row = el('div', 'hh-conn-row');
    row.appendChild(el('span', 'hh-k', 'This connection now'));
    if (s) { row.appendChild(badge(s)); } else { row.appendChild(el('span', 'hh-k', 'Rouh cannot see this one for itself: tick it when it works.')); }
    box.appendChild(row);
    if (s && s.said) { box.appendChild(el('p', 'hh-said hh-said-' + s.kind, s.said)); }
    if (c.needs) {
      var dl = el('dl', 'hh-facts');
      var f = el('div', 'hh-fact');
      f.appendChild(el('dt', '', 'What you need'));
      f.appendChild(el('dd', '', c.needs));
      dl.appendChild(f);
      box.appendChild(dl);
    }
    return box;
  }

  function partsList(l, used) {
    var ul = el('ul', 'hh-parts');
    l.parts.forEach(function (p, i) {
      var li = el('li', 'hh-part');
      li.appendChild(el('h4', 'hh-h3', p.name));
      // Rouh's own words in a part are explained where they stand, as in the tip's other words (problem 348).
      li.appendChild(rich('p', 'hh-part-t', p.text, l.id, used));
      if (p.open) {
        var a = p.open.href ? away(p.open.href, 'Open ' + p.open.label) : null;
        if (a) { li.appendChild(k(a, 'part-' + i)); }
      }
      ul.appendChild(li);
    });
    return ul;
  }

  /** Mark done, on the page itself, always there (review 49, problem 429: "Keep the done/not done toggle
      always visible, even if task is completed"). A tip Rouh saw done is shown pressed, with what it saw,
      and pressing it marks it not done, which the server keeps as the person's word over what it saw; a
      connection is done while Rouh sees it connected, so its toggle is shown and cannot be pressed. */
  /** What the bar cannot say in two words, under the tip's words, never a card (Petar, 23 November 2026):
      why it is done or ticks itself, Not for me on an optional tip, and a save that failed. */
  function tipNote(l) {
    var box = el('div', 'hh-tipnote');
    var seenDone = detected(l.id);
    var conn = /^connection:/.test(l.detect || '');
    var on = seenDone || ticked(l.id);
    if (skipped(l.id)) {
      box.appendChild(el('p', 'hh-done-hint', 'Not for me: you left this one out.'));
      box.appendChild(k(button('I want this after all', 'hh-quiet hh-small', function () { save(l.id, false); }), 'unskip'));
    } else {
      var why = '';
      if (seenDone && conn) { why = 'Rouh sees it connected, so it stays done while it is.'; }
      else if (seenDone) { why = 'Rouh saw it: ' + H.data.detected[l.id]; }
      else if (liveOnly(l)) { why = 'This tip is done when Rouh sees the connection working. It ticks itself.'; }
      else if (already(l.id)) { why = 'Already there: ' + already(l.id) + ' It counts as done once you have tried it yourself.'; }
      if (why) { box.appendChild(el('p', 'hh-done-hint', why)); }
      if (l.optional && !on) {
        box.appendChild(k(button('Not for me', 'hh-quiet hh-small', function () { save(l.id, true, true); }), 'skip'));
      }
    }
    if (H.failed[l.id]) { box.appendChild(el('p', 'hh-failed', H.failed[l.id])); }
    return box.childNodes.length ? box : null;
  }

  /* ---- the reading line (review 50, problems 404 and 405) ----
     Petar: "as you scroll a line increases to show you how far you are from that article". A thin line along the
     top edge of the bar at the tip's foot (23 November 2026) fills as the tip is read, to the end of its words;
     a tip that is done has it full and green, whenever it is opened again. */
  function readLine(l) {
    var bar = el('div', 'hh-read');
    var track = el('div', 'hh-read-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'How far through this tip you are');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.appendChild(el('div', 'hh-read-fill'));
    bar.appendChild(track);
    if (isDone(l)) { bar.classList.add('is-done'); }
    return bar;
  }
  /** How far the tip is read: the top of the bar against the end of the tip's words. Changes only classes and
      one width, so it runs on every scroll without drawing the page again. */
  function reading() {
    var body = $('handholdingBody');
    var bar = body && body.querySelector('.hh-read');
    var foot = body && body.querySelector('.hh-tipbar');
    var end = body && body.querySelector('.hh-end');
    var art = body && body.querySelector('.hh-lesson');
    if (!body || !bar || !foot || !end || !art) { return; }
    var b = body.getBoundingClientRect();
    var seen = Math.min(b.bottom, foot.getBoundingClientRect().top);
    var start = art.getBoundingClientRect().top;
    var stop = end.getBoundingClientRect().top;
    var total = stop - start - (seen - b.top);
    var got = total <= 0 ? 1 : Math.max(0, Math.min(1, (b.top - start) / total));
    if (stop <= seen + 2) { got = 1; }
    var pct = Math.round(got * 100);
    var fill = bar.querySelector('.hh-read-fill');
    if (fill) { /** @type {HTMLElement} */ (fill).style.width = (bar.classList.contains('is-done') ? 100 : pct) + '%'; }
    var track = bar.querySelector('.hh-read-track');
    if (track) { track.setAttribute('aria-valuenow', String(bar.classList.contains('is-done') ? 100 : pct)); }
  }
  var readHooked = false;
  function hookReading() {
    var body = $('handholdingBody');
    if (!body || readHooked) { return; }
    readHooked = true;
    body.addEventListener('scroll', reading, { passive: true });
    body.addEventListener('scroll', termTipHide, { passive: true });
    window.addEventListener('resize', reading);
    // A picture arriving makes the page longer.
    body.addEventListener('load', reading, true);
  }

  /* ---- the orb, which can be slid aside (review 50, problem 347) ----
     Petar: "we keep the orb where it is and how it behaves. rather we have to let people know they can slide it
     to the right side when they need." One quiet line at the top of the Guide's pages but Your path says so, until the person
     presses Got it or slides the orb to the right, which is the lesson learned (app/orb.js keeps the side). */
  var ORB_SIDE = 'rouh.orb.side.v1';
  var ORB_NOTE = 'rouh.guide.orbnote.v1';
  function stored(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function orbNote() {
    if (stored(ORB_SIDE) === 'right' || stored(ORB_NOTE)) { return null; }
    var box = el('div', 'hh-orbnote');
    var mark = el('span', 'hh-orbnote-mark');
    mark.setAttribute('aria-hidden', 'true');
    box.appendChild(mark);
    box.appendChild(el('p', 'hh-orbnote-t', 'Is the round button in the corner covering words? Drag it to the right side of the screen. It stays there until you drag it back.'));
    box.appendChild(k(button('Got it', 'hh-quiet hh-small', function () {
      try { localStorage.setItem(ORB_NOTE, '1'); } catch (e) { /* this visit only */ }
      draw();
    }), 'orbnote'));
    return box;
  }

  /** The one bar held at the foot of every tip (Petar, 23 November 2026), in place of Mark done twice over and
      the Previous and Next cards: the reading line along its top edge; Previous on the left (none on the first
      tip); on the right the one button, Done, next with the next tip's title, which marks this tip done and
      opens the next. Next is never locked. On a stage's last tip it says Done, finish stage, and after the last
      stage it goes back to the Guide's main page. A tip already done says Next, with a small Done that a press
      takes back. Opening a tip marks nothing: only this button does. */
  function footBar(x) {
    var l = x.lesson;
    var list = all();
    var nx = list[x.i + 1], pv = list[x.i - 1];
    var bar = el('nav', 'hh-tipbar');
    bar.setAttribute('aria-label', 'This tip and the next');
    bar.appendChild(readLine(l));
    var row = el('div', 'hh-tipbar-row');
    if (pv) {
      var p = k(link(lessonHref(pv.lesson.id, 'lesson-' + l.id), '', 'hh-tipbar-prev', true), 'prev');
      p.appendChild(glyph('<path d="M15 6l-6 6 6 6"/>', 18));
      p.appendChild(el('span', '', 'Previous'));
      p.setAttribute('aria-label', 'Previous tip: ' + pv.lesson.title);
      p.title = pv.lesson.title;
      row.appendChild(p);
    }
    var seenDone = detected(l.id);
    var conn = /^connection:/.test(l.detect || '');
    var on = seenDone || ticked(l.id);
    var held = seenDone && conn;
    // Done by this press: not a tip that ticks itself, nor one left out, nor one done already.
    var marks = !on && !skipped(l.id) && !liveOnly(l);
    var end = el('div', 'hh-tipbar-end');
    if (on) {
      var d = k(button('', 'hh-tipbar-done', function () { if (!held) { save(l.id, false); } }), 'undone');
      d.appendChild(el('span', '', 'Done'));
      d.appendChild(glyph(TICK, 14));
      if (held) {
        d.setAttribute('aria-disabled', 'true');
        d.title = 'Rouh sees it connected, so it stays done while it is.';
        d.setAttribute('aria-label', 'Done: Rouh sees it connected');
      } else {
        d.title = 'Press to mark it not done';
        d.setAttribute('aria-label', 'Done. Press to mark it not done');
      }
      end.appendChild(d);
    }
    var lastOfStage = !nx || nx.stage.id !== x.stage.id;
    var path = pageWith('path');
    var href = nx ? lessonHref(nx.lesson.id, 'lesson-' + l.id) : '/guide/' + (path ? path.id : '');
    var said = marks ? (lastOfStage ? 'Done, finish topic' : 'Done, next') : 'Next';
    var title = nx ? nx.lesson.title : 'Back to the guide';
    var b = k(button('', 'hh-tipbar-next', function () {
      if (marks) { save(l.id, true); }
      // After the last stage: the main page, this tip's stage open and its card in view.
      if (!nx) { H.back = l.id; H.stages[x.stage.id] = true; }
      go(href, true);
    }), 'next');
    var w = el('span', 'hh-tipbar-words');
    w.appendChild(el('span', 'hh-tipbar-k', said));
    w.appendChild(el('span', 'hh-tipbar-t', title));
    b.appendChild(w);
    b.appendChild(glyph('<path d="M9 6l6 6-6 6"/>', 18));
    b.setAttribute('aria-label', said + ': ' + title);
    end.appendChild(b);
    row.appendChild(end);
    bar.appendChild(row);
    return bar;
  }

  /** A page's own heading and line, from the data file. `sub` draws it one size down. */
  function heading(sec, id, def, fallback, sub) {
    var h = k(el('h3', sub ? 'hh-h2' : 'hh-h1', (def && def.title) || fallback), 'h-' + id);
    h.id = id;
    h.setAttribute('tabindex', '-1');
    sec.appendChild(h);
    if (def && def.lede) { sec.appendChild(el('p', 'hh-sub', def.lede)); }
  }

  var VIEWS = {
    path: pathView
  };

  /* ---- the layer ---- */

  /** @param {string} page @param {string} lesson @param {string} from where it was opened from */
  function shown(page, lesson, from) {
    var was = placeKey(), left = H.open ? H.lesson : '';
    if (H.open && was !== (lesson ? 'lesson/' + lesson : page)) { remember(); }
    H.open = true;
    H.page = page || '';
    H.lesson = lesson || '';
    H.from = from || '';
    if (!H.page && !H.lesson && H.data) { H.page = pageDef().id; }
    var here = H.lesson ? lessonHref(H.lesson, H.from) : '/guide/' + H.page;
    H.viaPress = !!H.pressed && (H.pressed === here || H.pressed.split('?')[0] === here.split('?')[0]);
    // Arrived by the browser's own Back or Forward: the lesson just left is the one to bring into view.
    if (!H.pressed && !H.back && left && left !== H.lesson) { H.back = left; }
    H.pressed = '';
    if (H.lesson) {
      var x = find(H.lesson);
      if (x) { H.stages[x.stage.id] = H.stages[x.stage.id] || false; }
    }
    if (H.back && !H.lesson) {
      var y = find(H.back);
      if (y) { H.stages[y.stage.id] = true; }
    }
    place();
    draw();
    if (placeKey() !== was || H.back) { settle(); }
    load();
  }
  function hidden() { H.open = false; }

  /* Escape on a lesson's page is Back, unless something of its own (a field, a menu) has it. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !H.open || !H.lesson || e.defaultPrevented) { return; }
    var view = $('handholdingView');
    if (!view || view.hidden) { return; }
    var t = e.target;
    if (t && t !== document.body && !view.contains(t)) { return; }
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    goBack();
  }, true);

  window.RouhHandholding = { shown: shown, hidden: hidden, reload: load };

  var xb = $('handholdingClose');
  if (xb) { xb.addEventListener('click', function () { if (host().close) { host().close(); } }); }
}());
