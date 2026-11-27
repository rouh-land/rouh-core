/* The projector's wall (`rouh/projector.py`): the Robot chat full screen, for a Raspberry Pi behind the
 * person's projector, read from a sofa and never touched.
 *
 * It rests on the orb (projector-orb.js): the work running now, full screen. Something new to show - a card
 * the Robot chat drew, or what was heard and Rouh's answer - comes up while the orb moves to the corner,
 * stays about 30 seconds or as long as it takes to read (`readFor`), longer while Rouh is still answering,
 * and goes, the orb coming back. A job waiting for the person shows its question in big words (`drawNeeds`). What was
 * already there when the page opened is not shown again: the wall starts on the orb.
 *
 * Every two seconds it asks /api/projector/feed for the newest card, what was heard and Rouh's answer,
 * with the Pi's display key from the address's #key= (the Pi opens it so) or, on the person's own
 * computer, with their sign-in. Nothing is sent but that question. A card too long for the wall is first
 * made smaller, down to `SMALLEST`, then moved slowly through, top to bottom and back, so every row is
 * seen with nobody pressing anything. When the network goes, the last card stays and the top line says
 * since when it has been reconnecting; it carries on by itself when the network is back.
 *
 * A card's blocks are drawn by the canvas's own code (app/cardblocks.js, loaded as a module before this
 * script), exactly as on Rouh's page; a picture Rouh drew in the Robot chat comes as a card of one picture
 * (`projector.picture_of`) and fills the stage (task 200, 200-06).
 *
 * window.PROJECTOR_DEMO, when a design's page sets it, is a feed to draw instead of asking for one.
 */
