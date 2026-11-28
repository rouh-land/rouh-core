/* Notifications, at /notifications: every notification ever kept, to find, read,
   follow and clear (`rouh/notices.py`, `rouh/web/notifications.py`).

   Petar, 26 November 2026: "When I press on the notifications icon in the
   navigation, it should take me to a new url with a full-scale management page.
   Filters, search, type, sort, clear multiple by some criteria, clear only the
   current filter, read inline, link to the relevant things. Everything I could
   possibly want from this. All the journeys."

   So the bell opens this page, and the column under it is only what the stack
   of new ones opens into. Here:

   - A headline says how many are still to read of how many are kept: the same
     number as the bell (`notices.unread_count`), and Mark all read beside it.
   - Search over every word, and filters with how many each would show: Show
     (every one, unread, read, cleared), When (today, the past 7 days, the past
     30, older, or two dates), Kind, Leads to, and the Task it is about.
   - Sort: newest, oldest, by kind, unread first.
   - The view is the address (`?q=&kind=&show=&when=&from=&until=&leads=&task=&sort=`),
     so a view can be bookmarked and Back goes to the one before (`host.moved`).
   - A notification opens in place, every word of it as markdown, or the
     decision it asks drawn as decisions are (`kit.decision`); opened, it is
     read. Its places are links: a plain press goes there and clears it, as
     the column does (fr_a7c05457e6a3); a new tab leaves it be.
   - Pick some, or every one in the view, and mark them read or unread, or
     clear them; Clear these clears exactly what the view shows; Clear by
     clears by a rule (already read, older than 7 or 30 days, one kind, all).
     A clear of more than a handful asks once, and every clear offers Undo.
     Cleared ones are kept, under Show: Cleared, and can be restored.
   - It follows the list as it moves anywhere (`moved`, from the socket's
     `notices`), and the keyboard does all of it: j and k or the arrows move,
     Enter opens, x picks, e clears, u marks read or unread, / searches, Esc
     steps back out.

   The layer, its address and the bell are app/runs.js's and app/notices.js's,
   handed over through `window.RouhNoticesHost` (close, moved) and
   `window.RouhNoticesKit` (icons, markdown, decisions, going somewhere). */
