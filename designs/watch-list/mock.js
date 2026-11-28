/* Step 202-05. The prototype's stand-in for Rouh's watch list API (steps 202-03 and 202-04): the same answers the real
   routes give, kept in memory over sample titles, so the real page script runs offline. */
(function () {
  'use strict';
  var AS = window.PROTO_AS || 'petar';
  var NOW = Date.now() / 1000, DAY = 86400;
  var PEOPLE = {
    petar: { name: 'Alex', email: 'alex@example.com' },
    maria: { name: 'Мира Петкова-Иванова', email: 'mira@example.com' },
    ivan: { name: 'Ivo', email: 'ivo@example.com' },
    elena: { name: 'Lena', email: 'lena@example.com' },
    georgi: { name: 'Gogo', email: 'gogo@example.com' },
    nina: { name: '', email: 'nia.k@example.com' }
  };
  // A drawn stand-in poster: two colours and the title, so the prototype shows the page with pictures.
  function art(title, a, b) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="' + a + '"/>' +
      (title.split('').reduce(function (a, ch) { return a + ch.charCodeAt(0); }, 0) % 3 === 0 ? '<circle cx="150" cy="80" r="70" fill="' + b + '" opacity=".75"/>'
        : title.split('').reduce(function (a, ch) { return a + ch.charCodeAt(0); }, 0) % 3 === 1 ? '<path d="M0 190 L70 90 L120 150 L160 110 L200 170 L200 200 L0 200Z" fill="' + b + '" opacity=".8"/>'
          : '<rect x="30" y="40" width="140" height="140" fill="none" stroke="' + b + '" stroke-width="14"/>') + '<rect y="200" width="200" height="100" fill="#000" opacity=".35"/>' +
      '<text x="14" y="262" font-family="Georgia,serif" font-size="22" fill="#fff">' + title.replace(/&/g, '&amp;') + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var FULL = {
    lists: [
      { id: 1, name: 'Alex and Mira', people: [{ key: 'maria', joined: true, role: 'edit', mailed: true, token: 't1' }] },
      { id: 2, name: 'Film club', people: [
        { key: 'ivan', joined: true, role: 'edit', mailed: true, token: 't2' },
        { key: 'elena', joined: true, role: 'edit', mailed: true, token: 't3' },
        { key: 'georgi', joined: true, role: 'view', mailed: true, token: 't4' },
        { key: 'nina', joined: false, role: 'edit', mailed: false, mail_error: 'Mail is not set up on this Rouh.', token: 't5' }] },
      { id: 3, name: 'С децата (with the kids)', people: [] }
    ],
    items: [
      { number: 1, title: 'The Sunken Cities', kind: 'documentary', years: '2022-2024', where: 'Netflix', status: 'to_watch',
        seasons: [{ n: 1, name: '', episodes: 8, year: 2022 }, { n: 2, name: 'The Americas', episodes: 6, year: 2024 }],
        seen: {}, runtime: 45, list: 0, by: 'petar', rank: 1, added_at: NOW - 1 * DAY, genres: ['Documentary', 'History'],
        overview: 'A journalist travels the world looking for traces of a lost civilisation.', marks: {},
        tags: ['history', 'cosy'], poster: art('The Sunken Cities', '#1f3b4d', '#c58b3a') },
      { number: 9, title: 'The Long Orbit', imdb_id: 'tt9000002', kind: 'film', years: '2019', where: 'Netflix', status: 'to_watch', runtime: 116, list: 0,
        by: 'petar', rank: 0, added_at: NOW - 400 * DAY, genres: ['Science fiction'], watches: [NOW - 700 * DAY, NOW - 200 * DAY], status_was: 'watched',
        tags: ['sci-fi', 'rewatch-worthy', 'cosy'], marks: { petar: { rating: 9 } }, poster: art('The Long Orbit', '#2a2f45', '#8fb3d9') },
      { number: 10, title: 'A Bear in Town', kind: 'film', years: '2017', where: 'HBO Max', status: 'to_watch', runtime: 103, list: 3,
        by: 'petar', rank: 1, added_at: NOW - 4 * DAY, tags: ['cosy', 'with the kids', 'feel-good', 'family', 'comedy',
        'british', 'rainy day', 'christmas', 'short', 'bears', 'favourites', 'second watch'], marks: {} },
      { number: 2, title: 'Harbour Lights', imdb_id: 'tt9000001', kind: 'show', years: '2022-', where: 'Apple TV+', status: 'watching',
        seasons: [{ n: 1, name: '', episodes: 9, year: 2022 }, { n: 2, name: '', episodes: 10, year: 2025 }],
        seen: { '1': 9, '2': 3 }, runtime: 55, list: 1, by: 'maria', rank: 1, added_at: NOW - 20 * DAY, genres: ['Drama', 'Mystery'],
        overview: 'A harbour town keeps its secrets until the lighthouse goes dark.',
        marks: { maria: { seen_before: false } }, poster: art('Harbour Lights', '#123a3a', '#e0b44c') },
      { number: 3, title: 'Desert Crown: Part Two', kind: 'film', years: '2024', where: 'HBO Max', status: 'to_watch', runtime: 166,
        list: 1, by: 'petar', rank: 2, added_at: NOW - 6 * DAY, recommended_by: 'Ivo', genres: ['Science fiction'],
        marks: { maria: { seen_before: true } }, poster: art('Desert Crown II', '#5a3418', '#e8a85a') },
      { number: 4, title: 'Горска сянка', kind: 'film', years: '2024', where: '', status: 'to_watch', runtime: 98, list: 1, by: 'maria',
        rank: 3, added_at: NOW - 2 * DAY, genres: ['Horror'], marks: {} },
      { number: 5, title: 'El Archivo del Tiempo: La Película Definitiva', kind: 'film', years: '2025', where: 'RTVE Play',
        status: 'to_watch', runtime: 112, list: 1, by: 'maria', rank: 4, added_at: NOW - 1 * DAY, marks: {} },
      { number: 6, title: 'Iron Shore', kind: 'show', years: '2024', where: 'Disney+', status: 'watched',
        seasons: [{ n: 1, name: '', episodes: 10, year: 2024 }], seen: { '1': 10 }, runtime: 58, list: 1, by: 'petar', rank: 5,
        added_at: NOW - 60 * DAY, watched_at: NOW - 9 * DAY, watches: [NOW - 9 * DAY], poster: art('Iron Shore', '#3b1d1d', '#c94f3d'),
        marks: { petar: { rating: 10, note: '' }, maria: { rating: 8, note: 'Slow first two episodes, then I could not stop.' } } },
      { number: 7, title: 'Small Hours', kind: 'film', years: '2023', where: 'MUBI', status: 'to_watch', runtime: 124, list: 2,
        by: 'ivan', rank: 1, added_at: NOW - 3 * DAY, marks: { elena: { seen_before: true } }, poster: art('Small Hours', '#24344d', '#f2d27a') },
      { number: 8, title: 'The Quiet Garden', kind: 'film', years: '2023', where: '', status: 'watched', runtime: 105, list: 2,
        by: 'elena', rank: 2, added_at: NOW - 40 * DAY, watched_at: NOW - 30 * DAY, watches: [NOW - 30 * DAY],
        marks: { petar: { rating: 8 }, ivan: { rating: 10 }, elena: { rating: 7 } } }
    ],
    next: 11
  };
  // The owner's real shape on 28 November 2026, with made-up titles: three to watch on My list, no lists, nobody invited.
  var SMALL = {
    lists: [],
    items: [
      { number: 1, title: 'The Sunken Cities', kind: 'documentary', years: '2022-2024', where: 'Netflix', status: 'to_watch',
        seasons: [{ n: 1, name: '', episodes: 8, year: 2022 }, { n: 2, name: 'The Americas', episodes: 6, year: 2024 }],
        seen: {}, runtime: 45, list: 0, by: 'petar', rank: 1, added_at: NOW - 1 * DAY, genres: ['Documentary', 'History'],
        overview: 'A journalist travels the world looking for traces of a lost civilisation.', marks: {},
        poster: art('The Sunken Cities', '#1f3b4d', '#c58b3a') },
      { number: 2, title: 'The Glass Maze', kind: 'film', years: '2014', where: '', status: 'to_watch', runtime: 113, list: 0,
        by: 'petar', rank: 2, added_at: NOW - 1 * DAY, genres: ['Action', 'Science fiction'], marks: {}, poster: art('The Glass Maze', '#20302a', '#9fd18b') },
      { number: 3, title: 'The Century of Wanting', kind: 'miniseries', years: '2002', where: '', status: 'to_watch', runtime: 58, list: 0,
        seasons: [{ n: 1, name: '', episodes: 4, year: 2002 }], seen: {}, by: 'petar', rank: 3, added_at: NOW - 0.2 * DAY,
        genres: ['Documentary'], marks: {} }
    ],
    next: 4
  };
  if (window.PROTO_SET === 'many') {
    ['Documentaries', 'Сериали за уикенда с цялото семейство', 'Horror nights', 'Oscars 2026', 'Mum and dad', 'Travel'].forEach(function (n, i) {
      FULL.lists.push({ id: 4 + i, name: n, people: [] });
    });
  }
  var EMPTY = { lists: [], items: [], next: 1 };
  var S = window.PROTO_SET === 'small' ? SMALL : window.PROTO_SET === 'empty' ? EMPTY : FULL;
  var MYLIST = AS === 'petar' ? null : 1;

  function total(t) { return (t.seasons || []).reduce(function (a, s) { return a + s.episodes; }, 0); }
  function seenN(t) { return (t.seasons || []).reduce(function (a, s) { return a + Math.min(s.episodes, (t.seen || {})[s.n] || 0); }, 0); }
  function nextEp(t) {
    var ss = t.seasons || [];
    for (var i = 0; i < ss.length; i++) {
      var got = (t.seen || {})[ss[i].n] || 0;
      if (got < ss[i].episodes) { return { season: ss[i].n, episode: got + 1 }; }
    }
    return null;
  }
  function membersOf(id) {
    var l = S.lists.filter(function (x) { return x.id === id; })[0];
    return l ? ['petar'].concat(l.people.filter(function (p) { return p.joined; }).map(function (p) { return p.key; })) : ['petar'];
  }
  function nameOf(k) { return k === 'petar' ? 'Alex' : (PEOPLE[k].name || PEOPLE[k].email); }
  function view(t) {
    var m = t.marks[AS] || {};
    var others = !t.list ? [] : membersOf(t.list).filter(function (k) { return k !== AS; }).map(function (k) {
      var o = t.marks[k] || {};
      return { name: nameOf(k), rating: o.rating || null, note: o.note || '', seen_before: !!o.seen_before };
    });
    var serial = t.kind !== 'film';
    return {
      number: t.number, title: t.title, kind: t.kind, years: t.years, where: t.where || '', where_url: t.where ? 'https://' + t.where.toLowerCase().replace(/[^a-z]/g, '') + '.example/title/' + t.number : '', status: t.status,
      status_said: { to_watch: 'To watch', watching: 'Watching', watched: 'Watched' }[t.status],
      seasons: t.seasons || [], seen: t.seen || {}, episodes: serial ? total(t) : 0, episodes_seen: serial ? seenN(t) : 0,
      next: serial ? nextEp(t) : null, runtime: t.runtime, genres: t.genres || [], rating: null, rating_from: '',
      overview: t.overview || '', cast: '', poster: t.poster || '', my_rating: m.rating || null, notes: m.note || '',
      recommended_by: t.recommended_by || '', rank: t.rank, added_at: t.added_at, updated_at: t.updated_at || t.added_at,
      started_at: null, watched_at: t.watched_at || null, looked_up: true,
      links: { where_find: '#where', trailer: '#trailer', imdb: t.imdb_id ? '#imdb' : '', wiki: t.imdb_id ? '#wiki' : '' },
      list: t.list, added_by_name: t.by === AS ? '' : nameOf(t.by), others: others, seen_before: !!m.seen_before,
      watches: t.watches || [], times_watched: (t.watches || []).length, tags: t.tags || [], imdb_id: t.imdb_id || '', year: +t.years || null,
      can_remove: AS === 'petar' || t.by === AS
    };
  }
  function people(l) {
    return l.people.map(function (p) {
      return { token: p.token, email: PEOPLE[p.key].email, name: PEOPLE[p.key].name, joined: p.joined, role: p.role,
               mailed: p.mailed, mail_error: p.mail_error || '', link: 'https://rouh.example/shared/' + p.token,
               you: p.key === AS };
    });
  }
  function data() {
    var its = S.items.filter(function (t) { return MYLIST ? t.list === MYLIST : true; }).map(view);
    var ls = S.lists.filter(function (l) { return MYLIST ? l.id === MYLIST : true; }).map(function (l) {
      return { id: l.id, name: l.name, people: people(l), owner_name: 'Alex' };
    });
    return { items: its, lists: ls, me: { name: AS === 'petar' ? 'Alex' : nameOf(AS) }, guest: !!MYLIST, list: MYLIST || 0,
             can_share: '', read_only: !!window.PROTO_RO };
  }
  function item(n) { return S.items.filter(function (t) { return t.number === n; })[0]; }
  function setStatus(t, st) {
    t.status = st;
    if (st === 'watched') { t.watched_at = Date.now() / 1000; t.watches = (t.watches || []).concat([t.watched_at]); (t.seasons || []).forEach(function (s) { t.seen[s.n] = s.episodes; }); }
    else if (t.watches && t.watches.length && Date.now() / 1000 - t.watches[t.watches.length - 1] < 900) { t.watches = t.watches.slice(0, -1); }
    if (st === 'to_watch') { t.seen = {}; }
  }
  function answer(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  var MATCHES = [
    { key: 'tt9000002', imdb_id: 'tt9000002', title: 'The Long Orbit', year: 2019, kind: 'film', kind_said: 'Film', cast: 'Ines Varga, Tomas Reel' },
    { key: 'tt9000003', imdb_id: 'tt9000003', title: 'The Long Orbit', years: '2023-2023', kind: 'miniseries', kind_said: 'Mini-series', cast: 'Ana Ferreira' },
    { key: 'tt9000004', title: 'Small Hours', year: 2025, kind: 'film', kind_said: 'Film', cast: 'Patrick Hale' }
  ];
  window.fetch = function (url, init) {
    var u = new URL(url, location.href), p = u.pathname.replace(/^.*\/api\/watch/, ''), b = {};
    try { b = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { b = {}; }
    var m;
    if (p === '' || p === '/') { return answer(data()); }
    if (p === '/search') {
      var q = (u.searchParams.get('q') || '').toLowerCase();
      return answer({ matches: MATCHES.filter(function (x) { return x.title.toLowerCase().indexOf(q.slice(0, 3)) === 0; }), offline: false });
    }
    if (p === '/new') {
      var t = { number: S.next++, title: b.title, kind: (b.pick && b.pick.kind) || 'film', years: String((b.pick && (b.pick.years || b.pick.year)) || ''),
                status: 'to_watch', list: MYLIST || b.list || 0, by: AS, rank: 0, added_at: Date.now() / 1000, marks: {}, seasons: [], seen: {} };
      S.items.push(t);
      return answer({ ok: true, item: view(t), said: '' });
    }
    if (p === '/leave') { return answer({ ok: true }); }
    if (p === '/lists/new') {
      if (S.lists.some(function (x) { return x.name.toLowerCase() === String(b.list_name).toLowerCase(); })) {
        return answer({ error: 'You have a list called ' + b.list_name + ' already: give this one another name, or invite them to that one with People and invites.' }, 400);
      }
      var id = S.lists.length + 1;
      if (!b.email) {
        S.lists.push({ id: id, name: b.list_name, people: [] });
        (b.titles || []).forEach(function (n) { item(n).list = id; });
        return answer({ ok: true, data: data(), list: { id: id, name: b.list_name } });
      }
      var key = 'new' + id;
      PEOPLE[key] = { name: b.name || '', email: b.email };
      S.lists.push({ id: id, name: b.list_name, people: [{ key: key, joined: false, role: b.role, mailed: false,
        mail_error: b.notify ? 'Mail is not set up on this Rouh.' : '', token: 'n' + id }] });
      (b.titles || []).forEach(function (n) { item(n).list = id; });
      return answer({ ok: true, data: data(), list: { id: id }, link: 'https://rouh.example/shared/n' + id,
        said: b.notify ? 'Shared with ' + b.email + ', but the email did not go: Mail is not set up on this Rouh. Send them the link below yourself.'
          : 'Shared with ' + b.email + '. No email was sent, so they will not know until you tell them: send them the link below. They open it by signing in with rouh.land as that address.' });
    }
    if ((m = /^\/lists\/(\d+)(\/[a-z]+)?$/.exec(p))) {
      var l = S.lists.filter(function (x) { return x.id === +m[1]; })[0];
      if (!m[2]) { l.name = b.name; return answer({ ok: true, data: data() }); }
      if (m[2] === '/invite') {
        var k2 = 'inv' + Math.random().toString(36).slice(2, 6);
        PEOPLE[k2] = { name: b.name || '', email: b.email };
        l.people.push({ key: k2, joined: false, role: b.role, mailed: !!b.notify, token: k2 });
        return answer({ ok: true, data: data(), link: 'https://rouh.example/shared/' + k2,
          said: b.notify ? 'Shared with ' + b.email + ', and an email with the link went to them.' : 'Shared with ' + b.email + '. No email was sent: send them the link yourself.' });
      }
      if (m[2] === '/uninvite') {
        var gone = l.people.filter(function (x) { return x.token === b.token; })[0];
        l.people = l.people.filter(function (x) { return x !== gone; });
        return answer({ ok: true, data: data(), was: gone });
      }
      if (m[2] === '/putback') { l.people.push(b.was); return answer({ ok: true, data: data() }); }
      if (m[2] === '/stop') { l.people = []; return answer({ ok: true, data: data() }); }
      if (m[2] === '/delete') {
        S.items.forEach(function (t) { if (t.list === l.id) { t.list = 0; } });
        S.lists = S.lists.filter(function (x) { return x !== l; });
        return answer({ ok: true, data: data() });
      }
    }
    if ((m = /^\/(\d+)(\/[a-z]+)?$/.exec(p))) {
      var t2 = item(+m[1]);
      if (!m[2]) {
        if ('status' in b) { setStatus(t2, b.status); }
        if ('list' in b) { t2.list = b.list; }
        if ('my_rating' in b) { (t2.marks[AS] = t2.marks[AS] || {}).rating = b.my_rating; }
        if ('notes' in b) { (t2.marks[AS] = t2.marks[AS] || {}).note = b.notes; }
        if ('seen_before' in b) { (t2.marks[AS] = t2.marks[AS] || {}).seen_before = b.seen_before; }
        if ('seen' in b) { t2.seen = b.seen; }
        if ('tags' in b) { t2.tags = b.tags; }
        return answer({ ok: true, item: view(t2) });
      }
      if (m[2] === '/tick') {
        var nx = b.step ? nextEp(t2) : { season: b.season, episode: b.episode };
        if (nx) { t2.seen[nx.season] = nx.episode; }
        if (t2.status === 'to_watch') { t2.status = 'watching'; }
        var fin = seenN(t2) === total(t2);
        if (fin) { t2.status = 'watched'; t2.watched_at = Date.now() / 1000; }
        return answer({ ok: true, item: view(t2), finished: fin });
      }
      if (m[2] === '/again') { t2.status = 'to_watch'; t2.seen = {}; t2.rank = -2; return answer({ ok: true, item: view(t2) }); }
      if (m[2] === '/front') { t2.rank = -1; return answer({ ok: true, item: view(t2) }); }
      if (m[2] === '/delete') { S.items = S.items.filter(function (x) { return x !== t2; }); return answer({ ok: true, was: { number: t2.number } }); }
      if (m[2] === '/refresh') { return answer({ ok: true, item: view(t2), said: 'Its details are up to date.' }); }
    }
    return answer({ error: 'Not in the prototype.' }, 404);
  };
})();
