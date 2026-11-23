/* Testing, in Evolution, at `/evolution/testing` (`rouh/web/trials.py`, `rouh/trials/`). It was called Trials, at
   `/evolution/trials`, until 22 November 2026, when Petar renamed it: those addresses are sent here (`urls.py`).

   Petar, 4 November 2026, on the first version: "Terrible first version of trials." What he asked for:
   "1. I need to be able to see and manage the people testing the software. I want to be able to add more
   people and remove them. I want to see their full profile and everything written on them. 2. I want a
   list of jobs. Each job will have multiple tries and has to say who did it, but only when I click on the
   job. Then I see the trials for that job specifically, and for each try, I want to see the different
   problems and discuss them." With the best of the two earlier tests he liked, Mira's ten use cases
   (30-43) and Teodora's bug hunt (30-44): a tester who reads like a real person, each try told step by
   step with its screenshot and the tester's own words, problems worst first with what should have
   happened, what did and how to fix it, a severity filter, screenshots that open full size, ticking and
   copying, Send as feedback and Edit before sending, and a page on how it works with its words explained.

   The look since 7 November 2026 is the "Page atlas", the design that scored best in design test 3
   (task 169, step 169-09, run v2-full, direction B), installed on Petar's word: "Take the best one from
   the v2 full and install it." Everything hangs off the pages of Rouh being tested: the Atlas draws one
   phone per page with one mark per open problem, shaped by how bad it is; the Fix list puts the worst
   first beside a page-by-severity grid; a try is a storyboard of phone frames; a problem has its story on
   the left, the talk with Rouh on the right and the decisions in a bar that stays at the bottom; the
   testers (the Cast) are in the header on every page, each with a pause button. Only real data: what the
   design drew from numbers Rouh does not record (cost, trait dials, a stop button for a run) is not here.

   The pages, each its own address under /evolution/testing:
     ''                 the Dashboard (the Atlas until 22 November 2026): the tiles, one card for each job (?kind=manual|automatic
                        filters them), and the pages of Rouh
     job/<n>            one job (one request): what was asked, its summary, every journey with its attempts, and for each
                        journey another attempt, its name and goal changed, and its problems (jobs/<n> opens it too)
     journey/<n>        opens its job's page at that journey; a journey has no page of its own (Petar, 22 November 2026)
     <n>                one attempt: its storyboard, step by step, how it ended, and its problems, worst first
     problems           the Fix list: every problem across the jobs, open first, worst first
     problem/<n>        one problem: its story, every sighting, its talk with Rouh, and what to do with it
     testers            the Testers (the Cast until 22 November 2026); testers/new adds one; tester/<key> one whole; tester/<key>/edit changes one
     how                how trials work, and the words they use
   `window.RouhTrials` is what `evolutionpage.js` mounts. Plain words only: Vesela tries this page too. */