(function () {
  'use strict';

  var PAGE = 50;
  var TOAST_MS = 10000;
  /** A clear of more than this many asks once before it is done. */
  var ASK_OVER = 5;

  var KEYS = ['q', 'kind', 'show', 'when', 'from', 'until', 'leads', 'task', 'sort'];
  var SORTS = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['unread', 'Unread first'],
               ['kind', 'By kind']];
  var SHOWS = [['', 'All'], ['unread', 'Unread'], ['read', 'Read'], ['cleared', 'Dismissed']];
  var WHENS = [['', 'Any time'], ['today', 'Today'], ['week', 'Past 7 days'], ['month', 'Past 30 days'],
               ['older', 'Older than 30 days'], ['custom', 'Between two dates']];

  var P = {
    open: false,
    /** The view, as the address says it. */
    v: blank(),
    items: [], total: 0, counts: null, totals: null,
    loading: false, error: '', seq: 0, more: false,
    /** The one opened in place, by id, or 0. */
    opened: 0,
    /** Picked: every one in the view (`all`), or these ids. */
    all: false, picked: {},
    /** The row the keyboard is on, by id. */
    at: 0,
    /** Ids that arrived while the page was open, marked for a moment. */
    fresh: {}, known: {},
    /** The filters' sheet, on a narrow page. */
    sheet: false,
    /** Every task in the Task filter, rather than the eight most. */
    tasksAll: false,
    /** The next drawing starts at the top of the list. */
    top: false,
    /** The last press that can be undone: {changed, words}. */
    undo: null, toastTimer: 0,
    /** Told the server the page drew it. */
    seen: {},
    movedTimer: 0, searchTimer: 0,
    /** What every one kept would show, for Clear by's counts: read when its menu opens. */
    whole: null
  };

  function blank() { return { q: '', kind: '', show: '', when: '', from: '', until: '', leads: '', task: '', sort: '' }; }
  function host() { return window.RouhNoticesHost || {}; }
  function kit() { return window.RouhNoticesKit || {}; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function button(cls, text, run, title) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    if (run) b.addEventListener('click', run);
    return b;
  }
  function svg(path, size) {
    var s = size || 16;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor"' +
      ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var GLYPH = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    /* Two chevrons pointing apart, to open; together, to fold (Petar, 28 November 2026). */
    unfold: '<path d="M7 9.5l5-5 5 5M7 14.5l5 5 5-5"/>',
    fold: '<path d="M7 4.5l5 5 5-5M7 19.5l5-5 5 5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    go: '<path d="M7 17L17 7M9 7h8v8"/>',
    read: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    unread: '<circle cx="12" cy="12" r="4.5"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    key: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'
  };
  function counted(n, one, many) { return n === 1 ? '1 ' + one : fmt(n) + ' ' + (many || one + 's'); }
  function fmt(n) { return Number(n || 0).toLocaleString(); }

  /* ---------- the view, as the address says it ---------- */

  /** @param {string} query */
  function readQuery(query) {
    var v = blank();
    var got = new URLSearchParams(String(query || '').replace(/^\?/, ''));
    KEYS.forEach(function (k) { v[k] = (got.get(k) || '').slice(0, 400); });
    if (!SORTS.some(function (s) { return s[0] === v.sort; })) v.sort = '';
    if (v.sort === 'newest') v.sort = '';
    if (!SHOWS.some(function (s) { return s[0] === v.show; })) v.show = '';
    if (!WHENS.some(function (s) { return s[0] === v.when; })) v.when = '';
    if (v.when !== 'custom') { v.from = ''; v.until = ''; }
    return v;
  }
  function query() {
    var out = new URLSearchParams();
    KEYS.forEach(function (k) { if (P.v[k]) out.set(k, P.v[k]); });
    return out.toString();
  }
  function list(s) { return s ? s.split(',').filter(Boolean) : []; }
  /** Whether the view is narrowed by anything at all, the search included. */
  function narrowed() {
    return !!(P.v.q || P.v.kind || P.v.show || P.v.when || P.v.leads || P.v.task);
  }
  function dayStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() / 1000; }
  function dateAt(s, end) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (end) d.setDate(d.getDate() + 1);
    return d.getTime() / 1000;
  }
  /** The view as the server's criteria. @param {any} v */
  function criteria(v) {
    var c = { q: v.q, kinds: list(v.kind), show: v.show, when: v.when, to: list(v.leads), task: v.task,
              today: dayStart(Date.now()) };
    if (v.when === 'custom') {
      c.since = dateAt(v.from, false);
      c.until = dateAt(v.until, true);
    }
    return c;
  }
  function apiQuery(offset, limit) {
    var c = criteria(P.v);
    var q = new URLSearchParams();
    if (c.q) q.set('q', c.q);
    if (c.kinds.length) q.set('kind', c.kinds.join(','));
    if (c.show) q.set('show', c.show);
    if (c.when) q.set('when', c.when);
    if (c.since != null) q.set('since', String(c.since));
    if (c.until != null) q.set('until', String(c.until));
    if (c.to.length) q.set('to', c.to.join(','));
    if (c.task) q.set('task', c.task);
    q.set('today', String(c.today));
    q.set('sort', P.v.sort || 'newest');
    q.set('offset', String(offset));
    q.set('limit', String(limit));
    return '/api/notifications?' + q.toString();
  }

  /** A change to the view, from a control: drawn, read again, and the address moved on. */
  function setView(change) {
    Object.keys(change).forEach(function (k) { P.v[k] = change[k]; });
    if (P.v.when !== 'custom') { P.v.from = ''; P.v.until = ''; }
    unpick();
    P.opened = 0;
    P.top = true;
    if (host().moved) host().moved(query());
    load(false);
  }

  /* ---------- reading ---------- */

  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j) throw new Error((j && j.error) || 'The notifications could not be read.');
        return j;
      });
    });
  }
  function postJSON(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || 'That could not be done. Try again in a moment.');
          return j;
        });
      });
  }

  /** The view read again. `keep` keeps as many as are loaded (a refresh); otherwise from the top. */
  function load(keep) {
    var seq = ++P.seq;
    var want = keep ? Math.max(PAGE, P.items.length) : PAGE;
    P.loading = true;
    P.error = '';
    if (!keep) draw();
    else drawBusy();
    return getJSON(apiQuery(0, Math.min(200, want))).then(function (j) {
      if (seq !== P.seq) return;
      take(j, false);
    }).catch(function (err) {
      if (seq !== P.seq) return;
      P.loading = false;
      P.error = String(err && err.message || err);
      draw();
    });
  }
  function loadMore() {
    if (P.loading || P.items.length >= P.total) return;
    var seq = ++P.seq;
    P.loading = true;
    drawBusy();
    getJSON(apiQuery(P.items.length, PAGE)).then(function (j) {
      if (seq !== P.seq) return;
      take(j, true);
    }).catch(function (err) {
      if (seq !== P.seq) return;
      P.loading = false;
      P.error = String(err && err.message || err);
      draw();
    });
  }
  function take(j, append) {
    P.loading = false;
    var first = !Object.keys(P.known).length;
    (j.items || []).forEach(function (n) {
      if (!first && !P.known[n.id] && !append && n.state !== 'dismissed') P.fresh[n.id] = Date.now();
      P.known[n.id] = true;
    });
    P.items = append ? P.items.concat(j.items || []) : (j.items || []);
    P.total = j.total || 0;
    P.counts = j.counts || null;
    P.totals = j.totals || null;
    if (P.opened && !P.items.some(function (n) { return n.id === P.opened; })) P.opened = 0;
    draw();
  }

  /* ---------- doing ---------- */

  /** Picked, as what the server is to act on. */
  function target() {
    if (P.all) return { match: criteria(P.v), n: P.total };
    var ids = Object.keys(P.picked).map(Number);
    return { ids: ids, n: ids.length };
  }
  function pickedCount() { return P.all ? P.total : Object.keys(P.picked).length; }
  function unpick() { P.all = false; P.picked = {}; }

  var DONE_WORDS = { read: 'Marked read', unread: 'Marked unread', clear: 'Dismissed', restore: 'Restored' };

  /** One press on many. `on` is {ids} or {match}; `n` is how many it is about, for the words.
   *  @param {string} what @param {{ids?: number[], match?: any, n: number}} on @param {string} [words] */
  function bulk(what, on, words) {
    if (!on.n) return Promise.resolve();
    var body = { act: what };
    if (on.match) body.match = on.match; else body.ids = on.ids;
    // What it is about changes on the screen at once, and comes right when the server answers.
    if (on.ids) local(on.ids, what);
    return postJSON('/api/notifications/act', body).then(function (j) {
      var n = j.count || 0;
      var said = (words || DONE_WORDS[what]) + ' ' + counted(n, 'notification');
      if (n && j.changed && j.changed.length) toast(said, j.changed);
      else if (!n) toast('Nothing to change: ' + (what === 'read' ? 'they were read already.' : what === 'unread' ? 'they were unread already.' : 'none of them is here any more.'), null);
      unpick();
      return load(true);
    }).catch(function (err) {
      toast(String(err && err.message || err), null);
      return load(true);
    });
  }
  /** @param {number[]} ids @param {string} what */
  function local(ids, what) {
    var to = { read: 'read', unread: 'later', clear: 'dismissed', restore: 'read' }[what];
    if (!to) return;
    P.items.forEach(function (n) {
      if (ids.indexOf(n.id) < 0) return;
      if (what === 'read' && n.state === 'dismissed') return;
      n.state = to;
    });
    if (what === 'clear' || what === 'restore') {
      // Gone from this view, unless the view is the one it went to.
      var stays = what === 'clear' ? P.v.show === 'cleared' : P.v.show !== 'cleared';
      if (!stays) {
        P.items = P.items.filter(function (n) { return ids.indexOf(n.id) < 0; });
        P.total = Math.max(0, P.total - ids.length);
      }
    }
    draw();
  }
  /** Clearing, asked once when it is more than a handful. @param {{ids?: number[], match?: any, n: number}} on
   *  @param {string} what words for what it clears, such as "these 48" */
  function clear(on, what) {
    if (!on.n) return;
    if (on.n <= ASK_OVER) { bulk('clear', on); return; }
    confirmBox('Dismiss ' + counted(on.n, 'notification') + '?',
      'They leave this list and wait under Show: Dismissed, where they can be restored. ' +
      (what ? 'This dismisses ' + what + '.' : ''),
      'Dismiss ' + fmt(on.n), function () { bulk('clear', on); });
  }
  function markAllRead() {
    var n = P.totals ? P.totals.unread : 0;
    if (!n) return;
    bulk('read', { match: { show: 'unread', today: dayStart(Date.now()) }, n: n }, 'Marked read');
  }

  /** Opened in place, or closed. Opening one reads it. @param {any} n */
  function toggle(n) {
    if (!hasMore(n)) return;
    P.opened = P.opened === n.id ? 0 : n.id;
    P.at = n.id;
    if (P.opened && (n.state === 'new' || n.state === 'later')) {
      n.state = 'read';
      postJSON('/api/notifications/act', { act: 'read', ids: [n.id] }).then(function () {
        if (P.totals && P.totals.unread) P.totals.unread -= 1;
        drawHead();
      }).catch(function () {});
    }
    draw();
    var row = rowNode(n.id);
    if (row) {
      if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      var strip = row.querySelector('.nf-open');
      if (strip) strip.focus({ preventScroll: true });
    }
  }
  /** Going where it leads, in this tab. It is marked read, never cleared: Petar, 26 November
   *  2026, of pressing one's chat here, "Didn't take me to the page ... and it just made the
   *  notification disappear." It stays on this page to be read again.
   *  A chat is beside this page rather than on the canvas under it, so going to one closes the
   *  page first: until then the address said the chat and the page stayed over it.
   *  @param {any} n @param {string} href */
  function follow(n, href) {
    if (isUnread(n)) {
      n.state = 'read';
      postJSON('/api/notifications/act', { act: 'read', ids: [n.id] }).then(function () {
        if (P.totals && P.totals.unread) P.totals.unread -= 1;
        drawHead();
      }).catch(function () {});
      draw();
    }
    if (/^\/chat\//.test(href) && host().close) host().close();
    if (kit().go) kit().go(href, n);
    else location.assign(href);
  }

  /* ---------- the toast, and the one question ---------- */

  function toast(words, changed) {
    var box = $('nfToast');
    if (!box) return;
    clearTimeout(P.toastTimer);
    P.undo = changed ? { changed: changed } : null;
    box.textContent = '';
    box.appendChild(el('span', 'nf-toast-words', words));
    if (changed) {
      box.appendChild(button('nf-toast-undo', 'Undo', function () {
        var was = P.undo;
        P.undo = null;
        box.hidden = true;
        if (!was) return;
        postJSON('/api/notifications/undo', { changed: was.changed }).then(function (j) {
          toast('Put back ' + counted(j.count || 0, 'notification'), null);
          load(true);
        }).catch(function (err) { toast(String(err && err.message || err), null); });
      }));
    }
    box.appendChild(button('nf-toast-x', '', function () { box.hidden = true; }, 'Close'));
    box.lastChild.innerHTML = svg(GLYPH.x, 14);
    box.lastChild.setAttribute('aria-label', 'Close');
    box.hidden = false;
    P.toastTimer = setTimeout(function () { box.hidden = true; P.undo = null; }, TOAST_MS);
  }

  function confirmBox(title, words, yes, run) {
    var d = $('nfAsk');
    if (!d || !d.showModal) { if (window.confirm(title + '\n\n' + words)) run(); return; }
    d.textContent = '';
    var form = el('form', 'nf-ask');
    form.method = 'dialog';
    form.appendChild(el('h4', 'nf-ask-h', title));
    form.appendChild(el('p', 'nf-ask-p', words));
    var row = el('div', 'nf-ask-row');
    var no = button('nf-btn', 'Cancel', function () { d.close(); });
    var ok = button('nf-btn nf-btn-danger', yes, function () { d.close(); run(); });
    row.appendChild(no);
    row.appendChild(ok);
    form.appendChild(row);
    d.appendChild(form);
    d.showModal();
    ok.focus();
  }

  /* ---------- drawing ---------- */

  function drawBusy() {
    var b = $('nfBody');
    if (b) b.setAttribute('aria-busy', P.loading ? 'true' : 'false');
    var more = document.querySelector('#nfBody .nf-more');
    if (more) more.textContent = P.loading ? 'Loading…' : moreWords();
  }
  function moreWords() {
    var left = P.total - P.items.length;
    return 'Show ' + Math.min(PAGE, left) + ' more of ' + fmt(left);
  }

  function drawHead() {
    var meta = $('nfMeta');
    if (!meta) return;
    meta.textContent = '';
    var t = P.totals;
    if (!t) { meta.appendChild(el('span', '', P.error ? '' : 'Reading…')); return; }
    var line = el('span', 'nf-verdict');
    line.textContent = t.unread
      ? counted(t.unread, 'unread', 'unread') + ' of ' + counted(t.kept, 'notification')
      : (t.kept ? 'All ' + counted(t.kept, 'notification') + ' read' : 'No notifications');
    meta.appendChild(line);
    if (t.cleared) meta.appendChild(el('span', '', fmt(t.cleared) + ' dismissed'));
    var all = $('nfAllRead');
    if (all) {
      all.hidden = !t.unread;
      all.textContent = 'Mark all ' + fmt(t.unread) + ' read';
    }
  }

  function draw() {
    if (!P.open) return;
    drawHead();
    var body = $('nfBody');
    if (!body) return;
    var keepScroll = body.scrollTop;
    var hadFocus = document.activeElement && body.contains(document.activeElement) ? focusKey(document.activeElement) : '';
    body.textContent = '';
    body.setAttribute('aria-busy', P.loading ? 'true' : 'false');
    var page = el('div', 'nf-page' + (P.sheet ? ' sheet-open' : ''));
    page.appendChild(drawTools());
    var cols = el('div', 'nf-cols');
    cols.appendChild(drawFilters());
    var main = el('section', 'nf-main');
    main.setAttribute('aria-label', 'The notifications');
    main.appendChild(drawViewLine());
    main.appendChild(drawList());
    cols.appendChild(main);
    page.appendChild(cols);
    body.appendChild(page);
    // A new view, or the sheet folded away, starts at the top; a redraw of the same keeps its place.
    body.scrollTop = P.top ? 0 : keepScroll;
    P.top = false;
    if (hadFocus) refocus(hadFocus);
    watchMore();
    tellSeen();
  }

  /** What has the keyboard, said so it can be found again after a redraw. @param {Element} n */
  function focusKey(n) {
    var key = n.getAttribute && n.getAttribute('data-key');
    if (key) return key;
    var row = n.closest && n.closest('.nf-row');
    if (row && n.classList.contains('nf-open')) return 'open:' + row.getAttribute('data-id');
    if (row && n.classList.contains('nf-pick-in')) return 'pick:' + row.getAttribute('data-id');
    return '';
  }
  function refocus(key) {
    var parts = key.split(':');
    var node = null;
    if (parts[0] === 'open') node = document.querySelector('.nf-row[data-id="' + parts[1] + '"] .nf-open');
    else if (parts[0] === 'pick') node = document.querySelector('.nf-row[data-id="' + parts[1] + '"] .nf-pick-in');
    else node = document.querySelector('#nfBody [data-key="' + key + '"]');
    if (node) /** @type {HTMLElement} */ (node).focus({ preventScroll: true });
  }

  function drawTools() {
    var bar = el('div', 'nf-tools');
    var find = el('label', 'nf-search');
    find.innerHTML = svg(GLYPH.search, 16);
    var hid = el('span', 'nf-sr', 'Search the notifications');
    find.appendChild(hid);
    var input = /** @type {HTMLInputElement} */ (el('input', 'nf-search-in'));
    input.type = 'search';
    input.id = 'nfSearch';
    input.placeholder = 'Search every word';
    input.value = P.v.q;
    input.setAttribute('data-key', 'search');
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', function () {
      clearTimeout(P.searchTimer);
      var words = input.value;
      P.searchTimer = setTimeout(function () { setView({ q: words.trim() }); }, 260);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (input.value) { input.value = ''; setView({ q: '' }); }
        else input.blur();
      } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        clearTimeout(P.searchTimer);
        if (input.value.trim() !== P.v.q) setView({ q: input.value.trim() });
        moveTo(0, true);
      }
    });
    find.appendChild(input);
    bar.appendChild(find);

    var sortBox = el('label', 'nf-sort');
    sortBox.appendChild(el('span', 'nf-sort-l', 'Sort'));
    sortBox.title = 'Sort';
    var sel = /** @type {HTMLSelectElement} */ (el('select', 'nf-select'));
    sel.setAttribute('data-key', 'sort');
    SORTS.forEach(function (s) {
      var o = el('option', '', s[1]);
      o.value = s[0];
      sel.appendChild(o);
    });
    sel.value = P.v.sort || 'newest';
    sel.addEventListener('change', function () { setView({ sort: sel.value === 'newest' ? '' : sel.value }); });
    sortBox.appendChild(sel);
    bar.appendChild(sortBox);

    bar.appendChild(clearBy());

    var on = filtersOn();
    var fb = button('nf-btn nf-filters-btn' + (P.sheet ? ' on' : ''), '', function () {
      P.sheet = !P.sheet;
      draw();
      if (P.sheet) {
        var first = /** @type {HTMLElement | null} */ (document.querySelector('#nfBody .nf-filters button, #nfBody .nf-filters input'));
        if (first) first.focus({ preventScroll: true });
      }
    });
    fb.innerHTML = svg(GLYPH.filter, 16) + '<span>Filters' + (on ? ' (' + on + ')' : '') + '</span>';
    fb.setAttribute('aria-expanded', P.sheet ? 'true' : 'false');
    fb.setAttribute('data-key', 'filters');
    bar.appendChild(fb);
    return bar;
  }

  function filtersOn() {
    return (P.v.kind ? list(P.v.kind).length : 0) + (P.v.show ? 1 : 0) + (P.v.when ? 1 : 0) +
      (P.v.leads ? list(P.v.leads).length : 0) + (P.v.task ? 1 : 0);
  }

  /** Clear by: a rule, with how many each would clear of every one kept. */
  function clearBy() {
    var box = el('div', 'nf-menu');
    var b = button('nf-btn', '', null);
    b.innerHTML = '<span>Dismiss by…</span>' + svg(GLYPH.down, 14);
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('data-key', 'clearby');
    var pop = el('div', 'nf-pop');
    pop.hidden = true;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', 'Dismiss by');
    function close() { pop.hidden = true; b.setAttribute('aria-expanded', 'false'); }
    function fill() {
      pop.textContent = '';
      var w = P.whole;
      if (!w) { pop.appendChild(el('p', 'nf-pop-wait', 'Counting…')); return; }
      var kept = w.show[''] || 0;
      // Over every one kept, whatever this view shows: said, so the counts are not read as the view's.
      pop.appendChild(el('p', 'nf-pop-h', 'Across every notification'));
      var rules = [
        ['Everything already read', w.show.read || 0, { show: 'read' }, 'every notification already read'],
        ['Older than 7 days', Math.max(0, kept - (w.when.week || 0)), { older_days: 7 }, 'every notification older than 7 days'],
        ['Older than 30 days', w.when.older || 0, { when: 'older' }, 'every notification older than 30 days']
      ];
      rules.forEach(function (r) { pop.appendChild(rule(r[0], r[1], r[2], r[3])); });
      if (w.kinds.length) {
        pop.appendChild(el('p', 'nf-pop-h', 'Every one of a kind'));
        w.kinds.forEach(function (k) {
          pop.appendChild(rule(k.name, k.n, { kinds: [k.id] }, 'every notification of the kind ' + k.name));
        });
      }
      pop.appendChild(el('hr', 'nf-pop-hr'));
      pop.appendChild(rule('Everything', kept, {}, 'every notification there is'));
    }
    function rule(name, n, match, what) {
      var r = button('nf-pop-item', '', function () {
        close();
        match.today = dayStart(Date.now());
        clear({ match: match, n: n }, what);
      });
      r.disabled = !n;
      r.appendChild(el('span', '', name));
      r.appendChild(el('span', 'nf-n', fmt(n)));
      return r;
    }
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!pop.hidden) { close(); return; }
      pop.hidden = false;
      b.setAttribute('aria-expanded', 'true');
      fill();
      getJSON('/api/notifications?limit=1&today=' + dayStart(Date.now())).then(function (j) {
        P.whole = j.counts;
        if (!pop.hidden) fill();
        var first = /** @type {HTMLElement | null} */ (pop.querySelector('button:not(:disabled)'));
        if (first) first.focus({ preventScroll: true });
      }).catch(function () {
        pop.textContent = '';
        pop.appendChild(el('p', 'nf-pop-wait', 'The counts could not be read.'));
      });
    });
    pop.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(pop.querySelectorAll('button:not(:disabled)'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); b.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) items[(i - 1 + items.length) % items.length].focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!pop.hidden && !(e.target instanceof Node && box.contains(e.target))) close();
    });
    box.appendChild(b);
    box.appendChild(pop);
    return box;
  }

  /* The filters: a column at a desk, a sheet under the toolbar on a narrow page. */
  function drawFilters() {
    var c = P.counts || { show: {}, kinds: [], when: {}, to: [], task: [] };
    var side = el('aside', 'nf-filters');
    side.setAttribute('aria-label', 'Filters');

    side.appendChild(group('Show', SHOWS.map(function (s) {
      return chip(s[1], c.show ? c.show[s[0]] : 0, P.v.show === s[0], function () { setView({ show: s[0] }); }, 'show:' + s[0], true);
    })));

    var whens = WHENS.map(function (w) {
      var n = w[0] === 'custom' ? null : (c.when ? c.when[w[0]] : 0);
      return chip(w[1], n, P.v.when === w[0], function () {
        if (w[0] === 'custom') {
          var today = new Date();
          var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
          var from = new Date(today.getTime() - 7 * 86400000);
          setView({ when: 'custom', from: P.v.from || iso(from), until: P.v.until || iso(today) });
        } else setView({ when: w[0] });
      }, 'when:' + w[0], true);
    });
    var wg = group('When', whens);
    if (P.v.when === 'custom') wg.appendChild(dates());
    side.appendChild(wg);

    var kinds = list(P.v.kind);
    if (c.kinds && c.kinds.length) {
      side.appendChild(group('Kind', c.kinds.map(function (k) {
        var on = kinds.indexOf(k.id) >= 0;
        var b = chip(k.name, k.n, on, function () {
          var now = on ? kinds.filter(function (x) { return x !== k.id; }) : kinds.concat([k.id]);
          setView({ kind: now.join(',') });
        }, 'kind:' + k.id, false);
        b.insertBefore(iconFor(k.id), b.firstChild);
        return b;
      })));
    }
    var leads = list(P.v.leads);
    if (c.to && c.to.length) {
      side.appendChild(group('Leads to', c.to.map(function (p) {
        var on = leads.indexOf(p.id) >= 0;
        return chip(p.name, p.n, on, function () {
          var now = on ? leads.filter(function (x) { return x !== p.id; }) : leads.concat([p.id]);
          setView({ leads: now.join(',') });
        }, 'leads:' + p.id, false);
      })));
    }
    if (c.task && c.task.length) {
      var tasks = c.task;
      var shown = P.v.task || P.tasksAll ? tasks : tasks.slice(0, 8);
      var tg = group('Task', shown.map(function (t) {
        var on = P.v.task === t.id;
        var b = chip(t.name, t.n, on, function () { setView({ task: on ? '' : t.id }); }, 'task:' + t.id, true);
        b.title = t.id;
        return b;
      }));
      if (tasks.length > shown.length) {
        var all = button('nf-link', 'Every task (' + tasks.length + ')', function () { P.tasksAll = true; draw(); });
        all.setAttribute('data-key', 'tasks-all');
        tg.appendChild(all);
      }
      side.appendChild(tg);
    }
    if (filtersOn() || P.v.q) {
      var reset = button('nf-link', 'Reset filters', function () { P.sheet = false; setView(blank()); });
      reset.setAttribute('data-key', 'reset');
      side.appendChild(reset);
    }
    if (P.sheet) {
      var done = button('nf-btn nf-sheet-done', 'Show ' + counted(P.total, 'notification'), function () { P.sheet = false; P.top = true; draw(); });
      side.appendChild(done);
    }
    return side;
  }
  function group(name, items) {
    var g = el('fieldset', 'nf-group');
    g.appendChild(el('legend', 'nf-group-h', name));
    var row = el('div', 'nf-chips');
    items.forEach(function (i) { row.appendChild(i); });
    g.appendChild(row);
    return g;
  }
  /** One choice of a filter: a press turns it on or off. `one` says it is one of several, only
   *  one of which can be on. @param {string} name @param {number|null|undefined} n */
  function chip(name, n, on, run, key, one) {
    var b = button('nf-chip' + (on ? ' on' : ''), '', run);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (one) b.setAttribute('data-one', '');
    b.setAttribute('data-key', key);
    b.appendChild(el('span', 'nf-chip-name', name));
    if (n != null) b.appendChild(el('span', 'nf-n', fmt(n)));
    if (!on && n === 0) b.classList.add('none');
    return b;
  }
  function dates() {
    var box = el('div', 'nf-dates');
    [['from', 'From'], ['until', 'To']].forEach(function (d) {
      var l = el('label', 'nf-date');
      l.appendChild(el('span', '', d[1]));
      var i = /** @type {HTMLInputElement} */ (el('input', 'nf-date-in'));
      i.type = 'date';
      i.value = P.v[d[0]];
      i.setAttribute('data-key', 'date:' + d[0]);
      i.addEventListener('change', function () {
        var ch = {};
        ch[d[0]] = i.value;
        setView(ch);
      });
      l.appendChild(i);
      box.appendChild(l);
    });
    return box;
  }
  function iconFor(kind) {
    if (kit().icon) return kit().icon(kind);
    var s = el('span', 'nt-ico');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /* The line over the list: what the view is, every filter on it as a chip to take off, and
     the presses that act on the view. With something picked, it is the picked ones' bar. */
  function drawViewLine() {
    var line = el('div', 'nf-line');
    var n = pickedCount();
    var allBox = el('label', 'nf-pick nf-pick-all');
    var all = /** @type {HTMLInputElement} */ (el('input', 'nf-pick-in'));
    all.type = 'checkbox';
    all.setAttribute('data-key', 'pick-all');
    all.checked = P.all || (n > 0 && n >= P.total);
    all.indeterminate = !all.checked && n > 0;
    all.disabled = !P.total;
    all.addEventListener('change', function () {
      if (all.checked) { P.all = true; P.picked = {}; } else unpick();
      draw();
    });
    allBox.appendChild(all);
    allBox.appendChild(el('span', 'nf-sr', 'Pick every one in this view'));
    line.appendChild(allBox);

    if (n) {
      line.classList.add('picking');
      line.appendChild(el('span', 'nf-view-words', fmt(n) + ' picked of ' + fmt(P.total) + (narrowed() ? ' in this view' : '')));
      var acts = el('div', 'nf-view-acts');
      var on = target();
      if (P.v.show === 'cleared') {
        acts.appendChild(act('Restore', GLYPH.restore, function () { bulk('restore', on); }, 'restore'));
      } else {
        acts.appendChild(act('Mark read', GLYPH.read, function () { bulk('read', on); }, 'mark-read'));
        acts.appendChild(act('Mark unread', GLYPH.unread, function () { bulk('unread', on); }, 'mark-unread'));
        acts.appendChild(act('Dismiss', GLYPH.x, function () { clear(on, P.all ? 'every one in this view' : 'the ones picked'); }, 'clear-picked'));
      }
      acts.appendChild(act('Unpick', '', function () { unpick(); draw(); }, 'unpick', 'nf-btn nf-btn-quiet'));
      line.appendChild(acts);
      return line;
    }

    var words = el('div', 'nf-view-words');
    words.appendChild(el('span', 'nf-view-n', P.loading && !P.counts ? 'Reading…' : (narrowed() ? 'Showing ' + fmt(P.total) : counted(P.total, 'notification'))));
    viewChips().forEach(function (c) { words.appendChild(c); });
    line.appendChild(words);
    if (narrowed() && P.total && P.v.show !== 'cleared') {
      var these = act('Dismiss these ' + fmt(P.total), GLYPH.x, function () {
        clear({ match: criteria(P.v), n: P.total }, 'exactly what this view shows, and nothing else');
      }, 'clear-view');
      line.appendChild(these);
    }
    if (P.v.show === 'cleared' && P.total) {
      line.appendChild(act('Restore these ' + fmt(P.total), GLYPH.restore, function () {
        bulk('restore', { match: criteria(P.v), n: P.total });
      }, 'restore-view'));
    }
    return line;
  }
  function act(words, glyph, run, key, cls) {
    var b = button(cls || 'nf-btn', '', run);
    b.innerHTML = (glyph ? svg(glyph, 15) : '') + '<span>' + words + '</span>';
    b.setAttribute('data-key', key);
    return b;
  }
  /** Each filter that is on, as a chip whose press takes it off. */
  function viewChips() {
    var out = [];
    var c = P.counts || { kinds: [], to: [], task: [] };
    function off(label, change, key) {
      var b = button('nf-on', '', function () { setView(change); });
      b.innerHTML = '<span>' + escapeHTML(label) + '</span>' + svg(GLYPH.x, 12);
      b.setAttribute('aria-label', 'Take off the filter ' + label);
      b.setAttribute('data-key', 'off:' + key);
      out.push(b);
    }
    if (P.v.q) off('“' + P.v.q + '”', { q: '' }, 'q');
    if (P.v.show) off(SHOWS.filter(function (s) { return s[0] === P.v.show; })[0][1], { show: '' }, 'show');
    if (P.v.when) {
      var w = WHENS.filter(function (s) { return s[0] === P.v.when; })[0][1];
      if (P.v.when === 'custom') w = (P.v.from || '…') + ' to ' + (P.v.until || '…');
      off(w, { when: '' }, 'when');
    }
    list(P.v.kind).forEach(function (k) {
      var got = (c.kinds || []).filter(function (x) { return x.id === k; })[0];
      off(got ? got.name : k, { kind: list(P.v.kind).filter(function (x) { return x !== k; }).join(',') }, 'kind:' + k);
    });
    list(P.v.leads).forEach(function (p) {
      var got = (c.to || []).filter(function (x) { return x.id === p; })[0];
      off('Leads to ' + (got ? got.name.toLowerCase() : p), { leads: list(P.v.leads).filter(function (x) { return x !== p; }).join(',') }, 'leads:' + p);
    });
    if (P.v.task) {
      var t = (c.task || []).filter(function (x) { return x.id === P.v.task; })[0];
      off('Task ' + (t ? t.name : P.v.task), { task: '' }, 'task');
    }
    return out;
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function drawList() {
    var box = el('div', 'nf-list');
    if (P.error && !P.items.length) {
      var e = el('div', 'nf-empty');
      e.appendChild(el('p', 'nf-empty-h', 'The notifications could not be read.'));
      e.appendChild(el('p', 'nf-empty-p', P.error));
      e.appendChild(button('nf-btn', 'Try again', function () { load(false); }));
      box.appendChild(e);
      return box;
    }
    if (!P.items.length && P.loading) {
      var w = el('div', 'nf-empty nf-loading');
      w.appendChild(el('p', 'nf-empty-p', 'Reading your notifications…'));
      box.appendChild(w);
      return box;
    }
    if (!P.items.length) {
      box.appendChild(emptyState());
      return box;
    }
    var groups = grouped(P.items);
    groups.forEach(function (g) {
      var sec = el('section', 'nf-day');
      var h = el('h4', 'nf-day-h', g.name);
      sec.appendChild(h);
      var ul = el('ul', 'nf-rows');
      g.items.forEach(function (n) { ul.appendChild(rowFor(n)); });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
    if (P.items.length < P.total) {
      var more = button('nf-btn nf-more', P.loading ? 'Loading…' : moreWords(), loadMore);
      more.setAttribute('data-key', 'more');
      box.appendChild(more);
    } else if (P.total > PAGE) {
      box.appendChild(el('p', 'nf-end', 'That is all ' + fmt(P.total) + '.'));
    }
    if (P.error) box.appendChild(el('p', 'nf-end nf-err', P.error));
    return box;
  }
  function emptyState() {
    var e = el('div', 'nf-empty');
    var t = P.totals || { kept: 0, cleared: 0 };
    if (narrowed()) {
      e.appendChild(el('p', 'nf-empty-h', P.v.show === 'cleared' ? 'Nothing dismissed matches this view.' :
        P.v.show === 'unread' && !P.v.q && filtersOn() === 1 ? 'You are all caught up.' : 'Nothing matches this view.'));
      e.appendChild(el('p', 'nf-empty-p', P.v.show === 'unread' && filtersOn() === 1 && !P.v.q
        ? 'Every notification has been read.' : 'Take a filter off, or reset them all to see every notification.'));
      var reset = button('nf-btn nf-btn-go', 'Reset filters', function () { setView(blank()); });
      reset.setAttribute('data-key', 'reset-empty');
      e.appendChild(reset);
    } else if (t.cleared) {
      e.appendChild(el('p', 'nf-empty-h', 'Nothing here: every notification is dismissed.'));
      e.appendChild(el('p', 'nf-empty-p', fmt(t.cleared) + ' are kept under Dismissed, and can be restored.'));
      var see = button('nf-btn nf-btn-go', 'Show dismissed', function () { setView({ show: 'cleared' }); });
      see.setAttribute('data-key', 'see-cleared');
      e.appendChild(see);
    } else {
      e.appendChild(el('p', 'nf-empty-h', 'No notifications yet.'));
      e.appendChild(el('p', 'nf-empty-p', 'When Rouh has something to tell you - a job finished, an email that needs you, a decision - it drops in at the top of the screen and is kept here.'));
    }
    return e;
  }

  /** The list in sections: by day for a list in time order, by kind for one by kind, and Unread
   *  over Read for unread first. */
  function grouped(items) {
    var out = [], by = {};
    var sort = P.v.sort || 'newest';
    items.forEach(function (n) {
      var key, name;
      if (sort === 'kind') { key = 'k:' + (n.kind || 'rouh'); name = n.kind_name || n.kind || 'Rouh'; }
      else if (sort === 'unread') {
        var u = n.state === 'new' || n.state === 'later';
        key = u ? 'u' : 'r'; name = u ? 'Unread' : 'Read';
      } else { key = 'd:' + dayKey(n.at); name = dayName(n.at); }
      if (!by[key]) { by[key] = { name: name, items: [] }; out.push(by[key]); }
      by[key].items.push(n);
    });
    return out;
  }
  function dayKey(at) { var d = new Date(at * 1000); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayName(at) {
    var d = new Date(at * 1000), now = new Date();
    var start = dayStart(now) * 1000;
    if (d.getTime() >= start) return 'Today';
    if (d.getTime() >= start - 86400000) return 'Yesterday';
    if (d.getTime() >= start - 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short',
                                             year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  function when(at) {
    var s = Math.max(0, Date.now() / 1000 - at);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    var d = new Date(at * 1000);
    var t = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.getTime() >= dayStart(Date.now()) * 1000) return t;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + t;
  }

  /** What a place is called on the row, in one word, by its address, in the order the row
   *  says them: Run, Chat, Task and Page first (Petar, 28 November 2026). */
  var PLACE_WORDS = [['/run/', 'Run'], ['/chat/', 'Chat'], ['/task/', 'Task'], ['/project/', 'Task'],
                     ['/workspace/', 'Page'], ['/decisions', 'Decision'], ['/brief', 'Brief'], ['/mail/', 'Email'],
                     ['/goal', 'Goal'], ['/quests', 'Quest'], ['/work', 'Quest'], ['/meeting', 'Meeting'],
                     ['/clockwork', 'Clockwork'], ['/reminders', 'Clockwork'], ['/browser', 'Browser'],
                     ['/web', 'Browser'], ['/files/', 'File']];
  var PLACE_ORDER = ['Run', 'Chat', 'Task', 'Page'];
  /** @param {string} href @param {string} to */
  function placeWord(href, to) {
    if (to === 'visual' || to === 'page') return 'Page';
    if (href.charAt(0) !== '/' || href.charAt(1) === '/') {
      try { return new URL(href).hostname.replace(/^www\./, '') || 'Link'; } catch (e) { return 'Link'; }
    }
    // A task's own page, drawn (`/task/<folder>/<step>/index.html`), is a page of it.
    if (/^\/(task|project)\/.+\.html?(?:[?#]|$)/.test(href)) return 'Page';
    var got = PLACE_WORDS.filter(function (w) { return href.indexOf(w[0]) === 0; })[0];
    return got ? got[1] : 'Open';
  }
  /** Every place a notification leads, each once: Run, Chat, Task, Page, then the rest.
   *  @param {any} n */
  function placesOf(n) {
    var out = [], seen = {};
    function add(href, label, title, to) {
      if (!href || seen[href]) return;
      seen[href] = true;
      out.push({ href: href, word: placeWord(href, to || ''), title: title || label || '' });
    }
    (n.links || []).forEach(function (p) { if (p && p.href) add(p.href, p.label, p.title, p.to); });
    if (n.link) add(n.link, n.link_label || 'Open it', '', '');
    function rank(p) { var i = PLACE_ORDER.indexOf(p.word); return i < 0 ? PLACE_ORDER.length : i; }
    return out.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (x, y) { return rank(x.p) - rank(y.p) || x.i - y.i; })
      .map(function (x) { return x.p; });
  }
  function isUnread(n) { return n.state === 'new' || n.state === 'later'; }
  /** Whether opening it shows more than the row already does: its details, or a decision. */
  function hasMore(n) { return !!(n.details || n.decision); }

  /** One notification's card, on one grid (Petar, 28 November 2026): the pick and the icon
   *  centred on the title's line; the icon's whole column, top to bottom, the one way to open
   *  and fold it, its two chevrons pointing apart to open and together to fold; the title plain
   *  words; the meta line, the short version whole and the one row of actions all on the
   *  title's left edge. @param {any} n */
  function rowFor(n) {
    var more = hasMore(n);
    var opened = more && P.opened === n.id;
    var li = el('li', 'nf-row' + (isUnread(n) ? ' unread' : '') + (opened ? ' open' : '') +
      (n.state === 'dismissed' ? ' cleared' : '') + (P.at === n.id ? ' at' : '') +
      (P.fresh[n.id] && Date.now() - P.fresh[n.id] < 8000 ? ' fresh' : '') + (isPicked(n) ? ' picked' : ''));
    li.setAttribute('data-id', String(n.id));

    var pick = el('label', 'nf-pick');
    var box = /** @type {HTMLInputElement} */ (el('input', 'nf-pick-in'));
    box.type = 'checkbox';
    box.checked = isPicked(n);
    box.addEventListener('change', function () { pickOne(n, box.checked); });
    pick.appendChild(box);
    pick.appendChild(el('span', 'nf-sr', 'Pick ' + n.title));
    li.appendChild(pick);

    var strip;
    if (more) {
      strip = button('nf-open', '', function () { toggle(n); });
      strip.setAttribute('aria-expanded', opened ? 'true' : 'false');
      strip.setAttribute('aria-label', (opened ? 'Fold the details of ' : 'Show the details of ') + n.title);
      strip.title = opened ? 'Fold the details' : 'Show the details';
    } else {
      strip = el('div', 'nf-open nf-open-none');
    }
    strip.appendChild(iconFor(n.kind || 'rouh'));
    if (more) {
      var chev = el('span', 'nf-chev');
      chev.innerHTML = svg(opened ? GLYPH.fold : GLYPH.unfold, 18);
      strip.appendChild(chev);
    }
    li.appendChild(strip);

    var main = el('div', 'nf-row-main');
    var top = el('div', 'nf-row-top');
    var title = el('h4', 'nf-title');
    marked(title, n.title);
    top.appendChild(title);
    var t = el('time', 'nf-when', when(n.at));
    t.setAttribute('datetime', new Date(n.at * 1000).toISOString());
    t.title = new Date(n.at * 1000).toLocaleString();
    top.appendChild(t);
    main.appendChild(top);

    var tags = el('div', 'nf-tags');
    if (isUnread(n)) {
      var unread = el('span', 'nf-tag nf-tag-unread');
      unread.appendChild(el('span', 'nf-dot'));
      unread.appendChild(document.createTextNode('Unread'));
      tags.appendChild(unread);
    }
    tags.appendChild(button('nf-tag nf-tag-btn', n.kind_name || n.kind || 'Rouh', function () { setView({ kind: n.kind || 'rouh' }); }, 'Only ' + (n.kind_name || n.kind)));
    (n.tasks || []).slice(0, 2).forEach(function (task) {
      tags.appendChild(button('nf-tag nf-tag-btn', 'Task ' + task.name, function () { setView({ task: task.id }); }, 'Only the ones about ' + task.id));
    });
    if (n.state === 'dismissed') tags.appendChild(el('span', 'nf-tag', 'Dismissed'));
    if (n.phone === 'sent') tags.appendChild(el('span', 'nf-tag', 'Sent to your phone'));
    main.appendChild(tags);

    // The short version, every word of it; opened, the details under it.
    if (opened) main.appendChild(whole(n));
    else if (n.body) main.appendChild(marked(el('p', 'nf-peek'), kit().plain ? kit().plain(n.body) : n.body));

    // One row of actions: where it leads, then what can be done to it, each said in words.
    var row = el('div', 'nf-acts');
    var go = el('div', 'nf-places');
    if (kit().reloadable && kit().reloadable(n)) {
      var rl = button('nf-place nf-place-go', '', function () {
        postJSON('/api/notifications/act', { act: 'read', ids: [n.id] }).catch(function () {}).then(function () { location.reload(); });
      }, 'Load the page again, as the build Rouh is serving now');
      rl.innerHTML = svg(GLYPH.restore, 13);
      rl.appendChild(document.createTextNode('Reload'));
      go.appendChild(rl);
    }
    placesOf(n).forEach(function (p) {
      var a = /** @type {HTMLAnchorElement} */ (el('a', 'nf-place'));
      a.href = p.href;
      a.innerHTML = svg(GLYPH.go, 12);
      a.appendChild(document.createTextNode(p.word));
      a.title = p.title && p.title !== p.word ? p.title : 'Open the ' + p.word.toLowerCase();
      a.setAttribute('aria-label', a.title + ': ' + n.title);
      var outside = p.href.charAt(0) !== '/' || p.href.charAt(1) === '/';
      if (outside) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      if (p.href.indexOf('/files/') === 0) a.setAttribute('download', decodeURIComponent(p.href.split('/').pop() || ''));
      a.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        follow(n, p.href);
      });
      go.appendChild(a);
    });
    if (go.childNodes.length) row.appendChild(go);

    var own = el('div', 'nf-own');
    function ownBtn(words, glyph, run, tip, label) {
      var b = button('nf-act', '', run, tip);
      b.innerHTML = svg(glyph, 14);
      b.appendChild(el('span', 'nf-act-w', words));
      b.setAttribute('aria-label', label);
      return b;
    }
    if (n.state === 'dismissed') {
      own.appendChild(ownBtn('Restore', GLYPH.restore, function () { bulk('restore', { ids: [n.id], n: 1 }); },
        'Restore: put it back in the list (e)', 'Restore ' + n.title));
    } else {
      var u = isUnread(n);
      own.appendChild(ownBtn(u ? 'Mark read' : 'Mark unread', u ? GLYPH.read : GLYPH.unread, function () {
        if (!u && P.opened === n.id) P.opened = 0;
        bulk(u ? 'read' : 'unread', { ids: [n.id], n: 1 });
      }, (u ? 'Mark read' : 'Mark unread') + ' (u)', (u ? 'Mark read: ' : 'Mark unread: ') + n.title));
      own.appendChild(ownBtn('Dismiss', GLYPH.x, function () { bulk('clear', { ids: [n.id], n: 1 }); },
        'Dismiss: take it off the list. It is kept under Show: Dismissed, and can be restored (e)', 'Dismiss ' + n.title));
    }
    row.appendChild(own);
    main.appendChild(row);
    li.appendChild(main);
    return li;
  }
  /** Opened: every word, or the decision it asks. @param {any} n */
  function whole(n) {
    var box = el('div', 'nf-whole');
    if (n.decision && kit().decision) {
      box.appendChild(kit().decision(n.decision, n));
      if (n.body) {
        var said = el('details', 'nf-said');
        said.appendChild(el('summary', '', 'What the notification said'));
        said.appendChild(md(n.body));
        box.appendChild(said);
      }
      return box;
    }
    // The overview, then everything under it (`details`, a finished job's whole result since
    // 26 November 2026); a notice from before has its body alone, which was every word of it.
    if (n.body) box.appendChild(md(n.body));
    if (n.details) {
      var more = el('div', 'nf-details');
      more.appendChild(el('h5', 'nf-details-head', 'Details'));
      more.appendChild(md(n.details));
      box.appendChild(more);
    }
    if (!n.body && !n.details) box.appendChild(el('p', 'nf-peek', 'Nothing more than its title.'));
    return box;
  }
  function md(text) {
    var d = el('div', 'nf-md nt-md');
    if (kit().markdown) d.innerHTML = kit().markdown(text);
    else d.textContent = text;
    return d;
  }

  /** `text` in `node`, every word searched for marked where it is found. */
  function marked(node, text) {
    var words = P.v.q.split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length) { node.textContent = text; return node; }
    var find = new RegExp('(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    String(text).split(find).forEach(function (part, i) {
      node.appendChild(i % 2 ? el('mark', 'nf-hit', part) : document.createTextNode(part));
    });
    return node;
  }
  function isPicked(n) { return P.all ? true : !!P.picked[n.id]; }
  function pickOne(n, on) {
    if (P.all) {
      // From every one in the view to the loaded ones, less this one.
      P.all = false;
      P.picked = {};
      P.items.forEach(function (x) { P.picked[x.id] = true; });
    }
    if (on) P.picked[n.id] = true; else delete P.picked[n.id];
    P.at = n.id;
    draw();
  }

  /* ---------- the keyboard ---------- */

  function rowNode(id) { return /** @type {HTMLElement | null} */ (document.querySelector('#nfBody .nf-row[data-id="' + id + '"]')); }
  /** Move the keyboard's row by `by`, or to the first with `first`. */
  function moveTo(by, first) {
    if (!P.items.length) return;
    var i = P.items.findIndex(function (n) { return n.id === P.at; });
    i = first || i < 0 ? 0 : Math.max(0, Math.min(P.items.length - 1, i + by));
    P.at = P.items[i].id;
    var rows = document.querySelectorAll('#nfBody .nf-row.at');
    for (var k = 0; k < rows.length; k++) rows[k].classList.remove('at');
    var row = rowNode(P.at);
    if (row) {
      row.classList.add('at');
      var strip = /** @type {HTMLElement | null} */ (row.querySelector('.nf-open'));
      if (strip) strip.focus({ preventScroll: true });
      if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
    if (i >= P.items.length - 3) loadMore();
  }
  function current() { return P.items.filter(function (n) { return n.id === P.at; })[0]; }

  function keys(e) {
    if (!P.open || e.defaultPrevented) return;
    var t = e.target;
    var typing = t instanceof Element && !!t.closest('input:not([type=checkbox]), textarea, select, [contenteditable="true"], dialog');
    if (typing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var n = current();
    var k = e.key;
    if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); moveTo(1); }
    else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); moveTo(-1); }
    else if (k === '/') { e.preventDefault(); var s = $('nfSearch'); if (s) s.focus(); }
    else if ((k === 'Enter' || k === 'o') && n && !(t instanceof Element && t.closest('a, button:not(.nf-open)'))) { e.preventDefault(); toggle(n); }
    else if (k === 'x' && n) { e.preventDefault(); pickOne(n, !isPicked(n)); }
    else if ((k === 'e' || k === 'Delete' || k === '#') && n) {
      e.preventDefault();
      var i = P.items.indexOf(n);
      var next = P.items[i + 1] || P.items[i - 1];
      if (n.state === 'dismissed') bulk('restore', { ids: [n.id], n: 1 });
      else bulk('clear', { ids: [n.id], n: 1 });
      if (next) P.at = next.id;
    }
    else if (k === 'u' && n && n.state !== 'dismissed') { e.preventDefault(); bulk(isUnread(n) ? 'read' : 'unread', { ids: [n.id], n: 1 }); }
    else if (k === '?') { e.preventDefault(); var h = $('nfKeys'); if (h) /** @type {HTMLDetailsElement} */ (h).open = !(/** @type {HTMLDetailsElement} */ (h).open); }
    else if (k === 'Escape') {
      if (P.sheet) { e.preventDefault(); P.sheet = false; draw(); }
      else if (pickedCount()) { e.preventDefault(); unpick(); draw(); }
      else if (P.opened) { e.preventDefault(); var was = P.opened; P.opened = 0; draw(); var r = rowNode(was); var st = r && r.querySelector('.nf-open'); if (st) /** @type {HTMLElement} */ (st).focus(); }
      // Otherwise Escape is the layer's, and closes the page.
    }
  }

  /* ---------- loading as it is scrolled to, and what the page drew ---------- */

  var watcher = null;
  function watchMore() {
    if (!('IntersectionObserver' in window)) return;
    if (watcher) watcher.disconnect();
    var more = document.querySelector('#nfBody .nf-more');
    if (!more) return;
    watcher = new IntersectionObserver(function (seen) {
      if (seen.some(function (s) { return s.isIntersecting; })) loadMore();
    }, { root: $('nfBody'), rootMargin: '400px' });
    watcher.observe(more);
  }
  function tellSeen() {
    if (document.visibilityState === 'hidden') return;
    // A new one drawn here has been seen, as one put away from the stack has: it waits as
    // unread, and its phone copy stays quiet.
    var ids = P.items.filter(function (n) { return n.state === 'new' && !P.seen[n.id]; }).map(function (n) { return n.id; });
    if (!ids.length) return;
    ids.forEach(function (id) { P.seen[id] = true; });
    postJSON('/api/notifications/act', { act: 'later', ids: ids }).catch(function () {});
  }

  /* ---------- what app/runs.js and the socket call ---------- */

  /** The page is on the screen, with this view. @param {string} q the address's query */
  function shown(q) {
    var v = readQuery(q);
    var same = P.open && KEYS.every(function (k) { return P.v[k] === v[k]; });
    P.v = v;
    var was = P.open;
    P.open = true;
    if (!was) window.dispatchEvent(new Event('rouh:notices-page'));
    if (same && was) return;
    unpick();
    P.opened = 0;
    load(false);
  }
  function hidden() {
    P.open = false;
    window.dispatchEvent(new Event('rouh:notices-page'));
    P.sheet = false;
    var box = $('nfToast');
    if (box) box.hidden = true;
  }
  /** The list moved somewhere (a notification said, or acted on in another tab). */
  function moved() {
    if (!P.open) return;
    clearTimeout(P.movedTimer);
    P.movedTimer = setTimeout(function () { if (P.open && !P.loading) load(true); }, 500);
  }

  window.RouhNoticesPage = { shown: shown, hidden: hidden, moved: moved, query: query,
                            isOpen: function () { return P.open; } };

  var view = $('notificationsView');
  if (view) view.addEventListener('keydown', keys);
  var x = $('nfClose');
  if (x) x.addEventListener('click', function () { if (host().close) host().close(); });
  var allRead = $('nfAllRead');
  if (allRead) allRead.addEventListener('click', markAllRead);
  document.addEventListener('visibilitychange', function () { if (P.open) tellSeen(); });
  // The times on the rows ("4 min ago") move on by themselves.
  setInterval(function () {
    if (!P.open) return;
    var times = document.querySelectorAll('#nfBody .nf-when');
    for (var i = 0; i < times.length; i++) {
      var tm = /** @type {HTMLElement} */ (times[i]);
      var at = Date.parse(tm.getAttribute('datetime') || '') / 1000;
      if (at) tm.textContent = when(at);
    }
  }, 30000);
}());
