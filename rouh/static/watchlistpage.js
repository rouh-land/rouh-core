/* The watch list, at /watch: the films and shows the person wants to watch,
   is watching and has watched (`rouh/watchlist.py`, `rouh/web/watchlist.py`).

   The owner, 28 November 2026: "I want the watch list to be a full feature in
   the navigation. with all the bells and whistles you could have." So the
   page opens on a sentence that counts the list, then Tonight - the show they
   are in the middle of with its next episode, or the first of Up next, within
   the time they say they have - then the list itself, Up next, Watched or All,
   searched, filtered and sorted. Add a title offers the matches as it is
   typed, each with its poster, year, kind and cast, because one name is often
   several titles; picking one looks its details up. A title's own page
   (/watch/<number>) has its seasons with every episode a press, its status,
   the person's rating, notes and who recommended it, where it streams and its
   trailer, and Remove, which can be undone.

   Every count on the page comes from the one list the server sent, so the
   headline, the tabs and Tonight always agree. The layer, its address and its
   row are app/runs.js's (`watchOpen`), handed over through
   `window.RouhWatchHost`. */
(function () {
  'use strict';

  var W = {
    open: false, data: null, error: '', loading: false, seq: 0,
    view: 'next', q: '', kind: '', where: '', sort: '',
    detail: 0, editing: false,
    adding: false, addQ: '', matches: [], look: 'idle', lookSeq: 0, lookTimer: 0, addBusy: '',
    minutes: '', skip: [],
    toast: null, toastTimer: 0, saved: ''
  };

  var STATUS = [['to_watch', 'To watch'], ['watching', 'Watching'], ['watched', 'Watched']];
  var KIND = { film: 'Film', show: 'Show', miniseries: 'Mini-series', documentary: 'Documentary' };
  var SERIAL = { show: 1, miniseries: 1, documentary: 1 };
  var TIMES = [['', 'Any length'], ['30', '30 min'], ['60', '1 hour'], ['120', '2 hours']];
  var SORTS = {
    next: [['', 'My order'], ['added', 'Recently added'], ['year', 'Newest first'], ['short', 'Shortest first'],
           ['rating', 'Public rating']],
    watched: [['', 'Recently watched'], ['mine', 'My rating'], ['year', 'Newest first'], ['title', 'A to Z']],
    all: [['', 'My order'], ['added', 'Recently added'], ['title', 'A to Z'], ['year', 'Newest first'],
          ['mine', 'My rating']]
  };

  function host() { return window.RouhWatchHost || {}; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function button(cls, text, run, label) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    b.addEventListener('click', run);
    return b;
  }
  var SVG = 'http://www.w3.org/2000/svg';
  function icon(d, size) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', String(size || 16));
    s.setAttribute('height', String(size || 16));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = d;
    return s;
  }
  var I = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    play: '<polygon points="8,5 19,12 8,19"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    star: '<polygon points="12,3.5 14.6,9 20.5,9.6 16,13.6 17.3,19.5 12,16.5 6.7,19.5 8,13.6 3.5,9.6 9.4,9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M17 4l3 3-3 3M4 17h3.5c1.4 0 2.4-1.2 3.3-2.8M13.2 9.8C14 8.2 15 7 16.5 7H20M17 14l3 3-3 3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    link: '<path d="M10 14l4-4M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2"/>'
  };

  /* ---- words ---- */

  function counted(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + many; }
  function mins(m) {
    if (!m) { return ''; }
    if (m < 60) { return m + ' min'; }
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  function day(at) {
    if (!at) { return ''; }
    var d = new Date(at * 1000);
    var same = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: same ? undefined : 'numeric' });
  }
  function serial(t) { return !!SERIAL[t.kind]; }
  function epLabel(n) { return n ? 'S' + n.season + ' E' + n.episode : ''; }
  function facts(t) {
    var bits = [];
    if (t.years) { bits.push(t.years); }
    bits.push(KIND[t.kind] || t.kind);
    if (t.where) { bits.push(t.where); }
    return bits.join(', ');
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  /* ---- reading and writing ---- */

  function ask(url, body) {
    var init = { credentials: 'same-origin', cache: 'no-store' };
    if (body) {
      init.method = 'POST';
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (r) {
      if (r.status === 401) { location.href = '/login'; throw new Error('Sign in first.'); }
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j) { throw new Error((j && j.error) || 'Rouh could not do that. Try again in a moment.'); }
        return j;
      });
    });
  }

  function load(quiet) {
    var seq = ++W.seq;
    if (!quiet) { W.loading = !W.data; draw(); }
    return ask('/api/watch').then(function (j) {
      if (seq !== W.seq) { return; }
      W.data = j; W.error = ''; W.loading = false;
      if (W.detail && !find(W.detail)) { W.detail = 0; W.editing = false; }
      draw();
    }).catch(function (e) {
      if (seq !== W.seq) { return; }
      W.loading = false; W.error = e.message; draw();
    });
  }

  function items() { return (W.data && W.data.items) || []; }
  function find(n) {
    var all = items();
    for (var i = 0; i < all.length; i++) { if (all[i].number === n) { return all[i]; } }
    return null;
  }
  function put(item) {
    if (!W.data) { return; }
    var all = W.data.items, i;
    for (i = 0; i < all.length; i++) { if (all[i].number === item.number) { all[i] = item; break; } }
    if (i === all.length) { all.push(item); }
    recount();
  }
  function recount() {
    var c = { to_watch: 0, watching: 0, watched: 0, all: 0 };
    items().forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; c.all += 1; });
    W.data.counts = c;
  }
  function counts() { return (W.data && W.data.counts) || { to_watch: 0, watching: 0, watched: 0, all: 0 }; }

  // Every write goes through here: the title it answers is put in place, and the page is drawn again.
  function act(url, body, done) {
    return ask(url, body || {}).then(function (j) {
      if (j.item) { put(j.item); }
      if (done) { done(j); }
      draw();
      return j;
    }).catch(function (e) { toast(e.message); draw(); });
  }

  function toast(text, undo, rate) {
    clearTimeout(W.toastTimer);
    W.toast = { text: text, undo: undo || null, rate: rate || null };
    W.toastTimer = setTimeout(function () { W.toast = null; drawToast(); }, rate ? 12000 : undo ? 8000 : 4500);
    drawToast();
  }

  /* ---- what is shown ---- */

  // Tonight: the show they are in the middle of first, newest touched first, then Up next in their
  // order, within the time they have. The same rule as `watchlist.tonight`, on the same list.
  function tonight() {
    var m = W.minutes ? parseInt(W.minutes, 10) : 0;
    var fits = function (t) { return !m || !t.runtime || t.runtime <= m; };
    var left = items().filter(function (t) { return t.status !== 'watched' && fits(t); });
    var watching = left.filter(function (t) { return t.status === 'watching'; })
      .sort(function (a, b) { return b.updated_at - a.updated_at; });
    var next = left.filter(function (t) { return t.status === 'to_watch'; })
      .sort(function (a, b) { return a.rank - b.rank || a.number - b.number; });
    return watching.concat(next);
  }

  function why(t, list) {
    if (t.status === 'watching') {
      return t.next ? 'You are in the middle of it. Next is season ' + t.next.season + ', episode ' + t.next.episode + '.'
        : 'You are in the middle of it.';
    }
    var ahead = list.filter(function (x) { return x.status === 'to_watch'; });
    var at = ahead.indexOf(t) + 1;
    var s = at === 1 ? 'First in Up next.' : 'Number ' + at + ' in Up next.';
    if (t.recommended_by) { s += ' ' + t.recommended_by + ' recommended it.'; }
    return s;
  }

  function shown() {
    var list = items().slice();
    if (W.view === 'next') { list = list.filter(function (t) { return t.status !== 'watched'; }); }
    if (W.view === 'watched') { list = list.filter(function (t) { return t.status === 'watched'; }); }
    if (W.kind === 'film') { list = list.filter(function (t) { return t.kind === 'film'; }); }
    if (W.kind === 'show') { list = list.filter(function (t) { return serial(t); }); }
    if (W.where) { list = list.filter(function (t) { return (t.where || '') === (W.where === '-' ? '' : W.where); }); }
    var q = norm(W.q.trim());
    if (q) {
      list = list.filter(function (t) {
        return [t.title, t.cast, t.notes, t.recommended_by, t.where, (t.genres || []).join(' '), t.years]
          .some(function (s) { return norm(s).indexOf(q) >= 0; });
      });
    }
    var sort = W.sort;
    var by = {
      added: function (a, b) { return b.added_at - a.added_at; },
      year: function (a, b) { return (b.year || 0) - (a.year || 0); },
      short: function (a, b) { return (a.runtime || 9999) - (b.runtime || 9999); },
      rating: function (a, b) { return (b.rating || 0) - (a.rating || 0); },
      mine: function (a, b) { return (b.my_rating || 0) - (a.my_rating || 0) || (b.watched_at || 0) - (a.watched_at || 0); },
      title: function (a, b) { return norm(a.title).localeCompare(norm(b.title)); }
    }[sort];
    if (by) { list.sort(by); }
    else if (W.view === 'watched') { list.sort(function (a, b) { return (b.watched_at || 0) - (a.watched_at || 0); }); }
    else {
      var rankOf = { watching: 0, to_watch: 1, watched: 2 };
      list.sort(function (a, b) {
        return (rankOf[a.status] - rankOf[b.status]) ||
          (a.status === 'watching' ? b.updated_at - a.updated_at : a.rank - b.rank) || a.number - b.number;
      });
    }
    return list;
  }

  /* ---- drawing ---- */

  function poster(t, cls) {
    var box = el('div', 'wl-poster' + (cls ? ' ' + cls : ''));
    var none = function () {
      box.textContent = '';
      box.classList.add('is-none');
      var hue = 0, s = t.title || '?';
      for (var i = 0; i < s.length; i++) { hue = (hue * 31 + s.charCodeAt(i)) % 360; }
      box.style.setProperty('--wl-hue', String(hue));
      var words = s.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
      var mark = el('span', 'wl-initials', (words[0] || '?').charAt(0) + (words[1] ? words[1].charAt(0) : ''));
      mark.setAttribute('aria-hidden', 'true');
      box.appendChild(mark);
      box.appendChild(el('span', 'wl-sr', 'No poster'));
    };
    if (t.poster) {
      var img = el('img');
      img.alt = 'Poster of ' + t.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', none);
      img.src = t.poster;
      box.appendChild(img);
    } else { none(); }
    return box;
  }

  function progress(t, cls) {
    if (!serial(t) || !t.episodes) { return null; }
    var wrap = el('div', 'wl-progress' + (cls ? ' ' + cls : ''));
    var bar = el('div', 'wl-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(t.episodes));
    bar.setAttribute('aria-valuenow', String(t.episodes_seen));
    bar.setAttribute('aria-label', t.episodes_seen + ' of ' + t.episodes + ' episodes seen');
    var fill = el('span', 'wl-fill');
    fill.style.width = Math.round(100 * t.episodes_seen / t.episodes) + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    var words = t.episodes_seen + ' of ' + t.episodes + ' episodes';
    if (t.next && t.status === 'watching') { words = 'Next ' + epLabel(t.next) + ', ' + words; }
    wrap.appendChild(el('span', 'wl-progress-words', words));
    return wrap;
  }

  function statusMark(t) {
    var m = el('span', 'wl-status wl-status-' + t.status);
    var dot = el('span', 'wl-status-shape');
    dot.setAttribute('aria-hidden', 'true');
    m.appendChild(dot);
    m.appendChild(document.createTextNode(t.status_said || ''));
    return m;
  }

  function stars(t, small) {
    if (!t.my_rating) { return null; }
    var s = el('span', 'wl-stars' + (small ? ' is-small' : ''));
    s.setAttribute('aria-label', 'Your rating: ' + t.my_rating + ' of 5');
    for (var i = 1; i <= 5; i++) {
      var g = icon(I.star, small ? 12 : 14);
      if (i <= t.my_rating) { g.classList.add('on'); }
      s.appendChild(g);
    }
    return s;
  }

  // The one press a card offers: the next episode seen, or a film watched.
  function quick(t) {
    if (t.status === 'watched') { return null; }
    if (serial(t) && t.next) {
      var two = el('span', 'wl-quick-pair');
      two.appendChild(button('ctl small wl-quick', 'Seen ' + epLabel(t.next), function () { stepOn(t); },
                    'Mark season ' + t.next.season + ', episode ' + t.next.episode + ' of ' + t.title + ' seen'));
      two.appendChild(button('ctl small wl-quick wl-quick-all', 'All watched', function () { markWatched(t); },
                    'Mark all of ' + t.title + ' watched'));
      return two;
    }
    return button('ctl small wl-quick', 'Mark watched', function () { markWatched(t); }, 'Mark ' + t.title + ' watched');
  }

  function card(t) {
    var li = el('li', 'wl-card');
    li.dataset.number = String(t.number);
    var open = el('a', 'wl-open');
    open.href = '/watch/' + t.number;
    open.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
      e.preventDefault();
      openDetail(t.number);
    });
    open.appendChild(poster(t));
    var text = el('span', 'wl-card-text');
    text.appendChild(el('span', 'wl-card-title', t.title));
    text.appendChild(el('span', 'wl-card-facts', facts(t)));
    open.appendChild(text);
    li.appendChild(open);
    var foot = el('div', 'wl-card-foot');
    var p = progress(t);
    if (p) { foot.appendChild(p); }
    var row = el('div', 'wl-card-row');
    if (t.status === 'watched') {
      row.appendChild(stars(t, true) || el('span', 'wl-dim', 'Watched ' + day(t.watched_at)));
    } else {
      row.appendChild(statusMark(t));
    }
    var q = quick(t);
    if (q) { row.appendChild(q); }
    foot.appendChild(row);
    li.appendChild(foot);
    return li;
  }

  function headline() {
    var c = counts();
    if (!c.all) { return 'Your watch list is empty.'; }
    var bits = [];
    if (c.watching) { bits.push(counted(c.watching, 'watching', 'watching')); }
    bits.push(counted(c.to_watch, 'to watch', 'to watch'));
    if (c.watched) { bits.push(counted(c.watched, 'watched', 'watched')); }
    return bits.join(', ').replace(/^./, function (x) { return x.toUpperCase(); }) + '.';
  }

  function drawTonight(into) {
    var all = tonight();
    var left = all.filter(function (t) { return W.skip.indexOf(t.number) < 0; });
    if (!left.length && all.length) { W.skip = []; left = all; }
    var sec = el('section', 'wl-tonight');
    sec.setAttribute('aria-labelledby', 'wlTonightH');
    var head = el('div', 'wl-tonight-head');
    var h = el('h4', 'wl-h', 'Tonight');
    h.id = 'wlTonightH';
    head.appendChild(h);
    var times = el('div', 'wl-seg wl-times');
    times.setAttribute('role', 'group');
    times.setAttribute('aria-label', 'How long you have');
    TIMES.forEach(function (o) {
      var b = button('wl-seg-b', o[1], function () { W.minutes = o[0]; W.skip = []; draw(); });
      b.setAttribute('aria-pressed', W.minutes === o[0] ? 'true' : 'false');
      times.appendChild(b);
    });
    if (all.length || W.minutes) { head.appendChild(times); }
    sec.appendChild(head);
    var t = left[0];
    if (!t) {
      var none = el('div', 'wl-tonight-none');
      var c = counts();
      none.appendChild(el('p', 'wl-lede', !c.all ? 'Add a title and Tonight picks from your list.'
        : (c.to_watch + c.watching) ? 'Nothing left on your list is ' + mins(parseInt(W.minutes, 10)) + ' or shorter.'
          : 'You have watched everything on your list.'));
      if (W.minutes) {
        none.appendChild(button('ctl small', 'Any length', function () { W.minutes = ''; draw(); }));
      } else if (c.all) {
        none.appendChild(button('ctl small', 'Add a title', function () { startAdd(); }));
      }
      sec.appendChild(none);
      into.appendChild(sec);
      return;
    }
    var pick = el('div', 'wl-pick');
    var po = el('a', 'wl-pick-poster');
    po.href = '/watch/' + t.number;
    po.setAttribute('aria-label', 'Open ' + t.title);
    po.addEventListener('click', function (e) { e.preventDefault(); openDetail(t.number); });
    po.appendChild(poster(t));
    pick.appendChild(po);
    var body = el('div', 'wl-pick-body');
    var title = el('h5', 'wl-pick-title');
    var ta = el('a', '', t.title);
    ta.href = '/watch/' + t.number;
    ta.addEventListener('click', function (e) { e.preventDefault(); openDetail(t.number); });
    title.appendChild(ta);
    body.appendChild(title);
    var meta = [facts(t)];
    if (t.runtime) { meta.push(mins(t.runtime) + (serial(t) ? ' an episode' : '')); }
    body.appendChild(el('p', 'wl-pick-facts', meta.join(', ')));
    body.appendChild(el('p', 'wl-pick-why', why(t, all)));
    var p = progress(t, 'is-wide');
    if (p) { body.appendChild(p); }
    var acts = el('div', 'wl-acts');
    var lead = W.detail ? 'ctl' : 'ctl wl-primary';
    if (serial(t) && t.next) {
      var main = button(lead, '', function () { stepOn(t); });
      main.appendChild(icon(I.check));
      main.appendChild(document.createTextNode('Seen ' + epLabel(t.next)));
      main.setAttribute('aria-label', 'Mark season ' + t.next.season + ', episode ' + t.next.episode + ' seen');
      acts.appendChild(main);
    } else {
      var w = button(lead, '', function () { markWatched(t); });
      w.appendChild(icon(I.check));
      w.appendChild(document.createTextNode('Watched it'));
      acts.appendChild(w);
    }
    if (t.where_url || t.links.where_find) {
      var go = el('a', 'ctl wl-ghost');
      go.href = t.where_url || t.links.where_find;
      go.target = '_blank';
      go.rel = 'noopener';
      go.appendChild(icon(I.play));
      go.appendChild(document.createTextNode(t.where_url && t.where ? 'Open ' + t.where : 'Where to watch'));
      acts.appendChild(go);
    }
    if (left.length > 1) {
      var other = button('ctl wl-ghost', '', function () { W.skip.push(t.number); draw(); });
      other.appendChild(icon(I.shuffle));
      other.appendChild(document.createTextNode('Something else'));
      acts.appendChild(other);
    }
    body.appendChild(acts);
    pick.appendChild(body);
    var after = left.slice(1, 4);
    if (after.length) {
      var then = el('div', 'wl-then');
      then.appendChild(el('h5', 'wl-then-h', 'After that'));
      var ul = el('ol', 'wl-then-list');
      after.forEach(function (x) {
        var li = el('li');
        var a = el('a', 'wl-then-item');
        a.href = '/watch/' + x.number;
        a.addEventListener('click', function (e) { e.preventDefault(); openDetail(x.number); });
        a.appendChild(poster(x, 'is-thumb'));
        var tx = el('span', 'wl-match-text');
        tx.appendChild(el('span', 'wl-then-title', x.title));
        var f = [];
        if (x.status === 'watching' && x.next) { f.push('next ' + epLabel(x.next)); }
        if (x.runtime) { f.push(mins(x.runtime) + (serial(x) ? ' an episode' : '')); }
        if (x.where) { f.push(x.where); }
        tx.appendChild(el('span', 'wl-match-facts', f.join(', ') || (KIND[x.kind] || '')));
        a.appendChild(tx);
        li.appendChild(a);
        ul.appendChild(li);
      });
      then.appendChild(ul);
      pick.appendChild(then);
    }
    sec.appendChild(pick);
    into.appendChild(sec);
  }

  function select(label, value, options, change) {
    var wrap = el('label', 'wl-field wl-select');
    wrap.appendChild(el('span', 'wl-field-label', label));
    var s = el('select', 'wl-in');
    options.forEach(function (o) {
      var op = el('option', '', o[1]);
      op.value = o[0];
      if (o[0] === value) { op.selected = true; }
      s.appendChild(op);
    });
    s.addEventListener('change', function () { change(s.value); });
    wrap.appendChild(s);
    return wrap;
  }

  function drawList(into) {
    var c = counts();
    var nav = el('div', 'wl-tabs');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Which titles');
    [['next', 'Up next', c.to_watch + c.watching], ['watched', 'Watched', c.watched], ['all', 'All', c.all]]
      .forEach(function (v) {
        var b = button('wl-tab', '', function () { W.view = v[0]; W.sort = ''; draw(); });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', W.view === v[0] ? 'true' : 'false');
        b.appendChild(document.createTextNode(v[1]));
        b.appendChild(el('span', 'wl-tab-n', v[2]));
        nav.appendChild(b);
      });
    into.appendChild(nav);

    var tools = el('div', 'wl-tools');
    var sw = el('label', 'wl-field wl-search');
    sw.appendChild(el('span', 'wl-sr', 'Search the watch list'));
    sw.appendChild(icon(I.search));
    var si = el('input', 'wl-in');
    si.type = 'search';
    si.id = 'wlSearch';
    si.placeholder = 'Search titles, people, notes';
    si.value = W.q;
    si.autocomplete = 'off';
    si.addEventListener('input', function () { W.q = si.value; drawGrid(); });
    sw.appendChild(si);
    tools.appendChild(sw);
    tools.appendChild(select('Kind', W.kind, [['', 'Everything'], ['film', 'Films'], ['show', 'Shows and series']],
      function (v) { W.kind = v; drawGrid(); }));
    var services = {};
    items().forEach(function (t) { services[t.where || '-'] = 1; });
    var wh = Object.keys(services).sort().map(function (k) { return [k, k === '-' ? 'Not said' : k]; });
    if (wh.length > 1) {
      tools.appendChild(select('Where', W.where, [['', 'Anywhere']].concat(wh), function (v) { W.where = v; drawGrid(); }));
    }
    tools.appendChild(select('Sort', W.sort, SORTS[W.view], function (v) { W.sort = v; drawGrid(); }));
    into.appendChild(tools);

    var grid = el('div', 'wl-grid-wrap');
    grid.id = 'wlGrid';
    into.appendChild(grid);
    drawGrid(grid);
  }

  /** @param {HTMLElement} [into] the grid's box, before it is on the page */
  function drawGrid(into) {
    var grid = into || $('wlGrid');
    if (!grid) { return; }
    grid.textContent = '';
    var list = shown();
    var filtered = W.q.trim() || W.kind || W.where;
    if (!list.length) {
      var empty = el('div', 'wl-empty');
      if (filtered) {
        empty.appendChild(el('p', 'wl-lede', 'Nothing here matches.'));
        empty.appendChild(button('ctl small', 'Clear the search and filters', function () {
          W.q = ''; W.kind = ''; W.where = ''; draw();
        }));
      } else if (W.view === 'watched') {
        empty.appendChild(el('p', 'wl-lede', 'Nothing watched yet. Mark a title watched and it is kept here, with your rating.'));
      } else {
        empty.appendChild(el('p', 'wl-lede', counts().all ? 'Up next is empty: you have watched everything.'
          : 'Nothing on your list yet.'));
        empty.appendChild(button('ctl small', 'Add a title', function () { startAdd(); }));
      }
      grid.appendChild(empty);
      return;
    }
    if (filtered) {
      grid.appendChild(el('p', 'wl-found', counted(list.length, 'title', 'titles') + ' found'));
    }
    var ul = el('ul', 'wl-grid');
    list.forEach(function (t) { ul.appendChild(card(t)); });
    grid.appendChild(ul);
  }

  /* ---- adding ---- */

  function startAdd() {
    W.adding = true; W.addQ = ''; W.matches = []; W.look = 'idle';
    draw();
    var f = $('wlAddQ');
    if (f) { f.focus(); }
  }
  function stopAdd() {
    W.adding = false; W.addBusy = '';
    draw();
    var b = $('wlAddBtn');
    if (b) { b.focus(); }
  }

  function lookUp() {
    clearTimeout(W.lookTimer);
    var q = W.addQ.trim();
    if (q.length < 2) { W.matches = []; W.look = 'idle'; drawMatches(); return; }
    W.look = 'looking';
    drawMatches();
    W.lookTimer = setTimeout(function () {
      var seq = ++W.lookSeq;
      ask('/api/watch/search?q=' + encodeURIComponent(q)).then(function (j) {
        if (seq !== W.lookSeq) { return; }
        W.matches = j.matches || [];
        W.look = j.offline ? 'offline' : 'done';
        drawMatches();
      }).catch(function () {
        if (seq !== W.lookSeq) { return; }
        W.matches = []; W.look = 'offline'; drawMatches();
      });
    }, 280);
  }

  function addPick(m) {
    W.addBusy = m ? m.key : 'name';
    drawMatches();
    var body = m ? { pick: m, title: m.title } : { title: W.addQ.trim(), lookup: false };
    ask('/api/watch/new', body).then(function (j) {
      put(j.item);
      W.adding = false; W.addBusy = '';
      W.view = 'next';
      toast(j.item.title + ' is on your watch list.' + (j.said ? ' ' + j.said : ''));
      openDetail(j.item.number);
    }).catch(function (e) { W.addBusy = ''; toast(e.message); drawMatches(); });
  }

  function drawAdd(into) {
    var box = el('section', 'wl-add');
    box.setAttribute('aria-labelledby', 'wlAddH');
    var top = el('div', 'wl-add-top');
    var h = el('h4', 'wl-h', 'Add a title');
    h.id = 'wlAddH';
    top.appendChild(h);
    top.appendChild(button('ctl small', 'Cancel', stopAdd));
    box.appendChild(top);
    var f = el('label', 'wl-field');
    f.appendChild(el('span', 'wl-field-label', 'Film or show'));
    var q = el('input', 'wl-in wl-add-in');
    q.id = 'wlAddQ';
    q.type = 'text';
    q.autocomplete = 'off';
    q.placeholder = 'Its name, as you heard it';
    q.value = W.addQ;
    q.addEventListener('input', function () { W.addQ = q.value; lookUp(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (W.matches[0]) { addPick(W.matches[0]); } else if (W.addQ.trim()) { addPick(null); }
      }
    });
    f.appendChild(q);
    box.appendChild(f);
    var m = el('div', 'wl-matches');
    m.id = 'wlMatches';
    m.setAttribute('aria-live', 'polite');
    box.appendChild(m);
    into.appendChild(box);
    drawMatches();
  }

  function drawMatches() {
    var m = $('wlMatches');
    if (!m) { return; }
    m.textContent = '';
    var q = W.addQ.trim();
    if (W.look === 'idle') {
      m.appendChild(el('p', 'wl-hint', 'Rouh looks it up as you type and fills in the poster, seasons and details. ' +
        'You can also say "add it to my watch list" to Rouh.'));
      return;
    }
    if (W.look === 'looking' && !W.matches.length) {
      m.appendChild(el('p', 'wl-hint', 'Looking it up...'));
    }
    if (W.look === 'offline') {
      m.appendChild(el('p', 'wl-hint', 'The lookup is not answering right now. Add it by its name, and look its details up later.'));
    } else if (W.look === 'done' && !W.matches.length) {
      m.appendChild(el('p', 'wl-hint', 'No film or show by that name was found.'));
    }
    if (W.matches.length) {
      var ul = el('ul', 'wl-match-list');
      W.matches.forEach(function (x) {
        var li = el('li');
        var b = button('wl-match', '', function () { addPick(x); });
        b.disabled = !!W.addBusy;
        b.appendChild(poster({ title: x.title, poster: x.poster }, 'is-thumb'));
        var tx = el('span', 'wl-match-text');
        tx.appendChild(el('span', 'wl-match-title', x.title));
        tx.appendChild(el('span', 'wl-match-facts', [x.years || x.year || '', x.kind_said].filter(Boolean).join(', ')));
        if (x.cast) { tx.appendChild(el('span', 'wl-match-cast', x.cast)); }
        b.appendChild(tx);
        b.appendChild(el('span', 'wl-match-go', W.addBusy === x.key ? 'Adding...' : 'Add'));
        b.setAttribute('aria-label', 'Add ' + x.title + (x.years || x.year ? ', ' + (x.years || x.year) : '') + ', ' + x.kind_said);
        li.appendChild(b);
        ul.appendChild(li);
      });
      m.appendChild(ul);
    }
    if (q) {
      var plain = button('ctl small wl-plain', W.addBusy === 'name' ? 'Adding...' : 'Add "' + q + '" by its name only',
        function () { addPick(null); });
      plain.disabled = !!W.addBusy;
      m.appendChild(plain);
    }
  }

  /* ---- what a press does ---- */

  function stepOn(t) {
    act('/api/watch/' + t.number + '/tick', { step: true }, function (j) {
      if (j.finished) {
        toast('Last episode: ' + j.item.title + ' is watched. Rate it:', function () {
          act('/api/watch/' + t.number, { status: 'watching' });
        }, j.item);
      }
    });
  }

  function tickTo(t, season, episode) {
    act('/api/watch/' + t.number + '/tick', { season: season, episode: episode }, function (j) {
      if (j.finished) { toast('Every episode seen: ' + j.item.title + ' is watched. Rate it:', null, j.item); }
    });
  }

  function markWatched(t) {
    var was = t.status, seen = t.seen || {};
    act('/api/watch/' + t.number, { status: 'watched' }, function (j) {
      toast(j.item.title + ' is watched. Rate it:', function () {
        act('/api/watch/' + t.number, { status: was, seen: seen });
      }, j.item);
    });
  }

  function setStatus(t, status) {
    if (status === t.status) { return; }
    if (status === 'watched') { markWatched(t); return; }
    var was = t.status;
    act('/api/watch/' + t.number, { status: status }, function (j) {
      toast(j.item.title + ': ' + j.item.status_said.toLowerCase() + '.', function () {
        act('/api/watch/' + t.number, { status: was });
      });
    });
  }

  function save(t, fields, said) {
    act('/api/watch/' + t.number, fields, function () {
      W.saved = said || 'Saved';
      var s = $('wlSaved');
      if (s) { s.textContent = W.saved; }
      setTimeout(function () { W.saved = ''; var n = $('wlSaved'); if (n) { n.textContent = ''; } }, 2500);
    });
  }

  function remove(t) {
    ask('/api/watch/' + t.number + '/delete', {}).then(function (j) {
      W.data.items = items().filter(function (x) { return x.number !== t.number; });
      recount();
      closeDetail(true);
      toast(t.title + ' is off your watch list.', function () {
        ask('/api/watch/restore', { was: j.was }).then(function (r) { put(r.item); draw(); toast(r.item.title + ' is back.'); })
          .catch(function (e) { toast(e.message); });
      });
    }).catch(function (e) { toast(e.message); });
  }

  function refresh(t) {
    toast('Looking ' + t.title + ' up again...');
    act('/api/watch/' + t.number + '/refresh', {}, function (j) {
      toast(j.said || 'The details of ' + j.item.title + ' are up to date.');
    });
  }

  /* ---- one title ---- */

  function openDetail(n) {
    W.detail = n; W.editing = false;
    if (host().focus) { host().focus(String(n)); }
    draw();
    var d = $('wlDetail');
    if (d) { d.scrollTop = 0; var h = $('wlDetailTitle'); if (h) { h.focus({ preventScroll: true }); } }
  }
  function closeDetail(quiet) {
    var was = W.detail;
    W.detail = 0; W.editing = false;
    if (host().focus) { host().focus(''); }
    draw();
    if (!quiet) {
      var back = document.querySelector('.wl-card[data-number="' + was + '"] .wl-open');
      if (back) { back.focus({ preventScroll: false }); }
    }
  }

  function linkOut(href, text) {
    var a = el('a', 'wl-out');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(icon(I.link, 14));
    a.appendChild(document.createTextNode(text));
    return a;
  }

  function textField(label, value, opts, onSave) {
    var f = el('label', 'wl-field');
    f.appendChild(el('span', 'wl-field-label', label));
    var input = el(opts.area ? 'textarea' : 'input', 'wl-in');
    if (!opts.area) { input.type = opts.type || 'text'; }
    if (opts.area) { input.rows = 3; }
    if (opts.placeholder) { input.placeholder = opts.placeholder; }
    if (opts.id) { input.id = opts.id; }
    input.value = value == null ? '' : String(value);
    input.addEventListener('change', function () { onSave(input.value); });
    f.appendChild(input);
    return f;
  }

  function seasonsBlock(t) {
    var wrap = el('section', 'wl-seasons');
    wrap.setAttribute('aria-labelledby', 'wlSeasonsH');
    var h = el('h4', 'wl-h', 'Seasons');
    h.id = 'wlSeasonsH';
    wrap.appendChild(h);
    var openN = t.next ? t.next.season : (t.seasons[t.seasons.length - 1] || {}).n;
    t.seasons.forEach(function (s) {
      var seen = parseInt((t.seen || {})[String(s.n)] || 0, 10);
      var d = el('details', 'wl-season');
      if (s.n === openN) { d.open = true; }
      d.addEventListener('toggle', function () {
        if (!d.open) { return; }
        wrap.querySelectorAll('details.wl-season[open]').forEach(function (o) { if (o !== d) { o.open = false; } });
      });
      var sum = el('summary', 'wl-season-sum');
      var name = 'Season ' + s.n + (s.name ? ': ' + s.name : '');
      sum.appendChild(el('span', 'wl-season-name', name));
      var bits = [];
      if (s.year) { bits.push(String(s.year)); }
      bits.push(s.episodes ? seen + ' of ' + s.episodes + ' seen' : 'episodes not known');
      sum.appendChild(el('span', 'wl-season-facts', bits.join(', ')));
      d.appendChild(sum);
      if (s.episodes) {
        var eps = el('div', 'wl-eps');
        eps.setAttribute('role', 'group');
        eps.setAttribute('aria-label', name + ': press an episode to mark it and every one before it seen');
        for (var e = 1; e <= s.episodes; e++) {
          (function (e) {
            var on = e <= seen;
            var b = button('wl-ep' + (on ? ' on' : '') + (t.next && t.next.season === s.n && t.next.episode === e ? ' is-next' : ''),
              String(e), function () { tickTo(t, s.n, on && e === seen ? e - 1 : e); });
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.setAttribute('aria-label', 'Episode ' + e + (on ? ', seen' : ''));
            eps.appendChild(b);
          })(e);
        }
        d.appendChild(eps);
        var row = el('div', 'wl-season-acts');
        if (seen < s.episodes) {
          row.appendChild(button('ctl small', 'All of season ' + s.n + ' seen', function () { tickTo(t, s.n, s.episodes); }));
        }
        if (seen) {
          row.appendChild(button('ctl small', 'None of it seen', function () { tickTo(t, s.n, 0); }));
        }
        d.appendChild(row);
      }
      wrap.appendChild(d);
    });
    return wrap;
  }

  function editForm(t) {
    var form = el('form', 'wl-edit');
    form.setAttribute('aria-label', 'Edit the details of ' + t.title);
    var grid = el('div', 'wl-edit-grid');
    var fields = {};
    function add(name, label, value, opts) {
      var f = textField(label, value, opts || {}, function () {});
      fields[name] = f.querySelector('input,textarea');
      grid.appendChild(f);
    }
    add('title', 'Title', t.title);
    var kind = select('Kind', t.kind, Object.keys(KIND).map(function (k) { return [k, KIND[k]]; }), function () {});
    fields.kind = kind.querySelector('select');
    grid.appendChild(kind);
    add('year', 'Year', t.year, { type: 'number' });
    add('end_year', 'Last year', t.end_year, { type: 'number' });
    add('runtime', serial(t) ? 'Minutes an episode' : 'Minutes', t.runtime, { type: 'number' });
    add('genres', 'Genres', (t.genres || []).join(', '), { placeholder: 'Drama, History' });
    add('seasons', 'Episodes in each season', (t.seasons || []).map(function (s) { return s.episodes; }).join(', '),
        { placeholder: 'For a show: 8, 6' });
    add('rating', 'Public rating out of 10', t.rating, { type: 'number' });
    form.appendChild(grid);
    form.appendChild(textField('About it', t.overview, { area: true }, function () {}));
    fields.overview = form.querySelector('textarea');
    var acts = el('div', 'wl-acts');
    var go = el('button', 'ctl wl-primary', 'Save the details');
    go.type = 'submit';
    acts.appendChild(go);
    acts.appendChild(button('ctl small', 'Cancel', function () { W.editing = false; draw(); }));
    form.appendChild(acts);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var old = {};
      (t.seasons || []).forEach(function (s) { old[s.n] = s; });
      var seasons = fields.seasons.value.split(/[,\s]+/).filter(Boolean).map(function (n, i) {
        var was = old[i + 1] || {};
        return { n: i + 1, name: was.name || '', episodes: parseInt(n, 10) || 0, year: was.year || null };
      });
      var body = { title: fields.title.value, kind: fields.kind.value, year: fields.year.value || null,
                   end_year: fields.end_year.value || null, runtime: fields.runtime.value || null,
                   genres: fields.genres.value, rating: fields.rating.value || null, overview: fields.overview.value,
                   seasons: seasons };
      act('/api/watch/' + t.number, body, function () { W.editing = false; toast('The details are saved.'); });
    });
    return form;
  }

  function drawDetail(into) {
    var t = find(W.detail);
    if (!t) { return; }
    var d = el('section', 'wl-detail');
    d.id = 'wlDetail';
    d.setAttribute('role', 'region');
    d.setAttribute('aria-label', t.title);
    var bar = el('div', 'wl-detail-bar');
    var back = button('ctl small wl-back', '', function () { closeDetail(); });
    back.appendChild(icon(I.back));
    back.appendChild(document.createTextNode('Watch list'));
    bar.appendChild(back);
    var saved = el('span', 'wl-saved', W.saved);
    saved.id = 'wlSaved';
    saved.setAttribute('aria-live', 'polite');
    bar.appendChild(saved);
    d.appendChild(bar);

    var hero = el('div', 'wl-hero');
    hero.appendChild(poster(t, 'is-big'));
    var info = el('div', 'wl-hero-info');
    var h = el('h4', 'wl-detail-title', t.title);
    h.id = 'wlDetailTitle';
    h.tabIndex = -1;
    info.appendChild(h);
    info.appendChild(el('p', 'wl-detail-facts', facts(t)));
    var more = [];
    if (t.runtime) { more.push(mins(t.runtime) + (serial(t) ? ' an episode' : '')); }
    if (serial(t) && t.seasons.length) { more.push(counted(t.seasons.length, 'season', 'seasons') + ', ' + counted(t.episodes, 'episode', 'episodes')); }
    if (more.length) { info.appendChild(el('p', 'wl-detail-facts', more.join(', '))); }
    if ((t.genres || []).length) {
      var g = el('ul', 'wl-genres');
      g.setAttribute('aria-label', 'Genres');
      t.genres.forEach(function (x) { g.appendChild(el('li', 'wl-genre', x)); });
      info.appendChild(g);
    }
    if (t.rating) { info.appendChild(el('p', 'wl-detail-facts', t.rating.toFixed(1) + ' out of 10 on ' + (t.rating_from || 'the web'))); }
    if (t.cast) { info.appendChild(el('p', 'wl-detail-cast', t.cast)); }
    if (!t.looked_up) {
      info.appendChild(el('p', 'wl-hint', 'Its details were not looked up yet.'));
    }
    hero.appendChild(info);
    d.appendChild(hero);

    // Status, and the one press that moves it on.
    var st = el('div', 'wl-seg wl-status-seg');
    st.setAttribute('role', 'group');
    st.setAttribute('aria-label', 'Status');
    STATUS.forEach(function (s) {
      var b = button('wl-seg-b', s[1], function () { setStatus(t, s[0]); });
      b.setAttribute('aria-pressed', t.status === s[0] ? 'true' : 'false');
      st.appendChild(b);
    });
    d.appendChild(st);
    var p = progress(t, 'is-wide');
    if (p) { d.appendChild(p); }
    var acts = el('div', 'wl-acts');
    if (t.status !== 'watched') {
      if (serial(t) && t.next) {
        var main = button('ctl wl-primary', '', function () { stepOn(t); });
        main.appendChild(icon(I.check));
        main.appendChild(document.createTextNode('Seen ' + epLabel(t.next)));
        acts.appendChild(main);
      } else {
        var w = button('ctl wl-primary', '', function () { markWatched(t); });
        w.appendChild(icon(I.check));
        w.appendChild(document.createTextNode('Watched it'));
        acts.appendChild(w);
      }
      var front = button('ctl wl-ghost', '', function () {
        act('/api/watch/' + t.number + '/front', {}, function (j) { toast(j.item.title + ' is first in Up next.'); });
      });
      front.appendChild(icon(I.up));
      front.appendChild(document.createTextNode('Watch next'));
      acts.appendChild(front);
    }
    d.appendChild(acts);

    // Their own: rating, who told them, where, notes.
    var mine = el('section', 'wl-mine');
    mine.setAttribute('aria-label', 'Yours');
    var rate = el('div', 'wl-rate');
    rate.setAttribute('role', 'group');
    rate.setAttribute('aria-label', 'My rating');
    rate.appendChild(el('span', 'wl-field-label', 'My rating'));
    var row = el('div', 'wl-rate-row');
    for (var i = 1; i <= 5; i++) {
      (function (i) {
        var b = button('wl-star' + (t.my_rating && i <= t.my_rating ? ' on' : ''), '', function () {
          save(t, { my_rating: t.my_rating === i ? null : i }, t.my_rating === i ? 'Rating taken off' : 'Rated ' + i + ' of 5');
        });
        b.appendChild(icon(I.star, 22));
        b.setAttribute('aria-label', i + ' of 5' + (t.my_rating === i ? ', your rating now; press to take it off' : ''));
        b.setAttribute('aria-pressed', t.my_rating === i ? 'true' : 'false');
        row.appendChild(b);
      })(i);
    }
    rate.appendChild(row);
    mine.appendChild(rate);
    mine.appendChild(textField('Recommended by', t.recommended_by, { placeholder: 'Who told you about it' },
      function (v) { save(t, { recommended_by: v }); }));
    mine.appendChild(textField('Where to watch', t.where, { placeholder: 'Netflix, HBO Max, cinema...' },
      function (v) { save(t, { where: v }); }));
    mine.appendChild(textField('Notes', t.notes, { area: true, placeholder: 'Anything to remember about it' },
      function (v) { save(t, { notes: v }); }));
    d.appendChild(mine);

    var outs = el('div', 'wl-outs');
    if (t.where_url) { outs.appendChild(linkOut(t.where_url, 'Open on ' + (t.where || 'its service'))); }
    outs.appendChild(linkOut(t.links.where_find, 'Where it streams in Bulgaria'));
    outs.appendChild(linkOut(t.links.trailer, 'Trailer'));
    if (t.links.imdb) { outs.appendChild(linkOut(t.links.imdb, 'IMDb')); }
    if (t.links.wiki) { outs.appendChild(linkOut(t.links.wiki, 'Wikipedia')); }
    d.appendChild(outs);

    if (t.overview) {
      var ov = el('section', 'wl-about');
      ov.appendChild(el('h4', 'wl-h', 'About it'));
      ov.appendChild(el('p', 'wl-about-text', t.overview));
      d.appendChild(ov);
    }
    if (serial(t) && t.seasons.length) { d.appendChild(seasonsBlock(t)); }

    if (W.editing) { d.appendChild(editForm(t)); }
    var tail = el('div', 'wl-tail');
    if (!W.editing) {
      tail.appendChild(button('ctl small', 'Edit the details', function () { W.editing = true; draw(); }));
    }
    var re = button('ctl small', '', function () { refresh(t); });
    re.appendChild(icon(I.refresh, 14));
    re.appendChild(document.createTextNode('Look it up again'));
    tail.appendChild(re);
    tail.appendChild(button('ctl small wl-remove', 'Remove from the list', function () { remove(t); }));
    d.appendChild(tail);
    var when = ['Added ' + day(t.added_at)];
    if (t.started_at) { when.push('started ' + day(t.started_at)); }
    if (t.watched_at) { when.push('watched ' + day(t.watched_at)); }
    d.appendChild(el('p', 'wl-dim wl-when', when.join(', ') + '.'));
    into.appendChild(d);
  }

  function drawToast() {
    var view = $('watchView');
    if (!view) { return; }
    var old = $('wlToast');
    if (!W.toast) { if (old) { old.remove(); } return; }
    var t = old || el('div', 'wl-toast');
    t.id = 'wlToast';
    t.setAttribute('role', 'status');
    t.textContent = '';
    t.appendChild(el('span', 'wl-toast-text', W.toast.text));
    if (W.toast.rate) {
      var rt = W.toast.rate;
      var stars = el('span', 'wl-toast-stars');
      stars.setAttribute('role', 'group');
      stars.setAttribute('aria-label', 'Rate ' + rt.title);
      for (var i = 1; i <= 5; i++) {
        (function (i) {
          var b = button('wl-star is-small', '', function () {
            W.toast = null; drawToast();
            act('/api/watch/' + rt.number, { my_rating: i }, function (j) { toast('Rated ' + j.item.title + ' ' + i + ' of 5.'); });
          }, 'Rate it ' + i + ' of 5');
          b.appendChild(icon(I.star, 18));
          stars.appendChild(b);
        })(i);
      }
      t.appendChild(stars);
    }
    if (W.toast.undo) {
      var undo = W.toast.undo;
      t.appendChild(button('wl-toast-undo', 'Undo', function () { W.toast = null; drawToast(); undo(); }));
    }
    t.appendChild(button('wl-toast-x', '', function () { W.toast = null; drawToast(); }, 'Dismiss'));
    t.lastChild.appendChild(icon(I.close, 14));
    if (!old) { view.appendChild(t); }
  }

  function draw() {
    var body = $('watchBody');
    var meta = $('watchMeta');
    if (!body) { return; }
    var keep = document.activeElement && document.activeElement.id;
    var at = keep === 'wlSearch' || keep === 'wlAddQ' ? document.activeElement.selectionStart : null;
    var scroll = body.scrollTop;
    body.textContent = '';
    if (meta) { meta.textContent = ''; }
    var page = el('div', 'wl-page' + (W.detail ? ' has-detail' : ''));
    var main = el('div', 'wl-main');
    if (W.detail) { main.setAttribute('aria-hidden', narrowNow() ? 'true' : 'false'); }
    if (W.loading) {
      main.appendChild(el('p', 'wl-lede', 'Reading your watch list...'));
    } else if (W.error && !W.data) {
      main.appendChild(el('p', 'wl-error', W.error));
      main.appendChild(button('ctl small', 'Try again', function () { load(); }));
    } else if (W.data) {
      var top = el('div', 'wl-top');
      top.appendChild(el('p', 'wl-headline', headline()));
      if (!W.adding) {
        var add = button(counts().all ? 'ctl wl-add-btn' : 'ctl wl-primary wl-add-btn', '', startAdd);
        add.id = 'wlAddBtn';
        add.appendChild(icon(I.plus));
        add.appendChild(document.createTextNode('Add a title'));
        top.appendChild(add);
      }
      main.appendChild(top);
      if (W.adding) { drawAdd(main); }
      if (counts().all) {
        drawTonight(main);
        drawList(main);
      } else if (!W.adding) {
        var empty = el('div', 'wl-empty wl-empty-first');
        empty.appendChild(el('p', 'wl-lede', 'Keep the films and shows you want to watch here. Add one, or say to Rouh: "add Severance to my watch list".'));
        main.appendChild(empty);
      }
    }
    page.appendChild(main);
    if (W.detail && W.data) { drawDetail(page); }
    body.appendChild(page);
    body.scrollTop = scroll;
    if (keep && $(keep) && keep !== 'wlDetailTitle') {
      var f = $(keep);
      f.focus({ preventScroll: true });
      if (at != null && f.setSelectionRange) { try { f.setSelectionRange(at, at); } catch (e) { /* a field without a caret */ } }
    }
    drawToast();
  }

  function narrowNow() { var b = $('watchBody'); return !!b && b.clientWidth <= 1000; }

  // Escape closes a title's page and the add box before the layer itself.
  document.addEventListener('keydown', function (e) {
    if (!W.open || e.key !== 'Escape') { return; }
    if (W.detail) { e.preventDefault(); e.stopImmediatePropagation(); closeDetail(); return; }
    if (W.adding) { e.preventDefault(); e.stopImmediatePropagation(); stopAdd(); }
  }, true);

  window.RouhWatch = {
    /** @param {string} [number] one title to open, from /watch/<number> */
    shown: function (number) {
      var n = parseInt(number || '0', 10) || 0;
      var first = !W.open;
      W.open = true;
      if (n !== W.detail) { W.detail = n; W.editing = false; }
      if (first || !W.data) { load(); } else { draw(); }
    },
    hidden: function () {
      W.open = false; W.adding = false; W.toast = null;
      drawToast();
    },
    // The list changed, here or on another screen of theirs, or by voice: read it again.
    moved: function () { if (W.open) { load(true); } },
    viewing: function () { return W.detail ? String(W.detail) : ''; }
  };

  var x = $('watchClose');
  if (x) { x.addEventListener('click', function () { if (host().close) { host().close(); } }); }
})();