(function () {
  'use strict';

  var API = '/api/trials';
  var S = { root: null, top: null, main: null, sub: '', host: null, data: {}, error: '', said: '', busy: '', seq: 0,
            poll: 0, shell: null, open: null, kind: '', jOpen: {}, jEdit: null, focusJourney: 0,
            probFilter: { status: 'open', who: '', job: '' }, probView: { screen: null, bad: '', group: false, all: false },
            tryBad: '', confirm: '', editJob: false, deciding: false, draft: null, form: null, carry: '',
            sayDraft: null, step: {}, toast: null };

  var RESULT = {
    passed: ['Passed', 'green'], failed: ['Did not pass', 'rose'], running: ['Trying now', 'amber'],
    queued: ['Waiting to start', 'slate'], broken: ['Could not finish', 'slate']
  };
  var MANAGED = { yes: 'Yes', partly: 'Partly', no: 'No' };
  // Said of the tester, by name of what they are: "Confused them" left Vesela asking who "them" is (trial 21).
  var BAD = { blocked: 'Couldn’t continue', confused: 'Confused the tester', annoyed: 'Annoyed the tester', minor: 'Small' };
  // A type's own name, the words its icon says on hover everywhere it is drawn (Petar, 22 November 2026).
  var BAD_SHORT = { blocked: 'Couldn’t continue', confused: 'Confused', annoyed: 'Annoyed', minor: 'Small' };
  var BAD_ORDER = ['blocked', 'confused', 'annoyed', 'minor'];
  var BAD_TONE = { blocked: 'rose', confused: 'amber', annoyed: 'violet', minor: 'slate' };
  var STAND = {
    open: ['Not fixed yet', 'slate'], decided: ['Chosen to fix', 'blue'], fixed: ['Fixed', 'green'],
    set_aside: ['Set aside', 'amber']
  };
  var VERDICT_LINE = { not_a_problem: 'Not a problem', wont_fix: 'Won’t fix', decided: 'Decided how to fix it',
                       sent: 'Sent as feedback' };
  // Petar, 22 November 2026: fixed as soon as its wave of fixes has finished, with no second test to prove it.
  var RULE = 'Fixed as soon as the wave of fixes it was chosen for has finished. A later test run that meets it again opens it again. Sent is never shown as fixed.';

  /* ---- small things ---- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function button(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }
  function go(href) { if (S.host && S.host.go) { S.host.go(href); } else { location.href = href; } }
  function link(text, href, cls) {
    var a = el('a', cls || 'tr-a', text);
    a.href = href;
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
      e.preventDefault();
      go(href);
    });
    return a;
  }
  var HOME = '/evolution/testing';
  function call(path, body) {
    var init = { credentials: 'same-origin', cache: 'no-store' };
    // A read that never answers is said, never left as "Opening…" for ever (Vesela, trial 20). Rouh's
    // answer in a discussion and its draft of a tester take longer, and wait longer.
    var ctl = window.AbortController ? new AbortController() : null;
    var slow = /\/say$|\/draft$|\/run$|\/again$/.test(path);
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, slow ? 240000 : 45000) : 0;
    if (ctl) { init.signal = ctl.signal; }
    if (body !== undefined) {
      init.method = 'POST';
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return fetch(API + path, init).then(function (r) {
      clearTimeout(timer);
      if (r.status === 401) { location.href = '/login'; return null; }
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j) { throw new Error((j && j.error) || 'Rouh could not do that just now. Try again in a moment.'); }
        return j;
      });
    }, function (e) {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'This page did not open in time. Nothing was lost.'
        : 'Rouh could not be reached just now. Nothing was lost.');
    });
  }
  function day(t) {
    return t ? new Date(t * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function dayShort(t) { return t ? new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; }
  function date(t) { return t ? new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function minutes(s) {
    var m = Math.round((s || 0) / 60);
    return m < 1 ? 'under a minute' : m === 1 ? '1 minute' : m + ' minutes';
  }
  function minShort(s) { var m = Math.round((s || 0) / 60); return m < 1 ? '<1 min' : m + ' min'; }
  /* An address that may break only after a slash, never inside a word. */
  function slashBreaks(path) { return String(path).replace(/\//g, '/\u200b').replace(/^\/\u200b/, '/'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function chip(text, tone) { return el('span', 'tr-chip tr-tone-' + tone, text); }
  function result(state, t) {
    if (t && stuck(t)) { return chip('Stuck since ' + dayShort(t.started_at || t.created_at), 'rose'); }
    var r = RESULT[state] || ['Not tried yet', 'slate']; return chip(r[0], r[1]);
  }
  /* How many different problems a try found: the same unit as "not fixed". */
  function foundN(t) { return t.found_n != null ? t.found_n : (t.problems || 0); }
  function upper(text) { text = String(text || ''); return text.charAt(0).toUpperCase() + text.slice(1); }
  /* Which try it is. A review has no rounds: nothing is fixed between its tries until the owner chooses. */
  function tryName(n, mode) {
    if (mode === 'review') { return 'Review you asked for'; }
    return n >= 3 ? 'Third and last test run' : n === 2 ? 'Second test run, after fixes' : 'First test run';
  }
  /* The two modes, said plainly (Petar, 4 November 2026). */
  function modeChip(mode) {
    return mode === 'review' ? chip('Review you asked for', 'blue') : chip('Automatic test while building', 'slate');
  }
  function said(label, text, cls) {
    var p = el('p', 'tr-said' + (cls ? ' ' + cls : ''));
    p.appendChild(el('span', 'tr-label', label));
    p.appendChild(el('span', '', text));
    return p;
  }
  function section(cls, title, id) {
    var s = el('section', 'tr-sec' + (cls ? ' ' + cls : ''));
    if (id) { s.id = id; }
    if (title) { s.appendChild(el('h2', 'tr-h2', title)); }
    return s;
  }
  function fail(e) { S.busy = ''; S.error = String((e && e.message) || e); draw(); }
  /* Says where inside Evolution the page is, once for each place: telling it again redraws the whole layer. */
  function moved(title) {
    var said = S.sub + '\n' + (title || '');
    if (S.movedSaid === said || !S.host || !S.host.moved) { return; }
    S.movedSaid = said;
    S.host.moved('trials', S.sub, title || '');
  }

  /* ---- the drawn marks: icons, and a shape for each kind of problem, so colour is never the only sign ---- */

  var ICON = {
    pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    phone: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="1.5" width="10" height="15" rx="2.5"/><path d="M7.5 4h3"/><path d="M9 8v5M6.5 10.5h5"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 2v10M2.5 7.5 7 12l4.5-4.5"/></svg>',
    flat: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4"/></svg>',
    one: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="7" cy="7" r="3"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5"/></svg>',
    thumb: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 7v7H2.5V7z"/><path d="M5 7.2 8 2.5c1 0 1.8.8 1.6 1.9L9.2 6.5h3.6c.9 0 1.5.8 1.3 1.7l-1.1 4.6c-.2.7-.8 1.2-1.5 1.2H5"/></svg>',
    wait: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3.5 1.5h7M3.5 12.5h7M4.5 1.5c0 3 5 3.5 5 5.5s-5 2.5-5 5.5M9.5 1.5c0 3-5 3.5-5 5.5s5 2.5 5 5.5"/></svg>',
    ask: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M5.3 5.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M7 10.2v.1"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
    clock: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="9" r="7"/><path d="M9 5v4.5l3 2"/></svg>',
    review: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H3z"/><path d="M7.5 16h3"/></svg>',
    tap: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7V2.5a1 1 0 0 1 2 0V7l3.5.8c.6.2 1 .8.9 1.4l-.6 3.3H5.5L3 9.5a1 1 0 0 1 1.4-1.4z"/></svg>',
    person: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="5" r="2.8"/><path d="M2.5 14.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/></svg>',
    cog: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M6.9 1.5h2.2l.4 1.9 1.3.6 1.7-1 1.5 1.5-1 1.7.6 1.3 1.9.4v2.2l-1.9.4-.6 1.3 1 1.7-1.5 1.5-1.7-1-1.3.6-.4 1.9H6.9l-.4-1.9-1.3-.6-1.7 1-1.5-1.5 1-1.7-.6-1.3-1.9-.4V6.9l1.9-.4.6-1.3-1-1.7 1.5-1.5 1.7 1 1.3-.6z"/><circle cx="8" cy="8" r="2.2"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    pencil: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M10.8 2.7l2.5 2.5-7.8 7.8-3.2.7.7-3.2z"/><path d="M9.3 4.2l2.5 2.5"/></svg>'
  };
  /* Each type's icon says what it is (Petar, 22 November 2026): a stop sign for Couldn't continue, a question
     mark for Confused, an angry face for Annoyed, and a small i for Small. Drawn on a 12 by 12 grid. */
  var SHAPE = {
    blocked: '<path d="M3.6 .4h4.8l3.2 3.2v4.8l-3.2 3.2H3.6L.4 8.4V3.6z" fill="var(--s-blocked)"/>' +
      '<rect x="2.6" y="5" width="6.8" height="2" rx=".5" fill="#fff"/>',
    confused: '<circle cx="6" cy="6" r="5.6" fill="var(--s-confused)"/>' +
      '<path d="M4.2 4.6a1.85 1.85 0 1 1 2.6 1.7c-.5.25-.8.6-.8 1.2v.3" fill="none" stroke="var(--s-glyph, #161827)" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="6" cy="9.4" r=".85" fill="var(--s-glyph, #161827)"/>',
    annoyed: '<circle cx="6" cy="6" r="5.6" fill="var(--s-annoyed)"/>' +
      '<path d="M2.9 3.7l2.2 1.1M9.1 3.7 6.9 4.8M3.8 9.2c1.3-1.3 3.1-1.3 4.4 0" fill="none" stroke="var(--s-glyph, #161827)" stroke-width="1.3" stroke-linecap="round"/>' +
      '<circle cx="4.2" cy="6.1" r=".75" fill="var(--s-glyph, #161827)"/><circle cx="7.8" cy="6.1" r=".75" fill="var(--s-glyph, #161827)"/>',
    minor: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="var(--s-minor)" stroke-width="1.6"/>' +
      '<path d="M6 5.4v3" stroke="var(--s-minor)" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="3.6" r=".85" fill="var(--s-minor)"/>'
  };
  /* Only the fixed strings above ever go through innerHTML: nothing a person or a tester wrote. */
  function icon(name) { var s = el('span', 'tr-ic'); s.innerHTML = ICON[name] || ''; s.setAttribute('aria-hidden', 'true'); return s; }
  /* A type's icon, with its name on hover and for a screen reader, wherever it is drawn. */
  function shape(bad, size) {
    var s = el('span', 'tr-shape');
    var name = BAD_SHORT[bad] || BAD_SHORT.minor;
    s.innerHTML = '<svg width="' + (size || 12) + '" height="' + (size || 12) + '" viewBox="0 0 12 12" aria-hidden="true">' +
      (SHAPE[bad] || SHAPE.minor) + '</svg>';
    s.title = name;
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', name);
    return s;
  }
  function sev(bad, long) {
    var s = el('span', 'tr-sev');
    s.appendChild(shape(bad, 13));
    s.appendChild(el('span', '', long ? (BAD[bad] || bad) : (BAD_SHORT[bad] || bad)));
    return s;
  }
  function withIcon(node, name, text) { node.appendChild(icon(name)); if (text != null) { node.appendChild(el('span', '', text)); } return node; }
  function badChip(b) { return chip(BAD[b] || b, BAD_TONE[b] || 'slate'); }
  /* A problem's number within a try (Petar, 22 November 2026): "#12" inside its try, "Try 49 · #12" anywhere else.
     A problem met in several tries is named by the try the person came from, else the first it was met in;
     one found by the owner in a chat has no try and keeps "Problem <n>". */
  function inTry(f) { return f.local ? '#' + f.local : 'Problem ' + f.number; }
  function numLabel(p, trialN) {
    var nums = p.numbers || [];
    var at = nums.filter(function (x) { return trialN && x.trial === trialN; })[0] || p.home || nums[0];
    return at ? 'Test run ' + at.trial + ' · #' + at.n : 'Problem ' + p.number;
  }

  /* Sent or decided, and then hit again by a later try: the fix did not hold. Read from its sightings. */
  function seenAgain(p) {
    if (p.standing !== 'decided' || !p.verdict_at) { return null; }
    var later = (p.sightings || []).filter(function (x) { return x.at > p.verdict_at; });
    return later.length ? later[0] : null;
  }
  /* Where a problem stands, in one line with its sign. */
  function standBadge(p) {
    var s = el('span', 'tr-state');
    if (p.awaiting_choice) { return withIcon(s, 'ask', 'Waiting for your choice'); }
    if (p.standing === 'fixed') { s.classList.add('is-fixed'); return withIcon(s, 'check', fixedWords(p)); }
    if (p.standing === 'set_aside') { s.classList.add('is-aside'); return withIcon(s, 'x', 'Set aside: ' + (VERDICT_LINE[p.verdict] || 'set aside') + (p.verdict === 'wont_fix' && p.reason ? ': ' + p.reason : '')); }
    var again = seenAgain(p);
    if (again) { s.classList.add('is-again'); return withIcon(s, 'up', (p.verdict === 'sent' ? 'Sent' : 'Decided') + ', but seen again' + (again.trial ? ' in test run ' + again.trial : '')); }
    if (p.standing === 'decided' && p.verdict === 'sent') { return withIcon(s, 'wait', 'Sent as feedback'); }
    if (p.standing === 'decided') { return withIcon(s, 'thumb', 'Chosen to fix in the next wave'); }
    return withIcon(s, 'ask', 'Needs your decision');
  }
  /* What fixed a problem, in a line: the wave and when (Petar, 22 November 2026), or the try that got past it. */
  function fixedWords(p) {
    var w = p.fixed_by_wave;
    if (w) { return 'Wave ' + w.number + (w.trial && p.home && p.home.trial !== w.trial ? ' of test run ' + w.trial : '') + ' fixed this' + (w.at ? ', ' + day(w.at) : ''); }
    return p.closed_by ? 'Fixed: test run ' + p.closed_by + ' got past it' : 'Fixed';
  }
  /* The proof chain: a problem is fixed once the wave chosen for it has finished, never when a fix is only sent. */
  function chain(p) {
    var c = el('div', 'tr-chain');
    c.setAttribute('aria-label', 'How far it is from fixed');
    function n(cls, ic, text) { var x = el('span', 'tr-chain-n' + (cls ? ' ' + cls : '')); if (ic) { x.appendChild(icon(ic)); } x.appendChild(el('span', '', text)); c.appendChild(x); }
    function ln() { var l = el('span', 'tr-chain-ln'); l.setAttribute('aria-hidden', 'true'); c.appendChild(l); }
    if (p.standing === 'fixed') {
      n('done', 'check', p.verdict ? (VERDICT_LINE[p.verdict] || 'Decided') : 'Found'); ln();
      n('ok', 'check', p.fixed_by_wave ? 'Wave ' + p.fixed_by_wave.number + ' finished ' + dayShort(p.fixed_by_wave.at) : p.closed_by ? 'Test run ' + p.closed_by + ' got past it' : 'A later test run got past it'); ln(); n('ok', 'check', 'Fixed');
    } else if (p.standing === 'set_aside') {
      n('done', 'x', VERDICT_LINE[p.verdict] || 'Set aside'); ln(); n('', '', 'No longer counted');
    } else if (seenAgain(p)) {
      var ag = seenAgain(p);
      n('done', 'check', (p.verdict === 'sent' ? 'Sent ' : 'Decided ') + dayShort(p.verdict_at)); ln();
      n('bad', 'up', ag.trial ? 'Test run ' + ag.trial + ' hit it again' : 'Seen again ' + dayShort(ag.at)); ln(); n('bad', '', 'Not fixed');
    } else if (p.standing === 'decided') {
      n('done', 'check', (p.verdict === 'sent' ? 'Sent ' : 'Chosen ') + dayShort(p.verdict_at)); ln(); n('', 'wait', p.verdict === 'sent' ? 'Feedback' : 'Its wave of fixes'); ln(); n('', '', 'Fixed');
    } else {
      n('', '', 'Not decided'); ln(); n('', '', 'A wave of fixes'); ln(); n('', '', 'Fixed');
    }
    return c;
  }

  /* A face for a tester: their initials on a colour that is always theirs, with a dot while paused. */
  function hueOf(t) {
    var key = (t && (t.key || t.id || t.persona)) || (t && t.name) || '?';
    var h = 7;
    for (var i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i) * 97) % 9973; }
    return (h * 137) % 360;
  }
  function initials(t) {
    var name = (t && (t.name || t.persona_name || t.first)) || '?';
    var parts = String(name).trim().split(/\s+/);
    return (parts[0] || '?').charAt(0).toUpperCase() + (parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '');
  }
  function face(t, size, paused) {
    var f = el('span', 'tr-face' + (size ? ' tr-face-' + size : ''), initials(t));
    f.style.setProperty('--hue', String(hueOf(t)));
    f.setAttribute('aria-hidden', 'true');
    if (paused != null) {
      var d = el('span', 'tr-face-dot' + (paused ? ' is-paused' : ''));
      if (paused) { d.innerHTML = '<svg width="7" height="7" viewBox="0 0 8 8"><rect x="1" y="1" width="2" height="6" fill="#fff"/><rect x="5" y="1" width="2" height="6" fill="#fff"/></svg>'; }
      f.appendChild(d);
    }
    return f;
  }
  function testerOf(key) {
    var all = (S.shell && S.shell.testers) || [];
    for (var i = 0; i < all.length; i++) { if (all[i].key === key) { return all[i]; } }
    return null;
  }
  function crumbs(items) {
    var nav = el('nav', 'tr-crumbs');
    nav.setAttribute('aria-label', 'Where you are');
    items.forEach(function (it, i) {
      if (i === items.length - 1) { var c = el('span', '', it[0]); c.setAttribute('aria-current', 'page'); nav.appendChild(c); return; }
      nav.appendChild(link(it[0], it[1]));
      var sep = el('span', 'tr-crumb-sep', '›');
      sep.setAttribute('aria-hidden', 'true');
      nav.appendChild(sep);
    });
    return nav;
  }

  /* A screenshot that opens full size over the page, and closes with Escape, a press anywhere, or Close. */
  function shot(src, alt, cls) {
    var b = button('tr-shot-btn' + (cls ? ' ' + cls : ''), null);
    b.setAttribute('aria-label', 'Open this picture full size: ' + alt);
    var img = el('img');
    img.src = src;
    img.alt = alt;
    img.loading = 'lazy';
    b.appendChild(img);
    b.addEventListener('click', function (e) { e.stopPropagation(); bigPicture(src, alt, b); });
    return b;
  }
  function bigPicture(src, alt, back) {
    var box = el('div', 'tr-big');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', alt);
    var close = button('tr-btn tr-big-close', 'Close');
    var img = el('img');
    img.src = src;
    img.alt = alt;
    box.appendChild(close);
    box.appendChild(img);
    box.appendChild(el('p', 'tr-big-cap', alt));
    function shut() {
      document.removeEventListener('keydown', key, true);
      box.remove();
      if (back && back.focus) { back.focus(); }
    }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } }
    box.addEventListener('click', shut);
    document.addEventListener('keydown', key, true);
    document.body.appendChild(box);
    close.focus();
  }

  /* A profile's Markdown, drawn as plain paragraphs and lists, with **bold** kept. Never as HTML. */
  function prose(text) {
    var out = el('div', 'tr-prose');
    var list = null;
    String(text || '').split('\n').forEach(function (line) {
      var t = line.trim();
      if (!t) { list = null; return; }
      var item = /^[-*]\s+(.*)$/.exec(t);
      var host;
      if (item) {
        if (!list) { list = el('ul'); out.appendChild(list); }
        host = el('li');
        list.appendChild(host);
        t = item[1];
      } else {
        list = null;
        host = el('p');
        out.appendChild(host);
      }
      t.split(/(\*\*[^*]+\*\*)/).forEach(function (bit) {
        if (/^\*\*[^*]+\*\*$/.test(bit)) { host.appendChild(el('strong', '', bit.slice(2, -2))); }
        else if (bit) { host.appendChild(document.createTextNode(bit)); }
      });
    });
    return out;
  }

  /* A short message at the bottom, with Undo when what was done can be taken back. */
  function toast(text, undo) {
    clearTimeout(S.toastTimer);
    S.toast = { text: text, undo: undo || null };
    drawToast();
    S.toastTimer = setTimeout(function () { S.toast = null; drawToast(); }, undo ? 8000 : 4000);
  }
  function drawToast() {
    if (!S.root) { return; }
    var old = S.root.querySelector('.tr-toast');
    if (old) { old.remove(); }
    if (!S.toast) { return; }
    var t = el('div', 'tr-toast');
    t.setAttribute('role', 'status');
    t.appendChild(el('span', '', S.toast.text));
    if (S.toast.undo) {
      var u = button('tr-toast-b', 'Undo');
      var fn = S.toast.undo;
      u.addEventListener('click', function () { S.toast = null; drawToast(); fn(); });
      t.appendChild(u);
    }
    S.root.appendChild(t);
  }

  /* ---- where we are, and reading it ---- */

  function where() {
    var s = S.sub, m;
    if (!s) { return { page: 'jobs' }; }
    if (/^\d+$/.test(s)) { return { page: 'try', n: s }; }
    // A job, one request with its journeys, is /job/<n> (Petar, 22 November 2026: "this should be the link of the
    // job, which contains all the journeys"); /jobs/<n> was its address for an hour and still opens it.
    if ((m = /^jobs?\/(\d+)$/.exec(s))) { return { page: 'request', n: m[1] }; }
    // A journey has no page of its own: /journey/<n> opens its job's page, at that journey.
    if ((m = /^journey\/(\d+)$/.exec(s))) { return { page: 'journey', n: m[1] }; }
    if ((m = /^problem\/(\d+)$/.exec(s))) { return { page: 'problem', n: m[1] }; }
    if (s === 'problems') { return { page: 'problems' }; }
    if (s === 'testers') { return { page: 'testers' }; }
    if (s === 'testers/new') { return { page: 'form' }; }
    if ((m = /^tester\/([a-z0-9]+)\/edit$/.exec(s))) { return { page: 'form', key: m[1] }; }
    if ((m = /^tester\/([a-z0-9]+)$/.exec(s))) { return { page: 'tester', key: m[1] }; }
    if (s === 'how') { return { page: 'how' }; }
    return { page: 'jobs' };
  }

  /* What the header and the Dashboard stand on: every job, the newest tries, the counts and the testers. */
  function loadShell() {
    return call('').then(function (j) { S.shell = j; if (!where().page.match(/^jobs$/)) { drawTop(); } return j; });
  }

  function load() {
    var seq = ++S.seq, w = where(), want;
    S.error = '';
    function keep(name) { return function (j) { if (seq === S.seq) { S.data[name] = j; } }; }
    if (w.page === 'jobs') {
      want = Promise.all([
        loadShell(),
        call('/problems?status=open'),
        loadAll()
      ]).then(function (got) {
        if (seq !== S.seq) { return; }
        S.data.jobs = got[0];
        S.open = got[1];
      });
    } else {
      var shellFirst = S.shell ? null : loadShell().catch(function () {});
      if (w.page === 'problems' || w.page === 'testers') { shellFirst = Promise.all([shellFirst, loadAll()]); }
      if (w.page === 'journey') {
        want = call('/jobs/' + w.n).then(function (j) {
          if (seq !== S.seq) { return; }
          var r = j.job && j.job.request;
          if (!r) { throw new Error('Journey ' + w.n + ' belongs to no job.'); }
          S.focusJourney = Number(w.n);
          S.sub = 'job/' + r.number;
          return call('/requests/' + r.number).then(function (x) { if (seq === S.seq) { S.data.request = x.request; } });
        });
      }
      else if (w.page === 'request') { want = call('/requests/' + w.n).then(function (j) { if (seq === S.seq) { S.data.request = j.request; } }); }
      else if (w.page === 'try') { want = call('/' + w.n).then(keep('try')); }
      else if (w.page === 'problems') { want = loadProblems(seq); }
      else if (w.page === 'problem') { want = call('/problems/' + w.n).then(keep('problem')); }
      else if (w.page === 'testers') { want = call('/testers?archived=1').then(keep('testers')); }
      else if (w.page === 'tester') { want = call('/testers/' + w.key).then(keep('tester')); }
      else if (w.page === 'form') {
        want = w.key ? call('/testers/' + w.key).then(function (j) {
          if (seq === S.seq) { S.data.tester = j; if (!S.form || S.form.key !== w.key) { S.form = formFrom(j.tester); } }
        }) : (S.form && !S.form.key ? Promise.resolve() : call('/testers').then(function (j) {
          if (seq === S.seq) { S.form = blankForm(j.sections || []); }
        }));
      } else { want = Promise.resolve(); }
      if (shellFirst) { want = Promise.all([want, shellFirst]); }
    }
    return want.then(function () { if (seq === S.seq) { draw(); } }, function (e) {
      if (seq !== S.seq) { return; }
      S.error = String((e && e.message) || e);
      draw();
    });
  }
  /* Every problem, for counts that must agree: seen again apart from waiting, and who found what. */
  function loadAll() {
    return call('/problems?status=all').then(function (j) { S.all = j.problems || []; }, function () { S.all = null; });
  }
  function againN() { return (S.all || []).filter(seenAgain).length; }
  /* Who found what, adding up to the total: a problem several testers hit is said once, and the owner's own too. */
  function foundLine(testers) {
    var all = S.all;
    if (!all || !all.length) { return ''; }
    var names = {};
    (testers || []).forEach(function (t) { names[t.key] = t.first; });
    var per = {}, both = 0, mine = 0;
    all.forEach(function (p) {
      if (p.source === 'owner') { mine += 1; return; }
      var ks = p.personas || [];
      if (ks.length > 1) { both += 1; }
      ks.forEach(function (k) { per[k] = (per[k] || 0) + 1; });
    });
    var parts = Object.keys(per).map(function (k) { return (names[k] || upper(k)) + ' found ' + per[k]; });
    var extra = [];
    if (both) { extra.push(both + ' found by more than one tester'); }
    if (mine) { extra.push(mine + ' by you'); }
    return parts.join(', ') + (extra.length ? '; ' + extra.join(' and ') : '') + ', ' + all.length + ' in all.';
  }
  function loadProblems(seq) {
    var f = S.probFilter, q = [];
    q.push('status=' + (f.status === 'again' ? 'decided' : f.status || 'all'));
    if (f.who === 'owner') { q.push('source=owner'); } else if (f.who) { q.push('persona=' + encodeURIComponent(f.who)); }
    if (f.job) { q.push('job=' + encodeURIComponent(f.job)); }
    return call('/problems?' + q.join('&')).then(function (j) { if (seq === S.seq) { S.data.problems = j; } });
  }

  /* ---- drawing ---- */

  function draw() {
    var root = S.root;
    if (!root || !root.isConnected) { return; }
    var keep = document.activeElement && root.contains(document.activeElement) && document.activeElement.id;
    root.textContent = '';
    S.top = el('header', 'tr-top');
    S.main = el('div', 'tr-main');
    root.appendChild(S.top);
    root.appendChild(S.main);
    var w = where();
    drawTop();
    var main = S.main;
    if (S.error) {
      var err = el('div', 'tr-err');
      err.appendChild(el('p', 'tr-err-words', S.error));
      var again = button('tr-btn', 'Open this page again');
      again.addEventListener('click', function () { S.error = ''; draw(); load(); });
      err.appendChild(again);
      main.appendChild(err);
    }
    if (S.said) { main.appendChild(el('p', 'tr-saidnow', S.said)); }
    ({ jobs: drawJobs, journey: drawRequest, request: drawRequest, 'try': drawTry, problems: drawProblems, problem: drawProblem,
       testers: drawTesters, tester: drawTester, form: drawForm, how: drawHow })[w.page](main, w);
    // At the end of a long page, the way back to every list, so nobody has to press Back three times (trial 17).
    // Not on a try's page, which ends with its Fix bar (Petar, 22 November 2026, third round).
    if (w.page === 'request' || w.page === 'problem' || w.page === 'tester') {
      var foot = el('nav', 'tr-foot');
      foot.setAttribute('aria-label', 'Back to a list');
      foot.appendChild(el('span', 'tr-dim', 'Back to:'));
      [['The dashboard', HOME], ['The Fix list', HOME + '/problems'], ['The testers', HOME + '/testers'],
       ['Add a tester', HOME + '/testers/new']].forEach(function (x) {
        foot.appendChild(link(x[0], x[1]));
      });
      main.appendChild(foot);
    }
    drawToast();
    // The try page's filter is kept in the address (Petar, 22 November 2026, fourth round).
    // So is the dashboard's All / Manual / Automatic (fifth round).
    if (S.host && S.host.filtered) { S.host.filtered(w.page === 'try' ? tfQuery() : w.page === 'jobs' && S.kind ? 'kind=' + S.kind : ''); }
    if (keep) { var back = document.getElementById(keep); if (back) { back.focus(); } }
  }

  /* The header on every page (Petar, 22 November 2026): the four places, the switch for automatic testing with
     a tick for each tester who runs while it is on, and Test something, which opens the start form. It scrolls
     with the page: only Evolution's title bar and the Fix bar stay pinned. */
  function drawTop() {
    var top = S.top;
    if (!top) { return; }
    top.textContent = '';
    var page = where().page;
    var on = page === 'journey' || page === 'request' || page === 'try' || page === 'jobs' ? 'jobs'
      : page === 'problem' || page === 'problems' ? 'problems'
      : page === 'tester' || page === 'testers' || page === 'form' ? 'testers' : 'how';
    var sh = S.shell;
    var nav = el('nav', 'tr-nav');
    nav.setAttribute('aria-label', 'Testing');
    [['jobs', 'Dashboard', HOME], ['problems', 'Fix list', HOME + '/problems'], ['testers', 'Testers', HOME + '/testers'],
     ['how', 'How it works', HOME + '/how']].forEach(function (v) {
      var a = link('', v[2], 'tr-nav-a');
      var top1 = el('span', 'tr-nav-w', v[1]);
      if (v[0] === 'problems' && sh && sh.counts && sh.counts.by) {
        var c = el('span', 'tr-nav-count', String(sh.counts.by.open));
        c.title = sh.counts.by.open + ' need your decision';
        top1.appendChild(c);
      }
      a.appendChild(top1);
      if (on === v[0]) { a.setAttribute('aria-current', 'page'); }
      nav.appendChild(a);
    });
    top.appendChild(nav);
    if (sh) { top.appendChild(autoControl(sh)); }
    var run = button('tr-btn tr-outline tr-run', null);
    withIcon(run, 'phone', 'Test something');
    run.addEventListener('click', function () { openStart(); });
    top.appendChild(run);
  }

  function liveTesters(sh) { return ((sh && sh.testers) || []).filter(function (t) { return !t.archived; }); }
  function autoOn(sh) { return !(sh && sh.paused_all); }

  /* Automatic testing: one ON/OFF switch, and beside it which testers run while it is on, a tick each, saved
     at once. It is the same pause as before, said the other way round: off is every tester paused at once,
     and an unticked tester is paused on their own. A test you start yourself runs either way. */
  function autoControl(sh) {
    var box = el('div', 'tr-auto');
    var isOn = autoOn(sh);
    var sw = button('tr-switch' + (isOn ? ' is-on' : ''), null);
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', isOn ? 'true' : 'false');
    sw.id = 'tr-auto-switch';
    var track = el('span', 'tr-switch-track');
    track.setAttribute('aria-hidden', 'true');
    track.appendChild(el('span', 'tr-switch-knob'));
    sw.appendChild(track);
    sw.appendChild(el('span', 'tr-switch-name', 'Automatic testing'));
    sw.appendChild(el('b', 'tr-switch-state', isOn ? 'ON' : 'OFF'));
    sw.title = isOn ? 'Testers test each change Rouh builds that you will see. Press to turn it off.'
      : 'No tester tests a change by itself. A test you start still runs. Press to turn it on.';
    sw.addEventListener('click', function () { setPause('', isOn, ''); });
    box.appendChild(sw);
    var live = liveTesters(sh);
    if (live.length) {
      var who = el('fieldset', 'tr-runs' + (isOn ? '' : ' is-off'));
      who.appendChild(el('legend', 'tr-runs-lbl', 'Who runs'));
      live.forEach(function (t) {
        var l = el('label', 'tr-runs-t');
        var c = el('input');
        c.type = 'checkbox';
        c.id = 'tr-runs-' + t.key;
        c.checked = !t.paused;
        c.addEventListener('change', function () { setPause(t.key, !c.checked, t.first); });
        l.appendChild(c);
        l.appendChild(face(t, 'xs'));
        l.appendChild(el('span', '', t.first));
        l.title = t.first + (t.paused ? ' does not run in automatic testing' : ' runs when automatic testing is on');
        who.appendChild(l);
      });
      box.appendChild(who);
    }
    return box;
  }

  function choose(label, value, options, onChange) {
    var wrap = el('label', 'tr-choose');
    wrap.appendChild(el('span', 'tr-label', label));
    var s = el('select', 'tr-select');
    // Named by its label alone: wrapped in it, a screen reader also read every option into the name.
    s.setAttribute('aria-label', label);
    options.forEach(function (o) {
      var opt = el('option', '', o[1]);
      opt.value = o[0];
      if (value === o[0]) { opt.selected = true; }
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onChange(s.value); });
    wrap.appendChild(s);
    return wrap;
  }

  /* ---- the Dashboard (the Atlas until 22 November 2026) ---- */

  function finished(t) { return t.state === 'passed' || t.state === 'failed'; }
  /* A try still going an hour after it began is stuck: a try takes minutes. Rouh has no way to stop one yet. */
  function stuck(t) { return (t.state === 'running' || t.state === 'queued') && (t.started_at || t.created_at) < Date.now() / 1000 - 3600; }
  function stuckOf(key) { return ((S.shell && S.shell.trials) || []).filter(function (t) { return stuck(t) && (!key || t.persona === key); }); }

  function trialOf(sh, n) { return ((sh && sh.trials) || []).filter(function (t) { return t.number === n; })[0] || null; }

  /* Better or worse: each job's newest finished try against its own try before, never two jobs mixed. */
  function trends(sh) {
    var per = {};
    (sh.trials || []).slice().sort(function (a, b) { return a.created_at - b.created_at; }).forEach(function (t) {
      if (t.job && finished(t)) { (per[t.job] = per[t.job] || []).push(t); }
    });
    var out = [];
    (sh.jobs || []).forEach(function (j) {
      var l = per[j.number] || [];
      if (l.length < 2) { out.push({ job: j, dir: 'one', last: l.length ? foundN(l[l.length - 1]) : null }); return; }
      var a = foundN(l[l.length - 2]), b = foundN(l[l.length - 1]);
      out.push({ job: j, dir: b > a ? 'worse' : b < a ? 'better' : 'same', prev: a, last: b,
                 prevTry: l[l.length - 2].number, lastTry: l[l.length - 1].number });
    });
    return out;
  }

  function stat(title, href) {
    var s = href ? link('', href, 'tr-stat') : el('div', 'tr-stat');
    s.appendChild(el('div', 'tr-stat-what', title));
    return s;
  }

  function drawJobs(root) {
    var sh = S.shell, d = S.data.jobs;
    moved('');
    if (!sh || !d) { if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the dashboard…')); } return; }
    // No summary sentence, Needs you, Latest tries or Testers tile here (Petar, 22 November 2026): the tiles, then the
    // jobs with their journeys and attempts, then the pages. The switch for automatic testing is the header's.
    root.appendChild(el('h1', 'tr-sr', 'Testing dashboard'));
    var open = (S.open && S.open.problems) || [];
    var by = (sh.counts && sh.counts.by) || {};

    var tiles = el('div', 'tr-grid4');
    // Problems, by how bad, the same set the pages below are drawn from.
    var t1 = stat('Problems', HOME + '/problems');
    t1.appendChild(el('div', 'tr-big-n', by.open + ' to decide'));
    var sevN = {};
    open.forEach(function (p) { sevN[p.how_bad] = (sevN[p.how_bad] || 0) + 1; });
    if (open.length) {
      var bar = el('div', 'tr-sevbar');
      bar.setAttribute('aria-hidden', 'true');
      BAD_ORDER.forEach(function (b) { if (sevN[b]) { var i = el('i'); i.style.flex = String(sevN[b]); i.style.background = 'var(--s-' + b + ')'; bar.appendChild(i); } });
      t1.appendChild(bar);
    }
    var leg = el('div', 'tr-legend');
    BAD_ORDER.forEach(function (b) { if (sevN[b]) { var x = el('span'); x.appendChild(shape(b)); x.appendChild(el('span', '', sevN[b] + ' ' + BAD_SHORT[b].toLowerCase())); leg.appendChild(x); } });
    t1.appendChild(leg);
    var rest = el('div', 'tr-legend');
    var ag = againN();
    if (by.decided - ag > 0) { rest.appendChild(withIcon(el('span'), 'thumb', (by.decided - ag) + ' chosen to fix')); }
    if (ag) { rest.appendChild(withIcon(el('span', 'is-again'), 'up', ag + ' sent, but seen again')); }
    if (by.set_aside) { rest.appendChild(withIcon(el('span', 'is-aside'), 'x', by.set_aside + ' set aside')); }
    if (by.fixed) { rest.appendChild(withIcon(el('span', 'is-fixed'), 'check', by.fixed + ' fixed')); }
    t1.appendChild(rest);
    tiles.appendChild(t1);

    var tr = trends(sh);
    var cmp = tr.filter(function (x) { return x.dir !== 'one'; });
    var worse = cmp.filter(function (x) { return x.dir === 'worse'; }).length;
    var better = cmp.filter(function (x) { return x.dir === 'better'; }).length;
    var t2 = stat('Better or worse');
    if (!cmp.length) {
      t2.appendChild(el('div', 'tr-big-n', 'No trend yet'));
      t2.appendChild(el('p', 'tr-cap', 'No journey has two test runs that ended among the newest ones yet.'));
    } else {
      t2.appendChild(el('div', 'tr-big-n', worse >= better ? worse + ' worse' : better + ' better'));
      var big = cmp.slice().sort(function (a, b) { return Math.abs(b.last - b.prev) - Math.abs(a.last - a.prev); })[0];
      t2.appendChild(el('p', 'tr-cap', 'Of ' + plural(cmp.length, 'journey') + ' with two test runs that ended, each against its own test run before: ' +
        better + ' better, ' + (cmp.length - better - worse) + ' the same, ' + worse + ' worse.' +
        (big && big.last !== big.prev ? ' Biggest change: ' + big.job.name + ', ' + big.prev + ' → ' + big.last + ' problems.' : '')));
      var arrows = el('div', 'tr-arrows');
      tr.forEach(function (x) {
        var a = icon(x.dir === 'worse' ? 'up' : x.dir === 'better' ? 'down' : x.dir === 'same' ? 'flat' : 'one');
        a.title = x.job.name + ': ' + (x.dir === 'one' ? 'one test run that ended so far' : x.prev + ' → ' + x.last + ' problems');
        a.removeAttribute('aria-hidden');
        a.setAttribute('role', 'img');
        a.setAttribute('aria-label', a.title);
        arrows.appendChild(a);
      });
      t2.appendChild(arrows);
    }
    tiles.appendChild(t2);

    // Tested lately: the tries of the last seven days, a bar for each day.
    var week = Date.now() / 1000 - 7 * 86400;
    var recent = (sh.trials || []).filter(function (t) { return t.created_at >= week; });
    var t3 = stat('Tested lately');
    t3.appendChild(el('div', 'tr-big-n', plural(recent.length, 'test run')));
    var who = {};
    recent.forEach(function (t) { who[t.persona_name] = (who[t.persona_name] || 0) + 1; });
    var whoLine = Object.keys(who).map(function (k) { return k + ' ' + who[k]; }).join(', ');
    t3.appendChild(el('p', 'tr-cap', recent.length ? 'In the last 7 days, by ' + whoLine + '.' : 'None in the last 7 days.'));
    if (recent.length) {
      var bars = el('div', 'tr-bars');
      bars.setAttribute('aria-hidden', 'true');
      var most = 1, days = [];
      for (var k = 6; k >= 0; k--) {
        var d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - k);
        var from = d0.getTime() / 1000, n = recent.filter(function (t) { return t.created_at >= from && t.created_at < from + 86400; }).length;
        days.push([d0.getDate(), n]);
        most = Math.max(most, n);
      }
      days.forEach(function (x) { var s = el('span'); var b = el('b'); b.style.height = Math.round(x[1] / most * 100) + '%'; s.appendChild(b); s.appendChild(el('span', '', String(x[0]))); bars.appendChild(s); });
      t3.appendChild(bars);
      t3.appendChild(el('p', 'tr-cap', 'Test runs each day, by date'));
    }
    tiles.appendChild(t3);

    root.appendChild(tiles);

    // The jobs above the pages (Petar, 22 November 2026).
    drawJobList(root);

    var left = el('section', 'tr-pages tr-sec');
    var lh = el('div', 'tr-sec-head');
    lh.appendChild(el('h2', 'tr-h2', 'The pages of Rouh'));
    var key = el('div', 'tr-legend');
    BAD_ORDER.forEach(function (b) { var x = el('span'); x.appendChild(shape(b)); x.appendChild(el('span', '', BAD_SHORT[b])); key.appendChild(x); });
    key.appendChild(el('span', '', 'one mark for each problem to decide'));
    lh.appendChild(key);
    left.appendChild(lh);
    left.appendChild(pagePhones(open, sh));
    root.appendChild(left);
  }

  /* One drawn phone for each page of Rouh with a problem to decide, one mark per problem, worst first. */
  function pagePhones(open, sh) {
    var groups = {}, order = [];
    open.forEach(function (p) {
      var k = p.screen || '';
      if (!groups[k]) { groups[k] = { key: k, name: p.screen_name || 'Somewhere in Rouh', list: [] }; order.push(k); }
      groups[k].list.push(p);
    });
    var wrap = el('div', 'tr-tiles');
    if (!order.length) {
      wrap.appendChild(el('p', 'tr-empty', (sh.counts && sh.counts.trials) ? 'No page has a problem waiting for your decision.'
        : 'Nothing has been tried yet, so no page has a problem.'));
      return wrap;
    }
    var jobsByPage = {};
    (sh.jobs || []).forEach(function (j) { if (j.page) { (jobsByPage[j.page] = jobsByPage[j.page] || []).push(j); } });
    var tr = {};
    trends(sh).forEach(function (x) { tr[x.job.number] = x; });
    order.sort(function (a, b) { return groups[b].list.length - groups[a].list.length; });
    order.forEach(function (k) {
      var g = groups[k];
      var tile = link('', HOME + '/problems', 'tr-tile');
      tile.addEventListener('click', function () { S.probFilter = { status: 'open', who: '', job: '' }; S.probView = { screen: k, bad: '', group: false, all: false }; }, true);
      tile.setAttribute('aria-label', g.name + ' (' + (k || '/') + '): ' + plural(g.list.length, 'problem') + ' to decide. Open them in the Fix list.');
      var ph = el('div', 'tr-phone');
      ph.appendChild(el('div', 'tr-pname', g.name));
      // The address tells apart pages that share a name, such as the Guide and each of its lessons
      // (Petar, 22 November 2026): no two tiles have the same one.
      var path = el('div', 'tr-ppath', slashBreaks(k || '/'));
      path.title = 'The address of this page in Rouh';
      ph.appendChild(path);
      var stopped = g.list.filter(function (p) { return p.how_bad === 'blocked'; }).length;
      ph.appendChild(el('div', 'tr-pnum', g.list.length + ' to decide' + (stopped ? ', ' + stopped + ' stopped the tester' : '')));
      var dots = el('div', 'tr-dots');
      g.list.slice().sort(function (a, b) { return BAD_ORDER.indexOf(a.how_bad) - BAD_ORDER.indexOf(b.how_bad); })
        .forEach(function (p) { dots.appendChild(shape(p.how_bad)); });
      ph.appendChild(dots);
      var js = jobsByPage[k] || [];
      if (js.length) {
        var foot = el('div', 'tr-pfoot');
        js.slice(0, 2).forEach(function (j) {
          var x = tr[j.number];
          var line = el('span', 'tr-trend');
          line.appendChild(icon(!x || x.dir === 'one' ? 'one' : x.dir === 'worse' ? 'up' : x.dir === 'better' ? 'down' : 'flat'));
          line.appendChild(el('span', '', (js.length > 1 ? j.name.replace(/:\s*$/, '') + ': ' : '') + (!x || x.dir === 'one' ? 'no trend yet'
            : (x.dir === 'same' ? 'Same' : upper(x.dir)) + ': ' + x.prev + ' → ' + x.last)));
          foot.appendChild(line);
        });
        ph.appendChild(foot);
      }
      tile.appendChild(ph);
      var lastJob = js.slice().sort(function (a, b) { return (b.last_at || 0) - (a.last_at || 0); })[0];
      if (lastJob && lastJob.last_at) { tile.appendChild(el('div', 'tr-under', 'Last tried ' + day(lastJob.last_at))); }
      wrap.appendChild(tile);
    });
    return wrap;
  }

  /* The jobs (Petar, 22 November 2026, fifth round): one card for each job, the whole card a link to its own page,
     which lists its journeys and their attempts. A card holds what the person asked (clamped), when it was made,
     whether they started it (Manual) or Rouh did (Automatic), its counts, and one ring of how much of what its
     testers found is resolved: fixed in green, set aside (Won't fix, Not a problem) in grey. No pass or did not pass anywhere. Under All the
     cards are in two groups, the person's first; the filter is kept in the address (?kind=). */
  var KIND = {
    manual: { word: 'Manual', icon: 'person', group: 'You started', note: 'Tests you asked for, from the start form or in a chat.' },
    automatic: { word: 'Automatic', icon: 'cog', group: 'Rouh started', note: 'Tests Rouh ran by itself: automatic testing, and a build testing its own change.' }
  };
  function kindOf(r) { return r && r.kind === 'manual' ? 'manual' : 'automatic'; }
  function kindBadge(r) {
    var k = kindOf(r), b = el('span', 'tr-kind is-' + k);
    b.appendChild(icon(KIND[k].icon));
    b.appendChild(el('span', '', KIND[k].word));
    return b;
  }
  function kindRead(search) {
    var m = /[?&]kind=(manual|automatic)(?:&|#|$)/.exec(String(search || ''));
    return m ? m[1] : '';
  }

  /* The ring: of the problems testers found, fixed (green) and set aside (yellow), drawn round a grey track, and what
     is still open is the track left showing (Petar, 23 November 2026, seventh round): green and yellow together fill
     the ring to how much is resolved, so 100% resolved is a full ring. Its words say the same, so colour is never the
     only sign. The same colours in every ring: a job's, a journey's and the small one on each test run's row. */
  function ringTitle(s) {
    return !s.found ? 'No problems found' : s.found + ' found · ' + s.fixed + ' fixed · ' + s.set_aside + ' set aside · ' + s.open + ' open';
  }
  function ringSvg(s, sw) {
    var n = s.found || 0, R = 42, C = 2 * Math.PI * R;
    var fx = n ? s.fixed / n : 0, sa = n ? s.set_aside / n : 0, op = n ? s.open / n : 0;
    var parts = [fx, sa, op].filter(function (x) { return x > 0; }).length;
    function arc(cls, from, part) {
      if (part <= 0) { return ''; }
      // A hair of a gap between parts, none when one part is the whole ring.
      var len = Math.max(0.5, part * C - (parts > 1 ? 2 : 0));
      return '<circle class="' + cls + '" cx="50" cy="50" r="' + R + '" fill="none" stroke-width="' + sw + '" stroke-dasharray="' +
        len.toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-from * C).toFixed(2) + '" transform="rotate(-90 50 50)"/>';
    }
    // Only these fixed shapes and numbers go through innerHTML: nothing a person or a tester wrote.
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tr-ring-track" cx="50" cy="50" r="' + R +
      '" fill="none" stroke-width="' + sw + '"/>' + arc('tr-ring-fixed', 0, fx) + arc('tr-ring-aside', fx, sa) + '</svg>';
  }
  /* The small ring on a test run's row: no words inside, its numbers on hover and for a screen reader. */
  function miniRing(s) {
    var w = el('span', 'tr-ring tr-ring-xs');
    w.innerHTML = ringSvg(s, 20);
    w.title = ringTitle(s);
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', ringTitle(s));
    return w;
  }
  function ring(s, size) {
    var n = s.found || 0, w = el('div', 'tr-ring' + (size ? ' tr-ring-' + size : ''));
    w.innerHTML = ringSvg(s, 11);
    var mid = el('div', 'tr-ring-mid');
    if (!n) { mid.appendChild(el('b', 'is-none', 'None')); mid.appendChild(el('span', '', 'found yet')); }
    else {
      mid.appendChild(el('b', '', Math.round(s.resolved / n * 100) + '%'));
      // The small one, on a journey, has its counts right beside it: one word under the number is enough.
      mid.appendChild(el('span', '', size === 's' ? 'resolved' : s.resolved === n ? 'all resolved' : s.resolved + ' of ' + n + ' resolved'));
    }
    w.appendChild(mid);
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', !n ? 'No problems found yet' : s.resolved + ' of ' + plural(n, 'problem') + ' resolved: ' +
      s.fixed + ' fixed, ' + s.set_aside + ' set aside, ' + s.open + ' still open');
    w.title = ringTitle(s);
    return w;
  }
  /* The counts beside the ring, the same on the card and the job's page. */
  function jobCounts(s) {
    var g = el('dl', 'tr-jc');
    function row(label, value, cls, ic) {
      var d = el('div', 'tr-jc-i' + (cls ? ' ' + cls : ''));
      var dt = el('dt');
      if (ic) { dt.appendChild(ic); }
      dt.appendChild(el('span', '', label));
      d.appendChild(dt);
      d.appendChild(el('dd', '', value));
      g.appendChild(d);
    }
    function key(cls) { var k = el('i', 'tr-jc-key ' + cls); k.setAttribute('aria-hidden', 'true'); return k; }
    row('Found', String(s.found), 'is-found');
    row('Fixed', String(s.fixed), s.fixed ? 'is-fixed' : '', key('is-fixed'));
    row('Set aside', String(s.set_aside), s.set_aside ? 'is-aside' : '', key('is-aside'));
    row('Open', String(s.open), s.open ? 'is-open' : '', key('is-open'));
    return g;
  }
  function jobScale(r) {
    var s = r.summary || {}, p = el('p', 'tr-jscale');
    p.appendChild(el('span', '', plural(s.journeys_n || 0, 'journey')));
    p.appendChild(el('span', '', plural(s.attempts_n || 0, 'test run')));
    var f = el('span', 'tr-jscale-fin');
    // A tick only when a tester finished one: a green tick on "0 of 1" read as success (critic, round 2).
    f.appendChild(icon(s.finished ? 'check' : 'one'));
    if (!s.finished) { f.classList.add('is-none'); }
    f.appendChild(el('span', '', (s.finished || 0) + ' of ' + (s.journeys_n || 0) + ' finished by a tester'));
    p.appendChild(f);
    return p;
  }
  function settledLine(s) {
    if (!s.found) { return 'No problems found yet.'; }
    if (!s.open) { return 'All ' + plural(s.found, 'problem') + ' resolved.'; }
    return s.resolved + ' of ' + s.found + ' resolved; ' + s.open + ' still open' + (s.decided ? ', ' + s.decided + ' of them chosen to fix' : '') + '.';
  }
  function jobCard(r) {
    var s = r.summary || {}, k = kindOf(r);
    var li = el('li', 'tr-jcard-li');
    var a = link('', HOME + '/job/' + r.number, 'tr-jcard is-' + k);
    a.id = 'job-' + r.number;
    var top = el('div', 'tr-jcard-top');
    top.appendChild(kindBadge(r));
    top.appendChild(el('span', 'tr-dim', 'Job ' + r.number + ' · made ' + day(r.created_at)));
    a.appendChild(top);
    a.appendChild(el('h3', 'tr-jcard-t', r.title));
    if (r.prompt) { a.appendChild(el('blockquote', 'tr-jcard-p', '“' + r.prompt + '”')); }
    else { a.appendChild(el('p', 'tr-jcard-p is-none', k === 'manual' ? 'Your words were not kept for this one.' : 'Started by Rouh after a change, so there are no words of yours.')); }
    var body = el('div', 'tr-jcard-b');
    body.appendChild(ring(s));
    body.appendChild(jobCounts(s));
    a.appendChild(body);
    a.appendChild(jobScale(r));
    var foot = el('div', 'tr-jcard-f');
    foot.appendChild(el('span', 'tr-dim', s.last_at ? 'Last tried ' + day(s.last_at) : 'Not tried yet'));
    foot.appendChild(el('span', 'tr-jcard-go', 'Open the job'));
    a.appendChild(foot);
    li.appendChild(a);
    return li;
  }
  function drawJobList(root) {
    var all = ((S.shell && S.shell.requests) || []), want = S.kind || '';
    var n = { manual: 0, automatic: 0 };
    all.forEach(function (r) { n[kindOf(r)]++; });
    var shown = all.filter(function (r) { return !want || kindOf(r) === want; });
    var sec = section('tr-jobs', '');
    var head = el('div', 'tr-jobs-head');
    var hw = el('div', 'tr-jobs-hw');
    hw.appendChild(el('h2', 'tr-h2', 'Jobs'));
    var tot = { found: 0, resolved: 0, open: 0, decided: 0 };
    all.forEach(function (r) { var x = r.summary || {}; tot.found += x.found || 0; tot.resolved += x.resolved || 0; tot.open += x.open || 0; tot.decided += x.decided || 0; });
    hw.appendChild(el('p', 'tr-lede', !all.length ? 'A job is one request for testing, yours or Rouh’s.'
      : plural(all.length, 'job') + ': ' + n.manual + ' you started, ' + n.automatic + ' Rouh started. ' +
        (tot.found ? tot.resolved + ' of the ' + plural(tot.found, 'problem') + ' they found are resolved: fixed or set aside.' +
          (tot.open ? ' ' + tot.open + ' still open' + (tot.decided ? ', ' + tot.decided + ' of them chosen to fix.' : '.') : '') : 'No problems found yet.')));
    head.appendChild(hw);
    var seg = el('div', 'tr-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Show the jobs');
    [['', 'All', all.length], ['manual', 'Manual', n.manual], ['automatic', 'Automatic', n.automatic]].forEach(function (o) {
      var b = button('tr-seg-b', '');
      if (o[0]) { b.appendChild(icon(KIND[o[0]].icon)); }
      b.appendChild(el('span', '', o[1]));
      b.appendChild(el('span', 'tr-seg-n', String(o[2])));
      b.setAttribute('aria-pressed', want === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (S.kind !== o[0]) { S.kind = o[0]; draw(); } });
      seg.appendChild(b);
    });
    head.appendChild(seg);
    sec.appendChild(head);
    if (!all.length) {
      sec.appendChild(el('p', 'tr-empty', 'Nothing has been tried yet. When you ask for a test, or Rouh changes something you will see, its job shows up here.'));
      root.appendChild(sec);
      return;
    }
    function grid(list) { var ul = el('ul', 'tr-jcards'); list.forEach(function (r) { ul.appendChild(jobCard(r)); }); return ul; }
    if (want) {
      if (!shown.length) {
        sec.appendChild(el('p', 'tr-empty', want === 'manual' ? 'You have not started a test yet. Test something, at the top, starts one.'
          : 'Rouh has not tested anything by itself yet.'));
      } else { sec.appendChild(grid(shown)); }
    } else {
      ['manual', 'automatic'].forEach(function (k) {
        var list = all.filter(function (r) { return kindOf(r) === k; });
        if (!list.length) { return; }
        var g = el('div', 'tr-jgroup is-' + k);
        var gh = el('h3', 'tr-jgroup-h');
        gh.appendChild(icon(KIND[k].icon));
        gh.appendChild(el('span', '', KIND[k].group));
        gh.appendChild(el('span', 'tr-seg-n', String(list.length)));
        g.appendChild(gh);
        g.appendChild(el('p', 'tr-cap', KIND[k].note));
        g.appendChild(grid(list));
        sec.appendChild(g);
      });
    }
    root.appendChild(sec);
  }

  /* ---- one job, the request: its words, its summary, and every journey with its attempts ---- */

  /* A test run that has not ended says where it is; one that ended shows its ring instead. */
  function runWords(t) {
    if (stuck(t)) { return 'Stuck'; }
    if (t.state === 'running') { return 'Testing now'; }
    if (t.state === 'queued') { return 'Waiting to start'; }
    if (t.state === 'broken') { return 'No report'; }
    return 'Ended';
  }
  function drawRequest(root, w) {
    var d = S.data.request;
    if (!d || w.page !== 'request' || String(d.number) !== w.n) {
      // A journey's address is looking for its job: it names the journey until the job is found.
      root.appendChild(crumbs([['Dashboard', HOME], [(w.page === 'journey' ? 'Journey ' : 'Job ') + w.n]]));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', w.page === 'journey' ? 'Opening the job of journey ' + w.n + '…' : 'Opening the job…')); }
      return;
    }
    var s = d.summary || {}, k = kindOf(d);
    moved(d.title);
    root.appendChild(crumbs([['Dashboard', HOME], ['Job ' + d.number]]));
    var head = el('header', 'tr-jhead');
    var meta = el('div', 'tr-jcard-top');
    meta.appendChild(kindBadge(d));
    meta.appendChild(el('span', 'tr-dim', 'Job ' + d.number + ' · made ' + day(d.created_at) + (s.last_at ? ' · last tried ' + day(s.last_at) : '')));
    head.appendChild(meta);
    head.appendChild(el('h1', 'tr-h1', d.title));
    head.appendChild(el('p', 'tr-lede', settledLine(s)));
    root.appendChild(head);
    var top = el('div', 'tr-jtop');
    var asked = el('figure', 'tr-jask');
    asked.appendChild(el('figcaption', 'tr-label', k === 'manual' ? 'What you asked' : 'What started it'));
    if (d.prompt) { asked.appendChild(el('blockquote', '', d.prompt)); }
    else { asked.appendChild(el('p', 'tr-dim', k === 'manual' ? 'Your words were not kept for this one.' : 'Rouh tested a change it had just made, so there are no words of yours.')); }
    top.appendChild(asked);
    var sum = el('section', 'tr-jsum');
    sum.setAttribute('aria-label', 'How far it has come');
    var sb = el('div', 'tr-jcard-b');
    sb.appendChild(ring(s, 'l'));
    sb.appendChild(jobCounts(s));
    sum.appendChild(sb);
    sum.appendChild(jobScale(d));
    if (s.found) {
      var toDecide = (s.open || 0) - (s.decided || 0);
      var fl = link(toDecide > 0 ? 'Decide the ' + toDecide + ' still to decide in the Fix list' : 'The Fix list', HOME + '/problems', 'tr-a tr-jsum-a');
      sum.appendChild(fl);
    }
    // The summary first, at the top as on its card; what was asked beside it, whole.
    top.insertBefore(sum, asked);
    root.appendChild(top);

    var sec = section('tr-jlist', 'Journeys');
    sec.appendChild(el('p', 'tr-cap', 'Each journey is one thing a tester is asked to do. Each test run is one tester going through it; open one to see it step by step.'));
    var ol = el('ol', 'tr-jrs');
    // Journeys that all begin "Guide: " say it once, in the job's title, not on every one of them.
    var js = d.journeys || [], head0 = /^([^:]{1,40}):\s+/.exec((js[0] || {}).name || '');
    var cut = head0 && js.length > 1 && js.every(function (j) { return String(j.name).indexOf(head0[0]) === 0; }) ? head0[0].length : 0;
    js.forEach(function (j) {
      var li = el('li', 'tr-jr2' + (S.focusJourney === j.number ? ' is-focus' : ''));
      li.id = 'journey-' + j.number;
      li.tabIndex = -1;
      // Its name and goal on the left, each with a pencil that changes it in place; its own ring on the right.
      var top2 = el('div', 'tr-jr2-top');
      var words = el('div', 'tr-jr2-words');
      words.appendChild(el('span', 'tr-jr2-n', 'Journey ' + j.number));
      var ed = S.jEdit && S.jEdit.n === j.number ? S.jEdit.what : '';
      if (ed === 'name') { words.appendChild(inlineEdit(j, 'name')); }
      else {
        var hn = el('h3', 'tr-jr2-t');
        hn.appendChild(el('span', '', upper(j.name.slice(cut))));
        hn.appendChild(pencil(j, 'name', 'Change the name of journey ' + j.number));
        words.appendChild(hn);
      }
      if (ed === 'goal') { words.appendChild(inlineEdit(j, 'goal')); }
      else {
        var gl = el('p', 'tr-jr-goal' + (j.goal ? '' : ' is-none'), j.goal ? '“' + j.goal + '”' : 'No goal written yet.');
        gl.appendChild(pencil(j, 'goal', 'Change the goal of journey ' + j.number));
        words.appendChild(gl);
      }
      if (j.finished) { words.appendChild(withIcon(el('span', 'tr-jr2-fin'), 'check', 'Finished by a tester')); }
      top2.appendChild(words);
      var jsum = el('div', 'tr-jr2-sum');
      jsum.appendChild(ring(j, 's'));
      var jc = jobCounts(j);
      jc.classList.add('tr-jc-s');
      jsum.appendChild(jc);
      top2.appendChild(jsum);
      li.appendChild(top2);
      var ul = el('ul', 'tr-att-l');
      ul.setAttribute('aria-label', 'Test runs of ' + j.name);
      (j.attempts || []).forEach(function (t) {
        var ali = el('li');
        var a = link('', HOME + '/' + t.number, 'tr-att-r');
        a.appendChild(face(testerOf(t.persona) || { key: t.persona, name: t.persona_name }, 'xs'));
        var ww = el('span', 'tr-att-w');
        ww.appendChild(el('strong', '', t.persona_name));
        ww.appendChild(el('span', 'tr-dim', 'Test run ' + t.number + ' · ' + day(t.created_at)));
        a.appendChild(ww);
        var res = el('span', 'tr-att-res');
        // An ended test run shows its own problems as a small ring, with no word for how far the tester got
        // (Petar, 23 November 2026); one still going, waiting, stuck or with no report says so.
        if (t.state === 'passed' || t.state === 'failed') {
          var tl = t.tally || { found: t.found_n || 0, fixed: 0, set_aside: 0, open: t.found_n || 0 };
          res.appendChild(miniRing(tl));
          a.title = 'Test run ' + t.number + ': ' + ringTitle(tl);
        } else { res.appendChild(el('span', 'tr-att-how is-' + (stuck(t) ? 'stuck' : t.state), runWords(t))); }
        a.appendChild(res);
        ali.appendChild(a);
        ul.appendChild(ali);
      });
      if (!(j.attempts || []).length) { ul.appendChild(el('li', 'tr-dim', 'Nobody has gone through it yet.')); }
      li.appendChild(ul);
      // What a journey's own page had until 22 November 2026: another test run, and its problems. Its name and
      // goal are changed by the pencils beside them since 23 November 2026.
      var acts = el('div', 'tr-jr2-acts');
      var open = S.jOpen[j.number] || '';
      var again = button('tr-btn tr-btn-s tr-quiet', 'Have a tester go through it again');
      again.setAttribute('aria-expanded', open === 'run' ? 'true' : 'false');
      again.addEventListener('click', function () { S.jOpen[j.number] = open === 'run' ? '' : 'run'; draw(); });
      acts.appendChild(again);
      if (j.found) {
        var pl = link('Its ' + plural(j.found, 'problem') + ' in the Fix list', HOME + '/problems', 'tr-a tr-jr2-a');
        pl.addEventListener('click', function () { S.probFilter = { status: 'all', who: '', job: String(j.number) }; S.probView = { screen: null, bad: '', group: false, all: false }; }, true);
        acts.appendChild(pl);
      }
      li.appendChild(acts);
      if (open === 'run') {
        li.appendChild(runAgain((S.shell && S.shell.personas) || [], S.shell && S.shell['default'], function (persona) {
          return call('/jobs/' + j.number + '/run', { persona: persona });
        }, 'Start the test run', 'A tester who has seen nothing before goes through this journey from the start, and you get the whole ' +
          'walk-through and what they found. It takes a few minutes. Nothing is fixed from it until you choose what.'));
      }
      ol.appendChild(li);
    });
    sec.appendChild(ol);
    root.appendChild(sec);
    // Opened from a journey's address: that journey, in view, once.
    if (S.focusJourney) {
      var fj = S.focusJourney;
      S.focusJourney = 0;
      setTimeout(function () { var x = document.getElementById('journey-' + fj); if (x) { x.scrollIntoView({ block: 'start' }); x.focus({ preventScroll: true }); } }, 0);
    }
  }

  /* A journey's name or goal, changed in place (Petar, 23 November 2026): a pencil beside it turns it into a box
     with Save and Cancel. Esc cancels; Enter saves a name, Ctrl or Cmd with Enter a goal. */
  function pencil(j, what, label) {
    var b = button('tr-pencil', '');
    b.id = 'tr-pen-' + what + '-' + j.number;
    b.appendChild(icon('pencil'));
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', function () { S.jEdit = { n: j.number, what: what, draft: what === 'name' ? j.name : (j.goal || ''), error: '' }; draw(); focusEdit(); });
    return b;
  }
  function focusEdit() {
    setTimeout(function () { var x = document.getElementById('tr-ied'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0);
  }
  function inlineEdit(j, what) {
    var e = S.jEdit, f = el('form', 'tr-ied is-' + what);
    var lab = el('label', 'tr-sr', what === 'name' ? 'Name of journey ' + j.number : 'What the tester is asked to do, as they would say it');
    lab.htmlFor = 'tr-ied';
    f.appendChild(lab);
    var box = el(what === 'name' ? 'input' : 'textarea', 'tr-ied-in');
    box.id = 'tr-ied';
    if (what === 'name') { box.type = 'text'; box.maxLength = 160; } else { box.rows = 3; box.maxLength = 400; }
    box.value = e.draft;
    box.addEventListener('input', function () { e.draft = box.value; e.error = ''; });
    f.appendChild(box);
    var row = el('div', 'tr-ied-acts');
    var save = button('tr-btn tr-btn-s tr-primary', e.busy ? 'Saving…' : 'Save');
    save.type = 'submit';
    save.disabled = !!e.busy;
    var cancel = button('tr-btn tr-btn-s', 'Cancel');
    row.appendChild(save);
    row.appendChild(cancel);
    if (e.error) { var er = el('p', 'tr-ied-err', e.error); er.setAttribute('role', 'alert'); row.appendChild(er); }
    f.appendChild(row);
    function back() { var id = 'tr-pen-' + what + '-' + j.number; setTimeout(function () { var p = document.getElementById(id); if (p) { p.focus(); } }, 0); }
    function stop() { S.jEdit = null; draw(); back(); }
    cancel.addEventListener('click', stop);
    box.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stop(); }
      else if (ev.key === 'Enter' && (what === 'name' || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); }
    });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (e.busy) { return; }
      var body = {};
      body[what] = box.value;
      e.busy = true; draw(); 
      call('/jobs/' + j.number, body).then(function () {
        S.jEdit = null; load().then(back, back);
      }, function (err) { e.busy = false; e.error = String((err && err.message) || err); draw(); focusEdit(); });
    });
    return f;
  }

  function field(form, label, kind, value, id) {
    var wrap = el('label', 'tr-field');
    wrap.appendChild(el('span', 'tr-label', label));
    var input = el(kind, 'tr-input' + (kind === 'textarea' ? ' tr-area' : ''));
    if (id) { input.id = id; }
    input.value = value == null ? '' : String(value);
    wrap.appendChild(input);
    form.appendChild(wrap);
    return input;
  }

  function runAgain(personas, def, start, label, words) {
    var box = section('tr-again', label);
    box.appendChild(el('p', 'tr-dim', words));
    var row = el('div', 'tr-again-row');
    // A word above the picker: "Vesela tries it" alone did not say a tester is being chosen (trial 22).
    var pl = el('label', 'tr-choose');
    pl.appendChild(el('span', 'tr-label', 'Who tests it'));
    var pick = el('select', 'tr-select');
    pick.setAttribute('aria-label', 'Who tests it');
    pl.appendChild(pick);
    personas.forEach(function (p) {
      var o = el('option', '', p.first + ' tests it' + (p.paused ? ' (paused)' : ''));
      o.value = p.id;
      if (p.id === def) { o.selected = true; }
      pick.appendChild(o);
    });
    row.appendChild(pl);
    var run = button('tr-btn tr-primary', label);
    run.disabled = !!S.busy;
    run.addEventListener('click', function () {
      S.busy = 'run'; S.said = ''; draw();
      start(pick.value).then(function (j) {
        S.busy = '';
        S.carry = j.said || 'Starting.';
        go(HOME + '/' + j.trial.number);
      }, fail);
    });
    row.appendChild(run);
    box.appendChild(row);
    return box;
  }

  /* Test something, from the header (Petar, 22 November 2026): say in a sentence what needs testing, pick the
     tester or testers, and Start. Each tester's test is a review, the same kind of try the old Run a trial
     started: nothing is fixed from it until you choose what. With one tester its page opens and fills in as it goes. */
  function openStart() {
    var sh = S.shell;
    var dlg = el('dialog', 'tr-dlg');
    dlg.setAttribute('aria-labelledby', 'tr-dlg-h');
    var f = el('form', 'tr-dlg-in');
    f.method = 'dialog';
    var head = el('div', 'tr-dlg-head');
    var h = el('h2', 'tr-h2', 'Test something');
    h.id = 'tr-dlg-h';
    head.appendChild(h);
    var x = button('tr-icon-btn', null);
    x.appendChild(icon('x'));
    x.setAttribute('aria-label', 'Close');
    head.appendChild(x);
    f.appendChild(head);
    var wrap = el('label', 'tr-field');
    wrap.appendChild(el('span', 'tr-label', 'What needs testing'));
    var what = el('textarea', 'tr-input tr-area');
    what.id = 'tr-start-what';
    what.rows = 4;
    what.placeholder = 'For example: You want to find the problems Vesela hit on the Fix list and choose one to fix. Name a page, such as /evolution/testing/problems, to start there.';
    wrap.appendChild(what);
    f.appendChild(wrap);
    var testers = liveTesters(sh);
    var pickT = el('fieldset', 'tr-pick');
    pickT.appendChild(el('legend', 'tr-label', 'Who tests it'));
    var def = sh && sh['default'];
    testers.forEach(function (t) {
      var l = el('label', 'tr-pick-t');
      var c = el('input');
      c.type = 'checkbox'; c.name = 'tester'; c.value = t.key;
      c.checked = t.key === def || (testers.length === 1);
      l.appendChild(c);
      l.appendChild(face(t, ''));
      var w = el('span');
      w.appendChild(el('b', '', t.first));
      if (t.short) { w.appendChild(el('span', 'tr-dim', ' ' + t.short)); }
      l.appendChild(w);
      pickT.appendChild(l);
    });
    if (!testers.length) { pickT.appendChild(el('p', 'tr-empty', 'There are no testers yet. Add one on Testers first.')); }
    f.appendChild(pickT);
    f.appendChild(el('p', 'tr-dim', 'Each tester has seen nothing before and tests it on a phone. You get the whole walk-through and what ' +
      'they found; nothing is fixed until you choose what. It runs whether automatic testing is on or off.'));
    var err = el('p', 'tr-err-words');
    err.setAttribute('role', 'alert');
    f.appendChild(err);
    var foot = el('div', 'tr-dlg-foot');
    var cancel = button('tr-btn', 'Cancel');
    var startB = button('tr-btn tr-primary', null);
    withIcon(startB, 'phone', 'Start');
    startB.type = 'submit';
    startB.disabled = !testers.length;
    foot.appendChild(cancel);
    foot.appendChild(startB);
    f.appendChild(foot);
    dlg.appendChild(f);
    function shut() {
      document.removeEventListener('keydown', esc, true);
      if (dlg.open) { dlg.close(); }
      dlg.remove();
    }
    // Escape closes it here, and never also closes the layer underneath.
    function esc(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } }
    x.addEventListener('click', shut);
    cancel.addEventListener('click', shut);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { shut(); } });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var goal = what.value.trim();
      var keys = [].slice.call(f.querySelectorAll('input[name=tester]:checked')).map(function (c) { return c.value; });
      if (!goal) { err.textContent = 'Say what needs testing first.'; what.focus(); return; }
      if (!keys.length) { err.textContent = 'Tick at least one tester.'; return; }
      // A page named in the words is where it begins; otherwise Rouh's first screen, and the run reads the words.
      var page = (/(?:^|\s)(\/[a-z][\w\-\/]*)/i.exec(goal) || [])[1] || '';
      var subject = goal.replace(/\s+/g, ' ').slice(0, 80);
      startB.disabled = true;
      err.textContent = '';
      var started = [], startedAt = String(Date.now());
      keys.reduce(function (p, k) {
        return p.then(function () {
          // Every tester ticked in one press is one job (`started` ties them together).
          return call('/new', { goal: goal, page: page, subject: subject, persona: k, started: startedAt }).then(function (j) { started.push(j); });
        });
      }, Promise.resolve()).then(function () {
        shut();
        S.shell = null;
        if (started.length === 1) { S.carry = started[0].said || 'Starting.'; go(HOME + '/' + started[0].trial.number); return; }
        S.carry = started.length + ' tests are starting: ' + started.map(function (j) { return j.trial.persona_name + ' in test run ' + j.trial.number; }).join(', ') +
          '. Each takes a few minutes, and shows under its job.';
        if (where().page === 'jobs') { S.said = S.carry; S.carry = ''; load(); } else { go(HOME); }
      }, function (e2) {
        startB.disabled = false;
        err.textContent = (started.length ? started.length + ' started, then: ' : '') + String((e2 && e2.message) || e2);
      });
    });
    document.addEventListener('keydown', esc, true);
    (S.root || document.body).appendChild(dlg);
    dlg.showModal();
    what.focus();
  }

  /* ---- one try ---- */

  /* ---- one try (Petar, 22 November 2026): the overview and how it ended together on top, then each step
     with the problems met at it, a navigator and a details panel, and the ticked fixes sent in waves ---- */

  function drawTry(root, w) {
    var d = S.data['try'];
    if (!d || String(d.trial.number) !== w.n) {
      root.appendChild(crumbs([['Dashboard', HOME], ['Test run ' + w.n]]));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the test run…')); }
      return;
    }
    var t = d.trial, name = t.persona_name;
    moved((t.job_name || upper(t.subject)) + ', test run ' + t.number);
    root.appendChild(crumbs(t.job ? [['Dashboard', HOME]].concat(t.request ? [['Job ' + t.request.number + ': ' + t.request.title, HOME + '/job/' + t.request.number]] : [])
        .concat([['Journey: ' + t.job_name, HOME + (t.request ? '/job/' + t.request.number : '/journey/' + t.job)], ['Test run ' + t.number]])
      : [['Dashboard', HOME], ['Test run ' + t.number]]));
    var going = t.state === 'queued' || t.state === 'running';
    var walk = t.walk || [];
    var found = t.found || [];
    var foundAt = {};
    found.forEach(function (f) { var k = f.step || 0; (foundAt[k] = foundAt[k] || []).push(f); });
    var stuckAt = 0;
    walk.forEach(function (s) { if ((foundAt[s.n] || []).some(function (f) { return f.how_bad === 'blocked'; })) { stuckAt = s.n; } });
    if (!going) { nameSteps(t); }

    root.appendChild(tryOverview(t, going, stuckAt));
    if ((t.waves || []).length) { root.appendChild(waveList(t)); }

    var story = section('tr-steps', 'Step by step', 'tr-steps-sec');
    S.tf = S.tf || tfBlank();
    // With a filter on, a step shows only while one of its problems matches it, and a step with none is hidden.
    var on = tfActive();
    function seen(list) { return !on || (list || []).some(tfShows); }
    var vis = walk.filter(function (s) { return seen(foundAt[s.n]); });
    var whole = (foundAt[0] || []).length && seen(foundAt[0]);
    if (!walk.length) { story.appendChild(el('p', 'tr-empty', going ? 'No steps yet: each one appears here as ' + name + ' takes it.' : 'No steps were kept.')); }
    else {
      if (found.length) { story.appendChild(tryFilter(found)); }
      if (!vis.length && !whole) {
        var none = el('div', 'tr-tf-none');
        none.appendChild(el('p', '', 'No problem matches this filter, so no step is shown.'));
        var rs = button('tr-btn tr-btn-s', 'Reset the filter');
        rs.addEventListener('click', function () { tfSet(tfBlank()); });
        none.appendChild(rs);
        story.appendChild(none);
      } else if (vis.length) {
        story.appendChild(stepStrip(t, vis, foundAt, stuckAt));
      }
      vis.forEach(function (s) { story.appendChild(stepBlock(t, s, foundAt[s.n] || [], s.n === stuckAt, walk.length, going)); });
    }
    if (whole) { story.appendChild(stepBlock(t, null, foundAt[0], false, walk.length, going)); }
    root.appendChild(story);
    // Asking for another review is the start form's, on the dashboard (Petar, 22 November 2026, third round).
    if (!going && found.length) { root.appendChild(fixBar(t)); }
    setTimeout(markHere, 0);
  }

  /* The strip marks the step being read, and on a phone keeps that step's button in sight. */
  function markHere() {
    if (S.hereWatch) { S.hereWatch.disconnect(); S.hereWatch = null; }
    var strip = document.querySelector('.tr-strip');
    if (!strip || !window.IntersectionObserver) { return; }
    S.hereWatch = new IntersectionObserver(function (seen) {
      seen.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        var n = e.target.id.replace('step-', '');
        strip.querySelectorAll('.tr-strip-b').forEach(function (b) {
          var on = b.getAttribute('data-n') === n;
          b.classList.toggle('is-here', on);
          if (on) {
            b.setAttribute('aria-current', 'step');
            if (b.offsetLeft < strip.scrollLeft || b.offsetLeft + b.offsetWidth > strip.scrollLeft + strip.clientWidth) {
              strip.scrollLeft = b.offsetLeft - strip.clientWidth / 2;
            }
          } else { b.removeAttribute('aria-current'); }
        });
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    document.querySelectorAll('.tr-sblock[id^="step-"]').forEach(function (b) { if (b.id !== 'step-whole') { S.hereWatch.observe(b); } });
  }

  /* The top: who tried what, the numbers, and how it ended, in one panel of two columns (Petar, 22 November 2026,
     third round): on the left the goal and the numbers under it; on the right the tester, where they nearly gave
     up, and their conclusive words. On a phone the two stack. */
  function tryOverview(t, going, stuckAt) {
    var name = t.persona_name;
    var head = el('section', 'tr-panel tr-over');
    head.setAttribute('aria-label', 'How the test run went');
    var h = el('h1', 'tr-h1', 'Test run ' + t.number + ': ' + name + ' on ' + (t.job_name || upper(t.subject) || 'a page of Rouh'));
    h.appendChild(el('small', '', tryName(t.round, t.mode) + ' · ' + day(t.created_at)));
    head.appendChild(h);
    var cols = el('div', 'tr-over-cols');
    var left = el('div', 'tr-over-l');
    left.appendChild(el('p', 'tr-goalq', '“' + t.goal + '”'));
    if (!going) {
      var facts = el('div', 'tr-facts');
      [[String(t.steps), plural(t.steps, 'step').replace(/^\d+ /, '')], [String(foundN(t)), 'problems found' + (t.open ? ', ' + t.open + ' not fixed' : '')],
       [minShort(t.seconds), 'time it took'], [MANAGED[t.managed] || '–', 'managed it?']].forEach(function (x) {
        var f = el('div', 'tr-fact');
        f.appendChild(el('b', '', x[0]));
        f.appendChild(el('span', '', x[1]));
        facts.appendChild(f);
      });
      var res = el('div', 'tr-fact');
      // A review has no pass or fail, and "managed it?" is said beside it: its fifth tile is its waves of fixes.
      var nw = (t.waves || []).length;
      res.appendChild(el('b', '', t.mode === 'review' ? String(nw) : (RESULT[t.state] || ['–'])[0]));
      res.appendChild(el('span', '', t.mode === 'review' ? (nw === 1 ? 'wave of fixes' : 'waves of fixes') : 'the result'));
      facts.appendChild(res);
      left.appendChild(facts);
    }
    cols.appendChild(left);
    var right = el('div', 'tr-over-r');
    var who = el('div', 'tr-who');
    var tt = testerOf(t.persona);
    who.appendChild(face(tt || { key: t.persona, name: name }, 'm', tt ? !!tt.paused : null));
    var nm = el('div');
    nm.appendChild(link(name, HOME + '/tester/' + t.persona, 'tr-a tr-strong'));
    nm.appendChild(document.createTextNode(', a made-up tester' + (tt && tt.age ? ', ' + tt.age : '') + (tt && tt.city ? ', ' + tt.city : '')));
    who.appendChild(nm);
    right.appendChild(who);
    if (t.nearly_gave_up) {
      var g = el('div', 'tr-over-gave');
      g.appendChild(el('h2', 'tr-h3', 'Where ' + name + ' nearly gave up'));
      g.appendChild(el('p', '', t.nearly_gave_up));
      if (stuckAt) {
        var j = button('tr-btn tr-btn-s tr-quiet', 'Go to step ' + stuckAt + ', where ' + name + ' was stopped');
        j.addEventListener('click', function () { toStep(stuckAt); });
        g.appendChild(j);
      }
      right.appendChild(g);
    }
    if (t.ending) {
      var q = el('figure', 'tr-over-q');
      q.appendChild(el('figcaption', 'tr-label', 'Conclusive words'));
      q.appendChild(el('blockquote', 'tr-last', '“' + t.ending + '”'));
      right.appendChild(q);
    }
    cols.appendChild(right);
    head.appendChild(cols);
    var why = t.mode === 'review' ? '' : verdictWhy(t);
    if (why) { head.appendChild(el('p', 'tr-why', why)); }
    if ((t.closed || []).length) {
      head.appendChild(said('Fixed, because ' + name + ' got past them this time',
        t.closed.map(function (c) { var f = (t.found || []).filter(function (x) { return x.number === c.number; })[0]; return (f ? inTry(f) : 'Problem ' + c.number) + ': ' + c.what; }).join('; ')));
    }
    if (going) {
      // A try going on is read again every few seconds, so its steps appear as they happen.
      clearTimeout(S.poll);
      S.poll = setTimeout(function () { if (S.root && S.root.isConnected && S.sub === String(t.number)) { load(); } }, 5000);
      var live = el('div', 'tr-banner');
      live.appendChild(el('span', 'tr-live-dot'));
      if (stuck(t)) { live.classList.add('is-stuck'); }
      live.appendChild(el('p', '', stuck(t) ? 'Stuck since ' + day(t.started_at || t.created_at) + '. A test run takes a few minutes, and this one ' +
          'never ended, so it is probably stuck. Its steps so far are below.'
        : t.state === 'queued' ? 'This test run is about to start. It takes a few minutes.'
        : name + ' is trying it now. Each step appears here as it happens.'));
      head.appendChild(live);
    } else if ((t.waves || []).some(function (x) { return x.state === 'running'; })) {
      // A wave going on is read again now and then, so it says done or failed without a reload.
      clearTimeout(S.poll);
      S.poll = setTimeout(function () { if (S.root && S.root.isConnected && S.sub === String(t.number)) { load(); } }, 30000);
    }
    if (t.state === 'broken') {
      var nr = el('div', 'tr-banner is-stuck');
      nr.appendChild(el('p', '', 'This test run could not finish, so there is no report: ' + (t.why || 'something went wrong.') + ' That is not the same as no problems.'));
      head.appendChild(nr);
    } else if (t.why && !going) { head.appendChild(el('p', 'tr-dim', t.why)); }
    return head;
  }

  /* Steps from before testers named their own are named once, by Rouh, and kept. */
  function nameSteps(t) {
    S.naming = S.naming || {};
    if (S.naming[t.number] || !(t.walk || []).some(function (s) { return !s.name; })) { return; }
    S.naming[t.number] = 1;
    call('/' + t.number + '/names', {}).then(function (j) {
      var d = S.data['try'];
      if (!d || d.trial.number !== t.number || !j || !j.names) { return; }
      d.trial.walk.forEach(function (s) { if (!s.name && j.names[s.n]) { s.name = j.names[s.n]; } });
      draw();
    }, function () { /* the screen's name stands in */ });
  }

  function stepTitle(s) { return s.name || s.title || 'Step ' + s.n; }

  /* ---- where each problem stands, and the try page's filter (Petar, 22 November 2026, fourth round) ----
     Four states: open (not decided, or chosen for the next wave, or being fixed in one), fixed, Won't fix and
     Not a problem. The filter is the status (none pressed is All) and the types hidden; it is kept in the
     address, ?status=open,fixed&hide=minor, so a reload or a shared link opens on the same view. */
  var TF_STATUS = [['open', 'Open'], ['fixed', 'Fixed'], ['wont', 'Won’t fix'], ['not', 'Not a problem']];
  function probState(f) {
    return f.verdict === 'wont_fix' ? 'wont' : f.verdict === 'not_a_problem' ? 'not' : f.standing === 'fixed' ? 'fixed' : 'open';
  }
  function stateWords(f) {
    var st = probState(f);
    if (st === 'wont') { return 'Won’t fix'; }
    if (st === 'not') { return 'Not a problem'; }
    if (st === 'fixed') {
      var w = f.fixed_by_wave || (waveOf(f) && waveOf(f).state === 'done' ? waveOf(f) : null);
      return w ? 'Fixed in Wave ' + w.number : f.closed_by ? 'Fixed: test run ' + f.closed_by + ' got past it' : 'Fixed';
    }
    var rw = runningWave(f);
    return rw ? 'Open, being fixed in Wave ' + rw.number : chosenNext(f) ? 'Open, chosen for the next wave' : 'Open, not decided yet';
  }
  /* A problem's type icon, coloured by where it stands: its type's own colour while open, green once fixed,
     the set-aside yellow when settled without a fix. The shape stays, so what went wrong is still there to read. */
  function stateShape(f, size) {
    var st = probState(f);
    var s = shape(f.how_bad, size);
    s.classList.add('is-' + st);
    var words = (BAD_SHORT[f.how_bad] || BAD_SHORT.minor) + ' · ' + inTry(f) + ' · ' + stateWords(f);
    s.title = words;
    s.setAttribute('aria-label', words);
    return s;
  }
  function tfBlank() { return { status: [], hide: [] }; }
  function tfActive() { return !!(S.tf && (S.tf.status.length || S.tf.hide.length)); }
  function tfTypeOk(f) { return !S.tf || S.tf.hide.indexOf(BAD_SHORT[f.how_bad] ? f.how_bad : 'minor') < 0; }
  function tfShows(f) { return tfTypeOk(f) && (!S.tf || !S.tf.status.length || S.tf.status.indexOf(probState(f)) >= 0); }
  function tfQuery() {
    var q = [];
    if (S.tf && S.tf.status.length) { q.push('status=' + S.tf.status.join(',')); }
    if (S.tf && S.tf.hide.length) { q.push('hide=' + S.tf.hide.join(',')); }
    return q.join('&');
  }
  function tfRead(search) {
    var tf = tfBlank();
    function list(name, ok) {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(String(search || ''));
      if (!m) { return []; }
      var raw = m[1];
      try { raw = decodeURIComponent(raw); } catch (e) { /* as it is */ }
      return raw.split(',').filter(function (x, i, all) { return ok.indexOf(x) >= 0 && all.indexOf(x) === i; });
    }
    tf.status = list('status', TF_STATUS.map(function (x) { return x[0]; }));
    tf.hide = list('hide', BAD_ORDER);
    return tf;
  }
  function tfSet(tf) { S.tf = tf; draw(); }
  /* An icon beside its own words says nothing more to a screen reader. */
  function quiet(node) { node.removeAttribute('role'); node.removeAttribute('aria-label'); node.setAttribute('aria-hidden', 'true'); return node; }
  function distinct(list) {
    var seen = {};
    return list.filter(function (f) { if (seen[f.number]) { return false; } seen[f.number] = 1; return true; });
  }

  /* The filter bar above the step map: the status, the types, and how many of the try's problems it shows. */
  function tryFilter(found) {
    var all = distinct(found);
    var bar = el('div', 'tr-tf');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Filter the problems');
    function chipB(label, on, count, fn, ic) {
      var b = button('tr-tf-c' + (on ? ' is-on' : ''), null);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (ic) { b.appendChild(ic); }
      b.appendChild(el('span', '', label));
      if (count != null) { b.appendChild(el('span', 'tr-tf-n', String(count))); }
      b.addEventListener('click', fn);
      return b;
    }
    var r1 = el('div', 'tr-tf-row');
    r1.appendChild(el('span', 'tr-tf-l', 'Status'));
    var typed = all.filter(tfTypeOk);
    r1.appendChild(chipB('All', !S.tf.status.length, typed.length, function () { tfSet({ status: [], hide: S.tf.hide.slice() }); }));
    TF_STATUS.forEach(function (x) {
      var on = S.tf.status.indexOf(x[0]) >= 0;
      var n = typed.filter(function (f) { return probState(f) === x[0]; }).length;
      r1.appendChild(chipB(x[1], on, n, function () {
        var st = S.tf.status.filter(function (y) { return y !== x[0]; });
        if (!on) { st.push(x[0]); }
        // Every status pressed is the same as All.
        if (st.length === TF_STATUS.length) { st = []; }
        tfSet({ status: TF_STATUS.map(function (y) { return y[0]; }).filter(function (y) { return st.indexOf(y) >= 0; }), hide: S.tf.hide.slice() });
      }));
    });
    bar.appendChild(r1);
    var r2 = el('div', 'tr-tf-row');
    r2.appendChild(el('span', 'tr-tf-l', 'Type'));
    BAD_ORDER.forEach(function (b) {
      var n = all.filter(function (f) { return (BAD_SHORT[f.how_bad] ? f.how_bad : 'minor') === b; }).length;
      if (!n) { return; }
      var on = S.tf.hide.indexOf(b) < 0;
      var c = chipB(BAD_SHORT[b], on, n, function () {
        var hide = on ? S.tf.hide.concat([b]) : S.tf.hide.filter(function (y) { return y !== b; });
        tfSet({ status: S.tf.status.slice(), hide: BAD_ORDER.filter(function (y) { return hide.indexOf(y) >= 0; }) });
      }, quiet(shape(b, 14)));
      c.title = (on ? 'Hide ' : 'Show ') + BAD_SHORT[b].toLowerCase() + ' problems';
      r2.appendChild(c);
    });
    bar.appendChild(r2);
    var r3 = el('p', 'tr-tf-sum');
    r3.setAttribute('aria-live', 'polite');
    r3.appendChild(el('span', '', all.filter(tfShows).length + ' of ' + plural(all.length, 'problem')));
    if (tfActive()) {
      var reset = button('tr-linkbtn tr-tf-reset', 'Reset');
      reset.addEventListener('click', function () { tfSet(tfBlank()); });
      r3.appendChild(reset);
    }
    bar.appendChild(r3);
    return bar;
  }

  /* The step map (Petar, 22 November 2026, third round): a row of miniature phone screens, each the step's own
     screenshot with its number, and under it the icon of every problem met there, all of them, wrapping as they
     need. The step where the tester was stopped has a red outline. The row scrolls sideways when it is wider than
     the page; a press goes to that step's block. */
  function stepStrip(t, walk, foundAt, stuckAt) {
    var wrap = el('div', 'tr-stripw');
    wrap.id = 'tr-stepmap';
    var strip = el('nav', 'tr-strip');
    strip.setAttribute('aria-label', 'Go to a step');
    walk.forEach(function (s) {
      var here = foundAt[s.n] || [];
      var n = here.length;
      var b = button('tr-strip-b' + (n ? ' has' : '') + (s.n === stuckAt ? ' is-stuck' : ''), null);
      b.setAttribute('aria-label', 'Go to step ' + s.n + ', ' + stepTitle(s) + ': ' + plural(n, 'problem') + (s.n === stuckAt ? ', stopped here' : ''));
      b.title = 'Step ' + s.n + ': ' + stepTitle(s);
      b.setAttribute('data-n', String(s.n));
      var ph = el('span', 'tr-mini-phone');
      if (s.shot) {
        var img = el('img');
        img.src = API + '/' + t.number + '/shot/' + s.n;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', function () { ph.classList.add('is-none'); img.remove(); });
        ph.appendChild(img);
      } else { ph.classList.add('is-none'); }
      b.appendChild(ph);
      b.appendChild(el('span', 'tr-strip-n', String(s.n)));
      if (n) {
        // Every problem met here that the filter shows, coloured by where it stands (Petar, 22 November 2026,
        // fourth round), then what is still open of the types shown, or a green tick when nothing is.
        var shown = here.filter(tfShows);
        var marks = el('span', 'tr-marks tr-strip-marks');
        shown.forEach(function (f) { marks.appendChild(stateShape(f, 11)); });
        if (shown.length) { b.appendChild(marks); }
        var open = distinct(here.filter(function (f) { return tfTypeOk(f) && probState(f) === 'open'; })).length;
        var left = el('span', 'tr-strip-open' + (open ? '' : ' is-clear'));
        if (open) { left.appendChild(el('span', '', open + ' open')); }
        else { left.appendChild(icon('check')); left.title = 'Nothing here is still open'; }
        b.appendChild(left);
        b.setAttribute('aria-label', b.getAttribute('aria-label') + ', ' + (open ? open + ' still open' : 'nothing still open'));
      }
      b.addEventListener('click', function () { toStep(s.n); });
      strip.appendChild(b);
    });
    wrap.appendChild(strip);
    return wrap;
  }

  /* Back up to the step map, with the step just read pressed-ready there. */
  function toMap(n) {
    var map = document.getElementById('tr-stepmap');
    if (!map) { return; }
    map.scrollIntoView({ block: 'start', behavior: 'smooth' });
    var b = map.querySelector('.tr-strip-b[data-n="' + n + '"]');
    if (b) {
      b.focus({ preventScroll: true });
      var strip = b.parentNode;
      if (b.offsetLeft < strip.scrollLeft || b.offsetLeft + b.offsetWidth > strip.scrollLeft + strip.clientWidth) { strip.scrollLeft = b.offsetLeft - strip.clientWidth / 2; }
    }
  }

  function toStep(n) {
    var to = document.getElementById('step-' + n);
    // A step the filter hides is shown again by resetting the filter, then gone to.
    if (!to && tfActive()) { tfSet(tfBlank()); to = document.getElementById('step-' + n); }
    if (to) { to.scrollIntoView({ block: 'start', behavior: 'smooth' }); var h = to.querySelector('h3'); if (h) { h.focus({ preventScroll: true }); } }
  }

  /* One step whole: its name, the screen and the three answers, what they saw, said and did, and the
     problems met there. With s null it is the block for the problems met at no step. */
  function stepBlock(t, s, found, isStuck, total, going) {
    var name = t.persona_name;
    var box = el('section', 'tr-sblock' + (isStuck ? ' is-stuck' : ''));
    box.id = s ? 'step-' + s.n : 'step-whole';
    var head = el('div', 'tr-sblock-head');
    var hrow = el('div', 'tr-sblock-hrow');
    var h = el('h3', 'tr-h2', s ? 'Step ' + s.n + ': ' + stepTitle(s) : 'Whole trial');
    h.tabIndex = -1;
    hrow.appendChild(h);
    var up = button('tr-btn tr-btn-s tr-quiet tr-tomap', null);
    up.appendChild(icon('up'));
    up.appendChild(el('span', 'tr-tomap-w', 'Back to steps'));
    up.setAttribute('aria-label', 'Back to steps');
    up.title = 'Back to steps';
    up.addEventListener('click', function () { toMap(s ? s.n : 0); });
    hrow.appendChild(up);
    head.appendChild(hrow);
    var meta = el('p', 'tr-sblock-meta');
    if (s) { meta.appendChild(el('span', '', (s.name && s.title ? s.title + ' · ' : '') + 'step ' + s.n + ' of ' + total)); }
    else { meta.appendChild(el('span', '', 'Problems ' + name + ' named that belong to no one step')); }
    if (isStuck) { var sw = el('span', 'tr-stuckword'); sw.appendChild(shape('blocked', 10)); sw.appendChild(el('span', '', 'Stopped here')); meta.appendChild(sw); }
    var marks = el('span', 'tr-marks');
    var shown = found.filter(tfShows);
    shown.forEach(function (x) { marks.appendChild(stateShape(x, 10)); });
    marks.appendChild(el('span', '', !found.length ? 'No problem here' : shown.length < found.length ? shown.length + ' of ' + plural(found.length, 'problem') + ' shown'
      : plural(found.length, 'problem')));
    meta.appendChild(marks);
    head.appendChild(meta);
    box.appendChild(head);
    if (s) {
      var grid = el('div', 'tr-sgrid');
      // The left column is the screenshot alone, whole and uncropped at the column's width (Petar, 22 November
      // 2026); a press still opens it larger. The three answers lead the right column, above Saw, Said and Did.
      var left = el('div', 'tr-sleft');
      if (s.shot) { left.appendChild(shot(API + '/' + t.number + '/shot/' + s.n, 'What ' + name + ' saw at step ' + s.n, 'tr-sshot')); }
      else { left.appendChild(el('p', 'tr-noshot', 'No picture was kept of this step.')); }
      grid.appendChild(left);
      var right = el('div', 'tr-sright');
      if (s.answers && (s.answers.what || s.answers.how || s.answers.then)) {
        var three = el('dl', 'tr-three');
        [['What is this?', s.answers.what], ['What do I do here?', s.answers.how], ['What happens when I do it?', s.answers.then]]
          .forEach(function (q, i) {
            var clear = !s.answers.clear || s.answers.clear[i] !== false;
            var dt = el('dt', '', q[0]);
            if (!clear) { dt.appendChild(chip('Not clear to ' + name, 'amber')); }
            three.appendChild(dt);
            three.appendChild(el('dd', '', q[1] || '–'));
          });
        right.appendChild(three);
      }
      var kv = el('dl', 'tr-kv');
      [['Saw', s.see], ['Said', s.think ? '“' + s.think + '”' : ''], ['Did', s.does]].forEach(function (x) {
        if (!x[1]) { return; }
        kv.appendChild(el('dt', '', x[0]));
        kv.appendChild(el('dd', x[0] === 'Said' ? 'tr-think' : '', x[1]));
      });
      right.appendChild(kv);
      grid.appendChild(right);
      box.appendChild(grid);
    }
    if (shown.length) { box.appendChild(stepProblems(t, s ? s.n : 0, shown, going, found.length)); }
    return box;
  }

  /* ---- the problems at one step: a navigator, and the selected one's details beside it ---- */

  function waveOf(f) { return f.wave || null; }
  /* Whether a problem is chosen for the next wave: decided, not fixed, in no running wave, and chosen again since
     a finished wave fixed it. The tick says exactly this, so it and the count on the button always agree. */
  function chosenNext(f) {
    if (f.verdict !== 'decided' || f.standing === 'fixed') { return false; }
    var w = waveOf(f);
    if (!w) { return true; }
    if (w.state === 'running') { return false; }
    if (w.state === 'done') { return (f.verdict_at || 0) > w.started_at; }
    return true;
  }
  function runningWave(f) { var w = waveOf(f); return w && w.state === 'running' ? w : null; }
  function choiceCounts(t) {
    var seen = {}, c = { distinct: 0, picked: 0, waiting: 0, inWave: 0 };
    (t.found || []).forEach(function (f) {
      if (seen[f.number]) { return; }
      seen[f.number] = 1;
      c.distinct += 1;
      if (f.awaiting_choice) { c.waiting += 1; }
      if (chosenNext(f)) { c.picked += 1; }
      if (runningWave(f)) { c.inWave += 1; }
    });
    return c;
  }
  /* The one short line under a problem's name in the navigator: its number and how often it was seen. Where it
     stands is its mark's, so the line never says it again (Petar, 22 November 2026, third round). */
  function seenLine(f) { return inTry(f) + ' · ' + (f.count > 1 ? 'seen ' + f.count + ' times' : 'seen once'); }
  function rowId(stepN, f) { return 'tr-pr-' + stepN + '-' + f.number; }

  /* A problem's mark in the navigator, which alone says where it stands (Petar, 22 November 2026, third round):
     an empty box, not decided yet; a thumbs-up, chosen to fix in the next wave (or being fixed in one now); a green
     tick, fixed, its wave and when on hover; a red X, Won't fix; an orange X, Not a problem. The box ticks it, the
     thumbs-up takes it back, the green tick chooses it again for a new wave, and an X takes the choice back. */
  function problemMark(t, stepN, f, going) {
    var id = 'tr-tick-' + stepN + '-' + f.number;
    var rw = runningWave(f);
    var kind = f.verdict === 'wont_fix' ? 'wont' : f.verdict === 'not_a_problem' ? 'not' : f.standing === 'fixed' ? 'fixed'
      : (rw || chosenNext(f)) ? 'chosen' : '';
    if (!kind) {
      var tick = el('input', 'tr-ptick');
      tick.type = 'checkbox';
      tick.id = id;
      tick.checked = false;
      tick.disabled = going || !!S.busy;
      var why = f.verdict === 'sent' ? 'Sent as feedback' : seenAgain(f) ? 'Seen again after it was fixed' : 'Not decided yet';
      tick.title = why + '. Tick to fix it in the next wave.';
      tick.setAttribute('aria-label', why + ': ' + inTry(f) + ', ' + f.what + '. Tick to fix it in the next wave.');
      tick.addEventListener('change', function () { setTick(t, stepN, f, tick.checked); });
      return tick;
    }
    var b = button('tr-pmark is-' + kind, null);
    b.id = id;
    var words, act;
    if (kind === 'wont' || kind === 'not') {
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
      words = kind === 'wont' ? 'Won’t fix' + (f.reason ? ': ' + f.reason : '') : 'Not a problem';
      act = 'Press to take it back and make it open again.';
      b.addEventListener('click', function () { decideOn(t, f, ''); });
    } else if (kind === 'fixed') {
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9.5 7.5 13.5 14.5 4.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var w = waveOf(f);
      words = f.fixed_by_wave ? fixedWords(f) : w && w.state === 'done' ? 'Wave ' + w.number + ' fixed this, ' + day(w.ended_at || w.started_at) : fixedWords(f);
      act = 'Press to choose it again for a new wave.';
      b.addEventListener('click', function () { setTick(t, stepN, f, true); });
    } else {
      b.innerHTML = ICON.thumb.replace('width="14" height="14"', 'width="19" height="19"');
      words = rw ? 'In wave ' + rw.number + ', being fixed now' : 'Chosen to fix in the next wave';
      act = rw ? '' : 'Press to take it back.';
      b.addEventListener('click', function () { setTick(t, stepN, f, false); });
    }
    b.title = words;
    b.setAttribute('aria-label', words.replace(/[.!?]$/, '') + '. ' + inTry(f) + (act ? '. ' + act : ''));
    if (kind === 'chosen' || kind === 'fixed') { b.setAttribute('aria-pressed', kind === 'chosen' ? 'true' : 'false'); }
    b.disabled = going || !!S.busy || !!rw;
    return b;
  }

  function stepProblems(t, stepN, found, going, total) {
    S.pick = S.pick || {};
    var key = t.number + ':' + stepN;
    // Each step opens on a problem still waiting for a choice, not on one already chosen or in a wave; one
    // picked and then hidden by the filter gives way to the first problem the filter shows.
    var picked = S.pick[key] ? found.filter(function (f) { return f.number === S.pick[key]; })[0] : null;
    var sel = picked || (S.pick[key] ? found[0] : null) ||
      found.filter(function (f) { return f.awaiting_choice || (!f.verdict && f.standing !== 'fixed'); })[0] || found[0];
    var wrap = el('div', 'tr-sprobs');
    wrap.appendChild(el('h4', 'tr-sprobs-h', (total && total > found.length ? found.length + ' of ' + plural(total, 'problem') : plural(found.length, 'problem')) +
      ' at ' + (stepN ? 'this step' : 'no one step')));
    var grid = el('div', 'tr-pgrid');
    var nav = el('ul', 'tr-pnav');
    nav.setAttribute('aria-label', 'Problems at ' + (stepN ? 'step ' + stepN : 'no one step'));
    found.forEach(function (f) {
      var li = el('li', 'tr-pnr' + (f === sel ? ' is-on' : '') + (f.standing === 'fixed' || f.standing === 'set_aside' ? ' is-closed' : ''));
      li.appendChild(problemMark(t, stepN, f, going));
      var b = button('tr-pnr-b', null);
      b.id = rowId(stepN, f);
      b.setAttribute('aria-pressed', f === sel ? 'true' : 'false');
      b.setAttribute('aria-controls', 'tr-pd-' + key.replace(':', '-'));
      // The type is its icon, named on hover; the second line is only its number and how often it was seen.
      var ty = el('span', 'tr-ptype');
      ty.appendChild(shape(f.how_bad, 16));
      b.appendChild(ty);
      var words = el('span', 'tr-pnr-w');
      words.appendChild(el('span', 'tr-pnr-t', f.what));
      words.appendChild(el('span', 'tr-pnr-s', seenLine(f)));
      b.appendChild(words);
      b.addEventListener('click', function () {
        S.pick[key] = f.number; S.cardDeciding = 0; draw();
        // Stacked (a phone, a narrow column), the details are under every row: bring them up to the eye.
        var pd = document.getElementById('tr-pd-' + key.replace(':', '-'));
        var row = document.getElementById(rowId(stepN, f));
        if (pd && row && pd.getBoundingClientRect().top > row.getBoundingClientRect().bottom + 40) { pd.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      });
      li.appendChild(b);
      nav.appendChild(li);
    });
    grid.appendChild(nav);
    var pd = problemDetails(t, stepN, sel, going);
    pd.id = 'tr-pd-' + key.replace(':', '-');
    grid.appendChild(pd);
    wrap.appendChild(grid);
    return wrap;
  }

  /* What the problem page has that the step above does not show (Petar, 22 November 2026, second and third
     rounds): its name; their words, what should have happened and what did; the suggested fix with the choices
     straight after it; and Discuss/Ask, which opens the problem's own chat with Rouh right underneath and folds it
     away again, leaving the panel as it was. */
  function problemDetails(t, stepN, f, going) {
    var name = t.persona_name;
    var box = el('div', 'tr-pd');
    box.setAttribute('aria-live', 'polite');
    // Only its name at the top: the type, where it stands and how often it was seen are its row's, beside it
    // (Petar, 22 November 2026, third round).
    var top = el('div', 'tr-pd-top');
    top.appendChild(el('h4', 'tr-h3 tr-pd-h', f.what));
    box.appendChild(top);
    var w = waveOf(f);
    // A wave that finished is said by the green tick's hover alone; one running or failed is said here.
    if (w && w.state !== 'done') {
      var wl = el('p', 'tr-pd-wave is-' + w.state);
      wl.appendChild(icon(w.state === 'failed' ? 'x' : 'wait'));
      wl.appendChild(el('span', '', w.state === 'running' ? 'In wave ' + w.number + ', started ' + day(w.started_at) + ': being fixed now. It can be chosen again once the wave ends.'
        : 'Wave ' + w.number + ' failed, ' + day(w.started_at) + '. Tick it to try again in a new wave.'));
      box.appendChild(wl);
    }
    if (f.quote) { box.appendChild(said(name + ' said', '“' + f.quote + '”', 'tr-think')); }
    var eh = el('div', 'tr-eh');
    if (f.expected) { var a1 = el('div'); a1.appendChild(el('h5', 'tr-label', 'What should have happened')); a1.appendChild(el('p', '', f.expected)); eh.appendChild(a1); }
    if (f.actual) { var a2 = el('div'); a2.appendChild(el('h5', 'tr-label', 'What happened')); a2.appendChild(el('p', '', f.actual)); eh.appendChild(a2); }
    if (eh.childNodes.length) { box.appendChild(eh); }
    if (f.decision && f.verdict === 'decided') { box.appendChild(said('You decided: fix it like this', f.decision, 'tr-decided')); }
    if (f.verdict === 'wont_fix') { box.appendChild(said('Won’t fix', f.reason || 'No reason written. Press Won’t fix to add one.', 'tr-wontfix')); }
    if (f.decision === f.fix && f.verdict === 'decided') { box.appendChild(el('p', 'tr-dim', 'That is the suggested fix, as Rouh wrote it.')); }
    if (f.fix && !(f.verdict === 'decided' && f.decision === f.fix)) { box.appendChild(said(f.decision && f.verdict === 'decided' ? 'Rouh’s first suggestion' : 'Suggested fix', f.fix)); }
    if (!going && f.standing !== 'fixed') { box.appendChild(choices(t, stepN, f)); }
    box.appendChild(discuss(t, f));
    return box;
  }

  /* Discuss/Ask: a toggle that opens the problem's own talk with Rouh inline, the same thread its page has, so
     nothing said before is lost; Close folds it away. */
  function discuss(t, f) {
    S.talkOpen = S.talkOpen || {};
    var open = !!S.talkOpen[f.number];
    var talk = el('div', 'tr-pd-talk' + (open ? ' is-open' : ''));
    var tid = 'tr-talk-' + f.number;
    var tog = button('tr-linkbtn tr-discuss', open ? 'Close Discuss/Ask' : 'Discuss/Ask');
    tog.id = 'tr-discuss-' + f.number;
    tog.setAttribute('aria-expanded', open ? 'true' : 'false');
    tog.setAttribute('aria-controls', tid);
    if (!open && f.notes) { tog.appendChild(el('span', 'tr-dim', ' · ' + plural(f.notes, 'message'))); }
    function shut() { S.talkOpen[f.number] = 0; draw(); var back = document.getElementById(tog.id); if (back) { back.focus({ preventScroll: true }); } }
    tog.addEventListener('click', function () {
      if (open) { shut(); return; }
      S.talkOpen[f.number] = 1; draw();
      var area = document.getElementById('tr-say-' + f.number);
      if (area) { area.focus({ preventScroll: true }); }
    });
    talk.appendChild(tog);
    if (!open) { return talk; }
    var body = el('div', 'tr-pd-chat');
    body.id = tid;
    var p = (S.pcache && S.pcache[f.number]) || null;
    if (p) {
      body.appendChild(thread(p, function (got) { keepProblem(t, got); }, { title: 'Discuss/Ask', close: shut }));
    } else {
      S.pload = S.pload || {};
      if (!S.pload[f.number]) {
        S.pload[f.number] = 1;
        call('/problems/' + f.number).then(function (j) {
          S.pcache = S.pcache || {}; S.pcache[f.number] = j.problem; S.pload[f.number] = 0; draw();
          var area = document.getElementById('tr-say-' + f.number);
          if (area) { area.focus({ preventScroll: true }); }
        }, function (e) { S.pload[f.number] = 0; S.talkOpen[f.number] = 0; fail(e); });
      }
      body.appendChild(el('p', 'tr-loading', 'Opening the talk with Rouh…'));
    }
    talk.appendChild(body);
    return talk;
  }

  /* The choices, the same as on the problem page, and Take it back, straight after the suggested fix. */
  function choices(t, stepN, f) {
    var wrap = el('div', 'tr-pd-choose');
    var rw = runningWave(f);
    var row = el('div', 'tr-actions');
    function act(text, cls, fn, what, on) {
      var b = button('tr-btn tr-btn-s' + (cls ? ' ' + cls : ''), text);
      b.disabled = !!S.busy || !!rw;
      b.title = what;
      if (on) { b.setAttribute('aria-pressed', 'true'); }
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    }
    if (f.fix) {
      act('Use this fix', '', function () { decideOn(t, f, 'decided', f.fix); },
        'Fix it the way suggested: ' + f.fix, f.verdict === 'decided' && f.decision === f.fix && chosenNext(f));
    }
    var own = f.verdict === 'decided' && f.decision && f.decision !== f.fix;
    act('Describe Solution', '', function () { S.cardDeciding = stepN + ':' + f.number; draw(); },
      own ? 'Change the way you wrote to fix it' : 'Write your own way to fix it', own);
    act('Not a problem', '', function () { decideOn(t, f, 'not_a_problem'); }, 'The tester was wrong: it is fine as it is.', f.verdict === 'not_a_problem');
    // Won't fix asks why, the same way Describe Solution asks how: the reason is kept for reading later why
    // problems were declined (Petar, 22 November 2026). It can be left empty, and changed by pressing it again.
    act('Won’t fix', '', function () { S.cardDeciding = 'wf:' + stepN + ':' + f.number; draw(); },
      f.verdict === 'wont_fix' ? 'Change why it won’t be fixed' : 'It is real, but not worth changing: say why', f.verdict === 'wont_fix');
    if (f.verdict) { act('Take it back', 'tr-quiet', function () { decideOn(t, f, ''); }, 'Undo your choice: it is open again.'); }
    wrap.appendChild(row);
    if (S.cardDeciding === 'wf:' + stepN + ':' + f.number) { wrap.appendChild(wontFixForm(f, 'tr-why-' + stepN + '-' + f.number, function (why) { decideOn(t, f, 'wont_fix', '', why); })); }
    if (S.cardDeciding === stepN + ':' + f.number) {
      var form = el('form', 'tr-form');
      // Empty to start with: the suggested fix is above it, and only the person's own words go here.
      var how = field(form, 'Describe the solution', 'textarea', own ? f.decision : '', 'tr-how-' + stepN + '-' + f.number);
      how.rows = 3;
      how.placeholder = 'How should it be fixed?';
      var r2 = el('div', 'tr-actions');
      var save = button('tr-btn tr-btn-s tr-primary', 'Save');
      save.type = 'submit';
      var cancel = button('tr-btn tr-btn-s', 'Cancel');
      cancel.addEventListener('click', function () { S.cardDeciding = 0; draw(); });
      r2.appendChild(save);
      r2.appendChild(cancel);
      form.appendChild(r2);
      form.addEventListener('submit', function (e) { e.preventDefault(); if (how.value.trim()) { decideOn(t, f, 'decided', how.value); } else { how.focus(); } });
      wrap.appendChild(form);
      setTimeout(function () { how.focus(); }, 0);
    }
    if (rw) { wrap.appendChild(el('p', 'tr-dim', 'It is in wave ' + rw.number + ' now, so it cannot be changed until that wave ends.')); }
    return wrap;
  }

  /* Why it won't be fixed: a box like Describe Solution's, with the reason written before in it to change. */
  function wontFixForm(f, id, save) {
    var form = el('form', 'tr-form');
    var why = field(form, 'Why won’t it be fixed?', 'textarea', f.verdict === 'wont_fix' ? f.reason || '' : '', id);
    why.rows = 3;
    why.placeholder = 'For example: it only happens to a first-time visitor, and the guide already explains it.';
    var r2 = el('div', 'tr-actions');
    var ok = button('tr-btn tr-btn-s tr-primary', 'Save won’t fix');
    ok.type = 'submit';
    var cancel = button('tr-btn tr-btn-s', 'Cancel');
    cancel.addEventListener('click', function () { S.cardDeciding = 0; S.wontFixing = false; draw(); });
    r2.appendChild(ok);
    r2.appendChild(cancel);
    form.appendChild(r2);
    form.appendChild(el('p', 'tr-dim', 'The reason is kept with the choice, so later you can see why problems were set aside. It can be left empty.'));
    form.addEventListener('submit', function (e) { e.preventDefault(); save(why.value.trim()); });
    setTimeout(function () { why.focus(); }, 0);
    return form;
  }

  /* The tick: on is Use this fix (or your own way, kept); off takes the choice back, with Undo. */
  function setTick(t, stepN, f, on) {
    S.ownFix = S.ownFix || {};
    if (on) {
      if (f.verdict === 'decided' && f.decision) { decideOn(t, f, 'decided', f.decision); return; }
      // Their own way, written before and unticked since, comes back with the tick.
      if (S.ownFix[f.number]) { decideOn(t, f, 'decided', S.ownFix[f.number]); return; }
      if (f.fix) { decideOn(t, f, 'decided', f.fix); return; }
      // No suggested fix to use: say how, right here.
      S.pick = S.pick || {}; S.pick[t.number + ':' + stepN] = f.number; S.cardDeciding = stepN + ':' + f.number; draw();
      return;
    }
    if (f.verdict === 'decided' && f.decision && f.decision !== f.fix) { S.ownFix[f.number] = f.decision; }
    decideOn(t, f, '');
  }

  function decideOn(t, f, v, decision, reason) {
    var before = { verdict: f.verdict || '', decision: f.decision || '', reason: f.reason || '' };
    S.busy = 'verdict'; draw();
    call('/problems/' + f.number + '/verdict', { verdict: v, decision: decision || '', reason: reason || '' }).then(function (got) {
      S.busy = ''; S.cardDeciding = 0;
      keepProblem(t, got.problem);
      if (S.shell) { loadShell().catch(function () {}); }
      draw();
      var msg = v === '' ? 'Taken back: ' + inTry(f) + ' is open again.' : v === 'decided' ? inTry(f) + ' chosen to fix. It is fixed when you press Fix the ones I chose.'
        : 'Saved for ' + inTry(f) + ': ' + (VERDICT_LINE[v] || v) + (v === 'wont_fix' && reason ? ', because ' + reason : '') + '.';
      toast(msg, function () { decideOn(t, Object.assign({}, f, got.problem), before.verdict, before.decision, before.reason); });
    }, fail);
  }

  /* A problem as Rouh now has it, put into every place on the page that shows it. */
  function keepProblem(t, p) {
    if (!p) { return; }
    S.pcache = S.pcache || {};
    S.pcache[p.number] = p;
    (t.found || []).forEach(function (f) {
      if (f.number !== p.number) { return; }
      ['verdict', 'verdict_name', 'decision', 'reason', 'standing', 'status', 'awaiting_choice', 'verdict_at', 'notes', 'fix', 'expected', 'actual', 'fixed_by_wave', 'count']
        .forEach(function (k) { if (k in p) { f[k] = p[k]; } });
    });
  }

  /* ---- waves of fixes ---- */

  function waveList(t) {
    var box = section('tr-waves', 'Waves of fixes', 'tr-waves-sec');
    var byN = {};
    (t.found || []).forEach(function (f) { if (!byN[f.number]) { byN[f.number] = f; } });
    var ul = el('ul', 'tr-wlist');
    (t.waves || []).slice().reverse().forEach(function (w) {
      var li = el('li', 'tr-wave is-' + w.state);
      var det = el('details');
      if (S.waveOpen && S.waveOpen[w.number]) { det.open = true; }
      det.addEventListener('toggle', function () { S.waveOpen = S.waveOpen || {}; S.waveOpen[w.number] = det.open; });
      var sm = el('summary');
      sm.appendChild(icon(w.state === 'done' ? 'check' : w.state === 'failed' ? 'x' : 'wait'));
      sm.appendChild(el('span', 'tr-wave-t', 'Wave ' + w.number + ' · ' + dayShort(w.started_at) + ' · ' + plural(w.problems.length, 'fix', 'fixes')));
      sm.appendChild(el('span', 'tr-wave-st', { running: 'running', done: 'done', failed: 'failed' }[w.state] || w.state));
      det.appendChild(sm);
      var body = el('div', 'tr-wave-body');
      body.appendChild(el('p', 'tr-dim', 'Started ' + day(w.started_at) + (w.ended_at ? ', ended ' + day(w.ended_at) : '') + '.'));
      if (w.said) { body.appendChild(said(w.state === 'failed' ? 'What went wrong' : 'What its run said it changed', w.said)); }
      else if (w.state === 'running') { body.appendChild(el('p', 'tr-dim', 'Its run is fixing them now. This says done or failed when it ends.')); }
      var pl = el('ul', 'tr-mini');
      w.problems.forEach(function (n) {
        var f = byN[n];
        var li2 = el('li');
        var a = link('', HOME + '/problem/' + n);
        if (f) { a.appendChild(shape(f.how_bad, 12)); }
        var ww = el('span');
        ww.appendChild(el('span', '', f ? f.what : 'Problem ' + n));
        ww.appendChild(el('span', 'tr-dim', ' · ' + (f ? inTry(f) : 'Problem ' + n) + (w.decisions && w.decisions[String(n)] ? ' · fix: ' + w.decisions[String(n)] : '')));
        a.appendChild(ww);
        li2.appendChild(a);
        pl.appendChild(li2);
      });
      body.appendChild(pl);
      if (w.run_id) { body.appendChild(link('Open its run', '/run/' + w.run_id, 'tr-btn tr-btn-s tr-outline')); }
      det.appendChild(body);
      li.appendChild(det);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  /* The bar that stays at the bottom of the page: how many are chosen, and the one button that sends them. */
  function fixBar(t) {
    var c = choiceCounts(t);
    var bar = el('section', 'tr-fixbar');
    bar.setAttribute('aria-label', 'Fix what you chose');
    bar.appendChild(el('p', 'tr-fixbar-words', c.picked ? plural(c.picked, 'problem') + ' chosen' + (c.waiting ? ', ' + c.waiting + ' waiting for your choice' : '') +
      (c.inWave ? ' · ' + c.inWave + ' being fixed in a wave' : '') : c.inWave ? c.inWave + ' being fixed in a wave. Tick more to start another.' : 'Tick the problems you want fixed.'));
    var go2 = button('tr-btn tr-primary', S.busy === 'fix' ? 'Starting the wave…' : c.picked === 1 ? 'Fix the one I chose' : c.picked ? 'Fix the ' + c.picked + ' I chose' : c.inWave ? 'Tick to fix more · ' + c.inWave + ' in a wave' : 'Tick problems to fix them');
    go2.disabled = !c.picked || !!S.busy;
    if (!c.picked) { go2.title = 'Tick a problem, or press Use this fix on one, first'; }
    go2.addEventListener('click', function () {
      S.busy = 'fix'; draw();
      call('/' + t.number + '/fix', {}).then(function (j) { S.busy = ''; S.said = j.said; S.waveOpen = S.waveOpen || {}; if (j.wave) { S.waveOpen[j.wave] = true; } load(); },
        // A wave that could not start is written down as failed: read the try again so it shows, with the reason above.
        function (e) { var why = String((e && e.message) || e); load().then(function () { S.busy = ''; S.error = why; draw(); }); });
    });
    bar.appendChild(go2);
    return bar;
  }

  /* Whether they managed it, said so it never reads against Passed or Did not pass (trials 17 and 21). */
  function tryLine(t) {
    if (t.state === 'failed' && t.managed === 'yes') { return 'Managed it, but problems got in the way'; }
    return { yes: 'Managed it', partly: 'Partly managed it', no: 'Did not manage it' }[t.managed] || '';
  }

  /* Why a try passed or not, in a line: "Managed it" and "Did not pass" side by side read as a contradiction
     to Vesela (trial 17) when nothing said that a problem that stopped or confused her fails it. */
  function verdictWhy(t) {
    var bad = (t.found || []).filter(function (f) {
      return (f.how_bad === 'blocked' || f.how_bad === 'confused') && f.standing !== 'set_aside';
    }).length;
    var who = t.persona_name;
    if (t.state === 'passed') { return who + ' managed it, and nothing stopped or confused them.'; }
    if (t.state !== 'failed') { return ''; }
    if (t.managed === 'yes' && bad) { return who + ' managed it, but ' + plural(bad, 'problem') + ' stopped or confused them, so it did not pass.'; }
    if (t.managed === 'partly') { return who + ' only partly managed it.'; }
    if (t.managed === 'no') { return who + ' did not manage it.'; }
    return t.why || '';
  }

  /* ---- the Fix list: the problems, every job ---- */

  var STATUS_TABS = [['open', 'Needs your decision', 'open'], ['awaiting', 'Waiting for your choice', ''],
                     ['decided', 'Chosen to fix', 'decided'], ['again', 'Seen again', ''], ['fixed', 'Fixed', 'fixed'],
                     ['set_aside', 'Set aside', 'set_aside'], ['all', 'All', '*']];

  function drawProblems(root) {
    var d = S.data.problems;
    moved('');
    if (d && d.counts && !d.counts.open && !d.counts.closed && !(d.counts.by && (d.counts.by.set_aside || d.counts.by.decided))) {
      root.appendChild(el('h1', 'tr-headline', 'Nothing to fix.'));
      root.appendChild(el('p', 'tr-empty', d.counts.trials ? 'No problems found yet: every test run so far went without one.'
        : 'Nothing has been tried yet, so no problems have been found.'));
      return;
    }
    var f = S.probFilter, v = S.probView;
    if (!d) {
      root.appendChild(el('h1', 'tr-headline', 'The Fix list'));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the problems…')); }
      return;
    }
    if (f.status === 'again') { d = Object.assign({}, d, { problems: d.problems.filter(seenAgain) }); }
    else if (f.status === 'decided') { d = Object.assign({}, d, { problems: d.problems.filter(function (p) { return !seenAgain(p); }) }); }
    var list = d.problems.filter(function (p) {
      return (v.screen == null || (p.screen || '') === v.screen) && (!v.bad || p.how_bad === v.bad);
    });
    var by = (d.counts && d.counts.by) || {};
    var worst = d.problems[0];
    var tab = STATUS_TABS.filter(function (x) { return x[0] === f.status; })[0] || STATUS_TABS[0];
    root.appendChild(el('h1', 'tr-headline tr-hl-fix', !d.problems.length ? (f.status === 'open' ? 'Nothing is waiting for your decision.' : 'No problems here.')
      : f.status === 'open' ? plural(d.problems.length, 'problem needs', 'problems need') + ' your decision. The worst is “' + worst.what + '”, seen ' +
        (worst.count === 1 ? 'once' : worst.count + ' times') + (worst.screen_name ? ' on ' + worst.screen_name : '') + '.'
      : plural(d.problems.length, 'problem') + ': ' + tab[1].toLowerCase() + '.'));
    var who = foundLine(d.testers);
    root.appendChild(el('p', 'tr-lede', 'Worst first means how bad it was first (couldn’t continue, then confused, then annoyed, then small), ' +
      'then how often it was seen.' + (who ? ' ' + who : '')));

    var grid = el('div', 'tr-fixgrid');
    // Where they are: each page against how bad, a count in each cell, and pressing one shows only those.
    var mx = el('section', 'tr-mxsec');
    mx.appendChild(el('h2', 'tr-h2', 'Where they are'));
    var pages = {}, porder = [];
    d.problems.forEach(function (p) {
      var k = p.screen || '';
      if (!pages[k]) { pages[k] = { name: p.screen_name || 'Somewhere in Rouh', n: {}, all: 0 }; porder.push(k); }
      pages[k].n[p.how_bad] = (pages[k].n[p.how_bad] || 0) + 1;
      pages[k].all += 1;
    });
    porder.sort(function (a, b) { return pages[b].all - pages[a].all; });
    // Pages that share a name (the Guide and its lessons) are told apart by their address (Petar, 22 November 2026).
    var named = {};
    porder.forEach(function (k) { named[pages[k].name] = (named[pages[k].name] || 0) + 1; });
    porder.forEach(function (k) { pages[k].label = named[pages[k].name] > 1 ? pages[k].name + ' ' + (k || '/') : pages[k].name; });
    var m = el('div', 'tr-matrix');
    m.setAttribute('role', 'table');
    m.setAttribute('aria-label', 'Problems by page and how bad');
    var hrow = el('div', 'tr-mx-row tr-mx-h');
    hrow.setAttribute('role', 'row');
    hrow.appendChild(el('span', '', 'Page'));
    // Each type by its icon, its name on hover and for a screen reader: the words did not fit the narrow columns.
    BAD_ORDER.forEach(function (b) { var c = el('span'); c.title = BAD_SHORT[b]; c.appendChild(quiet(shape(b, 14))); c.appendChild(el('span', 'tr-sr', BAD_SHORT[b])); hrow.appendChild(c); });
    hrow.appendChild(el('span', '', 'All'));
    m.appendChild(hrow);
    var most = 1;
    porder.forEach(function (k) { BAD_ORDER.forEach(function (b) { most = Math.max(most, pages[k].n[b] || 0); }); });
    porder.forEach(function (k) {
      var r = el('div', 'tr-mx-row');
      r.setAttribute('role', 'row');
      var pg = button('tr-mx-pg', pages[k].name);
      if (named[pages[k].name] > 1) { pg.appendChild(el('span', 'tr-ppath', slashBreaks(k || '/'))); }
      pg.setAttribute('aria-pressed', v.screen === k && !v.bad ? 'true' : 'false');
      pg.addEventListener('click', function () { setView(v.screen === k && !v.bad ? null : k, ''); });
      r.appendChild(pg);
      BAD_ORDER.forEach(function (b) {
        var n = pages[k].n[b] || 0;
        if (!n) { r.appendChild(el('span', 'tr-mx-zero', '0')); return; }
        var c = button('tr-mx-cell', null);
        var sq = el('span', 'tr-mx-sq');
        var s = Math.round(6 + n / most * 12);
        sq.style.width = s + 'px'; sq.style.height = s + 'px'; sq.style.background = 'var(--s-' + b + ')';
        c.appendChild(sq);
        c.appendChild(el('span', '', String(n)));
        c.setAttribute('aria-label', pages[k].label + ', ' + BAD_SHORT[b].toLowerCase() + ': ' + n + '. Show only these.');
        c.setAttribute('aria-pressed', v.screen === k && v.bad === b ? 'true' : 'false');
        c.addEventListener('click', function () { setView(v.screen === k && v.bad === b ? null : k, v.screen === k && v.bad === b ? '' : b); });
        r.appendChild(c);
      });
      r.appendChild(el('b', 'tr-mx-all', String(pages[k].all)));
      m.appendChild(r);
    });
    if (porder.length) { mx.appendChild(m); } else { mx.appendChild(el('p', 'tr-dim', 'No problems in this view.')); }
    grid.appendChild(mx);

    var right = el('section', 'tr-worst');
    var rh = el('div', 'tr-sec-head');
    rh.appendChild(el('h2', 'tr-h2', 'Worst first'));
    var grp = button('tr-btn tr-btn-s', v.group ? 'One list' : 'Group by page');
    grp.setAttribute('aria-pressed', v.group ? 'true' : 'false');
    grp.addEventListener('click', function () { S.probView.group = !S.probView.group; draw(); });
    rh.appendChild(grp);
    right.appendChild(rh);
    var tabs = el('div', 'tr-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Where they stand');
    STATUS_TABS.forEach(function (x) {
      var b = button('tr-tab', null);
      b.appendChild(el('span', '', x[1]));
      var n = x[2] === '*' ? (by.open || 0) + (by.decided || 0) + (by.fixed || 0) + (by.set_aside || 0)
        : x[0] === 'awaiting' && S.all ? S.all.filter(function (p) { return p.awaiting_choice; }).length
        : x[0] === 'decided' && S.all ? (by.decided || 0) - againN() : x[0] === 'again' && S.all ? againN() : x[2] ? by[x[2]] : null;
      if (n != null) { b.appendChild(el('b', '', String(n))); }
      b.setAttribute('aria-pressed', f.status === x[0] ? 'true' : 'false');
      b.addEventListener('click', function () { S.probFilter.status = x[0]; S.probView = { screen: null, bad: '', group: v.group, all: false }; reloadProblems(); });
      tabs.appendChild(b);
    });
    right.appendChild(tabs);
    right.appendChild(el('p', 'tr-rule', RULE));
    var bar = el('div', 'tr-filters');
    var people = [['', 'Everyone']];
    (d.testers || []).forEach(function (p) { people.push([p.key, p.first + (p.archived ? ' (removed)' : '')]); });
    people.push(['owner', 'You']);
    bar.appendChild(choose('Found by', f.who, people, function (x) { S.probFilter.who = x; reloadProblems(); }));
    var jobs = [['', 'Every journey']];
    (d.jobs || []).forEach(function (j) { jobs.push([String(j.number), j.name]); });
    bar.appendChild(choose('Journey', f.job, jobs, function (x) { S.probFilter.job = x; reloadProblems(); }));
    right.appendChild(bar);
    if (v.screen != null || v.bad) {
      var on = el('div', 'tr-showing');
      on.appendChild(el('span', '', 'Showing only: ' + [v.screen != null ? (pages[v.screen] ? pages[v.screen].label : 'that page') : '', v.bad ? BAD_SHORT[v.bad].toLowerCase() : '']
        .filter(Boolean).join(', ') + ' (' + list.length + ')'));
      var clr = button('tr-btn tr-btn-s', 'Show every page');
      clr.addEventListener('click', function () { setView(null, ''); });
      on.appendChild(clr);
      right.appendChild(on);
    }
    if (!list.length) {
      right.appendChild(el('p', 'tr-empty', f.status === 'open' ? 'Nothing is waiting to be fixed.' : 'No problems here.'));
    } else if (v.group) {
      var groups = {}, gorder = [];
      list.forEach(function (p) { var k = p.screen_name || 'Somewhere in Rouh'; if (!groups[k]) { groups[k] = []; gorder.push(k); } groups[k].push(p); });
      gorder.forEach(function (k) {
        right.appendChild(el('h3', 'tr-h3 tr-group-h', k + ' (' + groups[k].length + ')'));
        right.appendChild(problemRows(groups[k], d, false));
      });
    } else {
      right.appendChild(problemRows(list, d, true));
    }
    grid.appendChild(right);
    root.appendChild(grid);
  }

  function setView(screen, bad) { S.probView.screen = screen; S.probView.bad = bad; S.probView.all = false; draw(); }
  function reloadProblems() { var seq = ++S.seq; draw(); Promise.all([loadProblems(seq), loadAll()]).then(function () { if (seq === S.seq) { draw(); } }, fail); }

  function problemRows(list, d, cut) {
    var show = cut && !S.probView.all ? list.slice(0, 40) : list;
    var ul = el('ul', 'tr-plist');
    show.forEach(function (p) {
      var li = el('li', 'tr-prow' + (p.standing === 'fixed' || p.standing === 'set_aside' ? ' tr-closed' : ''));
      li.appendChild(sev(p.how_bad));
      var mid = el('div', 'tr-prow-mid');
      mid.appendChild(link(p.what, HOME + '/problem/' + p.number, 'tr-prow-title'));
      var meta = el('div', 'tr-prow-meta');
      meta.appendChild(el('span', 'tr-strong', numLabel(p)));
      meta.appendChild(el('span', '', p.screen_name || 'Somewhere in Rouh'));
      meta.appendChild(el('span', '', p.count === 1 ? 'Seen once' : 'Seen ' + p.count + ' times'));
      if (p.source === 'owner') { meta.appendChild(el('span', '', 'Found by you')); }
      else {
        var w = el('span', 'tr-prow-who');
        (p.personas || []).forEach(function (k) {
          var t = (d.testers || []).filter(function (x) { return x.key === k; })[0];
          w.appendChild(face(t || { key: k, name: upper(k) }, 'xs'));
        });
        w.appendChild(el('span', '', names(p.personas, d.testers)));
        meta.appendChild(w);
      }
      if ((p.jobs || []).length) { meta.appendChild(el('span', '', p.jobs.map(function (j) { return j.name; }).join(', '))); }
      if (p.notes) { meta.appendChild(el('span', '', plural(p.notes, 'message'))); }
      mid.appendChild(meta);
      li.appendChild(mid);
      li.appendChild(standBadge(p));
      if (p.standing === 'open') {
        var act = el('div', 'tr-prow-act');
        var fb = button('tr-btn tr-btn-s', 'Send as feedback');
        fb.disabled = !!S.busy;
        fb.addEventListener('click', function () { toFeedback(p, false); });
        act.appendChild(fb);
        li.appendChild(act);
      }
      ul.appendChild(li);
    });
    if (show.length < list.length) {
      var more = el('li', 'tr-more');
      more.appendChild(el('span', '', 'and ' + (list.length - show.length) + ' more'));
      var b = button('tr-btn tr-btn-s', 'Show all ' + list.length);
      b.addEventListener('click', function () { S.probView.all = true; draw(); });
      more.appendChild(b);
      ul.appendChild(more);
    }
    return ul;
  }

  function names(keys, testers) {
    return (keys || []).map(function (k) {
      var t = (testers || []).filter(function (x) { return x.key === k; })[0];
      return t ? t.first : upper(k);
    }).join(' and ') || 'a tester';
  }

  /* ---- one problem, and its discussion ---- */

  function drawProblem(root, w) {
    var d = S.data.problem;
    if (!d || String(d.problem.number) !== w.n) {
      root.appendChild(crumbs([['Fix list', HOME + '/problems'], ['Problem ' + w.n]]));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the problem…')); }
      return;
    }
    var p = d.problem;
    moved(numLabel(p, S.ctxTrial) + ' · ' + p.what);
    var label = numLabel(p, S.ctxTrial);
    root.appendChild(crumbs([['Fix list', HOME + '/problems'], [(p.screen_name || 'Somewhere in Rouh') + ': ' + label]]));
    root.appendChild(el('h1', 'tr-h1 tr-ph', p.what));
    var meta = el('div', 'tr-pmeta');
    meta.appendChild(sev(p.how_bad, true));
    meta.appendChild(el('span', '', (p.count === 1 ? 'Seen once' : 'Seen ' + p.count + ' times') +
      (p.source === 'owner' ? ', found by you' : (p.personas || []).length ? ' by ' + names(p.personas, (S.shell && S.shell.testers) || []) : '')));
    meta.appendChild(standBadge(p));
    meta.appendChild(el('span', 'tr-dim', label));
    root.appendChild(meta);
    // On a phone the decisions sit here, under the title: a bar at the bottom would cover Rouh's own menu button.
    root.appendChild(decide(p, 'inline'));
    if (p.status === 'closed') {
      root.appendChild(el('p', 'tr-good', 'Fixed on ' + date(p.closed_at) + (p.closed_by ? ': test run ' + p.closed_by +
        ' went past this screen without tripping on it.' : '.')));
    }

    var focus = el('div', 'tr-focus');
    var story = el('div', 'tr-story');
    var sights = p.sightings || [];
    var latest = sights[0];
    if (latest && latest.quote) {
      story.appendChild(el('p', 'tr-quote', latest.quote));
      var by = el('p', 'tr-dim');
      by.appendChild(document.createTextNode((latest.source === 'owner' ? 'You' : latest.persona_name) + ', ' + day(latest.at)));
      if (latest.trial) { by.appendChild(document.createTextNode(' · ')); by.appendChild(link('test run ' + latest.trial + ', step ' + latest.step, HOME + '/' + latest.trial)); }
      story.appendChild(by);
    }
    var withShot = sights.filter(function (s) { return s.trial && s.shot; })[0];
    if (withShot) {
      var whereB = el('section', 'tr-panel tr-where');
      var wh = el('div', 'tr-sec-head');
      wh.appendChild(el('h2', 'tr-h3', 'Where it happened: test run ' + withShot.trial + ', step ' + withShot.step));
      var open = link('Open the test run', HOME + '/' + withShot.trial, 'tr-a');
      open.addEventListener('click', function () { S.step[withShot.trial] = withShot.step; }, true);
      wh.appendChild(open);
      whereB.appendChild(wh);
      if (withShot.job_name) { whereB.appendChild(el('p', 'tr-dim', withShot.job_name + ' · ' + withShot.persona_name)); }
      whereB.appendChild(shot(API + '/' + withShot.trial + '/shot/' + withShot.step, 'The screen when ' + withShot.persona_name + ' ran into it', 'tr-where-shot'));
      story.appendChild(whereB);
    }
    var eh = el('div', 'tr-eh');
    if (p.expected) { var a1 = el('div'); a1.appendChild(el('h3', 'tr-h3', 'What should have happened')); a1.appendChild(el('p', '', p.expected)); eh.appendChild(a1); }
    if (p.actual) { var a2 = el('div'); a2.appendChild(el('h3', 'tr-h3', 'What happened')); a2.appendChild(el('p', '', p.actual)); eh.appendChild(a2); }
    if (eh.childNodes.length) { story.appendChild(eh); }
    if (p.decision || p.fix) {
      var fx = el('section', 'tr-panel');
      if (p.decision) { fx.appendChild(el('h2', 'tr-h3', 'You decided: fix it like this')); fx.appendChild(el('p', 'tr-decided', p.decision)); }
      if (p.fix) { fx.appendChild(el('h2', 'tr-h3', p.decision ? 'Rouh’s first suggestion' : 'Suggested fix')); fx.appendChild(el('p', '', p.fix)); }
      story.appendChild(fx);
    }
    if (p.verdict === 'wont_fix') {
      var wfx = el('section', 'tr-panel');
      wfx.appendChild(el('h2', 'tr-h3', 'Won’t fix'));
      wfx.appendChild(el('p', p.reason ? '' : 'tr-dim', p.reason || 'No reason written. Press Change why it won’t be fixed to add one.'));
      story.appendChild(wfx);
    }
    if (!p.expected && !p.actual && !p.fix && !p.decision) {
      story.appendChild(el('p', 'tr-dim', 'This problem was found before testers said what they expected, so only their words are kept.'));
    }
    var pc = el('section', 'tr-panel');
    pc.appendChild(el('h2', 'tr-h3', 'How far it is from fixed'));
    pc.appendChild(chain(p));
    pc.appendChild(el('p', 'tr-rule', RULE));
    story.appendChild(pc);
    // Each choice with one line on what it does: in a row, five buttons sounded the same to Vesela (trial 21).
    var what = section('', 'What each choice does');
    var dl = el('dl', 'tr-choices');
    [['Fix it like this…', 'You say how it should be fixed. The next round of fixes does it your way.'],
     ['Send as feedback', 'Sends it now, with its picture, to Rouh’s list of changes to make to itself.'],
     ['Edit before sending', 'The same, but you can change the words first, then send.'],
     ['Not a problem', 'The tester was wrong: it is fine as it is.'],
     ['Won’t fix', 'It is real, but not worth changing. You say why, and the reason is kept with the choice.'],
     ['Take it back', 'Undo your choice: it is open again. Every choice also has Undo on the message that appears.']]
      .forEach(function (x) { dl.appendChild(el('dt', '', x[0])); dl.appendChild(el('dd', '', x[1])); });
    what.appendChild(dl);
    what.appendChild(el('p', 'tr-dim', 'After Not a problem or Won’t fix, a tester who runs into it again no longer counts against the change.'));
    story.appendChild(what);

    var seen = section('', 'Every time it was seen');
    var ul = el('ul', 'tr-sights');
    sights.forEach(function (s) {
      var li = el('li', 'tr-sight');
      if (s.shot && s.trial) { li.appendChild(shot(API + '/' + s.trial + '/shot/' + s.step, 'The screen at that moment', 'tr-thumb')); }
      var ww = el('div', 'tr-sight-words');
      ww.appendChild(el('p', 'tr-think', '“' + s.quote + '”'));
      var from = el('p', 'tr-dim');
      from.appendChild(document.createTextNode((s.source === 'owner' ? 'You said this' : s.persona_name) + ', ' + day(s.at)));
      if (s.trial) {
        from.appendChild(document.createTextNode(' · '));
        from.appendChild(link((s.job_name ? s.job_name + ', ' : '') + 'test run ' + s.trial + ', step ' + s.step, HOME + '/' + s.trial));
      }
      ww.appendChild(from);
      li.appendChild(ww);
      ul.appendChild(li);
    });
    seen.appendChild(ul);
    story.appendChild(seen);
    focus.appendChild(story);
    focus.appendChild(thread(p, function (got) { S.data.problem.problem = got; }));
    root.appendChild(focus);
    root.appendChild(decide(p, 'bar'));
  }

  /* What to do with it, in a bar that stays at the bottom: decide how it is fixed, send it as feedback,
     or set it aside (Teodora's two buttons and the owner's three). Every choice can be undone. */
  function decide(p, kind) {
    var box = el('section', 'tr-decbar is-' + kind);
    box.setAttribute('aria-label', 'What should happen with it?');
    if (S.wontFixing) {
      // In both places, as Fix it like this is: a phone shows the one under the title, a desk the bar at the bottom.
      box.appendChild(wontFixForm(p, 'tr-why-' + kind, function (why) { S.wontFixing = false; verdict(p, 'wont_fix', '', false, why); }));
      return box;
    }
    if (S.deciding) {
      var f = el('form', 'tr-form tr-decform');
      var how = field(f, 'Fix it like this', 'textarea', p.decision || p.fix || '', 'tr-decision-' + kind);
      how.rows = 3;
      f.appendChild(el('p', 'tr-dim', p.awaiting_choice || isReview(p) ? 'It is fixed your way when you press Fix the ones I chose on the review’s page.'
        : 'The next round of fixes reads this and does it your way.'));
      var row = el('div', 'tr-actions');
      var save = button('tr-btn tr-primary', 'Save the decision');
      save.type = 'submit';
      var cancel = button('tr-btn', 'Cancel');
      cancel.addEventListener('click', function () { S.deciding = false; draw(); });
      row.appendChild(save);
      row.appendChild(cancel);
      f.appendChild(row);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        verdict(p, 'decided', how.value);
      });
      box.appendChild(f);
      return box;
    }
    var wrap = el('div', 'tr-decbar-in');
    wrap.appendChild(el('span', 'tr-decbar-q', 'What should happen with it?'));
    function act(text, cls, fn, what) {
      var b = button('tr-btn' + (cls ? ' ' + cls : ''), text);
      b.disabled = !!S.busy;
      b.title = what;
      b.addEventListener('click', fn);
      wrap.appendChild(b);
    }
    act('Fix it like this…', 'tr-primary', function () { S.deciding = true; draw(); },
      'You say how it should be fixed. The next round of fixes does it your way.');
    act('Send as feedback', '', function () { toFeedback(p, false); },
      'Sends it now, with its picture, to Rouh’s list of changes to make to itself.');
    act('Edit before sending', '', function () { toFeedback(p, true); },
      'The same, but you can change the words first, then send.');
    if (p.verdict !== 'not_a_problem') {
      act('Not a problem', '', function () { verdict(p, 'not_a_problem'); }, 'The tester was wrong: it is fine as it is.');
    }
    act(p.verdict === 'wont_fix' ? 'Change why it won’t be fixed' : 'Won’t fix', '', function () { S.wontFixing = true; draw(); },
      'It is real, but not worth changing: say why.');
    if (p.verdict) { act('Take it back', '', function () { verdict(p, ''); }, 'Undo your choice: it is open again.'); }
    box.appendChild(wrap);
    // Each choice in a line: in a row, five buttons sounded the same to Vesela (trial 21).
    var now = el('p', 'tr-decbar-now');
    if (p.verdict) {
      now.appendChild(el('strong', '', 'You chose: ' + (VERDICT_LINE[p.verdict] || p.verdict_name) + (p.verdict === 'wont_fix' && p.reason ? ': ' + p.reason.replace(/[.!?]$/, '') : '')));
      now.appendChild(document.createTextNode((p.verdict_at ? ', ' + day(p.verdict_at) : '') + '. Every choice can be taken back.'));
    } else {
      now.appendChild(document.createTextNode('Every choice can be undone. What each one does is under the problem.'));
    }
    box.appendChild(now);
    return box;
  }

  function isReview(p) { return (p.sightings || []).some(function (x) { return x.mode === 'review'; }); }

  function verdict(p, v, decision, quiet, reason) {
    var before = { verdict: p.verdict || '', decision: p.decision || '', reason: p.reason || '' };
    S.busy = 'verdict';
    call('/problems/' + p.number + '/verdict', { verdict: v, decision: decision || '', reason: reason || '' }).then(function (got) {
      S.busy = ''; S.deciding = false;
      if (S.data.problem && S.data.problem.problem.number === p.number) { S.data.problem.problem = got.problem; }
      S.said = '';
      if (S.shell) { loadShell().catch(function () {}); }
      draw();
      if (quiet) { toast('Put back as it was.'); return; }
      var msg = v === '' ? 'Taken back: it is open again.' : 'Saved: ' + (VERDICT_LINE[v] || v) + '.' +
        (v === 'decided' && isReview(got.problem) ? ' It is fixed when you press Fix the ones I chose on the review’s page.' : '');
      toast(msg, before.verdict === 'sent' ? null : function () { verdict(got.problem, before.verdict, before.decision, true, before.reason); });
    }, fail);
  }

  function toFeedback(p, edit) {
    var gt = window.RouhFeedback || window.RouhGeneTherapy;
    if (!gt) { S.error = 'Feedback cannot be sent from this page.'; draw(); return; }
    S.busy = 'feedback'; draw();
    call('/problems/' + p.number + '/report').then(function (r) {
      return gt.fill(r.body, r.shots || [], { edit: edit, onSent: function (fb) {
        call('/problems/' + p.number + '/verdict', { verdict: 'sent', feedback: (fb && fb.id) || '' }).then(function (got) {
          if (S.data.problem && S.data.problem.problem.number === p.number) { S.data.problem.problem = got.problem; }
          if (where().page === 'problems') { reloadProblems(); }
          if (S.shell) { loadShell().catch(function () {}); }
          S.said = '';
          toast('Sent as feedback: “' + p.what + '”.');
          draw();
        }, fail);
      } });
    }).then(function (got) {
      S.busy = '';
      S.said = got && got.ok === false ? got.error : edit ? 'It is in the box on the right. Change the words, then press Send.' : 'Sending it…';
      draw();
    }, fail);
  }

  /* The talk with Rouh about one problem; `kept` is handed the problem as Rouh answers with it. */
  function thread(p, kept, opts) {
    opts = opts || {};
    var box = el('section', 'tr-panel tr-talk');
    var th = el('div', 'tr-talk-head');
    th.appendChild(el('h2', 'tr-h2', opts.title || 'Talk it over with Rouh'));
    if (opts.close) {
      var cl = button('tr-icon-btn tr-talk-close', null);
      cl.appendChild(icon('x'));
      cl.setAttribute('aria-label', 'Close Discuss/Ask');
      cl.title = 'Close';
      cl.addEventListener('click', opts.close);
      th.appendChild(cl);
    }
    box.appendChild(th);
    var list = el('ol', 'tr-msgs');
    (p.thread || []).forEach(function (n) {
      var li = el('li', 'tr-msg tr-msg-' + (n.kind === 'verdict' ? 'verdict' : n.who));
      if (n.kind === 'verdict') {
        li.appendChild(el('span', '', n.text + ' · ' + day(n.at)));
      } else {
        li.appendChild(el('div', 'tr-msg-who', (n.who === 'owner' ? 'You' : 'Rouh') + ' · ' + day(n.at)));
        li.appendChild(prose(n.text));
      }
      list.appendChild(li);
    });
    function send(text) {
      S.busy = 'say'; S.sayDraft = { n: p.number, text: text }; draw();
      call('/problems/' + p.number + '/say', { text: text }).then(function (got) {
        S.busy = ''; S.sayDraft = null;
        kept(got.problem);
        draw();
      }, fail);
    }
    if (!(p.thread || []).length) {
      box.appendChild(el('p', 'tr-dim', 'Rouh answers here, with the problem, its picture and the whole test run in front of it. Start with a question:'));
      var qs = el('div', 'tr-suggest');
      [p.how_bad === 'blocked' ? 'Why did this stop the tester?' : 'Why did this happen?', 'How would you fix it?', 'Is it worth fixing now?']
        .forEach(function (q) {
          var b = button('tr-btn tr-btn-s', q);
          b.disabled = !!S.busy;
          b.addEventListener('click', function () { send(q); });
          qs.appendChild(b);
        });
      box.appendChild(qs);
    }
    box.appendChild(list);
    if (S.busy === 'say') { box.appendChild(el('p', 'tr-thinking', 'Rouh is answering…')); }
    if (p.unanswered) { box.appendChild(el('p', 'tr-err-words', p.unanswered)); }
    var f = el('form', 'tr-form tr-say');
    var lab = el('label', 'tr-label', 'Your message');
    lab.htmlFor = 'tr-say-' + p.number;
    f.appendChild(lab);
    var area = el('textarea', 'tr-input tr-area');
    area.id = 'tr-say-' + p.number;
    area.rows = 3;
    area.placeholder = 'Ask about this problem, or say how you see it';
    if (S.sayDraft && S.sayDraft.n === p.number) { area.value = S.sayDraft.text; }
    // It grows as she types, so the whole message can be read before it is sent (trial 22).
    function grow() { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight + 2, 320) + 'px'; }
    area.addEventListener('input', function () { S.sayDraft = { n: p.number, text: area.value }; grow(); });
    setTimeout(grow, 0);
    f.appendChild(area);
    var row = el('div', 'tr-actions tr-end-row');
    var sendB = button('tr-btn tr-outline', S.busy === 'say' ? 'Rouh is answering…' : 'Send to Rouh');
    sendB.type = 'submit';
    sendB.disabled = !!S.busy;
    row.appendChild(sendB);
    f.appendChild(row);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!area.value.trim()) { area.focus(); return; }
      send(area.value);
    });
    box.appendChild(f);
    return box;
  }

  /* ---- pausing (Petar, 5 November 2026: "a pause button I can toggle on/off") ---- */

  /* Pause or resume one tester (key), or everyone (no key). The page changes at once, before Rouh answers,
     and goes back, with the reason, if Rouh could not do it. Nothing asks first. */
  function setPause(key, on, firstName, quiet) {
    function apply(v) {
      if (!key) {
        if (S.data.testers) { S.data.testers.paused_all = v; }
        if (S.data.tester) { S.data.tester.tester.paused_all = v; }
        if (S.shell) { S.shell.paused_all = v; }
        return;
      }
      [S.data.testers && S.data.testers.testers, S.data.tester && [S.data.tester.tester], S.shell && S.shell.testers,
       S.shell && S.shell.personas].forEach(function (l) {
        (l || []).forEach(function (t) { if ((t.key || t.id) === key) { t.paused = v; } });
      });
    }
    apply(on);
    S.error = '';
    S.said = '';
    if (!quiet) {
      toast(!key ? (on ? 'Automatic testing is off. A test you start still runs.' : 'Automatic testing is on.')
        : on ? firstName + ' does not run in automatic testing now. A test you start with ' + firstName + ' still runs.'
          : allPaused() ? firstName + ' runs once automatic testing is on.'
            : firstName + ' runs in automatic testing.');
    }
    draw();
    call(key ? '/testers/' + key + '/pause' : '/pause', { on: on }).then(function () {}, function (e) {
      apply(!on);
      fail(e);
    });
  }

  function allPaused() {
    return !!((S.data.testers && S.data.testers.paused_all) || (S.data.tester && S.data.tester.tester.paused_all) ||
              (S.shell && S.shell.paused_all));
  }

  /* A tester's tick: on, they run in automatic testing while it is on; off, they are paused on their own. */
  function runsTick(t, cls) {
    var l = el('label', 'tr-runs-one' + (cls ? ' ' + cls : ''));
    var c = el('input');
    c.type = 'checkbox';
    c.id = 'tr-runs-card-' + t.key + (cls ? '-' + cls : '');
    c.checked = !t.paused;
    c.addEventListener('change', function () { setPause(t.key, !c.checked, t.first); });
    l.appendChild(c);
    l.appendChild(el('span', '', t.first + ' runs in automatic testing'));
    return l;
  }

  /* What automatic testing means, at the top of the testers. */
  function autoWords(off) {
    return (off ? 'Automatic testing is off, so no tester tests a change by itself. ' : 'While automatic testing is on, a ticked tester tests each change Rouh builds that you will see. ') +
      'A test you start yourself runs either way. Turn it on or off, and tick who runs, at the top of every page here.';
  }

  /* ---- the testers (the Cast until 22 November 2026) ---- */

  function drawTesters(root) {
    var d = S.data.testers;
    moved('');
    if (!d) {
      root.appendChild(el('h1', 'tr-headline', 'The testers'));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the testers…')); }
      return;
    }
    var live = d.testers.filter(function (t) { return !t.archived; });
    var gone = d.testers.filter(function (t) { return t.archived; });
    var held = live.filter(function (t) { return t.paused; });
    var head = !live.length ? 'There are no testers.' : d.paused_all ? 'Automatic testing is off.'
      : held.length === live.length ? 'No tester is ticked to run.'
      : held.length ? live.filter(function (t) { return !t.paused; }).map(function (t) { return t.first; }).join(' and ') + (live.length - held.length === 1 ? ' runs' : ' run') + ' in automatic testing.'
      : (live.length === 1 ? 'One tester, running in automatic testing.' : 'All ' + live.length + ' testers run in automatic testing.');
    var finds = foundLine(d.testers);
    root.appendChild(el('h1', 'tr-headline', head + (finds ? ' ' + finds : '')));
    root.appendChild(el('p', 'tr-lede', 'The made-up people who test Rouh’s changes on their phones. Each has a whole ' +
      'life written down, and that is what they are told before every test run.'));
    var row = el('div', 'tr-flex tr-cast-acts');
    var add = link('', HOME + '/testers/new', 'tr-btn tr-primary');
    withIcon(add, 'plus', 'Add a tester');
    row.appendChild(add);
    root.appendChild(row);
    if (live.length) { root.appendChild(el('p', 'tr-dim tr-pause-words', autoWords(!!d.paused_all))); }
    var ul = el('ul', 'tr-cards');
    live.forEach(function (t) { ul.appendChild(personCard(t, !!d.paused_all)); });
    root.appendChild(ul);
    if (!live.length) { root.appendChild(el('p', 'tr-empty', 'There are no testers. Add one, and they test every change.')); }
    if (gone.length) {
      var det = el('details', 'brown-toggle');
      det.appendChild(el('summary', '', 'Removed testers (' + gone.length + ')'));
      var b = el('div', 'brown-toggle-body');
      b.appendChild(el('p', 'tr-dim', 'They no longer test anything. Their old test runs still say who did them.'));
      var ul2 = el('ul', 'tr-cards');
      gone.forEach(function (t) { ul2.appendChild(personCard(t)); });
      b.appendChild(ul2);
      det.appendChild(b);
      root.appendChild(det);
    }
  }

  function personCard(t, all) {
    var held = (!!t.paused || !!all) && !t.archived;
    var li = el('li', 'tr-pcard' + (held ? ' is-paused' : ''));
    var por = el('div', 'tr-portrait');
    var f = face(t, 'portrait');
    por.appendChild(f);
    var words = el('div', 'tr-person-words');
    var h = el('h2', 'tr-h2');
    h.appendChild(link(t.name, HOME + '/tester/' + t.key, 'tr-pcard-name'));
    words.appendChild(h);
    var jc = [t.age, t.job, t.city].filter(Boolean).join(', ');
    if (jc) { words.appendChild(el('div', 'tr-pcard-job', jc)); }
    if (t.short) { words.appendChild(el('div', 'tr-dim', t.short)); }
    por.appendChild(words);
    li.appendChild(por);
    var chips = el('div', 'tr-chips');
    if (t['default']) { chips.appendChild(chip('Tests every change', 'green')); }
    if (t.paused && !t.archived) { chips.appendChild(chip('Not running', 'amber')); }
    if (chips.childNodes.length) { li.appendChild(chips); }
    var st = el('div', 'tr-pstat');
    var jam = t.archived ? 0 : stuckOf(t.key).length;
    [[t.tries, t.tries === 1 ? 'test run' : 'test runs'], [t.problems, t.problems === 1 ? 'problem found' : 'problems found'],
     jam ? [jam, 'stuck'] : [t.running || 0, 'going now']]
      .forEach(function (x) { var dv = el('div'); dv.appendChild(el('b', '', String(x[0] || 0))); dv.appendChild(el('span', '', x[1])); st.appendChild(dv); });
    li.appendChild(st);
    if (!t.archived) {
      var status = el('div', 'tr-status-line');
      status.appendChild(withIcon(el('span', 'tr-status'), held ? 'pause' : 'play',
        all ? 'Automatic testing is off' : t.paused ? t.first + ' does not run' + (t.paused_at ? ', since ' + day(t.paused_at) : '') : t.first + ' runs in automatic testing'));
      status.appendChild(el('span', 'tr-dim', t['default'] ? 'Tests every change' : 'Tests a change when the one who tests every change is unticked, or when asked for by name'));
      li.appendChild(status);
      var acts = el('div', 'tr-actions');
      acts.appendChild(runsTick(t));
      acts.appendChild(link('Open ' + t.first, HOME + '/tester/' + t.key, 'tr-btn tr-quiet'));
      li.appendChild(acts);
    }
    return li;
  }

  function drawTester(root, w) {
    var d = S.data.tester;
    if (!d || d.tester.key !== w.key) {
      root.appendChild(crumbs([['Testers', HOME + '/testers'], ['Tester']]));
      if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening the tester…')); }
      return;
    }
    var t = d.tester, firstName = t.first;
    moved(t.name);
    root.appendChild(crumbs([['Testers', HOME + '/testers'], [t.name]]));
    var topG = el('div', 'tr-tester-top');
    var leftC = el('div', 'tr-tester-main');
    var por = el('div', 'tr-portrait');
    por.appendChild(face(t, 'portrait'));
    var hw = el('div', 'tr-person-words');
    hw.appendChild(el('h1', 'tr-h1', t.name + (t.age ? ', ' + t.age : '')));
    var jc = [t.job, t.city].filter(Boolean).join(' · ');
    if (jc) { hw.appendChild(el('p', 'tr-pcard-job', jc)); }
    if (t.short) { hw.appendChild(el('p', 'tr-dim', t.short)); }
    var chips = el('div', 'tr-chips');
    if (t['default']) { chips.appendChild(chip('Tests every change', 'green')); }
    if (t.archived) { chips.appendChild(chip('Removed', 'slate')); }
    if (!t.archived && (t.paused || t.paused_all)) { chips.appendChild(chip(t.paused_all && !t.paused ? 'Automatic testing off' : 'Not running', 'amber')); }
    chips.appendChild(chip(t.device === 'desk' ? 'Mostly on a computer' : 'Mostly on a phone', 'slate'));
    chips.appendChild(chip(plural(t.tries_count, 'test run') + ' · ' + plural(t.problems, 'problem') + ' found', 'slate'));
    hw.appendChild(chips);
    por.appendChild(hw);
    leftC.appendChild(por);
    if (!t.archived) {
      var pbox = el('div', 'tr-pausebox' + (t.paused || t.paused_all ? ' is-paused' : ''));
      var pw = el('div', 'tr-pause-text');
      pw.appendChild(el('b', '', t.paused ? firstName + ' does not run in automatic testing' : t.paused_all
        ? 'Automatic testing is off' : firstName + ' runs in automatic testing'));
      pw.appendChild(el('span', 'tr-dim', t.paused || t.paused_all
        ? firstName + ' tests no change by itself; a test you start with ' + firstName + ' still runs.' + (!t.paused && t.paused_all
          ? ' ' + firstName + ' runs again once automatic testing is on.' : '')
        : (t['default'] ? firstName + ' tests every change Rouh makes that you will see.' : firstName + ' tests a change when the tester who tests every change is not ticked, or when you ask for ' +
          firstName + ' by name.')));
      var jam = stuckOf(t.key);
      pw.appendChild(el('span', 'tr-dim', jam.length ? (jam.length === 1 ? 'Test run ' + jam[0].number + ' by ' + firstName + ' has been stuck since ' +
          day(jam[0].started_at || jam[0].created_at) + ': a test run takes minutes.' : jam.length + ' test runs by ' + firstName + ' are stuck.')
        : t.running
        ? (t.running === 1 ? 'A test run by ' + firstName + ' is going now' : t.running + ' test runs by ' + firstName + ' are going now') +
          (t.paused || t.paused_all ? '; it may finish.' : '.')
        : 'No test run by ' + firstName + ' is going now.'));
      if (t.skipped) {
        pw.appendChild(el('span', 'tr-dim', plural(t.skipped, 'test run') + ' skipped while paused' +
          (t.skipped_at ? ', the last on ' + day(t.skipped_at) : '') + '.'));
      }
      pbox.appendChild(pw);
      pbox.appendChild(runsTick(t, 'is-big'));
      leftC.appendChild(pbox);
      var acts = el('div', 'tr-actions');
      acts.appendChild(link('Change ' + firstName + '’s profile', HOME + '/tester/' + t.key + '/edit', 'tr-btn tr-btn-s'));
      if (!t['default']) {
        var def = button('tr-btn tr-btn-s', 'Make ' + firstName + ' test every change');
        def.addEventListener('click', function () {
          call('/testers/' + t.key + '/default', {}).then(function () { S.said = firstName + ' now tests every change.'; S.shell = null; load(); }, fail);
        });
        acts.appendChild(def);
        var rm = button('tr-btn tr-btn-s tr-danger', 'Remove ' + firstName);
        rm.addEventListener('click', function () { S.confirm = t.key; draw(); });
        acts.appendChild(rm);
      }
      leftC.appendChild(acts);
      if (S.confirm === t.key) {
        var c = el('div', 'tr-confirm');
        c.setAttribute('role', 'alertdialog');
        c.setAttribute('aria-label', 'Remove ' + firstName + '?');
        c.appendChild(el('p', '', 'Remove ' + firstName + '? ' + firstName + ' will not test anything again. The ' +
          plural(t.tries_count, 'test run') + ' ' + firstName + ' already did stay, and still say who did them.'));
        var row = el('div', 'tr-actions');
        var yes = button('tr-btn tr-btn-s tr-danger', 'Yes, remove ' + firstName);
        yes.addEventListener('click', function () {
          call('/testers/' + t.key + '/remove', {}).then(function () {
            S.confirm = ''; S.carry = firstName + ' is removed.'; S.shell = null; go(HOME + '/testers');
          }, fail);
        });
        var no = button('tr-btn tr-btn-s', 'Keep ' + firstName);
        no.addEventListener('click', function () { S.confirm = ''; draw(); });
        row.appendChild(yes);
        row.appendChild(no);
        c.appendChild(row);
        leftC.appendChild(c);
        setTimeout(function () { no.focus(); }, 0);
      }
    }
    if (t.made_by === 'rouh') { leftC.appendChild(el('p', 'tr-dim', 'Rouh wrote this profile from a sentence, and you kept it.')); }

    // Everything written about them, a folded chapter for each part: it is what they are told, read rarely.
    var prof = section('tr-profile', 'Everything written about ' + firstName);
    prof.appendChild(el('p', 'tr-dim', 'This is exactly what ' + firstName + ' is told before every test run, written to ' +
      ({ her: 'her', him: 'him' }[t.them] || 'them') + '. Open a part to read it.'));
    var openAll = button('tr-btn tr-btn-s', 'Open every part');
    prof.appendChild(openAll);
    var parts = [];
    (t.sections || []).forEach(function (s, i) {
      var part = el('details', 'tr-ch');
      part.id = 'tr-part-' + i;
      if (i === 0) { part.open = true; }
      part.appendChild(el('summary', '', s.title));
      part.appendChild(prose(s.text));
      prof.appendChild(part);
      parts.push(part);
    });
    openAll.addEventListener('click', function () {
      var shut = parts.every(function (x) { return x.open; });
      parts.forEach(function (x) { x.open = !shut; });
      openAll.textContent = shut ? 'Open every part' : 'Close every part';
    });
    leftC.appendChild(prof);
    topG.appendChild(leftC);

    var hist = el('section', 'tr-panel tr-hist-sec');
    hist.appendChild(el('h2', 'tr-h2', firstName + '’s test runs'));
    if (!t.tries.length) { hist.appendChild(el('p', 'tr-dim', firstName + ' has not tried anything yet.')); }
    var ul = el('ul', 'tr-hist');
    t.tries.forEach(function (x) {
      var li = el('li');
      var a = link('', HOME + '/' + x.number);
      a.appendChild(el('span', 'tr-dim', 'Test run ' + x.number));
      var mid = el('span', 'tr-hist-mid');
      mid.appendChild(el('span', 'tr-strong', x.job_name || upper(x.subject) || 'A page of Rouh'));
      mid.appendChild(el('span', 'tr-dim', day(x.created_at) + ' · ' + tryName(x.round, x.mode) + ' · ' +
        (foundN(x) ? plural(foundN(x), 'problem') : 'No problems')));
      a.appendChild(mid);
      a.appendChild(result(x.state));
      li.appendChild(a);
      ul.appendChild(li);
    });
    hist.appendChild(ul);
    topG.appendChild(hist);
    root.appendChild(topG);
  }

  /* ---- adding or changing a tester ---- */

  function blankForm(sections) {
    return { key: '', name: '', age: '', job: '', city: '', short: '', them: 'her', device: 'phone', sentence: '',
             profile: '# You are ...\n\nYou are ... You are ... years old, and you live in ...\n\n' +
               sections.map(function (s) { return '## ' + s + '\n\n'; }).join(''), written: false };
  }
  function formFrom(t) {
    return { key: t.key, name: t.name, age: t.age || '', job: t.job, city: t.city, short: t.short, them: t.them,
             device: t.device, profile: t.profile, sentence: '', written: false };
  }

  function drawForm(root, w) {
    var editing = !!w.key;
    var F = S.form;
    root.appendChild(crumbs(editing ? [['Testers', HOME + '/testers'], [(F && F.name) || 'The tester', HOME + '/tester/' + w.key], ['Change']]
      : [['Testers', HOME + '/testers'], ['Add a tester']]));
    if (!F || (editing && F.key !== w.key)) { if (!S.error) { root.appendChild(el('p', 'tr-loading', 'Opening…')); } return; }
    moved(editing ? F.name : 'New tester');
    root.appendChild(el('h1', 'tr-headline', editing ? 'Change ' + (F.name.split(' ')[0] || 'the tester') + '’s profile' : 'Add a tester'));
    if (!editing) {
      var quick = section('tr-panel tr-quick', 'Describe them in a sentence, and Rouh writes the rest');
      var q = el('textarea', 'tr-input tr-area');
      q.id = 'tr-sentence';
      q.rows = 2;
      q.value = F.sentence;
      q.placeholder = 'For example: a retired teacher in Varna, 67, who is wary of apps and reads everything twice.';
      q.setAttribute('aria-label', 'Describe the new tester in a sentence');
      q.addEventListener('input', function () { F.sentence = q.value; });
      quick.appendChild(q);
      var wr = button('tr-btn tr-primary', S.busy === 'draft' ? 'Rouh is writing… about a minute' : 'Let Rouh write the whole profile');
      wr.disabled = !!S.busy;
      wr.addEventListener('click', function () {
        if (!F.sentence.trim()) { q.focus(); return; }
        S.busy = 'draft'; S.error = ''; S.draftError = ''; draw();
        call('/testers/draft', { sentence: F.sentence }).then(function (j) {
          S.busy = '';
          var g = j.draft || {};
          ['name', 'age', 'job', 'city', 'short', 'them', 'device', 'profile'].forEach(function (k) {
            if (g[k] != null && g[k] !== '') { F[k] = g[k]; }
          });
          F.written = true;
          S.said = 'Rouh wrote the profile below. Read it and change anything, then press Save.';
          draw();
        }, function (e) {
          // Said beside the button that was pressed, not at the top of the page out of sight.
          S.busy = '';
          S.draftError = String((e && e.message) || e);
          draw();
        });
      });
      quick.appendChild(wr);
      if (S.draftError) { quick.appendChild(el('p', 'tr-err-words', S.draftError)); }
      quick.appendChild(el('p', 'tr-dim', 'Rouh only fills in the boxes below. Nothing is kept until you press Save at the bottom. ' +
        'Or fill in everything yourself.'));
      root.appendChild(quick);
    }
    var f = el('form', 'tr-form tr-panel');
    function bind(label, key, kind, extra) {
      var input = field(f, label, kind || 'input', F[key], 'tr-f-' + key);
      if (extra) { extra(input); }
      input.addEventListener('input', function () { F[key] = input.value; });
      return input;
    }
    bind('Name', 'name');
    bind('Age', 'age', 'input', function (i) { i.inputMode = 'numeric'; });
    bind('Job', 'job');
    bind('City', 'city');
    bind('One line about them', 'short');
    var pick = el('div', 'tr-two');
    pick.appendChild(choose('Call them', F.them, [['her', 'she / her'], ['him', 'he / him'], ['them', 'they / them']],
      function (v) { F.them = v; }));
    pick.appendChild(choose('Mostly uses', F.device, [['phone', 'A phone'], ['desk', 'A computer']],
      function (v) { F.device = v; }));
    f.appendChild(pick);
    bind('Everything about them, written to them (“You are…”), a heading for each part', 'profile', 'textarea',
      function (i) { i.rows = 18; i.classList.add('tr-profile-area'); });
    var row = el('div', 'tr-actions');
    var save = button('tr-btn tr-primary', editing ? 'Save the changes' : 'Save the new tester');
    save.type = 'submit';
    save.disabled = !!S.busy;
    row.appendChild(save);
    row.appendChild(link('Cancel', editing ? HOME + '/tester/' + w.key : HOME + '/testers', 'tr-btn'));
    f.appendChild(row);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      S.busy = 'save'; S.error = '';
      var body = { name: F.name, age: F.age, job: F.job, city: F.city, short: F.short, them: F.them, device: F.device,
                   profile: F.profile, written_by_rouh: F.written };
      call(editing ? '/testers/' + w.key : '/testers/new', body).then(function (j) {
        S.busy = ''; S.form = null; S.shell = null;
        S.carry = editing ? 'Saved.' : j.tester.first + ' is added.';
        go(HOME + '/tester/' + j.tester.key);
      }, fail);
    });
    root.appendChild(f);
  }

  /* ---- how it works, and its words ---- */

  function drawHow(root) {
    moved('');
    root.appendChild(el('h1', 'tr-headline', 'How testing works'));
    var grid = el('div', 'tr-how');
    var s1 = section('tr-panel', 'The words');
    [['A tester', 'a made-up person with a whole life written down, such as Vesela, 41, head of HR in Plovdiv. ' +
       'A model plays them. They know only what is on the screen, never how Rouh is built.'],
     ['A job', 'one request you gave, such as testing the guide with ten journeys, kept with your own words.'],
     ['A journey', 'one thing a tester is asked to do in a job, such as signing in for the first time. Every test run of the same thing is kept in the same journey.'],
     ['A test run', 'one tester going through a journey from the first screen, on a phone, saying out loud what they see, think and do, ' +
       'with a picture of the screen at every step.'],
     ['The three questions', 'on every new screen the tester answers: What is this? What do I do here? What happens when I do it? ' +
       'One they cannot answer is a problem.'],
     ['Finished', 'the tester got all the way through the journey. Got part of the way and Stopped before the end say how far they got otherwise.'],
     ['Manual, Automatic', 'a manual job is one you started, from Test something or in a chat; an automatic one Rouh started by itself, to test a change it made.'],
     ['Rounds', 'when a change does not pass, Rouh fixes what tripped the tester and a new tester goes through it again: the first test run, ' +
       'the second test run after fixes, and the third and last. After that the change goes out anyway, its problems stay open, and you are told.']]
      .forEach(function (x) { s1.appendChild(said(x[0], x[1])); });
    grid.appendChild(s1);
    var sm = section('tr-panel', 'Two kinds of test run');
    sm.appendChild(said('Automatic test while building', 'every change you will see is tried by a tester before it ships. ' +
      'The builder fixes what tripped them, within what you already approved, and it is tried again: at most two rounds of ' +
      'fixes, then it ships. Nobody asks you anything.'));
    sm.appendChild(said('Review you asked for', 'when you ask for someone to test something, for example “Have Vesela test ' +
      'this”, or press Test something. You get the whole walk-through, what they found and what Rouh suggests. Nothing is fixed until you go through ' +
      'the problems and choose what is done and how; Fix the ones I chose then starts one run that does only those.'));
    grid.appendChild(sm);
    var s2 = section('tr-panel', 'How bad a problem is');
    [['blocked', 'they could not go on.'], ['confused', 'they did not understand something they needed.'],
     ['annoyed', 'they understood, but it bothered them.'], ['minor', 'a small thing that bothered nobody much.']].forEach(function (x) {
      var p = el('p', 'tr-said tr-sev-line');
      p.appendChild(sev(x[0], true));
      p.appendChild(document.createTextNode(': ' + x[1]));
      s2.appendChild(p);
    });
    s2.appendChild(el('p', 'tr-dim', 'Each kind has its own icon as well as its colour: a stop sign, a question mark, an angry face and a small i. Point at one to read its name.'));
    grid.appendChild(s2);
    var s3 = section('tr-panel', 'What you can do with a problem');
    [['Talk it over', 'write to Rouh on the problem’s page. Rouh answers there, with the problem, its picture and the whole test run in front of it.'],
     ['Fix it like this', 'say how it should be fixed. The next round of fixes reads it and does it your way.'],
     ['Send as feedback', 'it goes, with its picture, to Rouh’s list of changes to make to itself. Edit before sending lets you change the words first.'],
     ['Not a problem, Won’t fix', 'set it aside. A tester who runs into it again no longer counts against the test run.'],
     ['Undo', 'every choice can be taken back: press Undo on the message that appears, or Take it back later.'],
     ['Fixed', 'a problem is fixed as soon as the wave of fixes you chose it for has finished, or when a later test run passes its screen without tripping on it. Nobody marks it by hand, and a later test run that meets it again opens it again.']]
      .forEach(function (x) { s3.appendChild(said(x[0], x[1])); });
    grid.appendChild(s3);
    var s4 = section('tr-panel', 'Where the ideas came from');
    s4.appendChild(el('p', 'tr-dim', 'Two earlier tests you liked: Mira Koleva’s ten use cases as a new customer, each told ' +
      'screen by screen in her own words, and Teodora Angelova’s bug hunt, each bug worst first with its picture, what should ' +
      'have happened, what did, and how to fix it. The look is the Page atlas, the design that scored best in design test 3.'));
    grid.appendChild(s4);
    root.appendChild(grid);
  }

  window.RouhTrials = {
    mount: function (wrap, sub, host) {
      var was = S.sub;
      S.host = host || null;
      S.sub = String(sub || '');
      if (was !== S.sub) {
        S.said = S.carry || ''; S.carry = ''; S.error = ''; S.confirm = ''; S.draftError = ''; S.jOpen = {}; S.jEdit = null; S.tryBad = '';
        if (!/^problem\//.test(S.sub)) { S.deciding = false; }
        S.wontFixing = false;
        // The try a problem's page was opened from names it, until the page is left for another.
        if (!/^problem\//.test(S.sub)) { S.ctxTrial = 0; }
        if (!/^(testers\/new|tester\/[a-z0-9]+\/edit)$/.test(S.sub)) { S.form = null; }
        if (S.sub === 'testers/new' && S.form && S.form.key) { S.form = null; }
        if (S.sub !== 'problems') { S.probView.all = false; }
        // A try opens on the filter its address names, and on none without one.
        S.tf = /^\d+$/.test(S.sub) ? tfRead(location.search) : tfBlank();
      }
      // The dashboard opens on the kind of jobs its address names, and on All without one.
      if (!S.sub) { S.kind = kindRead(location.search); }
      S.root = el('div', 'tr');
      wrap.appendChild(S.root);
      draw();
      load();
    }
  };
}());
