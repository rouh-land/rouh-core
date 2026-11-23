/* The Guide, at /guide (Handholding, at /handholding, until 21 November 2026): the guided way into Rouh for someone who has never seen it
   (`rouh/handholding.py`, `rouh/web/handholding.py`, the words in `rouh/handholding.json`).

   Petar, 20 November 2026: "I want to be able to put a person that has never seen rouh and step
   by step the guide should lead him to using the absolute maximum of rouh." Reworked the same day on
   his review of the first version: one source, a lesson is a step; a lesson is a card that opens
   into its own page, at its own address, with a way back to where you came from; no Try saying,
   which put words in a chat nobody could find again; pictures in every lesson.

   Three pages, from the data file's `pages`:
   - Your path: where the person stands and their next tip, a search over every tip, then the eight
     stages, all closed at first, each with the topics inside it in plain words, and each opening
     into its tips' cards. Lessons are called tips on every page since 22 November 2026 (review 49):
     a card shows a symbol, not a screenshot, and where it stands in its own stage, never out of
     every tip there is. There is no card of the tip to carry on with at the top any more.
   - Enabling Rouh: every lesson that is a connection, as the same card with its live badge, and
     the real switches.
   - Pro tips.
   And every lesson's own page, `/guide/lesson/<id>`: breadcrumbs, Back, the cover, the
   how-to with numbered pictures, Things you can say, Mark done, Previous and Next step.

   Back goes to where the person came from: the browser's own back when the lesson was opened by a
   press inside this page session (so the page, its scroll and the card are as they were); else the
   address's `?from=` (path, enable, tips, lesson-<id>); else the lesson's stage on Your path.

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
    feat: {}, featRead: false, tipArea: '',
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
  function stageName(stage) { return 'Stage ' + stage.n + ', ' + stage.title; }
  function lessonHref(id, from) { return '/guide/lesson/' + id + (from ? '?from=' + from : ''); }
  /** What the place a lesson was opened from is called, and its address. */
  function origin(from, x) {
    var m = /^lesson-([a-z0-9-]+)$/.exec(from || '');
    if (m && find(m[1])) {
      var o = find(m[1]);
      return { words: o.lesson.title, href: lessonHref(o.lesson.id, ''), key: from };
    }
    var p = pages().filter(function (q) { return q.id === from; })[0];
    if (p) { return { words: p.name, href: '/guide/' + p.id, key: from }; }
    var path = pageWith('path');
    return { words: x ? stageName(x.stage) : 'Your path', href: '/guide/' + (path ? path.id : ''),
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
    if (H.lesson) {
      page.appendChild(lessonPage(H.lesson));
    } else {
      var def = pageDef();
      page.appendChild(tabs(def));
      // Not on Your path, the Guide's main page (Petar, 23 November 2026): only its other pages carry the line.
      var note = def.id === 'path' ? null : orbNote();
      if (note) { page.appendChild(note); }
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
    if (p.w && p.h) { frame.style.aspectRatio = p.w + ' / ' + p.h; }
    var im = el('img');
    im.src = src(p.src);
    im.alt = p.alt || '';
    im.loading = 'lazy';
    im.decoding = 'async';
    if (p.w && p.h) { im.width = p.w; im.height = p.h; }
    im.addEventListener('error', function () {
      frame.textContent = '';
      frame.classList.add('hh-shot-none');
      frame.appendChild(glyph('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 15l5-4 4 3 3-2 5 4"/>', 24));
      frame.appendChild(el('span', 'hh-shot-alt', p.alt || 'The picture could not be shown.'));
    });
    frame.appendChild(im);
    var marks = withLegend ? (p.marks || []) : [];
    marks.forEach(function (m) {
      // Near an edge, the number goes on the side that has room.
      var dot = el('span', 'hh-dot' + (m.x > 88 ? ' hh-dot-l' : '') + (m.y < 12 ? ' hh-dot-b' : ''));
      dot.appendChild(el('span', 'hh-dot-n', letter(m.n)));
      dot.style.left = m.x + '%';
      dot.style.top = m.y + '%';
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
    a.setAttribute('aria-label', (isDone(l) ? 'Done. ' : isNext ? 'Your next tip. ' : '') + l.title + '. ' + l.outcome +
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
    w.appendChild(el('span', 'hh-card-o', l.outcome));
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

  /** Every tip whose words have all the words typed, in the order of the path. */
  function found(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all().filter(function (x) {
      var l = x.lesson;
      var hay = [l.title, l.outcome, (l.summary || []).join(' '), x.stage.title, x.stage.topics || '',
                 (l.says || []).join(' '), (l.parts || []).map(function (p) { return p.name + ' ' + p.text; }).join(' '),
                 (l.how || []).map(function (h) { return typeof h === 'string' ? h : h.text; }).join(' ')].join(' ').toLowerCase();
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
      tw.appendChild(el('span', 'hh-stage-n', 'Stage ' + stage.n));
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
        tw.appendChild(el('span', 'hh-stage-next', 'Your next tip is in this stage'));
      }
      t.appendChild(meter);
      t.appendChild(glyph('<path d="M7 10l5 5 5-5"/>', 18));
      hd.appendChild(t);
      box.appendChild(hd);
      var body = el('div', 'hh-stage-body');
      body.id = 'hh-stage-body-' + stage.id;
      body.hidden = !open;
      if (open) {
        if (stage.why) { body.appendChild(el('p', 'hh-stage-why', stage.why)); }
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

  /* ---- Enabling Rouh ---- */

  function connectionsView(def) {
    var sec = el('section', 'hh-sec hh-conns');
    sec.id = 'hh-conns';
    sec.setAttribute('aria-labelledby', 'hh-conns-h');
    heading(sec, 'hh-conns-h', def, 'Connections');
    var rows = all().filter(function (x) { return x.lesson.connection; });
    // Every connection counts: one Rouh can see by its state, one it cannot (the phone) by its tick.
    var n = { live: 0, attention: 0, unknown: 0 };
    rows.forEach(function (x) {
      var key = x.lesson.connection.key;
      if (!key) { if (isDone(x.lesson) && !skipped(x.lesson.id)) { n.live += 1; } return; }
      var s = status(key);
      if (s && n[s.kind] !== undefined) { n[s.kind] += 1; }
    });
    var sum = el('div', 'hh-sum');
    sum.appendChild(badge({ kind: 'count', words: n.unknown
      ? n.live + ' connected, ' + n.unknown + ' not known just now'
      : n.live + ' of ' + rows.length + ' connected' }));
    if (n.attention) { sum.appendChild(badge({ kind: 'attention', words: n.attention + ' ' + plural(n.attention, 'needs', 'need') + ' attention' })); }
    sec.appendChild(sum);
    var grid = el('ul', 'hh-cards');
    rows.forEach(function (x) {
      var item = el('li');
      item.appendChild(card(x, 'enable'));
      grid.appendChild(item);
    });
    sec.appendChild(grid);
    return sec;
  }

  /* The switches: each read and flipped through the very address its own Settings page uses. */
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
  function featuresView(def) {
    if (!H.featRead) { readFeatures(); }
    var sec = el('section', 'hh-sec hh-feats');
    sec.id = 'hh-feats';
    sec.setAttribute('aria-labelledby', 'hh-feats-h');
    heading(sec, 'hh-feats-h', def, 'Features you can switch on and off', true);
    var ul = el('ul', 'hh-featlist');
    (content().features || []).forEach(function (f) {
      var st = H.feat[f.id] || { loading: true };
      var li = el('li', 'hh-feat');
      var top = el('div', 'hh-feat-top');
      var words = el('div', 'hh-feat-words');
      var name = el('h4', 'hh-h3', f.name);
      name.id = 'hh-feat-' + f.id;
      words.appendChild(name);
      words.appendChild(el('p', 'hh-feat-what', f.what));
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
      if (f.show && f.show.href) {
        var foot = el('div', 'hh-foot');
        var fa = k(link(f.show.href, 'Open ' + f.show.label, 'hh-link hh-out'), 'fshow-' + f.id);
        fa.appendChild(glyph(OUT, 14));
        foot.appendChild(fa);
        li.appendChild(foot);
      }
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  /* ---- Pro tips ---- */

  function areaName(id) {
    var a = (content().areas || []).filter(function (x) { return x.id === id; })[0];
    return a ? a.name : id;
  }
  function tipsView(def) {
    var list = content().tips || [];
    var sec = el('section', 'hh-sec hh-tips');
    sec.id = 'hh-tips';
    sec.setAttribute('aria-labelledby', 'hh-tips-h');
    heading(sec, 'hh-tips-h', def, 'Pro tips');
    var chips = el('div', 'hh-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Area');
    [{ id: '', name: 'All areas' }].concat(content().areas || []).forEach(function (x) {
      var n = x.id ? list.filter(function (t) { return t.area === x.id; }).length : list.length;
      if (x.id && !n) { return; }
      var b = k(button(x.name, 'hh-chip' + (H.tipArea === x.id ? ' on' : ''), function () { H.tipArea = x.id; draw(); }),
                'ta-' + (x.id || 'all'));
      b.setAttribute('aria-pressed', H.tipArea === x.id ? 'true' : 'false');
      chips.appendChild(b);
    });
    sec.appendChild(chips);
    var got = list.filter(function (t) { return !H.tipArea || t.area === H.tipArea; });
    var cnt = el('p', 'hh-count', got.length + ' ' + plural(got.length, 'tip', 'tips'));
    cnt.setAttribute('aria-live', 'polite');
    sec.appendChild(cnt);
    var ul = el('ul', 'hh-tiplist');
    got.forEach(function (t) {
      var li = el('li', 'hh-tip');
      li.appendChild(el('span', 'hh-tag', areaName(t.area)));
      li.appendChild(el('h4', 'hh-h3', t.title));
      li.appendChild(el('p', 'hh-tip-body', t.body));
      if (t.says && t.says.length) { li.appendChild(says(t.says, 'hh-says-one')); }
      var from = t.lesson ? find(t.lesson) : null;
      if (from) {
        var foot = el('p', 'hh-tip-from');
        foot.appendChild(el('span', '', 'From the tip '));
        foot.appendChild(k(link(lessonHref(from.lesson.id, 'tips'), from.lesson.title, 'hh-link', true), 'tip-' + t.id));
        li.appendChild(foot);
      }
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
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
    var to = def.lesson ? find(def.lesson) : null;
    if (to) { means.appendChild(k(link(lessonHref(to.lesson.id, 'lesson-' + H.lesson), 'Tip: ' + to.lesson.title, 'hh-link', true), 'termtip-' + key.toLowerCase())); }
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
    back.appendChild(el('span', '', 'Back to ' + from.words));
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
    wrap.appendChild(readLine(l));
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
    head.appendChild(meta);
    var h = k(el('h3', 'hh-h1', l.title), 'h-lesson');
    h.setAttribute('tabindex', '-1');
    h.id = 'hh-lesson-h';
    head.appendChild(h);
    head.appendChild(el('p', 'hh-outcome', l.outcome));
    wrap.appendChild(head);
    var used = {};
    (l.summary || []).forEach(function (s) { wrap.appendChild(rich('p', 'hh-para', s, l.id, used)); });
    if (l.remembers) { wrap.appendChild(remembers()); }
    if (l.connection) { wrap.appendChild(connectionFacts(l)); }
    if (l.parts && l.parts.length) { wrap.appendChild(partsList(l, used)); }
    if (l.how && l.how.length) {
      var hh = el('h4', 'hh-h2', 'How');
      wrap.appendChild(hh);
      var ol = el('ol', 'hh-how');
      l.how.forEach(function (s, i) {
        var li = el('li');
        var words = typeof s === 'string' ? s : s.text;
        li.appendChild(rich('p', 'hh-how-t', words, l.id, used));
        if (s && s.image) { li.appendChild(picture(s.image, '', true)); }
        k(li, 'how-' + i);
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
    }
    if (l.says && l.says.length) {
      var sh = el('h4', 'hh-h2', 'Things you can say');
      wrap.appendChild(sh);
      if (H.data && H.data.chat) { wrap.appendChild(noChat(l, H.data.chat)); }
      var note = content().talk_note;
      if (l.talk && note && note.lesson !== l.id) {
        var tn = el('p', 'hh-talknote');
        tn.appendChild(el('span', '', note.text + ' '));
        var tl = find(note.lesson);
        if (tl) { tn.appendChild(k(link(lessonHref(tl.lesson.id, 'lesson-' + l.id), 'How: ' + tl.lesson.title, 'hh-link', true), 'talknote')); }
        wrap.appendChild(tn);
      }
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
    wrap.appendChild(doneBox(l));
    wrap.appendChild(nextBox(x));
    return wrap;
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
        var to = p.open.lesson ? find(p.open.lesson) : null;
        var a = to ? link(lessonHref(to.lesson.id, 'lesson-' + l.id), 'Tip: ' + to.lesson.title, 'hh-away hh-away-tip', true)
          : p.open.href ? away(p.open.href, 'Open ' + p.open.label) : null;
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
  function doneBox(l) {
    var box = el('section', 'hh-done' + (isDone(l) ? ' is-done' : ''));
    box.setAttribute('aria-label', 'Your progress on this tip');
    var seenDone = detected(l.id);
    var conn = /^connection:/.test(l.detect || '');
    var on = seenDone || ticked(l.id);
    var fixed = (seenDone && conn) || (!seenDone && liveOnly(l));
    if (skipped(l.id)) {
      box.appendChild(el('p', 'hh-done-words', 'Not for me: you left this one out.'));
      box.appendChild(k(button('I want this after all', 'hh-quiet', function () { save(l.id, false); }), 'unskip'));
      if (H.failed[l.id]) { box.appendChild(el('p', 'hh-failed', H.failed[l.id])); }
      return box;
    }
    var b = k(button('', on ? 'hh-markdone on' : 'hh-markdone', function () { if (!fixed) { save(l.id, !on); } }), 'markdone');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    // The button is its own message (review 50, problem 405): Mark done becomes Done, in green, and the line
    // at the top of the tip fills green with it. Pressed again it is not done; its hover says so.
    if (on && !fixed) { b.title = 'Press again to mark it not done'; }
    if (fixed) { b.setAttribute('aria-disabled', 'true'); b.classList.add('fixed'); }
    var face = el('span', 'hh-markdone-box');
    face.appendChild(glyph(TICK, 16));
    b.appendChild(face);
    b.appendChild(el('span', '', on ? 'Done' : 'Mark done'));
    box.appendChild(b);
    var why = '';
    if (seenDone && conn) { why = 'Rouh sees it connected, so it stays done while it is.'; }
    else if (seenDone) { why = 'Rouh saw it: ' + H.data.detected[l.id] + ' Press to mark it not done.'; }
    else if (fixed) { why = 'This tip is done when Rouh sees the connection working. It ticks itself.'; }
    else if (already(l.id)) { why = 'Already there: ' + already(l.id) + ' It counts as done once you have tried it yourself.'; }
    if (why) { box.appendChild(el('span', 'hh-done-hint', why)); }
    if (l.optional && !on) {
      box.appendChild(k(button('Not for me', 'hh-quiet hh-small', function () { save(l.id, true, true); }), 'skip'));
    }
    if (H.failed[l.id]) { box.appendChild(el('p', 'hh-failed', H.failed[l.id])); }
    return box;
  }

  /* ---- the reading line (review 50, problems 404 and 405) ----
     Petar: "as you scroll a line increases to show you how far you are from that article ... and as it reaches
     the end we have there a mark as done." A thin line held at the top of a tip's page fills as the page is
     read, measured to the tip's own Mark done at its foot. When it reaches the end, Mark done appears at the
     line's end, so finishing is one press where the eye already is; pressed, it says Done in green, the line
     turns green, and it stays so whenever the tip is opened again. The Mark done at the foot is the same
     switch, drawn from the same state. */
  function readLine(l) {
    var bar = el('div', 'hh-read');
    var track = el('div', 'hh-read-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'How far through this tip you are');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.appendChild(el('div', 'hh-read-fill'));
    bar.appendChild(track);
    var seenDone = detected(l.id);
    var on = seenDone || ticked(l.id);
    var fixed = (seenDone && /^connection:/.test(l.detect || '')) || (!seenDone && liveOnly(l));
    if (isDone(l)) { bar.classList.add('is-done'); }
    if (!skipped(l.id) && !fixed) {
      var b = k(button('', 'hh-read-done' + (on ? ' on' : ''), function () { save(l.id, !on); }), 'readdone');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.appendChild(glyph(TICK, 16));
      b.appendChild(el('span', '', on ? 'Done' : 'Mark done'));
      if (on) { b.title = 'Press again to mark it not done'; }
      bar.appendChild(b);
    }
    return bar;
  }
  /** How far the page is read: the bottom of the view against the foot of Mark done. Changes only classes and
      one width, so it runs on every scroll without drawing the page again. */
  function reading() {
    var body = $('handholdingBody');
    var bar = body && body.querySelector('.hh-read');
    var end = body && body.querySelector('.hh-done');
    var art = body && body.querySelector('.hh-lesson');
    if (!body || !bar || !end || !art) { return; }
    var b = body.getBoundingClientRect();
    var start = art.getBoundingClientRect().top;
    var stop = end.getBoundingClientRect().bottom;
    var total = stop - start - b.height;
    var got = total <= 0 ? 1 : Math.max(0, Math.min(1, (b.top - start) / total));
    if (stop <= b.bottom + 2) { got = 1; }
    var pct = Math.round(got * 100);
    var fill = bar.querySelector('.hh-read-fill');
    if (fill) { /** @type {HTMLElement} */ (fill).style.width = (bar.classList.contains('is-done') ? 100 : pct) + '%'; }
    var track = bar.querySelector('.hh-read-track');
    if (track) { track.setAttribute('aria-valuenow', String(bar.classList.contains('is-done') ? 100 : pct)); }
    bar.classList.toggle('at-end', got >= 0.999);
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

  /** The foot of every tip: the tip before it and the tip after it, side by side, each named by where it
      is (review 49, problems 429 and 430). Petar, 22 November 2026: a Previous button to the left of Next,
      with no second line on either, and no list of the stage's other tips. Back, at the top, is where the
      person came from; these two are the tips in order, so each says so: in this stage, or the stage it
      crosses into. */
  function nextBox(x) {
    var list = all();
    var nx = list[x.i + 1], pv = list[x.i - 1];
    var nav = el('nav', 'hh-nextstep');
    nav.setAttribute('aria-label', 'The tips in order');
    var row = el('div', 'hh-steps');
    nav.appendChild(row);
    function step(y, which) {
      var same = y.stage.id === x.stage.id;
      var said = which === 'prev'
        ? (same ? 'Previous tip in this stage' : 'Last tip of ' + stageName(y.stage))
        : (same ? 'Next tip in this stage' : 'First tip of ' + stageName(y.stage));
      var a = k(link(lessonHref(y.lesson.id, 'lesson-' + x.lesson.id), '', 'hh-stepbtn hh-stepbtn-' + which, true), which);
      a.setAttribute('aria-label', said + ': ' + y.lesson.title);
      if (which === 'prev') { a.appendChild(glyph('<path d="M15 6l-6 6 6 6"/>', 20)); }
      var w = el('span', 'hh-stepbtn-words');
      w.appendChild(el('span', 'hh-stepbtn-k', said));
      w.appendChild(el('span', 'hh-stepbtn-t', y.lesson.title));
      a.appendChild(w);
      if (which === 'next') { a.appendChild(glyph('<path d="M9 6l6 6-6 6"/>', 20)); }
      return a;
    }
    if (pv) { row.appendChild(step(pv, 'prev')); } else { row.appendChild(el('span', 'hh-stepbtn-none')); }
    if (nx) {
      row.appendChild(step(nx, 'next'));
    } else {
      var tips = pageWith('tips');
      if (tips) {
        var end = k(link('/guide/' + tips.id, '', 'hh-stepbtn hh-stepbtn-next', true), 'next');
        var ew = el('span', 'hh-stepbtn-words');
        ew.appendChild(el('span', 'hh-stepbtn-k', 'The last tip on the path'));
        ew.appendChild(el('span', 'hh-stepbtn-t', 'Open Pro tips'));
        end.appendChild(ew);
        end.appendChild(glyph('<path d="M9 6l6 6-6 6"/>', 20));
        row.appendChild(end);
      }
    }
    return nav;
  }

  /** A page's own heading and line, from the data file. `sub` draws it one size down. */
  function heading(sec, id, def, fallback, sub) {
    var h = k(el('h3', sub ? 'hh-h2' : 'hh-h1', (def && def.title) || fallback), 'h-' + id);
    h.id = id;
    h.setAttribute('tabindex', '-1');
    sec.appendChild(h);
    if (def && def.lede) { sec.appendChild(el('p', 'hh-sub', def.lede)); }
  }

  /** The section's pages, the one open marked: a way between them without the navigation. */
  function tabs(def) {
    var nav = el('nav', 'hh-tabs');
    nav.setAttribute('aria-label', 'Guide');
    pages().forEach(function (p) {
      var a = k(link('/guide/' + p.id, p.name, 'hh-tab' + (p.id === def.id ? ' on' : ''), true), 'tab-' + p.id);
      if (p.id === def.id) { a.setAttribute('aria-current', 'page'); }
      nav.appendChild(a);
    });
    return nav;
  }

  var VIEWS = {
    path: pathView,
    connections: connectionsView,
    features: featuresView,
    tips: tipsView
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