(function () {
  'use strict';

  var EVERY = 2000;          // ms between two questions while the wall is live
  var EVERY_UNPAIRED = 10000;
  var SMALLEST = 0.72;       // the smallest a card's type is made before it moves through instead
  var SPEED = 3.2;           // how fast a long card moves, in hundredths of the wall's width a second
  var HOLD = 4000;           // ms a long card stays still at its top and at its bottom
  var FRESH_EVERY = 6 * 3600 * 1000; // the page loads itself again, so a week on the wall stays light
  var READ_WPM = 170;        // how fast the wall assumes words are read from across a room
  // Up for about 30 seconds, longer for more to read (Petar, 27 November 2026: the orb "grows back when the
  // card fades after about 30 s").
  var READ_LEAST = 30000, READ_MOST = 120000, READ_PICTURE = 8000, READ_SETTLE = 5000;
  var AFTER_ANSWER = 4000;   // ms an answer still being written keeps the wall up after its last word

  var DEMO = window.PROJECTOR_DEMO || null;
  // The key: from the address (a Pi set up from the setup file opens it so), or the one this browser was
  // given by pairing and keeps (`pair`, below), or none, on the person's own signed-in computer.
  var KEPT = 'rouh.projector.key';
  var key = '';
  var hash = /(?:^#|&)key=([^&]+)/.exec(location.hash || '');
  if (hash) key = decodeURIComponent(hash[1]);
  function kept(value) {
    try {
      if (value === undefined) return localStorage.getItem(KEPT) || '';
      if (value) localStorage.setItem(KEPT, value); else localStorage.removeItem(KEPT);
    } catch (e) { /* a browser that keeps nothing pairs again after a restart */ }
    return value || '';
  }
  if (!key) key = kept();

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), clock = $('clock'), statusEl = $('status');
  var heardEl = $('heard'), saidEl = $('said'), unpaired = $('unpaired'), wall = $('wall');
  // Always dark: on a projector black is no light at all, and the orb floats on the wall (Petar, 27 November).
  document.documentElement.setAttribute('data-theme', 'dark');

  var shown = { version: null, card: null, heard: null, said: null, first: true };
  var upUntil = 0, downTimer = 0, cycleMs = 0, cardWords = 0, cardPictures = 0;
  var orb = window.ProjectorOrb ? window.ProjectorOrb.start($('orb'), { rules: $('orb').getAttribute('data-rules') }) : null;
  window.projectorOrb = orb;
  var lostSince = null;
  var began = Date.now();
  var motion = null;
  var blobs = [];
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function u() { return Math.min(window.innerWidth / 100, window.innerHeight * 1.7778 / 100); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  // The 24-hour clock, as the household reads it.
  function hhmm(d) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }

  // --- words: plain, for the caption band and a waiting job's question ----------------------------------
  function plain(text) {
    return String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
  }
  function wordsBlock(text) {
    var wrap = el('div', 'b-text');
    String(text || '').split(/\n{2,}/).forEach(function (para) {
      if (para.trim()) wrap.appendChild(el('p', null, plain(para)));
    });
    return wrap;
  }

  // --- a card's blocks: the canvas's own (app/cardblocks.js), the same as on Rouh's page ------------------
  //
  // Petar, 27 November 2026: a picture of a mouse reached his Robot chat and not the wall, and he asked
  // "shall we have the projector part canvas part the custom stuff?". So the wall draws a card's blocks
  // with the code the canvas draws them with, loaded as a module before this script (projector.html), and
  // keeps only what is the wall's own: the orb, fitting a card to the wall, moving through a long one, and
  // a waiting job's question. A block that does something on the canvas (a contact to save, an email to
  // write, an inbox) is shown here as its words: nothing on the wall is ever pressed.
  var CB = window.RouhCardBlocks || null;

  // Pictures: fetched by Rouh, with the Pi's key, when the wall cannot fetch them itself.
  function pictureInto(img, src, gone) {
    if (!src) { gone(); return; }
    if (/^(data:|blob:)/.test(src) || DEMO) { img.src = src; return; }
    var same = false;
    try { same = new URL(src, location.href).origin === location.origin; } catch (e) { gone(); return; }
    if (!key) { img.src = src; return; }   // the person's own browser: its sign-in, and the canvas's proxy after
    var at = same ? src : '/api/projector/image?src=' + encodeURIComponent(src);
    fetch(at, { headers: { Authorization: 'Bearer ' + key }, credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (b) { var url = URL.createObjectURL(b); blobs.push(url); img.src = url; })
      .catch(gone);
  }
  if (CB) {
    CB.blocksUse({
      picture: pictureInto,
      // A markup block is read from across a room: its letters at the wall's size, not the canvas's.
      frameDoc: function (doc) {
        var px = Math.round(1.5 * u());   // the size of a card's own words on the wall (projector.css, .card)
        return doc.replace('</head>', '<style>body{font-size:' + px + 'px}h1{font-size:1.7em}h2{font-size:1.45em}' +
          'h3{font-size:1.2em}h4{font-size:1.05em}table{font-size:1em}th{font-size:.8em}code,kbd,pre{font-size:.85em}' +
          'img,video{max-height:' + Math.round(stage.clientHeight * 0.9) + 'px;object-fit:contain}</style></head>');
      }
    });
  }
  // A markup block's frame says how tall it is (cardblocks.js, `rouh-html-size`): the wall sizes it so, then fits.
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!CB || !m || m.type !== 'rouh-html-size' || !(m.height > 0)) return;
    var frames = stage.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        CB.htmlFrameHeight(frames[i], Math.max(24, Math.min(CB.HTML_FRAME_MAX, Math.ceil(m.height))));
        fit();
        return;
      }
    }
  });

  function rowsOf(rows) {
    var ul = el('ul', 'b-list');
    (rows || []).forEach(function (r) {
      var text = Array.isArray(r) ? r.filter(Boolean).join(': ')
        : (r && typeof r === 'object') ? [r.label, r.value || r.text].filter(Boolean).join(': ') : r;
      if (text) ul.appendChild(el('li', null, plain(text)));
    });
    return ul.children.length ? ul : null;
  }
  function labelled(b, node) {
    if (!node || b.label == null || !String(b.label).trim()) return node;
    var wrap = el('div', 'b-labelled');
    wrap.appendChild(el('div', 'b-label', String(b.label)));
    wrap.appendChild(node);
    return wrap;
  }
  function block(b) {
    if (!b || typeof b !== 'object') return null;
    var drawn = CB ? CB.drawBlock(b) : null;
    if (drawn) return drawn;
    switch (b.block) {
      case 'link': return b.href ? labelled(b, el('div', 'b-link', b.text || b.label || b.href)) : null;
      case 'email': {
        var m = el('div', 'b-email');
        if (b.subject) m.appendChild(el('div', 'em-subject', b.subject));
        var meta = [b.from && ('From ' + b.from), b.date].filter(Boolean).join(', ');
        if (meta) m.appendChild(el('div', 'meta', meta));
        if (b.body) m.appendChild(el('div', 'em-body', String(b.body).slice(0, 2400)));
        return m;
      }
      case 'contact': {
        var c = el('div', 'b-email');
        if (b.name) c.appendChild(el('div', 'em-subject', b.name));
        var list = rowsOf(b.rows);
        if (list) c.appendChild(list);
        return c;
      }
      default: {
        // A block only the canvas can do something with, or a wall whose module did not load: its words.
        var words = b.title || b.heading || b.question || b.text;
        if (!words && b.block === 'list' && b.items) words = b.items.join('\n\n');
        return words ? labelled(b, wordsBlock(String(words))) : null;
      }
    }
  }

  function drawCard(card) {
    stopMoving();
    blobs.forEach(function (x) { URL.revokeObjectURL(x); });
    blobs = [];
    var old = stage.querySelector('.card');
    if (old) old.remove();
    var bar = stage.querySelector('.through');
    if (bar) bar.remove();
    cycleMs = 0;
    if (!card) { cardWords = 0; cardPictures = 0; return; }
    // Sliding in only when it replaces a card already up; over the orb, the wall's own fade brings it.
    var cls = (document.body.classList.contains('up') ? 'card enter' : 'card') + (card.picture ? ' picture' : '');
    var box = el('article', cls);
    if (card.title) box.appendChild(el('h1', null, card.title));
    if (card.description) box.appendChild(el('p', 'desc', card.description));
    var stats = null;
    var blocks = Array.isArray(card.blocks) ? card.blocks : [];
    (CB ? CB.sourcesLast(blocks) : blocks).forEach(function (b) {
      var drawn = null;
      try { drawn = block(b); } catch (e) { drawn = null; }  // one block that cannot be drawn never blanks the card
      if (!drawn) return;
      if (b.block === 'stat') {
        // Numbers side by side, as a row of them reads at a glance.
        if (!stats) { stats = el('div', 'stats'); box.appendChild(stats); }
        stats.appendChild(drawn);
        return;
      }
      stats = null;
      box.appendChild(drawn);
    });
    if (CB) CB.footnotes(box);
    stage.appendChild(box);
    Array.prototype.forEach.call(box.querySelectorAll('img'), function (img) {
      img.addEventListener('load', fit);
      img.addEventListener('error', fit);
    });
    cardWords = wordsIn(box.textContent);
    cardPictures = box.querySelectorAll('img, svg, iframe').length;
    fit();
  }

  // --- fitting a card to the wall, and moving through one that will not fit ------------------------
  var fitting = 0;
  function fit() {
    clearTimeout(fitting);
    fitting = setTimeout(fitNow, 60);
  }
  function fitNow() {
    var box = stage.querySelector('.card');
    if (!box) return;
    stopMoving();
    var s = 1;
    box.style.setProperty('--s', s);
    while (box.scrollHeight > stage.clientHeight + 1 && s > SMALLEST) {
      s = Math.max(SMALLEST, s - 0.07);
      box.style.setProperty('--s', s.toFixed(2));
    }
    var over = box.scrollHeight - stage.clientHeight;
    if (over > 2) move(box, over);
  }
  function stopMoving() {
    if (motion) { motion.stop(); motion = null; }
  }
  function move(box, over) {
    stage.classList.add('moving');
    var bar = el('div', 'through');
    var thumb = el('i');
    bar.appendChild(thumb);
    stage.appendChild(bar);
    var share = stage.clientHeight / box.scrollHeight;
    thumb.style.height = (share * 100) + '%';
    var setAt = function (y) {
      box.style.transform = 'translateY(' + (-y) + 'px)';
      thumb.style.top = ((y / box.scrollHeight) * 100) + '%';
    };
    var timer = 0, frame = 0, stopped = false;
    if (reduced) {
      // A page at a time, still: the wall turns over rather than gliding.
      var at = 0;
      var turn = function () {
        if (stopped) return;
        at = at >= over ? 0 : Math.min(over, at + stage.clientHeight * 0.85);
        setAt(at);
        timer = setTimeout(turn, 9000);
      };
      timer = setTimeout(turn, 9000);
    } else {
      var pxs = SPEED * u();
      var down = over / pxs * 1000;
      var cycle = HOLD + down + HOLD + down / 3;
      cycleMs = cycle;
      var start = performance.now();
      var step = function (now) {
        if (stopped) return;
        var t = (now - start) % cycle;
        var y;
        if (t < HOLD) y = 0;
        else if (t < HOLD + down) y = over * (t - HOLD) / down;
        else if (t < HOLD + down + HOLD) y = over;
        else y = over * (1 - (t - HOLD - down - HOLD) / (down / 3));
        setAt(y);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
    motion = { stop: function () { stopped = true; clearTimeout(timer); cancelAnimationFrame(frame); box.style.transform = ''; bar.remove(); stage.classList.remove('moving'); } };
  }

  // --- the caption band ----------------------------------------------------------------------------
  function drawCaption(d) {
    heardEl.textContent = '';
    saidEl.textContent = '';
    if (d.heard && d.heard.text) {
      heardEl.appendChild(el('span', 'who', d.heard.spoken ? 'Heard' : 'You'));
      heardEl.appendChild(el('span', 'words', plain(d.heard.text)));
    }
    var words = d.answering ? d.so_far : (d.said && d.said.text);
    if (d.answering || words) {
      saidEl.appendChild(el('span', 'who', 'Rouh'));
      var box = el('div', 'words');
      if (words) box.appendChild(el('span', null, plain(words)));
      if (d.answering && !words) {
        var p = el('span', 'pulse');
        p.setAttribute('aria-label', 'Answering');
        p.appendChild(el('i')); p.appendChild(el('i')); p.appendChild(el('i'));
        p.appendChild(el('span', null, 'Answering'));
        box.appendChild(p);
      }
      saidEl.appendChild(box);
      if (box.scrollHeight <= box.clientHeight + 1) box.classList.add('fits');
    }
    heardEl.hidden = !heardEl.childNodes.length;
    saidEl.hidden = !saidEl.childNodes.length;
  }

  // --- a job waiting for the person: its question, in big words, low on the wall -------------------------
  var needsEl = $('needs');
  function drawNeeds(tree) {
    var found = [];
    ((tree && tree.children) || []).forEach(function (j) {
      if (j && j.state === 'waiting') found.push(j);
    });
    needsEl.textContent = '';
    if (!found.length) { needsEl.hidden = true; if (orb) orb.reserve(0); return; }
    var j = found[0];
    var head = el('div', 'head');
    head.appendChild(el('span', 'mark'));
    head.appendChild(el('span', null, 'NEEDS YOU · ' + (window.ProjectorOrb ? window.ProjectorOrb.short(j.label) : j.label)));
    needsEl.appendChild(head);
    if (j.asking) needsEl.appendChild(el('p', 'ask', plain(j.asking)));
    if (found.length > 1) needsEl.appendChild(el('p', 'more', 'And ' + (found.length - 1) + ' more waiting'));
    needsEl.hidden = false;
    if (orb) orb.reserve(needsEl.offsetHeight + 24);
  }

  // --- up over the orb, and back down to it ---------------------------------------------------------
  function wordsIn(text) { return (String(text || '').match(/\S+/g) || []).length; }
  // How long something stays up: its words at a slow reading pace, a little more for each picture, and at
  // least once through a card that has to move to be seen whole.
  function readFor(words, pictures) {
    var ms = READ_SETTLE + words / READ_WPM * 60000 + pictures * READ_PICTURE;
    if (cycleMs) ms = Math.max(ms, cycleMs + READ_SETTLE);
    return Math.max(READ_LEAST, Math.min(READ_MOST, ms));
  }
  // Coming up, the orb glides into the corner first (on its own canvas, smoothly even on a Pi 3), then the
  // words and the card come in with a short fade; going down, they go with a short fade and the orb comes
  // back to the middle. A long fade of a whole-screen layer is what a Pi 3 without its graphics chip draws worst.
  var upTimer = 0;
  function up(ms) {
    upUntil = Math.max(upUntil, Date.now() + ms);
    if (orb) orb.corner(true);
    if (!document.body.classList.contains('up') && !upTimer) {
      upTimer = setTimeout(function () { upTimer = 0; document.body.classList.add('up'); }, orb ? 350 : 0);
    }
    clearTimeout(downTimer);
    downTimer = setTimeout(maybeDown, Math.max(250, upUntil - Date.now()));
  }
  function maybeDown() {
    var left = upUntil - Date.now();
    if (left > 0) { downTimer = setTimeout(maybeDown, left); return; }
    clearTimeout(upTimer); upTimer = 0;
    document.body.classList.remove('up');
    if (orb) orb.corner(false);
    // Once it has faded, the long card stops moving: nothing is drawn that nobody can see.
    downTimer = setTimeout(function () { if (!document.body.classList.contains('up')) stopMoving(); }, 1500);
  }

  function draw(d) {
    unpaired.hidden = true;
    document.body.classList.remove('unpaired-on');
    wall.hidden = false;
    if (orb && orb.settings) orb.settings(d.orb3d || null);
    if (orb && d.tree) orb.tree(d.tree, d.now);
    drawNeeds(d.tree);
    if (d.version && d.version === shown.version) return;
    shown.version = d.version || null;
    var first = shown.first;
    shown.first = false;
    var cardKey = d.card ? (d.card.card_id + ':' + (d.card.version || 1)) : '';
    var heardKey = d.heard ? String(d.heard.id || d.heard.text) : '';
    var saidKey = d.said ? String(d.said.id || d.said.text) : '';
    var newCard = cardKey !== shown.card;
    var newWords = heardKey !== shown.heard || saidKey !== shown.said;
    var newQuestion = heardKey !== shown.heard;
    shown.heard = heardKey;
    shown.said = saidKey;
    if (newCard) {
      shown.card = cardKey;
      drawCard(d.card || null);
    }
    // A card is on the stage while it is the news: with what Rouh heard and its answer in the strip under it,
    // as the answer comes (Petar, 27 November 2026, 14:06: "keep that in addition to the overall canvas"). A new
    // question with no card of its own comes up as words over the orb.
    if (newCard && d.card && !first) wall.classList.add('with-card');
    else if (newQuestion && !newCard) wall.classList.remove('with-card');
    var before = stage.clientHeight;
    drawCaption(d);
    // The caption band takes the room its words need, so the stage may have grown or shrunk: fit again.
    if (stage.clientHeight !== before) fit();
    if (first && !d.answering) return;      // the wall starts on the orb, not on what was there before
    if ((newCard && d.card) || newWords || d.answering) {
      var said = d.answering ? d.so_far : (d.said && d.said.text);
      var words = wordsIn(plain(said)) + wordsIn(d.heard && d.heard.text);
      var withCard = wall.classList.contains('with-card');
      // fitNow, 60 ms on, knows whether the card has to move; ask again once it has.
      setTimeout(function () {
        up(d.answering ? AFTER_ANSWER + READ_SETTLE : readFor(words + (withCard ? cardWords : 0), withCard ? cardPictures : 0));
      }, 120);
      if (d.answering) up(AFTER_ANSWER + READ_SETTLE);
    }
  }

  // --- live or not ----------------------------------------------------------------------------------
  function live() {
    lostSince = null;
    statusEl.hidden = true;
    wall.classList.remove('lost');
  }
  function lost() {
    if (!lostSince) lostSince = new Date();
    statusEl.textContent = 'Reconnecting since ' + hhmm(lostSince);
    statusEl.hidden = false;
    wall.classList.add('lost');
  }
  function notSetUp(forget) {
    unpaired.hidden = false;
    document.body.classList.add('unpaired-on');
    wall.hidden = true;
    $('setupAddr').textContent = location.host + '/projector/setup';
    live();
    // A kept key is forgotten only when Rouh itself says it read it and it is unknown or turned off
    // (`forget`). A refusal without that (Rouh restarting, a proxy on the way) keeps it: the wall stays
    // paired and simply asks again (task 200, 200-05: "Why does it stop being paired?").
    if (key && !hash && forget) { key = kept(''); }
    if (!key) pair();
  }

  // --- pairing: the code on the wall, typed by the person on the setup page, and the key it brings -------
  var pairing = null;
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      cache: 'no-store', body: JSON.stringify(body || {}) }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function pair() {
    if (DEMO || pairing) return;
    pairing = { ticket: '' };
    var codeEl = $('pairCode');
    var start = function () {
      post('/api/projector/pair').then(function (d) {
        pairing.ticket = d.ticket;
        codeEl.textContent = d.code;
        codeEl.hidden = false;
        $('pairHow').hidden = false;
        setTimeout(wait, 3000);
      }).catch(function () { setTimeout(start, 10000); });
    };
    var wait = function () {
      post('/api/projector/pair/take', { ticket: pairing.ticket }).then(function (d) {
        if (d.state === 'paired' && d.key) {
          key = kept(d.key);
          pairing = null;
          codeEl.hidden = true;
          shown.first = true;
          ask();
        } else if (d.state === 'gone') {
          start();
        } else {
          setTimeout(wait, 3000);
        }
      }).catch(function () { setTimeout(wait, 6000); });
    };
    start();
  }

  function ask() {
    if (DEMO) {
      // A design's page: its feeds in turn, each after the one before it has had its time.
      var steps = DEMO.steps || [DEMO.feed || DEMO];
      var i = DEMO.at || 0;
      DEMO.at = i + 1;
      if (i < steps.length) {
        draw(steps[i]);
        if (steps[i].lost) lost();
        if (steps[i].unpaired) notSetUp(true);
        setTimeout(ask, steps[i].after || EVERY);
      }
      return;
    }
    var headers = { Accept: 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    var next = EVERY;
    fetch('/api/projector/feed', { headers: headers, credentials: key ? 'omit' : 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            // A kept key refused without Rouh saying "forget it" is a hiccup, not an unpairing: keep it.
            if (key && !(b && b.forget)) { lost(); return null; }
            next = EVERY_UNPAIRED;
            notSetUp(true);
            // Pairing asks for the feed itself once the key comes.
            if (pairing) next = 0;
            return null;
          });
        }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        live();
        draw(d);
        // A fresh page now and then, only while Rouh answers (so a reload never lands on an error page) and only
        // while the wall rests on the orb (so nothing being read goes away).
        if (Date.now() - began > FRESH_EVERY && !document.body.classList.contains('up') && !d.answering) location.reload();
      })
      .catch(lost)
      .then(function () { if (next) setTimeout(ask, next); });
  }

  function tickClock() {
    clock.textContent = hhmm(new Date());
  }
  tickClock();
  setInterval(tickClock, 10000);
  window.addEventListener('resize', fit);
  ask();
})();
