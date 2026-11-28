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

   Step 202-04 (the owner: "I rewatch stuff ... shall we have multiple lists?
   tags also? also ratings should be out of 10"): a watched title has Watch
   again, which puts it first in Up next and keeps every date it was watched;
   New list makes a list of his own, shared only once he invites someone;
   free tags cut across lists and filter the list; and the rating is a pad of
   the numbers 1 to 10, the one chosen (or under the pointer) shown large,
   with Save and Clear.

   Every count on the page comes from the one list the server sent, so the
   headline, the tabs and Tonight always agree. The layer, its address and its
   row are app/runs.js's (`watchOpen`), handed over through
   `window.RouhWatchHost`. */
(function () {
  'use strict';

  var W = {
    open: false, data: null, error: '', loading: false, seq: 0,
    view: 'next', q: '', kind: '', where: '', tag: '', sort: '',
    // Step 202-05: Kind, Where, Tag and Sort sit behind Filter, open or shut.
    filters: false,
    // The rating pad: the number pressed and not yet saved ({n: title, v: 1..10 or 0 to clear}), and the one hovered.
    rateDraft: null, rateHover: 0, tagDraft: '',
    detail: 0, editing: false,
    adding: false, addQ: '', matches: [], look: 'idle', lookSeq: 0, lookTimer: 0, addBusy: '',
    minutes: '', skip: [],
    toast: null, toastTimer: 0, saved: '',
    // Which list is shown: 'all', '0' for My list, or a shared list's id; kept in this browser.
    list: remembered(),
    // The Share a list / People sheet: null, or {mode: 'new' | 'people', id, said, link, busy, ...}.
    sheet: null,
    // The other person's page: Leave this list asked once; why the list is not theirs any more.
    leaving: false, gone: '', poll: 0
  };

  function remembered() {
    try { return localStorage.getItem('rouh.watch.list') || 'all'; } catch (e) { return 'all'; }
  }
  function remember(v) {
    try { localStorage.setItem('rouh.watch.list', v); } catch (e) { /* a private window */ }
  }

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
  // Where the list is read and written: the owner's /api/watch, or, for a person a shared list was
  // shared with, the routes under their own share (`/shared/<token>/watch`, `rouh/web/watchlist.py`).
  function api(p) { return (host().api || '/api/watch') + (p || ''); }
  function guest() { return !!host().guest; }
  function href(n) { return host().href ? host().href(n) : '/watch/' + n; }
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
    again: '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20M17 4l3 3-3 3M4 17h3.5c1.4 0 2.4-1.2 3.3-2.8M13.2 9.8C14 8.2 15 7 16.5 7H20M17 14l3 3-3 3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    link: '<path d="M10 14l4-4M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2c2.4-.3 4.4 1.2 5 4.3"/>'
  };

  /* ---- words ---- */

  // "2023-2023" is one year (step 202-05).
  function oneYear(y) { var m = /^(\d{4})-(\d{4})$/.exec(y || ''); return m && m[1] === m[2] ? m[1] : (y || ''); }
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
  function epWords(n) { return n ? 'season ' + n.season + ', episode ' + n.episode : ''; }
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
  function times(n) { return n === 1 ? 'once' : n + ' times'; }
  function rated(r) { return r ? r + '/10' : ''; }
  // Every watch, as dates: "12 Mar 2025, 28 Nov 2026".
  function watchDays(t) { return (t.watches || []).map(day).join(', '); }

  /* ---- reading and writing ---- */

  function ask(url, body) {
    var init = { credentials: 'same-origin', cache: 'no-store' };
    if (body) {
      init.method = 'POST';
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (r) {
      if (r.status === 401 && !guest()) { location.href = '/login'; throw new Error('Sign in first.'); }
      if ((r.status === 401 || r.status === 403 || r.status === 410) && guest()) {
        return r.json().catch(function () { return null; }).then(function (j) {
          W.gone = (j && j.error) || 'This list is not shared with you any more.';
          throw new Error(W.gone);
        });
      }
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j) { throw new Error((j && j.error) || 'Rouh could not do that. Try again in a moment.'); }
        return j;
      });
    });
  }

  function load(quiet) {
    var seq = ++W.seq;
    if (!quiet) { W.loading = !W.data; draw(); }
    return ask(api()).then(function (j) {
      if (seq !== W.seq) { return; }
      W.data = j; W.error = ''; W.loading = false;
      if (guest()) { W.list = String(j.list); }
      else if (W.list !== 'all' && W.list !== '0' && !listById(W.list)) { W.list = 'all'; }
      if (W.detail && !find(W.detail)) { W.detail = 0; W.editing = false; }
      draw();
    }).catch(function (e) {
      if (seq !== W.seq) { return; }
      W.loading = false; W.error = e.message; draw();
    });
  }

  function items() { return (W.data && W.data.items) || []; }
  function lists() { return (W.data && W.data.lists) || []; }
  function listById(id) {
    var all = lists();
    for (var i = 0; i < all.length; i++) { if (String(all[i].id) === String(id)) { return all[i]; } }
    return null;
  }
  // The list shown, or null on All and My list.
  function shownList() { return W.list === 'all' || W.list === '0' ? null : listById(W.list); }
  // Whether a list is kept with somebody: a list of his own with nobody on it is just his (step 202-04).
  function isShared(id) {
    if (!id) { return false; }
    if (guest()) { return true; }
    var l = listById(id);
    return !!(l && l.people && l.people.length);
  }
  function listName(id) {
    if (!id) { return 'My list'; }
    var l = listById(id);
    return l ? l.name : 'a shared list';
  }
  // The titles of the list shown: every count, Tonight and the shelf read these.
  function inList() {
    if (W.list === 'all') { return items(); }
    var id = W.list === '0' ? 0 : parseInt(W.list, 10);
    return items().filter(function (t) { return (t.list || 0) === id; });
  }
  function countOf(list) {
    var c = { to_watch: 0, watching: 0, watched: 0, all: 0 };
    list.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; c.all += 1; });
    return c;
  }
  function pickList(v) {
    W.list = v; W.skip = []; W.q = ''; W.kind = ''; W.where = ''; W.tag = '';
    if (!guest()) { remember(v); }
    draw();
  }
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
  function counts() { return countOf(inList()); }

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
    var fits = function (t) { return !m || (t.runtime && t.runtime <= m); };
    var left = inList().filter(function (t) { return t.status !== 'watched' && fits(t); });
    var watching = left.filter(function (t) { return t.status === 'watching'; })
      .sort(function (a, b) { return b.updated_at - a.updated_at; });
    var next = left.filter(function (t) { return t.status === 'to_watch'; })
      .sort(function (a, b) { return a.rank - b.rank || a.number - b.number; });
    return watching.concat(next);
  }

  function names(list) {
    if (list.length < 2) { return list.join(''); }
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
  // On a shared list: who added it, and who has seen it before, so two people can choose.
  function together(t) {
    if (!t.list) { return ''; }
    var bits = [];
    if (W.list === 'all' && !guest()) { bits.push('On ' + listName(t.list) + '.'); }
    if (!isShared(t.list)) { return bits.join(' '); }
    bits.push((t.added_by_name || 'You') + ' added it.');
    var others = t.others || [];
    var seen = others.filter(function (o) { return o.seen_before; }).map(function (o) { return o.name; });
    if (t.seen_before) { seen.unshift('You'); }
    if (!seen.length) { bits.push(others.length === 1 ? 'Neither of you has seen it.' : 'Nobody on the list has seen it.'); }
    else { bits.push(names(seen) + (seen.length === 1 && seen[0] !== 'You' ? ' has' : ' have') + ' seen it before.'); }
    return bits.join(' ');
  }
  function why(t, list) {
    var we = isShared(t.list) ? ' together' : '';
    if (t.status === 'watching') {
      // Step 202-05: the next episode is on the press and under the bar, so the sentence stays short.
      return 'You are in the middle of it' + we + '.' + (W.list === 'all' && t.list && !guest() ? ' On ' + listName(t.list) + '.' : '');
    }
    var ahead = list.filter(function (x) { return x.status === 'to_watch'; });
    var at = ahead.indexOf(t) + 1;
    var s = at === 1 ? 'It is first in Up next, your list to watch.' : 'It is number ' + at + ' in Up next, your list to watch.';
    if (t.recommended_by) { s += ' ' + t.recommended_by + ' recommended it.'; }
    if (t.times_watched) { s += ' A rewatch: watched ' + times(t.times_watched) + ' before.'; }
    if (t.list) { var tg = together(t); if (tg) { s += ' ' + tg; } }
    return s;
  }

  function shown() {
    var list = inList().slice();
    if (W.view === 'next') { list = list.filter(function (t) { return t.status !== 'watched'; }); }
    if (W.view === 'watched') { list = list.filter(function (t) { return t.status === 'watched'; }); }
    if (W.kind === 'film') { list = list.filter(function (t) { return t.kind === 'film'; }); }
    if (W.kind === 'show') { list = list.filter(function (t) { return serial(t); }); }
    if (W.where) { list = list.filter(function (t) { return (t.where || '') === (W.where === '-' ? '' : W.where); }); }
    if (W.tag) { list = list.filter(function (t) { return hasTag(t, W.tag); }); }
    var q = norm(W.q.trim());
    if (q) { list = list.filter(function (t) { return matchesQ(t, q); }); }
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

  function hasTag(t, tag) {
    var k = norm(tag);
    return (t.tags || []).some(function (x) { return norm(x) === k; });
  }
  function matchesQ(t, q) {
    return [t.title, t.cast, t.notes, t.recommended_by, t.where, (t.genres || []).join(' '), (t.tags || []).join(' '), t.years]
      .some(function (s) { return norm(s).indexOf(q) >= 0; });
  }
  // Every tag on the titles given, most used first, as [tag, count].
  function tagsOf(list) {
    var n = {}, shownAs = {};
    list.forEach(function (t) {
      (t.tags || []).forEach(function (x) { var k = norm(x); n[k] = (n[k] || 0) + 1; if (!shownAs[k]) { shownAs[k] = x; } });
    });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || a.localeCompare(b); })
      .map(function (k) { return [shownAs[k], n[k]]; });
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

  // A rating as its number out of 10: "8/10", never stars to count.
  function score(r, who) {
    if (!r) { return null; }
    var s = el('span', 'wl-score');
    s.setAttribute('aria-label', (who || 'Your rating') + ': ' + r + ' out of 10');
    s.appendChild(el('span', 'wl-score-n', r));
    s.appendChild(el('span', 'wl-score-of', '/10'));
    return s;
  }

  // The one press a card offers: the next episode seen, or a film watched.
  function quick(t) {
    if (t.status === 'watched') {
      var a = button('ctl small wl-quick wl-quick-again', '', function () { watchAgain(t); }, 'Watch ' + t.title + ' again');
      a.appendChild(icon(I.again, 14));
      a.appendChild(document.createTextNode('Watch again'));
      return a;
    }
    if (serial(t) && t.next) {
      // Step 202-05: one press on a card; all of it watched is the title page's Status.
      return button('ctl small wl-quick', 'Seen ' + epLabel(t.next), function () { stepOn(t); },
                    'Mark season ' + t.next.season + ', episode ' + t.next.episode + ' of ' + t.title + ' seen');
    }
    return button('ctl small wl-quick', 'Mark watched', function () { markWatched(t); }, 'Mark ' + t.title + ' watched');
  }

  function card(t) {
    var li = el('li', 'wl-card');
    li.dataset.number = String(t.number);
    var open = el('a', 'wl-open');
    open.href = href(t.number);
    open.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
      e.preventDefault();
      openDetail(t.number);
    });
    open.appendChild(poster(t));
    var text = el('span', 'wl-card-text');
    text.appendChild(el('span', 'wl-card-title', t.title));
    text.appendChild(el('span', 'wl-card-facts', facts(t) + (t.runtime ? ', ' + mins(t.runtime) + (serial(t) ? ' an episode' : '') : '')));
    var who = [];
    if (W.list === 'all' && !guest() && lists().length) { who.push(listName(t.list)); }
    if (isShared(t.list)) { who.push('added by ' + (t.added_by_name || 'you')); }
    if (who.length) { text.appendChild(el('span', 'wl-card-who', who.join(', ').replace(/^./, function (x) { return x.toUpperCase(); }))); }
    open.appendChild(text);
    li.appendChild(open);
    if ((t.tags || []).length) { li.appendChild(tagChips(t.tags.slice(0, 3), t.tags.length - 3)); }
    var foot = el('div', 'wl-card-foot');
    var p = progress(t);
    if (p) { foot.appendChild(p); }
    var row = el('div', 'wl-card-row');
    if (t.status === 'watched') {
      var said = el('span', 'wl-card-said');
      said.appendChild(score(t.my_rating) || el('span', 'wl-dim', 'Not rated'));
      said.appendChild(el('span', 'wl-dim', t.times_watched > 1 ? 'watched ' + times(t.times_watched) : 'watched ' + day(t.watched_at)));
      row.appendChild(said);
      (t.others || []).forEach(function (o) {
        row.appendChild(el('span', 'wl-dim wl-their', o.name + ': ' + (o.rating ? rated(o.rating) : 'not rated')));
      });
    } else {
      row.appendChild(statusMark(t));
      var sc = score(t.my_rating);
      if (sc) { row.appendChild(sc); }
      if (t.times_watched) {
        var rw = el('span', 'wl-rewatch', 'Rewatch');
        rw.title = 'Watched ' + times(t.times_watched) + ': ' + watchDays(t);
        row.appendChild(rw);
      }
    }
    var q = quick(t);
    if (q) { row.appendChild(q); }
    foot.appendChild(row);
    li.appendChild(foot);
    return li;
  }

  function headline() {
    var c = counts();
    var l = shownList();
    if (!c.all) {
      return l ? 'Nothing on ' + l.name + ' yet.' : W.list === '0' && items().length ? 'Nothing on My list: everything is on a shared list.'
        : 'Your watch list is empty.';
    }
    return (l ? l.name + ': ' : W.list === '0' && lists().length ? 'My list: ' : '') + counted0(c);
  }
  function counted0(c) {
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
    var h = el('h4', 'wl-h', (shownList() && isShared(shownList().id)) || guest() ? 'Tonight, together' : 'Tonight');
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
    var longer = W.minutes ? inList().filter(function (x) {
      return x.status !== 'watched' && (!x.runtime || x.runtime > parseInt(W.minutes, 10));
    }).length : 0;
    if (longer && t) {
      var hid = el('p', 'wl-hint wl-hidden-note', counted(longer, 'title is', 'titles are') + ' left out: longer than ' + mins(parseInt(W.minutes, 10)) + ', or of a length not known.');
      var anyb = button('wl-inline', 'Show any length', function () { W.minutes = ''; draw(); });
      hid.appendChild(anyb);
      sec.appendChild(hid);
    }
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
    po.href = href(t.number);
    po.setAttribute('aria-label', 'Open ' + t.title);
    po.addEventListener('click', function (e) { e.preventDefault(); openDetail(t.number); });
    po.appendChild(poster(t));
    pick.appendChild(po);
    var body = el('div', 'wl-pick-body');
    var title = el('h5', 'wl-pick-title');
    var ta = el('a', '', t.title);
    ta.href = href(t.number);
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
      main.appendChild(document.createTextNode('Seen ' + epWords(t.next)));
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
        a.href = href(x.number);
        a.addEventListener('click', function (e) { e.preventDefault(); openDetail(x.number); });
        a.appendChild(poster(x, 'is-thumb'));
        var tx = el('span', 'wl-match-text');
        tx.appendChild(el('span', 'wl-then-title', x.title));
        var f = [];
        if (x.status === 'watching' && x.next) { f.push('next ' + epLabel(x.next)); }
        if (x.times_watched && x.status !== 'watched') { f.push('a rewatch'); }
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

  // A row of choices, each one press (step 202-05): Kind, Where, Tag and Sort in the Filter panel.
  function choices(label, value, options, change) {
    var g = el('div', 'wl-choices');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    g.appendChild(el('span', 'wl-field-label', label));
    var row = el('div', 'wl-choice-row');
    options.forEach(function (o) {
      var b = button('wl-opt', '', function () { change(o[0]); });
      b.setAttribute('aria-pressed', o[0] === value ? 'true' : 'false');
      b.appendChild(el('span', '', o[1]));
      if (o[2]) { b.appendChild(el('span', 'wl-opt-n', o[2])); }
      row.appendChild(b);
    });
    g.appendChild(row);
    return g;
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
    var shelfHead = el('div', 'wl-shelf-head');
    shelfHead.appendChild(nav);
    into.appendChild(shelfHead);

    // Step 202-05: the search is always there; Kind, Where, Tag and Sort sit behind Filter, each a row of
    // choices that take one press, and every filter that is on shows as a chip with a cross.
    var tools = el('div', 'wl-tools');
    var sw = el('label', 'wl-field wl-search');
    sw.appendChild(el('span', 'wl-sr', 'Search the watch list'));
    sw.appendChild(icon(I.search));
    var si = el('input', 'wl-in');
    si.type = 'search';
    si.id = 'wlSearch';
    var bw = $('watchBody');
    si.placeholder = bw && bw.clientWidth <= 560 ? 'Search' : 'Search titles, people, notes, tags';
    si.value = W.q;
    si.autocomplete = 'off';
    si.addEventListener('input', function () { W.q = si.value; drawGrid(); });
    sw.appendChild(si);
    tools.appendChild(sw);
    var on = (W.kind ? 1 : 0) + (W.where ? 1 : 0) + (W.tag ? 1 : 0) + (W.sort ? 1 : 0);
    var fb = button('ctl wl-filter-b', '', function () {
      W.filters = !W.filters; draw();
      var fp = $('wlFilters');
      if (fp && fp.getBoundingClientRect().bottom > window.innerHeight) { fp.scrollIntoView({ block: 'nearest' }); }
    });
    fb.id = 'wlFilterB';
    fb.setAttribute('aria-expanded', W.filters ? 'true' : 'false');
    fb.setAttribute('aria-controls', 'wlFilters');
    fb.appendChild(icon(I.filter));
    fb.appendChild(document.createTextNode('Filter'));
    if (on) { fb.appendChild(el('span', 'wl-tab-n is-on', on)); }
    fb.setAttribute('aria-label', 'Filter and sort' + (on ? ', ' + on + ' on' : ''));
    tools.appendChild(fb);
    shelfHead.appendChild(tools);

    var services = {};
    inList().forEach(function (t) { services[t.where || '-'] = 1; });
    var wh = Object.keys(services).sort().map(function (k) { return [k, k === '-' ? 'Not said' : k]; });
    var tg = tagsOf(inList());
    if (W.filters) {
      var panel = el('div', 'wl-filters');
      panel.id = 'wlFilters';
      panel.appendChild(choices('Kind', W.kind, [['', 'Everything'], ['film', 'Films'], ['show', 'Shows and series']],
        function (v) { W.kind = v; draw(); }));
      if (wh.length > 1) {
        panel.appendChild(choices('Where', W.where, [['', 'Anywhere']].concat(wh), function (v) { W.where = v; draw(); }));
      }
      if (tg.length) {
        panel.appendChild(choices('Tag', W.tag, [['', 'Any tag']].concat(tg.map(function (x) { return [x[0], x[0], x[1]]; })),
          function (v) { W.tag = v; draw(); }));
      }
      panel.appendChild(choices('Sort', W.sort, SORTS[W.view], function (v) { W.sort = v; draw(); }));
      into.appendChild(panel);
    }
    var chips = [];
    if (W.kind) { chips.push([W.kind === 'film' ? 'Films' : 'Shows and series', function () { W.kind = ''; }]); }
    if (W.where) { chips.push([W.where === '-' ? 'Where: not said' : W.where, function () { W.where = ''; }]); }
    if (W.tag) { chips.push(['Tag: ' + W.tag, function () { W.tag = ''; }]); }
    if (W.sort) {
      var so = SORTS[W.view].filter(function (x) { return x[0] === W.sort; })[0];
      if (so) { chips.push(['Sorted: ' + so[1].toLowerCase(), function () { W.sort = ''; }]); }
    }
    if (chips.length && !W.filters) {
      var cr = el('ul', 'wl-chips');
      cr.setAttribute('aria-label', 'Filters that are on');
      chips.forEach(function (c) {
        var li = el('li');
        var b = button('wl-chip', '', function () { c[1](); draw(); }, 'Take off ' + c[0]);
        b.appendChild(el('span', '', c[0]));
        b.appendChild(icon(I.close, 14));
        li.appendChild(b);
        cr.appendChild(li);
      });
      into.appendChild(cr);
    }

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
    var filtered = W.q.trim() || W.kind || W.where || W.tag;
    // Searching Up next: a title watched already is still there to watch again, so say it is in Watched.
    var also = [];
    if (W.view === 'next' && (W.q.trim() || W.tag)) {
      var q = norm(W.q.trim());
      also = inList().filter(function (t) {
        return t.status === 'watched' && (!q || matchesQ(t, q)) && (!W.tag || hasTag(t, W.tag));
      });
    }
    function alsoNote() {
      if (!also.length) { return null; }
      var n = el('div', 'wl-also');
      n.appendChild(el('span', 'wl-hint', (also.length === 1 ? also[0].title + ' is' : counted(also.length, 'title', 'titles') + ' that match are') +
        ' in Watched, ready to watch again.'));
      n.appendChild(button('ctl small', also.length === 1 ? 'Show it' : 'Show them', function () { W.view = 'all'; W.sort = ''; draw(); }));
      return n;
    }
    if (!list.length) {
      var empty = el('div', 'wl-empty');
      if (filtered) {
        empty.appendChild(el('p', 'wl-lede', 'Nothing here matches.'));
        empty.appendChild(button('ctl small', 'Clear the search and filters', function () {
          W.q = ''; W.kind = ''; W.where = ''; W.tag = ''; draw();
        }));
        var an = alsoNote();
        if (an) { empty.appendChild(an); }
      } else if (W.view === 'watched') {
        empty.appendChild(el('p', 'wl-lede', 'Nothing finished yet. A film comes here when you mark it watched, a show when its last episode is seen.'));
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
      var an2 = alsoNote();
      if (an2) { grid.appendChild(an2); }
    }
    var ul = el('ul', 'wl-grid');
    list.forEach(function (t) { ul.appendChild(card(t)); });
    grid.appendChild(ul);
  }


  /* ---- lists, and the people on them ---- */

  function initials(name) {
    var words = String(name || '?').replace(/@.*$/, '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    return ((words[0] || '?').charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  }
  function face(name, cls) {
    var f = el('span', 'wl-face' + (cls ? ' ' + cls : ''), initials(name));
    f.setAttribute('aria-hidden', 'true');
    return f;
  }

  // All, My list and each shared list, with what is left to watch on each. Only once a list is shared.
  // Step 202-05: one strip, always there for the owner: All lists, My list, each list, then New list.
  // It never wraps; it scrolls inside itself, with a fade at the edge that has more.
  function drawLists(into) {
    if (guest()) { return; }
    var wrap = el('div', 'wl-strip');
    var row = el('div', 'wl-lists');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Which list');
    var none = !lists().length;
    var opts = none ? [] : [['all', 'All lists', items()]];
    opts.push(['0', 'My list', items().filter(function (t) { return !t.list; })]);
    lists().forEach(function (l) {
      opts.push([String(l.id), l.name, items().filter(function (t) { return t.list === l.id; }), l]);
    });
    opts.forEach(function (o) {
      var c = countOf(o[2]);
      var b = button('wl-list-b', '', function () { pickList(o[0]); });
      var on = none ? o[0] === '0' : W.list === o[0];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (o[3] && o[3].people && o[3].people.length) {
        var sh = icon(I.people, 14);
        sh.setAttribute('aria-hidden', 'true');
        b.appendChild(sh);
      }
      b.appendChild(el('span', 'wl-list-name', o[1]));
      b.appendChild(el('span', 'wl-tab-n', c.all));
      b.setAttribute('aria-label', o[1] + ', ' + counted(c.all, 'title', 'titles') + (o[3] && o[3].people.length ? ', shared' : ''));
      row.appendChild(b);
    });
    var nl = button('wl-list-b wl-list-new', '', function () { openSheet('list'); });
    nl.id = 'wlNewList';
    nl.setAttribute('aria-haspopup', 'dialog');
    nl.appendChild(icon(I.plus, 14));
    nl.appendChild(el('span', 'wl-list-name', 'New list'));
    var line = el('div', 'wl-strip-line' + (none ? '' : ' has-lists'));
    wrap.appendChild(row);
    line.appendChild(wrap);
    line.appendChild(nl);
    if (!none && W.list === 'all') {
      // Every list at once: Share a list sits on this row, so no line of its own is needed.
      var sa = button('wl-list-b wl-list-new', '', function () { openSheet('new'); });
      sa.id = 'wlShareBtn';
      sa.setAttribute('aria-haspopup', 'dialog');
      sa.appendChild(icon(I.people, 14));
      sa.appendChild(el('span', 'wl-list-name', 'Share a list'));
      line.appendChild(sa);
    }
    into.appendChild(line);
    // The fade says there is more to the side; it goes once the strip is scrolled to that end.
    var edge = function () {
      wrap.classList.toggle('has-more-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
      wrap.classList.toggle('has-more-left', row.scrollLeft > 2);
    };
    row.addEventListener('scroll', edge, { passive: true });
    requestAnimationFrame(function () {
      var on = row.querySelector('[aria-pressed="true"]');
      if (on && (on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth - 56 || (row.scrollLeft > 2 && on.offsetLeft < row.scrollLeft + 56))) {
        row.scrollLeft = Math.max(0, on.offsetLeft - 60);
      }
      edge();
    });
  }

  // Who is on the list shown: you, and each person, joined or only invited.
  function drawPeople(into) {
    var l = guest() ? (lists()[0] || null) : shownList();
    var row = el('div', 'wl-people');
    if (!l) {
      // My list, or every list at once (step 202-05): who sees it, and Share a list from here.
      if (guest() || !items().length || (W.list === 'all' && lists().length)) { return; }
      var mine = el('p', 'wl-person wl-only');
      var mineAll = W.list === 'all' && lists().length;
      mine.appendChild(el('span', 'wl-person-name', mineAll ? 'Every list at once' : 'Only you see My list'));
      row.appendChild(mine);
      var sa = button('ctl small wl-people-b', '', function () { openSheet('new'); });
      sa.id = 'wlShareBtn';
      sa.setAttribute('aria-haspopup', 'dialog');
      sa.appendChild(icon(I.people, 14));
      sa.appendChild(document.createTextNode('Share a list'));
      row.appendChild(sa);
      into.appendChild(row);
      return;
    }
    if (!guest() && !l.people.length) {
      // A list of his own (step 202-04): nobody else sees it until he shares it.
      var only = el('p', 'wl-person wl-only');
      only.appendChild(el('span', 'wl-person-name', 'Only you'));
      only.appendChild(el('span', 'wl-dim', 'nobody else sees this list'));
      row.appendChild(only);
      var ra = el('div', 'wl-acts');
      var shb = button('ctl small wl-people-b', '', function () { openSheet('people', l.id); });
      shb.setAttribute('aria-haspopup', 'dialog');
      shb.appendChild(icon(I.people, 14));
      shb.appendChild(document.createTextNode('Share this list'));
      ra.appendChild(shb);
      var rd = button('ctl small wl-ghost', 'Rename or delete', function () { openSheet('people', l.id); });
      rd.setAttribute('aria-haspopup', 'dialog');
      ra.appendChild(rd);
      row.appendChild(ra);
      into.appendChild(row);
      return;
    }
    var ul = el('ul', 'wl-people-list');
    ul.setAttribute('aria-label', 'On this list');
    var all = [{ name: 'You', you: true, joined: true }];
    if (guest()) { all.push({ name: l.owner_name, joined: true, owner: true }); }
    l.people.forEach(function (p) { if (!p.you) { all.push(p); } });
    var most = 4;
    all.slice(0, most).forEach(function (p) {
      var li = el('li', 'wl-person' + (p.joined ? '' : ' is-invited'));
      li.appendChild(face(p.name || p.email));
      var label = p.name || p.email;
      li.appendChild(el('span', 'wl-person-name', label));
      if (p.owner) { li.appendChild(el('span', 'wl-dim', 'shared it')); }
      else if (!p.joined) { li.appendChild(el('span', 'wl-dim', 'invited, not opened yet')); }
      ul.appendChild(li);
    });
    if (all.length > most) { ul.appendChild(el('li', 'wl-person wl-dim', '+' + (all.length - most) + ' more')); }
    row.appendChild(ul);
    if (guest() && W.data && W.data.read_only) {
      row.appendChild(el('p', 'wl-hint wl-lookonly', 'You can look at this list; ' + (l.owner_name || 'its owner') + ' keeps it, so nothing here can be changed.'));
    }
    if (guest() && !W.leaving) {
      row.appendChild(button('ctl small wl-people-b', 'Leave this list', function () { W.leaving = true; draw(); }));
    }
    if (!guest()) {
      var b = button('ctl small wl-people-b', 'People and invites', function () { openSheet('people', l.id); });
      b.setAttribute('aria-haspopup', 'dialog');
      row.appendChild(b);
    }
    into.appendChild(row);
    drawLeave(into);
  }

  /* ---- the Share a list and People sheet (the owner's) ---- */

  function openSheet(mode, id) {
    W.sheet = { mode: mode, id: id || 0, said: '', link: '', busy: false, confirmStop: false,
                email: '', name: '', listName: '', named: false, role: 'edit', letter: false, bring: {} };
    draw();
    var f = $('wlSheetFirst');
    if (f) { f.focus(); }
  }
  function closeSheet() {
    W.sheet = null;
    draw();
    var b = $('wlShareBtn') || $('wlNewList') || document.querySelector('.wl-people-b');
    if (b) { b.focus(); }
  }

  function field(label, input) {
    var f = el('label', 'wl-field');
    f.appendChild(el('span', 'wl-field-label', label));
    f.appendChild(input);
    return f;
  }
  function textInput(id, type, value, placeholder, onInput) {
    var i = el('input', 'wl-in');
    i.id = id; i.type = type; i.value = value || ''; i.autocomplete = 'off';
    if (placeholder) { i.placeholder = placeholder; }
    i.addEventListener('input', function () { onInput(i.value); });
    return i;
  }
  function roleChoice(S) {
    var fs = el('fieldset', 'wl-choice');
    fs.appendChild(el('legend', 'wl-field-label', 'They can'));
    [['edit', 'Add and tick', 'Add titles, tick episodes, rate and note'], ['view', 'Only look', 'See the list and Tonight, change nothing']]
      .forEach(function (o) {
        var lab = el('label', 'wl-radio');
        var r = el('input');
        r.type = 'radio'; r.name = 'wlRole'; r.value = o[0]; r.checked = S.role === o[0];
        r.addEventListener('change', function () { S.role = o[0]; });
        lab.appendChild(r);
        var tx = el('span', 'wl-radio-text');
        tx.appendChild(el('span', 'wl-radio-name', o[1]));
        tx.appendChild(el('span', 'wl-dim', o[2]));
        lab.appendChild(tx);
        fs.appendChild(lab);
      });
    return fs;
  }
  function letterBox(S) {
    var lab = el('label', 'wl-check');
    var c = el('input');
    c.type = 'checkbox'; c.checked = S.letter;
    c.addEventListener('change', function () { S.letter = c.checked; });
    lab.appendChild(c);
    var tx = el('span', 'wl-radio-text');
    tx.appendChild(el('span', '', 'Also email them the invite'));
    tx.appendChild(el('span', 'wl-dim', S.letter ? 'Rouh sends it as you press Make the invite.' : 'Off: you send them the link yourself.'));
    lab.appendChild(tx);
    c.addEventListener('change', function () { tx.lastChild.textContent = c.checked ? 'Rouh sends it as you press Make the invite.' : 'Off: you send them the link yourself.'; });
    return lab;
  }

  // What became of an invite: the sentence, and the link to copy whatever happened to the letter.
  function drawSaid(box, S) {
    if (!S.said) { return; }
    var said = el('div', 'wl-said');
    said.setAttribute('role', 'status');
    said.appendChild(el('p', 'wl-said-text', S.said));
    if (S.link) {
      var row = el('div', 'wl-link-row');
      var inp = el('input', 'wl-in wl-link');
      inp.readOnly = true; inp.value = S.link; inp.id = 'wlInviteLink';
      inp.setAttribute('aria-label', 'Their link');
      row.appendChild(inp);
      row.appendChild(button('ctl small', 'Copy the link', function () { copy(S.link); }));
      said.appendChild(row);
    }
    box.appendChild(said);
  }
  function copy(text) {
    var done = function () { toast('The link is copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Select the link and copy it.'); });
    } else { toast('Select the link and copy it.'); }
  }

  function invite(S, id) {
    var email = S.email.trim();
    if (!email) { S.said = 'Write their email address first.'; S.link = ''; draw(); return; }
    S.busy = true; draw();
    var body = { email: email, name: S.name.trim(), role: S.role, notify: S.letter };
    var url = id ? api('/lists/' + id + '/invite') : api('/lists/new');
    if (!id) {
      body.list_name = (S.listName || defaultName(S)).trim();
      body.titles = Object.keys(S.bring).filter(function (k) { return S.bring[k]; }).map(Number);
    }
    ask(url, body).then(function (j) {
      W.data = j.data || W.data;
      S.busy = false; S.said = j.said; S.link = j.link || '';
      if (!id && j.list) { S.mode = 'people'; S.id = j.list.id; W.list = String(j.list.id); remember(W.list); }
      S.email = ''; S.name = ''; S.letter = false;
      draw();
    }).catch(function (e) { S.busy = false; S.said = e.message; S.link = ''; draw(); });
  }
  function defaultName(S) {
    var me = (W.data && W.data.me && W.data.me.name) || 'Me';
    var them = (S.name || S.email.replace(/@.*$/, '')).trim().split(/\s+/)[0];
    return them ? me + ' and ' + them.charAt(0).toUpperCase() + them.slice(1) : me + "'s shared list";
  }

  function drawSheet(view) {
    var S = W.sheet;
    var old = $('wlSheet');
    if (old) { old.remove(); }
    if (!S || !W.data) { return; }
    var back = el('div', 'wl-sheet-back');
    back.id = 'wlSheet';
    back.addEventListener('mousedown', function (e) { if (e.target === back) { closeSheet(); } });
    var box = el('section', 'wl-sheet');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'wlSheetH');
    var top = el('div', 'wl-add-top');
    var l = S.mode === 'people' ? listById(S.id) : null;
    var h = el('h4', 'wl-h', l ? l.name : S.mode === 'list' ? 'New list' : 'Share a list');
    h.id = 'wlSheetH';
    top.appendChild(h);
    var x = button('wl-toast-x', '', closeSheet, 'Close');
    x.appendChild(icon(I.close, 16));
    top.appendChild(x);
    box.appendChild(top);

    if (S.mode === 'list') {
      drawNewList(box, S);
      back.appendChild(box); view.appendChild(back);
      return;
    }

    if (W.data.can_share && (S.mode === 'new' || (l && !l.people.length))) {
      box.appendChild(el('p', 'wl-lede', W.data.can_share));
      if (l) { drawListTail(box, S, l); }
      back.appendChild(box); view.appendChild(back);
      return;
    }

    if (S.mode === 'new') {
      box.appendChild(el('p', 'wl-hint', 'A list you keep with someone. They open it with a rouh.land sign-in, from the email or the link; nothing else of yours opens to them.'));
      var form = el('form', 'wl-sheet-form');
      var em = textInput('wlSheetFirst', 'email', S.email, 'maria@example.com', function (v) { S.email = v; nameHint(); });
      form.appendChild(field('Their email', em));
      form.appendChild(field('Their name', textInput('wlInvName', 'text', S.name, 'What you call them', function (v) { S.name = v; nameHint(); })));
      var ln = textInput('wlListName', 'text', S.listName || defaultName(S), '', function (v) { S.listName = v; S.named = true; });
      form.appendChild(field('Name of the list', ln));
      function nameHint() { if (!S.named) { ln.value = defaultName(S); S.listName = ''; } }
      form.appendChild(roleChoice(S));
      var bb = bringBox(S);
      if (bb) { form.appendChild(bb); }
      form.appendChild(letterBox(S));
      var acts = el('div', 'wl-acts');
      var go = el('button', 'ctl wl-primary', S.busy ? 'Making the invite...' : 'Make the invite');
      go.type = 'submit'; go.disabled = S.busy;
      acts.appendChild(go);
      acts.appendChild(button('ctl small', 'Cancel', closeSheet));
      form.appendChild(acts);
      form.addEventListener('submit', function (e) { e.preventDefault(); invite(S, 0); });
      box.appendChild(form);
      drawSaid(box, S);
      back.appendChild(box); view.appendChild(back);
      return;
    }

    if (!l) { W.sheet = null; return; }
    drawSaid(box, S);
    var ppl = el('ul', 'wl-sheet-people');
    ppl.setAttribute('aria-label', 'People on ' + l.name);
    var me = el('li', 'wl-sheet-person');
    me.appendChild(face('You'));
    var mt = el('span', 'wl-sheet-who');
    mt.appendChild(el('span', 'wl-person-name', 'You'));
    mt.appendChild(el('span', 'wl-dim', 'made the list'));
    me.appendChild(mt);
    ppl.appendChild(me);
    l.people.forEach(function (p) {
      var li = el('li', 'wl-sheet-person');
      li.appendChild(face(p.name || p.email));
      var tx = el('span', 'wl-sheet-who');
      tx.appendChild(el('span', 'wl-person-name', p.name ? p.name : p.email));
      var state = [p.name ? p.email : '', p.joined ? 'joined' : 'invited, not opened yet',
                   p.role === 'view' ? 'can only look' : 'can add and tick'];
      if (!p.joined && !p.mailed) { state.push(p.mail_error ? 'the email did not go: ' + p.mail_error.replace(/\.$/, '') : 'no email sent'); }
      tx.appendChild(el('span', 'wl-dim', state.filter(Boolean).join(', ')));
      li.appendChild(tx);
      var pa = el('span', 'wl-acts');
      if (!p.joined && p.link) { pa.appendChild(button('ctl small', 'Copy link', function () { copy(p.link); }, 'Copy the link for ' + (p.name || p.email))); }
      pa.appendChild(button('ctl small wl-remove', 'Remove', function () { uninvite(l, p); }, 'Remove ' + (p.name || p.email) + ' from the list'));
      li.appendChild(pa);
      ppl.appendChild(li);
    });
    box.appendChild(ppl);
    if (!l.people.length) { box.appendChild(el('p', 'wl-hint', 'Only you see this list. Invite someone to share it: they open it with a rouh.land sign-in, and nothing else of yours opens to them.')); }

    var form2 = el('form', 'wl-sheet-form wl-sheet-invite');
    form2.appendChild(el('h5', 'wl-h', l.people.length ? 'Invite someone' : 'Share it with someone'));
    var two = el('div', 'wl-edit-grid');
    two.appendChild(field('Their email', textInput('wlSheetFirst', 'email', S.email, 'name@example.com', function (v) { S.email = v; })));
    two.appendChild(field('Their name', textInput('wlInvName', 'text', S.name, 'What you call them', function (v) { S.name = v; })));
    form2.appendChild(two);
    form2.appendChild(roleChoice(S));
    form2.appendChild(letterBox(S));
    var a2 = el('div', 'wl-acts');
    var go2 = el('button', 'ctl wl-primary', S.busy ? 'Making the invite...' : 'Make the invite');
    go2.type = 'submit'; go2.disabled = S.busy;
    a2.appendChild(go2);
    form2.appendChild(a2);
    form2.addEventListener('submit', function (e) { e.preventDefault(); invite(S, l.id); });
    box.appendChild(form2);
    drawListTail(box, S, l);
    back.appendChild(box);
    view.appendChild(back);
  }

  // Bring titles over from My list: for a new list, shared or not.
  function bringBox(S) {
    var mine = items().filter(function (t) { return !t.list && t.status !== 'watched'; });
    if (!mine.length) { return null; }
    var fs = el('fieldset', 'wl-choice');
    fs.appendChild(el('legend', 'wl-field-label', 'Move titles here from My list (optional): a ticked title leaves My list and goes to this list'));
    var ul = el('div', 'wl-bring');
    mine.forEach(function (t) {
      var lab = el('label', 'wl-check');
      var c = el('input');
      c.type = 'checkbox'; c.checked = !!S.bring[t.number];
      c.addEventListener('change', function () { S.bring[t.number] = c.checked; });
      lab.appendChild(c);
      lab.appendChild(el('span', '', t.title));
      ul.appendChild(lab);
    });
    fs.appendChild(ul);
    return fs;
  }

  // New list: a list of his own, shared with nobody until he invites someone (step 202-04).
  function drawNewList(box, S) {
    box.appendChild(el('p', 'wl-hint', 'A list is who you watch with, such as the kids. Only you see it until you share it.'));
    box.appendChild(el('p', 'wl-hint', 'Tags are different: short words on a title, like cosy, that work across every list. It is fine to make the list empty and add titles later.'));
    var form = el('form', 'wl-sheet-form');
    form.appendChild(field('Name of the list', textInput('wlSheetFirst', 'text', S.listName, 'For example: Weekend films', function (v) { S.listName = v; })));
    var bb = bringBox(S);
    if (bb) { form.appendChild(bb); }
    var acts = el('div', 'wl-acts');
    var go = el('button', 'ctl wl-primary', S.busy ? 'Making the list...' : 'Make the list');
    go.type = 'submit'; go.disabled = S.busy;
    acts.appendChild(go);
    acts.appendChild(button('ctl small', 'Cancel', closeSheet));
    form.appendChild(acts);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (S.listName || '').trim();
      if (!name) { S.said = 'Give the list a name first.'; draw(); return; }
      S.busy = true; draw();
      ask(api('/lists/new'), { list_name: name, titles: Object.keys(S.bring).filter(function (k) { return S.bring[k]; }).map(Number) })
        .then(function (j) {
          W.data = j.data || W.data;
          W.sheet = null;
          W.list = String(j.list.id); remember(W.list);
          draw();
          toast(j.list.name + ' is made. Only you see it.');
        }).catch(function (e) { S.busy = false; S.said = e.message; draw(); });
    });
    box.appendChild(form);
    if (S.said) { var sd = el('p', 'wl-error', S.said); sd.setAttribute('role', 'alert'); box.appendChild(sd); }
  }

  // The foot of a list's sheet: its name, Stop sharing (the list stays his), Delete this list.
  function drawListTail(box, S, l) {
    var tail = el('div', 'wl-sheet-tail');
    var rn = textInput('wlRename', 'text', l.name, '', function () {});
    rn.addEventListener('change', function () {
      act(api('/lists/' + l.id), { name: rn.value }, function (j) { if (j.data) { W.data = j.data; } toast('The list is called ' + rn.value.trim() + ' now.'); });
    });
    tail.appendChild(field('Name of the list', rn));
    var row = el('div', 'wl-acts');
    if (l.people.length && S.confirmStop !== 'stop') {
      row.appendChild(button('ctl small wl-remove', 'Stop sharing this list', function () { S.confirmStop = 'stop'; draw(); }));
    }
    if (S.confirmStop !== 'delete') {
      row.appendChild(button('ctl small wl-remove', 'Delete this list', function () { S.confirmStop = 'delete'; draw(); }));
    }
    tail.appendChild(row);
    if (S.confirmStop === 'stop' || S.confirmStop === 'delete') {
      var del = S.confirmStop === 'delete';
      var c = el('div', 'wl-confirm');
      c.setAttribute('role', 'alert');
      c.appendChild(el('p', 'wl-said-text', del
        ? 'Delete ' + l.name + '? Its titles go back to My list, with your ratings and notes' + (l.people.length ? ', and nobody else can open it.' : '.')
        : 'Stop sharing ' + l.name + '? Nobody else can open it from now on. The list and its titles stay, yours alone.'));
      var ca = el('div', 'wl-acts');
      ca.appendChild(button('ctl small wl-remove', del ? 'Yes, delete it' : 'Yes, stop sharing', function () {
        act(api('/lists/' + l.id + (del ? '/delete' : '/stop')), {}, function (j) {
          if (j.data) { W.data = j.data; }
          if (del) { W.list = '0'; remember('0'); W.sheet = null; }
          else { S.confirmStop = false; }
          toast(del ? l.name + ' is deleted. Its titles are on My list.' : l.name + ' is not shared any more. It is yours alone now.');
        });
      }));
      ca.appendChild(button('ctl small', del ? 'Keep it' : 'Keep sharing', function () { S.confirmStop = false; draw(); }));
      c.appendChild(ca);
      tail.appendChild(c);
    }
    box.appendChild(tail);
  }

  function uninvite(l, p) {
    act(api('/lists/' + l.id + '/uninvite'), { token: p.token }, function (j) {
      if (j.data) { W.data = j.data; }
      toast((p.name || p.email) + ' is off ' + l.name + '. Their link stops working now.', function () {
        act(api('/lists/' + l.id + '/putback'), { was: j.was }, function (k) {
          if (k.data) { W.data = k.data; }
          toast((p.name || p.email) + ' is back on ' + l.name + ', with the same link.');
        });
      });
    });
  }

  // The other person's page: Leave this list, asked once.
  function drawLeave(into) {
    if (!guest()) { return; }
    var l = lists()[0];
    var box = el('div', 'wl-leave');
    if (!W.leaving) {
      return;
    } else {
      box.setAttribute('role', 'alert');
      box.appendChild(el('p', 'wl-said-text', 'Leave ' + (l ? l.name : 'this list') + '? You will not be able to open it again unless ' +
        (l ? l.owner_name : 'its owner') + ' invites you again. Your ratings and notes stay on it.'));
      var a = el('div', 'wl-acts');
      a.appendChild(button('ctl small wl-remove', 'Yes, leave', function () {
        ask(api('/leave'), {}).then(function () { W.gone = 'You left ' + (l ? l.name : 'the list') + '.'; draw(); })
          .catch(function (e) { toast(e.message); });
      }));
      a.appendChild(button('ctl small', 'Stay', function () { W.leaving = false; draw(); }));
      box.appendChild(a);
    }
    into.appendChild(box);
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
      ask(api('/search?q=') + encodeURIComponent(q)).then(function (j) {
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

  // The title of theirs a match is, by its IMDb number, or its name and year: so it is not added twice.
  function already(m) {
    var all = items();
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      if (m.imdb_id && t.imdb_id === m.imdb_id) { return t; }
      if (!m.imdb_id || !t.imdb_id) {
        if (norm(t.title) === norm(m.title) && (!m.year || !t.year || t.year === m.year)) { return t; }
      }
    }
    return null;
  }

  function addPick(m) {
    W.addBusy = m ? m.key : 'name';
    drawMatches();
    var body = m ? { pick: m, title: m.title } : { title: W.addQ.trim(), lookup: false };
    var l = shownList();
    if (l && !guest()) { body.list = l.id; }
    ask(api('/new'), body).then(function (j) {
      put(j.item);
      W.adding = false; W.addBusy = '';
      W.view = 'next';
      toast('Added ' + j.item.title + ' to the end of Up next on ' + (j.item.list ? listName(j.item.list) : 'My list') + '. Here is its page.' + (j.said ? ' ' + j.said : ''));
      openDetail(j.item.number);
    }).catch(function (e) { W.addBusy = ''; toast(e.message); drawMatches(); });
  }

  function drawAdd(into) {
    var box = el('section', 'wl-add');
    box.setAttribute('aria-labelledby', 'wlAddH');
    var top = el('div', 'wl-add-top');
    var h = el('h4', 'wl-h', shownList() || guest() ? 'Add a title to ' + (shownList() || lists()[0] || {}).name : 'Add a title');
    h.id = 'wlAddH';
    top.appendChild(h);
    top.appendChild(button('ctl small', 'Cancel', stopAdd));
    box.appendChild(top);
    var f = el('label', 'wl-field');
    f.appendChild(el('span', 'wl-field-label', 'Film or show'));
    var how = el('span', 'wl-hint', 'Type its name, then press the one you mean in the list that appears: that adds it.');
    how.id = 'wlAddHow';
    var q = el('input', 'wl-in wl-add-in');
    q.id = 'wlAddQ';
    q.type = 'text';
    q.autocomplete = 'off';
    q.placeholder = 'Its name, as you heard it';
    q.setAttribute('aria-describedby', 'wlAddHow');
    q.value = W.addQ;
    q.addEventListener('input', function () { W.addQ = q.value; lookUp(); });
    f.appendChild(how);
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

  // Whether the name typed is a title of theirs already.
  function ownFirst() {
    var q = norm(W.addQ.trim());
    return q.length >= 2 && items().some(function (t) { return norm(t.title) === q; });
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
    if (W.look === 'offline' && ownFirst()) {
      m.appendChild(el('p', 'wl-hint', 'It is on your list already:'));
    } else if (W.look === 'offline') {
      m.appendChild(el('p', 'wl-hint', 'The lookup is not answering right now. Add it by its name, and look its details up later.'));
    } else if (W.look === 'done' && !W.matches.length && !ownFirst()) {
      m.appendChild(el('p', 'wl-hint', 'No film or show by that name was found.'));
    }
    // Titles of theirs with the name typed come first, even with the lookup out of reach, so a
    // film watched before is watched again rather than added twice.
    var own = q.length >= 2 ? items().filter(function (t) {
      return norm(t.title) === norm(q) && !W.matches.some(function (m) { return already(m) === t; });
    }).map(function (t) {
      return { key: 'own' + t.number, title: t.title, year: t.year, years: t.years, kind_said: KIND[t.kind] || t.kind,
               imdb_id: t.imdb_id, poster: t.poster, cast: '' };
    }) : [];
    var shownMatches = own.concat(W.matches);
    if (shownMatches.length) {
      var ul = el('ul', 'wl-match-list');
      shownMatches.forEach(function (x) {
        var li = el('li');
        var have = already(x);
        var b = button('wl-match' + (have ? ' is-have' : ''), '', function () {
          if (!have) { addPick(x); return; }
          W.adding = false;
          if (have.status === 'watched') { watchAgain(have); }
          openDetail(have.number);
        });
        b.disabled = !!W.addBusy;
        b.appendChild(poster({ title: x.title, poster: x.poster }, 'is-thumb'));
        var tx = el('span', 'wl-match-text');
        tx.appendChild(el('span', 'wl-match-title', x.title));
        tx.appendChild(el('span', 'wl-match-facts', [oneYear(x.years) || x.year || '', x.kind_said].filter(Boolean).join(', ')));
        if (x.cast) { tx.appendChild(el('span', 'wl-match-cast', x.cast)); }
        b.appendChild(tx);
        if (have) {
          tx.appendChild(el('span', 'wl-match-have', 'On ' + listName(have.list) + ', ' + (have.status === 'watched'
            ? 'watched ' + times(have.times_watched || 1) : have.status_said.toLowerCase())));
        }
        var go = have ? (have.status === 'watched' ? 'Watch again' : 'Open') : W.addBusy === x.key ? 'Adding...' : 'Add';
        b.appendChild(el('span', 'wl-match-go', go));
        b.setAttribute('aria-label', go + ' ' + x.title + (x.years || x.year ? ', ' + (x.years || x.year) : '') + ', ' + x.kind_said +
          (have ? ', already on ' + listName(have.list) : ''));
        li.appendChild(b);
        ul.appendChild(li);
      });
      m.appendChild(ul);
    }
    if (q && !own.length && !W.matches.length && W.look !== 'looking') {
      var plain = button('ctl small wl-plain', W.addBusy === 'name' ? 'Adding...' : 'Add "' + q + '" with just its name: you can press Look up its details on its page later',
        function () { addPick(null); });
      plain.disabled = !!W.addBusy;
      m.appendChild(plain);
    }
  }

  /* ---- what a press does ---- */

  function stepOn(t) {
    act(api('/') + t.number + '/tick', { step: true }, function (j) {
      if (j.finished) {
        toast('Last episode: ' + j.item.title + ' is watched.', function () {
          act(api('/') + t.number, { status: 'watching' });
        }, j.item);
      }
    });
  }

  function tickTo(t, season, episode) {
    act(api('/') + t.number + '/tick', { season: season, episode: episode }, function (j) {
      if (j.finished) { toast('Every episode seen: ' + j.item.title + ' is watched.', null, j.item); }
    });
  }

  function markWatched(t) {
    var was = t.status, seen = t.seen || {};
    act(api('/') + t.number, { status: 'watched' }, function (j) {
      toast(j.item.title + ' is watched' + (j.item.times_watched > 1 ? ', ' + times(j.item.times_watched) + ' now' : '') + '.', function () {
        act(api('/') + t.number, { status: was, seen: seen });
      }, j.item);
    });
  }

  function setStatus(t, status) {
    if (status === t.status) { return; }
    if (status === 'watched') { markWatched(t); return; }
    var was = t.status;
    act(api('/') + t.number, { status: status }, function (j) {
      toast(j.item.title + ': ' + j.item.status_said.toLowerCase() + '.', function () {
        act(api('/') + t.number, { status: was });
      });
    });
  }

  function save(t, fields, said) {
    act(api('/') + t.number, fields, function () {
      W.saved = said || 'Saved';
      var s = $('wlSaved');
      if (s) { s.textContent = W.saved; }
      setTimeout(function () { W.saved = ''; var n = $('wlSaved'); if (n) { n.textContent = ''; } }, 2500);
    });
  }

  function remove(t) {
    ask(api('/') + t.number + '/delete', {}).then(function (j) {
      W.data.items = items().filter(function (x) { return x.number !== t.number; });
      recount();
      closeDetail(true);
      toast(t.title + ' is off ' + (t.list ? listName(t.list) : 'your watch list') + '.', function () {
        ask(api('/restore'), { was: j.was }).then(function (r) { put(r.item); draw(); toast(r.item.title + ' is back.'); })
          .catch(function (e) { toast(e.message); });
      });
    }).catch(function (e) { toast(e.message); });
  }

  function moveTo(t, id) {
    var was = t.list || 0;
    if (id === was) { return; }
    act(api('/') + t.number, { list: id }, function (j) {
      toast(j.item.title + ' is on ' + listName(id) + ' now.', function () { act(api('/') + t.number, { list: was }); });
    });
  }

  function refresh(t) {
    toast('Looking ' + t.title + ' up again...');
    ask(api('/') + t.number + '/refresh', {}).then(function (j) {
      if (j.item) { put(j.item); }
      draw();
      toast(j.said || 'The details of ' + j.item.title + ' are up to date.');
    }).catch(function () {
      draw();
      toast('No film or show called ' + t.title + ' was found to fill in its details. Press Edit the details to add them yourself, or try again later.');
    });
  }

  function watchAgain(t) {
    var was = { status: t.status, seen: t.seen || {} };
    act(api('/') + t.number + '/again', {}, function (j) {
      W.view = W.view === 'watched' ? 'next' : W.view;
      toast(j.item.title + ' is back in Up next, ready to watch again.', function () {
        act(api('/') + t.number, { status: was.status, seen: was.seen });
      });
    });
  }

  // Tags as small chips; `more` says how many are not shown.
  function tagChips(tags, more) {
    var ul = el('ul', 'wl-tags');
    ul.setAttribute('aria-label', 'Tags');
    tags.forEach(function (x) { ul.appendChild(el('li', 'wl-tag', x)); });
    if (more > 0) { ul.appendChild(el('li', 'wl-tag is-more', '+' + more)); }
    return ul;
  }

  // The rating: the ten numbers to press, the chosen one (or the one under the pointer) shown large,
  // then Save. Nothing is saved until Save, so a slip of the finger on a phone costs nothing.
  function ratePad(t) {
    var D = W.rateDraft && W.rateDraft.n === t.number ? W.rateDraft : null;
    var chosen = D ? D.v : (t.my_rating || 0);
    var box = el('div', 'wl-pad');
    var big = el('div', 'wl-pad-big');
    big.setAttribute('aria-live', 'polite');
    var bn = el('span', 'wl-pad-n');
    var bo = el('span', 'wl-pad-of', '/10');
    var bw = el('span', 'wl-pad-said');
    big.appendChild(bn); big.appendChild(bo); big.appendChild(bw);
    function show(v, hover) {
      if (v === chosen) { hover = false; }
      bn.textContent = v ? String(v) : '–';
      bo.style.visibility = v ? 'visible' : 'hidden';
      big.classList.toggle('is-hover', !!hover);
      bw.textContent = hover ? 'press to choose ' + v
        : D ? (D.v ? 'not saved yet: press Save' : 'rating to be cleared: press Save') : (t.my_rating ? 'saved' : 'not rated yet');
    }
    show(chosen, false);
    box.appendChild(big);
    var nums = el('div', 'wl-pad-nums');
    nums.setAttribute('role', 'group');
    nums.setAttribute('aria-label', 'My rating for ' + t.title + ', 1 to 10');
    for (var i = 1; i <= 10; i++) {
      (function (i) {
        var b = button('wl-num' + (i === chosen ? ' on' : '') + (i < chosen ? ' below' : ''), String(i), function () {
          W.rateDraft = { n: t.number, v: i };
          draw();
          var again = document.querySelector('.wl-num.on');
          if (again) { again.focus({ preventScroll: true }); }
        });
        b.setAttribute('aria-pressed', i === chosen ? 'true' : 'false');
        b.setAttribute('aria-label', i + ' out of 10');
        b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { show(i, true); } });
        b.addEventListener('pointerleave', function () { show(chosen, false); });
        b.addEventListener('focus', function () { if (b.matches(':focus-visible')) { show(i, true); } });
        b.addEventListener('blur', function () { show(chosen, false); });
        nums.appendChild(b);
      })(i);
    }
    box.appendChild(nums);
    var acts = el('div', 'wl-acts wl-pad-acts');
    var changed = D && D.v !== (t.my_rating || 0);
    var sv = button(changed ? 'ctl wl-primary wl-save-ready' : 'ctl', changed ? (D.v ? 'Save ' + D.v + '/10' : 'Save: no rating') : 'Save', function () {
      var v = W.rateDraft.v;
      act(api('/') + t.number, { my_rating: v || null }, function (j) {
        W.rateDraft = null;
        toast(v ? 'Saved: you rated ' + j.item.title + ' ' + v + '/10.' : 'The rating of ' + j.item.title + ' is cleared.');
      });
    });
    sv.id = 'wlRateSave';
    sv.disabled = !changed;
    acts.appendChild(sv);
    if (chosen) {
      acts.appendChild(button('ctl small', 'Clear', function () { W.rateDraft = { n: t.number, v: 0 }; draw(); },
        'Clear my rating'));
    }
    if (D) {
      acts.appendChild(button('ctl small', 'Cancel', function () { W.rateDraft = null; draw(); }, 'Keep the rating as it was'));
    }
    box.appendChild(acts);
    return box;
  }

  // Tags: free words of his own that cut across lists ("cosy", "with the kids"), filtered by on the list.
  function tagEditor(t) {
    var wrap = el('div', 'wl-field wl-tagedit');
    wrap.appendChild(el('h4', 'wl-h', 'Tags'));
    var have = t.tags || [];
    var ul = el('ul', 'wl-tags');
    ul.setAttribute('aria-label', 'Tags on ' + t.title);
    have.forEach(function (x) {
      var li = el('li', 'wl-tag is-edit');
      li.appendChild(el('span', '', x));
      var rm = button('wl-tag-x', '', function () {
        save(t, { tags: have.filter(function (y) { return y !== x; }) }, 'Tag ' + x + ' taken off');
      }, 'Take the tag ' + x + ' off');
      rm.appendChild(icon(I.close, 12));
      li.appendChild(rm);
      ul.appendChild(li);
    });
    if (have.length) { wrap.appendChild(ul); }
    var row = el('form', 'wl-tag-row');
    var inp = el('input', 'wl-in');
    inp.id = 'wlTagIn'; inp.type = 'text'; inp.autocomplete = 'off'; inp.value = W.tagDraft || '';
    inp.placeholder = have.length ? 'Another tag' : 'For example: cosy';
    if (!have.length) { wrap.appendChild(el('p', 'wl-hint', 'Tags are your own short words, like cosy or with the kids, to find titles by later.')); }
    inp.setAttribute('aria-label', 'Add a tag');
    var dl = el('datalist');
    dl.id = 'wlTagList';
    tagsOf(items()).forEach(function (x) {
      if (!hasTag(t, x[0])) { var o = el('option'); o.value = x[0]; dl.appendChild(o); }
    });
    inp.setAttribute('list', 'wlTagList');
    inp.addEventListener('input', function () { W.tagDraft = inp.value; });
    row.appendChild(inp);
    row.appendChild(dl);
    var go = el('button', 'ctl', 'Add');
    go.type = 'submit';
    row.appendChild(go);
    row.addEventListener('submit', function (e) {
      e.preventDefault();
      var add = inp.value.split(/[,;]/).map(function (x) { return x.replace(/^#/, '').trim(); }).filter(Boolean)
        .filter(function (x) { return !hasTag(t, x); });
      if (!add.length) { inp.value = ''; W.tagDraft = ''; return; }
      W.tagDraft = '';
      save(t, { tags: have.concat(add) }, 'Tagged ' + add.join(', '));
    });
    wrap.appendChild(row);
    return wrap;
  }

  /* ---- one title ---- */

  function openDetail(n) {
    var body = $('watchBody');
    if (!W.detail && body) { W.listScroll = body.scrollTop; }
    W.detail = n; W.editing = false; W.rateDraft = null; W.tagDraft = '';
    if (host().focus) { host().focus(String(n)); }
    draw();
    // Step 202-05 (Vesela): on a phone the title takes the whole layer, so it opens at its top.
    if (body && narrowNow()) { body.scrollTop = 0; }
    var d = $('wlDetail');
    if (d) { d.scrollTop = 0; var h = $('wlDetailTitle'); if (h) { h.focus({ preventScroll: true }); } }
  }
  function closeDetail(quiet) {
    var was = W.detail;
    W.detail = 0; W.editing = false;
    if (host().focus) { host().focus(''); }
    draw();
    // Back on a phone goes to where the list was left, not the middle of it.
    var body = $('watchBody');
    if (body && narrowNow() && W.listScroll != null) { body.scrollTop = W.listScroll; }
    if (!quiet) {
      var back = document.querySelector('.wl-card[data-number="' + was + '"] .wl-open');
      if (back) { back.focus({ preventScroll: false }); }
    }
  }

  // Step 202-05 (Vesela): a link that opens in a new tab says so, since nothing changes here.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('.wl-view a[target="_blank"]');
    if (a) { toast('Opened in a new tab: ' + a.textContent.trim() + '.'); }
  });
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
    var wrap = el('section', 'wl-seasons wl-sec');
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
    add('end_year', 'Year it ended (a show)', t.end_year, { type: 'number' });
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
    acts.appendChild(button('ctl small', 'Cancel', function () { W.editing = false; draw(); toast('Nothing was changed.'); }));
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
      act(api('/') + t.number, body, function () { W.editing = false; toast('The details are saved.'); });
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
    back.appendChild(document.createTextNode('Back to the list'));
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
    info.appendChild(el('p', 'wl-detail-facts', facts(t) + (t.runtime ? ', ' + mins(t.runtime) + (serial(t) ? ' an episode' : '') : '')));
    var more = [];
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
    if (lists().length && !guest()) { info.appendChild(el('p', 'wl-detail-on', 'On ' + listName(t.list))); }
    if (!t.looked_up) {
      var nl = el('div', 'wl-notlooked');
      nl.appendChild(el('p', 'wl-hint', 'It has only its name so far.'));
      var lu = button('ctl small', '', function () { refresh(t); });
      lu.appendChild(icon(I.refresh, 14));
      lu.appendChild(document.createTextNode('Look up its details'));
      nl.appendChild(lu);
      info.appendChild(nl);
    }
    hero.appendChild(info);
    d.appendChild(hero);

    // Step 202-05: the one next press first, with where to watch beside it; then the history, the status,
    // the episodes, my rating, tags and notes; links and about; Move to and the rest under More.
    var acts = el('div', 'wl-acts wl-detail-acts');
    var lead = W.rateDraft && W.rateDraft.n === t.number ? 'ctl' : 'ctl wl-primary';
    if (t.status !== 'watched') {
      if (serial(t) && t.next) {
        var main = button(lead, '', function () { stepOn(t); });
        main.appendChild(icon(I.check));
        main.appendChild(document.createTextNode('Seen ' + epWords(t.next)));
        main.setAttribute('aria-label', 'Mark season ' + t.next.season + ', episode ' + t.next.episode + ' seen');
        acts.appendChild(main);
      } else {
        var w = button(lead, '', function () { markWatched(t); });
        w.appendChild(icon(I.check));
        w.appendChild(document.createTextNode('Watched it'));
        acts.appendChild(w);
      }
    } else {
      var ag = button(lead, '', function () { watchAgain(t); });
      ag.appendChild(icon(I.again));
      ag.appendChild(document.createTextNode('Watch again'));
      acts.appendChild(ag);
    }
    if (t.where_url || (t.links && t.links.where_find)) {
      var go = el('a', 'ctl wl-ghost');
      go.href = t.where_url || t.links.where_find;
      go.target = '_blank';
      go.rel = 'noopener';
      go.appendChild(icon(I.play));
      go.appendChild(document.createTextNode(t.where_url && t.where ? 'Open ' + t.where : 'Where to watch'));
      acts.appendChild(go);
    }
    if (t.status !== 'watched') {
      var front = button('ctl wl-ghost', '', function () {
        act(api('/') + t.number + '/front', {}, function (j) { toast(j.item.title + ' is first in Up next.'); });
      });
      front.appendChild(icon(I.up));
      front.appendChild(document.createTextNode('Put first in Up next'));
      acts.appendChild(front);
    }
    d.appendChild(acts);
    // Every time it was watched (step 202-04): a rewatch is never kept out of Up next.
    if (t.times_watched) {
      var hist = el('p', 'wl-history');
      hist.appendChild(icon(I.again, 14));
      hist.appendChild(document.createTextNode('Watched ' + times(t.times_watched) + ': ' +
        watchDays(t) + (t.status === 'watched' ? '.' : '. It is back in Up next to watch again.')));
      d.appendChild(hist);
    }

    // Status, and the progress through a show.
    var sts = el('section', 'wl-sec');
    sts.appendChild(el('h4', 'wl-h', isShared(t.list) ? 'Status, together' : 'Status'));
    var st = el('div', 'wl-seg wl-status-seg');
    st.setAttribute('role', 'group');
    st.setAttribute('aria-label', isShared(t.list) ? 'Status, together' : 'Status');
    STATUS.forEach(function (s) {
      var b = button('wl-seg-b', s[1], function () { setStatus(t, s[0]); });
      b.setAttribute('aria-pressed', t.status === s[0] ? 'true' : 'false');
      st.appendChild(b);
    });
    sts.appendChild(st);
    var p = progress(t, 'is-wide');
    if (p) { sts.appendChild(p); }
    d.appendChild(sts);
    if (serial(t) && t.seasons.length) { d.appendChild(seasonsBlock(t)); }

    // Their own: rating, tags, who told them, where, notes.
    var mine = el('section', 'wl-mine');
    mine.setAttribute('aria-label', 'Yours');
    var rate = el('div', 'wl-rate wl-sec');
    rate.id = 'wlRate';
    var others = isShared(t.list) ? (t.others || []) : [];
    rate.appendChild(el('h4', 'wl-h', 'My rating, out of 10'));
    rate.appendChild(ratePad(t));
    if (others.length) {
      var ul = el('ul', 'wl-raters');
      ul.setAttribute('aria-label', 'Their ratings');
      others.forEach(function (o) {
        var r = el('li', 'wl-rater');
        r.appendChild(face(o.name));
        r.appendChild(el('span', 'wl-rater-name', o.name));
        r.appendChild(score(o.rating, o.name) || el('span', 'wl-dim', 'not rated yet'));
        if (o.note) { r.appendChild(el('p', 'wl-rater-note', o.note)); }
        ul.appendChild(r);
      });
      rate.appendChild(ul);
    }
    mine.appendChild(rate);
    var tsec = el('div', 'wl-sec');
    tsec.appendChild(tagEditor(t));
    mine.appendChild(tsec);
    var notes = el('div', 'wl-sec wl-notes');
    notes.appendChild(el('h4', 'wl-h', isShared(t.list) ? 'My notes' : 'Notes'));
    if (isShared(t.list)) {
      var sb = el('label', 'wl-check');
      var cb = el('input');
      cb.type = 'checkbox'; cb.checked = !!t.seen_before;
      cb.addEventListener('change', function () { save(t, { seen_before: cb.checked }, cb.checked ? 'Marked: you have seen it before' : 'Saved'); });
      sb.appendChild(cb);
      sb.appendChild(el('span', '', 'I have seen it before, on my own'));
      notes.appendChild(sb);
    }
    var two = el('div', 'wl-two');
    two.appendChild(textField('Recommended by', t.recommended_by, { placeholder: 'Who told you about it' },
      function (v) { save(t, { recommended_by: v }); }));
    two.appendChild(textField('Where to watch', t.where, { placeholder: 'Netflix, HBO Max, cinema...' },
      function (v) { save(t, { where: v }); }));
    notes.appendChild(two);
    notes.appendChild(textField(isShared(t.list) ? 'What I think' : 'Notes', t.notes, { area: true, placeholder: 'Anything to remember about it' },
      function (v) { save(t, { notes: v }); }));
    mine.appendChild(notes);
    d.appendChild(mine);

    var lk = el('section', 'wl-sec');
    lk.appendChild(el('h4', 'wl-h', 'Links'));
    var outs = el('div', 'wl-outs');
    if (t.where_url) { outs.appendChild(linkOut(t.where_url, 'Open on ' + (t.where || 'its service'))); }
    outs.appendChild(linkOut(t.links.where_find, 'Where it streams in Bulgaria'));
    outs.appendChild(linkOut(t.links.trailer, 'Trailer'));
    if (t.links.imdb) { outs.appendChild(linkOut(t.links.imdb, 'IMDb')); }
    if (t.links.wiki) { outs.appendChild(linkOut(t.links.wiki, 'Wikipedia')); }
    lk.appendChild(outs);
    d.appendChild(lk);

    if (t.overview) {
      var ov = el('section', 'wl-about wl-sec');
      ov.appendChild(el('h4', 'wl-h', 'About it'));
      ov.appendChild(el('p', 'wl-about-text', t.overview));
      d.appendChild(ov);
    }

    // More: which list it is on and Move to (the owner's), edit, look up again, remove.
    var more = el('section', 'wl-sec wl-more');
    more.appendChild(el('h4', 'wl-h', 'More'));
    if (lists().length && !guest()) {
      var onl = el('div', 'wl-onlist');
      var here = String(t.list || 0);
      var opts = [['0', 'My list']].concat(lists().map(function (l) { return [String(l.id), l.name]; }))
        .map(function (o) { return [o[0], o[1] + (o[0] === here ? ' (on it now)' : '')]; });
      onl.appendChild(select('Move to another list (it leaves this one)', here, opts, function (v) { moveTo(t, parseInt(v, 10) || 0); }));
      more.appendChild(onl);
    }
    if (W.editing) { more.appendChild(editForm(t)); }
    var tail = el('div', 'wl-tail');
    if (!W.editing) {
      tail.appendChild(button('ctl small', 'Edit the details', function () { W.editing = true; draw(); }));
    }
    var re = button('ctl small', '', function () { refresh(t); });
    re.appendChild(icon(I.refresh, 14));
    re.appendChild(document.createTextNode('Look up its details again'));
    re.title = 'Fills in the poster, length, seasons and links again; your notes, rating and tags stay';
    tail.appendChild(re);
    if (t.can_remove !== false) { tail.appendChild(button('ctl small wl-remove', 'Remove from the list', function () { remove(t); })); }
    more.appendChild(tail);
    var when = ['Added ' + day(t.added_at) + (isShared(t.list) ? ' by ' + (t.added_by_name || 'you') : '')];
    if (t.started_at) { when.push('started ' + day(t.started_at)); }
    if (t.watched_at && t.times_watched < 2) { when.push('watched ' + day(t.watched_at)); }
    more.appendChild(el('p', 'wl-dim wl-when', when.join(', ') + '.'));
    d.appendChild(more);
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
      t.appendChild(button('wl-toast-undo', 'Rate it', function () {
        W.toast = null; drawToast();
        if (W.detail !== rt.number) { openDetail(rt.number); }
        var first = document.querySelector('#wlRate .wl-num');
        var r = $('wlRate');
        if (r) { r.scrollIntoView({ block: 'center' }); }
        if (first) { first.focus({ preventScroll: true }); }
      }, 'Rate ' + rt.title + ' out of 10'));
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
    var at = keep === 'wlSearch' || keep === 'wlAddQ' || keep === 'wlTagIn' ? document.activeElement.selectionStart : null;
    var scroll = body.scrollTop;
    body.textContent = '';
    if (meta) { meta.textContent = ''; }
    var page = el('div', 'wl-page' + (W.detail ? ' has-detail' : '') + (W.data && W.data.read_only ? ' is-readonly' : ''));
    var main = el('div', 'wl-main');
    if (W.detail) { main.setAttribute('aria-hidden', narrowNow() ? 'true' : 'false'); }
    if (W.gone) {
      var g = el('div', 'wl-empty wl-empty-first');
      g.appendChild(el('p', 'wl-lede', W.gone));
      var to = el('a', 'ctl small', 'Everything shared with you');
      to.href = '/shared';
      g.appendChild(to);
      main.appendChild(g);
      page.appendChild(main);
      body.appendChild(page);
      drawToast();
      return;
    }
    if (W.loading) {
      main.appendChild(el('p', 'wl-lede', 'Reading your watch list...'));
    } else if (W.error && !W.data) {
      main.appendChild(el('p', 'wl-error', W.error));
      main.appendChild(button('ctl small', 'Try again', function () { load(); }));
    } else if (W.data) {
      // Step 202-05: the sentence that counts the list, and Add a title shaped like the box it opens.
      // New list sits at the end of the lists strip, Share on the line that says who sees the list.
      var top = el('div', 'wl-top');
      top.appendChild(el('h2', 'wl-headline', headline()));
      if (!W.adding && !(W.data.read_only)) {
        var add = button(counts().all ? 'wl-addfield' : 'ctl wl-primary wl-add-btn', '', startAdd);
        add.id = 'wlAddBtn';
        add.appendChild(icon(I.plus));
        add.appendChild(el('span', 'wl-addfield-text', 'Add a title'));
        if (counts().all) { add.appendChild(el('span', 'wl-addfield-hint', 'film or show')); }
        top.appendChild(add);
      }
      if (counts().all) {
        // Step 202-05 (Vesela): the search is one press from the top, where she looked for it.
        var findb = button('ctl wl-findb', '', function () {
          var si = $('wlSearch');
          if (si) { si.scrollIntoView({ block: 'center' }); si.focus({ preventScroll: true }); }
        });
        findb.appendChild(icon(I.search));
        findb.appendChild(document.createTextNode('Search'));
        top.appendChild(findb);
      }
      main.appendChild(top);
      drawLists(main);
      drawPeople(main);
      if (W.adding) { drawAdd(main); }
      if (counts().all) {
        drawTonight(main);
        drawList(main);
      } else if (!W.adding) {
        var empty = el('div', 'wl-empty wl-empty-first');
        var l = shownList() || (guest() ? lists()[0] : null);
        if (l) {
          empty.appendChild(el('p', 'wl-lede', guest()
            ? 'Nothing on this list yet, so Tonight has nothing to pick. Add the first title: ' + l.owner_name + ' sees it here too.'
            : 'Nothing on ' + l.name + ' yet, so Tonight has nothing to pick. Add a title here, or open a title on My list and press Move to another list.'));
          if (!guest() && items().some(function (t) { return !t.list; })) {
            empty.appendChild(button('ctl small', 'Show My list', function () { pickList('0'); }));
          }
        } else if (W.list === '0' && items().length) {
          empty.appendChild(el('p', 'wl-lede', 'Every title is on a shared list. Add one here to keep it to yourself.'));
        } else {
          empty.appendChild(el('p', 'wl-lede', 'Keep the films and shows you want to watch here. Add one, or say to Rouh: "add Severance to my watch list".'));
        }
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
    drawSheet($('watchView'));
  }

  function narrowNow() { var b = $('watchBody'); return !!b && b.clientWidth <= 1000; }

  // Escape closes a title's page and the add box before the layer itself.
  document.addEventListener('keydown', function (e) {
    if (!W.open || e.key !== 'Escape') { return; }
    if (W.sheet) { e.preventDefault(); e.stopImmediatePropagation(); closeSheet(); return; }
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
      // The other person has no live line to Rouh: their page reads the list again every 30 s.
      if (guest() && !W.poll) {
        W.poll = setInterval(function () {
          if (W.open && !W.gone && !W.sheet && !W.editing && !W.adding && !document.hidden &&
              !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) { load(true); }
        }, 30000);
      }
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
