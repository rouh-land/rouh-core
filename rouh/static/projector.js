/* The projector's wall (`rouh/projector.py`): the Robot chat full screen, for a Raspberry Pi behind the
 * person's projector, read from a sofa and never touched.
 *
 * Every two seconds it asks /api/projector/feed for the newest card, what was heard and Rouh's answer,
 * with the Pi's display key from the address's #key= (the Pi opens it so) or, on the person's own
 * computer, with their sign-in. Nothing is sent but that question. A card too long for the wall is first
 * made smaller, down to `SMALLEST`, then moved slowly through, top to bottom and back, so every row is
 * seen with nobody pressing anything. When the network goes, the last card stays and the top line says
 * since when it has been reconnecting; it carries on by itself when the network is back.
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

  var DEMO = window.PROJECTOR_DEMO || null;
  var key = '';
  var hash = /(?:^#|&)key=([^&]+)/.exec(location.hash || '');
  if (hash) key = decodeURIComponent(hash[1]);

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), rest = $('rest'), clock = $('clock'), statusEl = $('status');
  var heardEl = $('heard'), saidEl = $('said'), unpaired = $('unpaired'), wall = $('wall');
  var themeAsked = /(?:[?&])theme=(light|dark)/.exec(location.search || '');
  if (themeAsked) document.documentElement.setAttribute('data-theme', themeAsked[1]);

  var shown = { version: null, card: null };
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
  function hhmm(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

  // --- words: the little markdown a card's text or an answer may carry, drawn plain and safe -----------
  function inline(parent, text) {
    var parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    parts.forEach(function (p) {
      if (!p) return;
      if (/^\*\*[^*]+\*\*$/.test(p)) parent.appendChild(el('strong', null, p.slice(2, -2)));
      else if (/^`[^`]+`$/.test(p)) parent.appendChild(el('code', null, p.slice(1, -1)));
      else parent.appendChild(document.createTextNode(p.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')));
    });
  }
  function plain(text) {
    return String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
  }
  function textBlock(text) {
    var wrap = el('div', 'b-text');
    String(text || '').split(/\n{2,}/).forEach(function (para) {
      para = para.trim();
      if (!para) return;
      var lines = para.split('\n');
      if (lines.every(function (l) { return /^\s*([-*]|\d+\.)\s+/.test(l); })) {
        wrap.appendChild(listBlock(lines.map(function (l) { return l.replace(/^\s*([-*]|\d+\.)\s+/, ''); })));
        return;
      }
      var p = el('p');
      inline(p, para.replace(/^#+\s*/, ''));
      wrap.appendChild(p);
    });
    return wrap;
  }
  function listBlock(items) {
    var ul = el('ul', 'b-list');
    (items || []).forEach(function (it) {
      var li = el('li');
      var span = el('span');
      inline(span, typeof it === 'string' ? it : (it && (it.text || it.title)) || JSON.stringify(it));
      li.appendChild(span);
      ul.appendChild(li);
    });
    return ul;
  }

  // --- pictures: fetched by Rouh, with the Pi's key, when the wall cannot fetch them itself -----------
  function pictureInto(img, src, gone) {
    if (!src) { gone(); return; }
    if (/^(data:|blob:)/.test(src)) { img.src = src; return; }
    if (DEMO) { img.src = src; return; }
    var proxied = '/api/projector/image?src=' + encodeURIComponent(src);
    if (!key) {
      img.onerror = function () { img.onerror = gone; img.src = proxied; };
      img.src = src;
      return;
    }
    var local = src.charAt(0) === '/' && src.charAt(1) !== '/';
    fetch(local ? src : proxied, { headers: local ? {} : { Authorization: 'Bearer ' + key }, credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (b) { var url = URL.createObjectURL(b); blobs.push(url); img.src = url; })
      .catch(gone);
  }
  function imageBlock(b) {
    var fig = el('figure', 'b-image');
    var img = el('img');
    img.alt = b.alt || b.caption || '';
    var missing = function () {
      img.remove();
      if (!fig.querySelector('.img-gone')) fig.insertBefore(el('div', 'img-gone', 'The picture could not be loaded'), fig.firstChild);
      fit();
    };
    img.addEventListener('load', fit);
    img.addEventListener('error', missing);
    fig.appendChild(img);
    if (b.caption) fig.appendChild(el('figcaption', null, b.caption));
    pictureInto(img, b.src, missing);
    return fig;
  }

  // --- the blocks a card is made of (PROTOCOL.md, "The `ui` spec") -------------------------------------
  function table(b) {
    var t = el('table', 'b-table');
    if (b.columns && b.columns.length) {
      var hr = el('tr');
      b.columns.forEach(function (c) { hr.appendChild(el('th', null, plain(c))); });
      var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    }
    var body = el('tbody');
    (b.rows || []).forEach(function (row) {
      var tr = el('tr');
      (Array.isArray(row) ? row : [row]).forEach(function (cell) {
        tr.appendChild(el('td', null, cell == null ? '' : plain(typeof cell === 'object' ? (cell.text || JSON.stringify(cell)) : cell)));
      });
      body.appendChild(tr);
    });
    t.appendChild(body);
    return t;
  }
  function chart(b) {
    var values = (b.values || []).map(Number).filter(function (v) { return isFinite(v); });
    if (!values.length) return null;
    var labels = b.labels || [];
    var W = 1000, H = 420, pad = 56, top = 20, max = Math.max.apply(null, values.concat([0])) || 1;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'b-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', b.title || 'A chart');
    function add(tag, attrs, text) {
      var n = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    }
    add('line', { x1: pad, y1: H - pad, x2: W, y2: H - pad, class: 'axis' });
    var step = (W - pad) / values.length;
    var y = function (v) { return top + (H - pad - top) * (1 - v / max); };
    if (b.kind === 'line') {
      add('polyline', { class: 'line', points: values.map(function (v, i) { return (pad + step * (i + .5)) + ',' + y(v); }).join(' ') });
    } else {
      values.forEach(function (v, i) {
        add('rect', { class: 'bar', x: pad + step * i + step * .15, y: y(v), width: step * .7, height: H - pad - y(v), rx: 4 });
      });
    }
    values.forEach(function (v, i) {
      if (labels[i] != null) add('text', { x: pad + step * (i + .5), y: H - pad + 34, 'text-anchor': 'middle', 'font-size': 26 }, String(labels[i]).slice(0, 14));
    });
    add('text', { x: pad - 10, y: top + 10, 'text-anchor': 'end', 'font-size': 24 }, String(max));
    return svg;
  }
  function htmlFrame(b) {
    var markup = typeof b.html === 'string' ? b.html : (typeof b.text === 'string' ? b.text : '');
    if (!markup.trim()) return null;
    var size = Math.round(2.1 * u());
    var css = ':root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;background:transparent}' +
      'body{font-family:-apple-system,"Segoe UI",Roboto,"DejaVu Sans",sans-serif;font-size:' + size + 'px;line-height:1.4;' +
      'color:' + getComputedStyle(document.documentElement).getPropertyValue('--ink') + '}' +
      'img,svg,canvas,video{max-width:100%}table{border-collapse:collapse}th,td{padding:.3em .7em .3em 0;text-align:left}';
    var csp = "default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; " +
      "script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
    var frame = el('iframe', 'b-html');
    // Only scripts of its own: no origin of this page's, so it can read nothing here and ask nothing.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = b.title || 'Something Rouh drew';
    frame.style.height = Math.round(stage.clientHeight * 0.72) + 'px';
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp +
      '"><style>' + css + '</style>' + markup;
    return frame;
  }
  function rowsOf(rows) {
    var ul = el('ul', 'b-list');
    (rows || []).forEach(function (r) {
      var text = Array.isArray(r) ? r.filter(Boolean).join(': ')
        : (r && typeof r === 'object') ? [r.label, r.value || r.text].filter(Boolean).join(': ') : r;
      if (text) { var li = el('li'); li.appendChild(el('span', null, plain(text))); ul.appendChild(li); }
    });
    return ul.children.length ? ul : null;
  }
  function block(b) {
    if (!b || typeof b !== 'object') return null;
    switch (b.block) {
      case 'text': return b.text ? textBlock(b.text) : null;
      case 'list': return b.items && b.items.length ? listBlock(b.items) : null;
      case 'stat': {
        var s = el('div', 'b-stat');
        s.appendChild(el('div', 'value', b.value == null ? '' : b.value));
        if (b.hint) s.appendChild(el('div', 'hint', b.hint));
        return s;
      }
      case 'table': return table(b);
      case 'code': return b.text ? el('pre', 'b-code', b.text) : null;
      case 'chart': return chart(b);
      case 'link': return b.href ? el('div', 'b-link', b.text || b.href) : null;
      case 'image': return imageBlock(b);
      case 'html': return htmlFrame(b);
      case 'sources': {
        var ol = el('ol', 'b-sources');
        (b.sources || []).forEach(function (x) {
          var t = typeof x === 'string' ? x : (x.title || x.url || x.href || '');
          if (t) ol.appendChild(el('li', null, t));
        });
        return ol.children.length ? ol : null;
      }
      case 'email': {
        var m = el('div', 'b-email');
        if (b.subject) m.appendChild(el('div', 'label', b.subject));
        var meta = [b.from && ('From ' + b.from), b.date].filter(Boolean).join(', ');
        if (meta) m.appendChild(el('div', 'meta', meta));
        if (b.body) m.appendChild(el('div', 'body', String(b.body).slice(0, 2400)));
        return m;
      }
      case 'contact': {
        var c = el('div', 'b-email');
        if (b.name) c.appendChild(el('div', 'label', b.name));
        var list = rowsOf(b.rows);
        if (list) c.appendChild(list);
        return c;
      }
      default: {
        // A block made by one of Rouh's own tools that the wall has no drawing for: its words, if any.
        var words = b.title || b.heading || b.question || b.text;
        return words ? textBlock(String(words)) : null;
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
    wall.classList.toggle('resting', !card);
    if (!card) { rest.hidden = false; drawRest(); return; }
    rest.hidden = true;
    var box = el('article', 'card enter');
    if (card.title) box.appendChild(el('h1', null, card.title));
    if (card.description) box.appendChild(el('p', 'desc', card.description));
    var stats = null;
    (card.blocks || []).forEach(function (b) {
      var drawn = block(b);
      if (!drawn) return;
      var wrap = drawn;
      if (b.label && b.block !== 'stat') {
        wrap = el('section');
        wrap.appendChild(el('div', 'label', b.label));
        wrap.appendChild(drawn);
      } else if (b.block === 'stat' && b.label) {
        drawn.insertBefore(el('div', 'label', b.label), drawn.firstChild);
      }
      if (b.block === 'stat') {
        // Numbers side by side, as a row of them reads at a glance.
        if (!stats) { stats = el('div', 'stats'); box.appendChild(stats); }
        stats.appendChild(wrap);
        return;
      }
      stats = null;
      box.appendChild(wrap);
    });
    stage.appendChild(box);
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

  function drawRest() {
    var now = new Date();
    $('restTime').textContent = hhmm(now);
    $('restDay').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function draw(d) {
    unpaired.hidden = true;
    wall.hidden = false;
    if (d.version && d.version === shown.version) return;
    shown.version = d.version || null;
    var cardKey = d.card ? (d.card.card_id + ':' + (d.card.version || 1)) : '';
    if (cardKey !== shown.card) {
      shown.card = cardKey;
      drawCard(d.card || null);
    }
    var before = stage.clientHeight;
    drawCaption(d);
    // The caption band takes the room its words need, so the stage may have grown or shrunk: fit again.
    if (stage.clientHeight !== before) fit();
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
  function notSetUp() {
    unpaired.hidden = false;
    wall.hidden = true;
    $('setupAddr').textContent = location.host + '/projector/setup';
    live();
  }

  function ask() {
    if (DEMO) { draw(DEMO.feed || DEMO); if (DEMO.lost) lost(); if (DEMO.unpaired) notSetUp(); return; }
    var headers = { Accept: 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    var next = EVERY;
    fetch('/api/projector/feed', { headers: headers, credentials: key ? 'omit' : 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { next = EVERY_UNPAIRED; notSetUp(); return null; }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        live();
        draw(d);
        // A fresh page now and then, only while Rouh answers, so a reload never lands on an error page.
        if (Date.now() - began > FRESH_EVERY) location.reload();
      })
      .catch(lost)
      .then(function () { setTimeout(ask, next); });
  }

  function tickClock() {
    clock.textContent = hhmm(new Date());
    if (!rest.hidden) drawRest();
  }
  tickClock();
  setInterval(tickClock, 10000);
  window.addEventListener('resize', fit);
  ask();
})();
