/* The orb the projector's wall rests on (`rouh/projector.py`, projector.js): the work running now, drawn light.
 *
 * Rouh's own page draws the orb as glass tubes in three.js (app/orb3d.js). A Raspberry Pi 3 has no WebGL 2,
 * which three.js needs, and its four small cores cannot draw that glass smoothly anyway, so the wall draws
 * the same tree flat, on one 2D canvas, in the same colours (rouh/static/orb-branching.json's palette):
 *
 *   the machine   a white core with a halo, breathing, and three thin rings turning round it
 *   a job         a turquoise branch out of the core: a soft wide stroke for the glass and a bright thin
 *                 nerve down its middle, tapering to its tip, its name beside the tip
 *   a helper      a thinner branch off its job
 *   a tool call   a short coloured twig off the line that made it; its colour is its kind
 *   running       a ring breathing at the tip
 *   waiting       red and dashed, a square at its tip, the words NEEDS YOU
 *   finished      fades to a faint trace, holds ten seconds, and is gone
 *
 * The tree turns slowly about one upright axis. It is drawn at most 30 times a second, 10 while a card is
 * over it; when it cannot keep up it draws less often, so it slows down evenly instead of stuttering.
 * `ProjectorOrb.stats()` says how it is doing. On the Pi, Chromium runs with --disable-gpu: measured on
 * 27 November 2026, its VC4 chip drew this canvas at 11 frames a second, its CPU alone at 30.
 *
 *   var orb = ProjectorOrb.start(canvas);  orb.tree(feed.tree);  orb.dim(true);
 */
(function () {
  'use strict';

  var PAL = {
    agent: '#36dce5', search: '#ffd064', page: '#ff994d', code: '#69dfa1', shell: '#aa8aff', edit: '#f875d5',
    read: '#bac5d8', api: '#729dff', other: '#8993a7', wait: '#ff3655', ghost: '#596170', self: '#cfd9ee'
  };
  var KINDS = {
    search: /^(web_?search|websearch|search_web|google_search|brave_web_search|tavily_search|youtube_search|linkedin_search)/i,
    page: /^(web_?fetch|fetch|open_url|read_url|read_rouh_link|browser|youtube_transcript|linkedin_profile)/i,
    code: /(code_execution|^python|^js_repl|^run_code|^execute_code)/i,
    shell: /^(bash|bashoutput|killshell|run_command|exec_command|shell|local_shell|write_stdin|unified_exec)/i,
    edit: /^(edit|write|multiedit|notebookedit|apply_patch|edit_page|edit_doc|edit_sheet|edit_slides)/i,
    read: /^(read|glob|grep|ls|list_|read_workspace|recall|thoughts|list_memory)/i,
    api: /^(mail_|read_mail|send_|draft_mail|slack_|calendar|list_calendar|create_calendar|drive|search_drive|doc|contact|meeting_|hue|notify_|request_from_rouh|assistant_job|stripe|cloudflare)/i
  };
  var FPS = 30, FPS_DIM = 10;
  var DIM = 0.8;                         // how much of the orb a card over it hides
  var SPIN = 0.07;                       // radians a second about the upright axis
  var TILT = 0.38;                       // the axis leans towards the viewer this much
  var GHOST_IN = 1.5, GHOST_HOLD = 10, GHOST_OUT = 1.8, GHOST_LEVEL = 0.16;
  var GROW = 1.2;                        // seconds a new line takes to reach its tip
  var MAX_TWIGS = 12;

  // A number in [0, 1) from an id, a different one for each salt, well mixed: ids such as "run-4" and
  // "run-5" must not point the same way.
  function hash(s, salt) {
    var h = 2166136261;
    s = String(salt || 0) + ':' + String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function toolKind(label) {
    var name = String(label || '').replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '').trim().split(/[\s:(]/)[0];
    for (var k in KINDS) if (KINDS[k].test(name)) return k;
    return 'other';
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }

  function start(canvas, opts) {
    opts = opts || {};
    var g = canvas.getContext('2d', { alpha: false });
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var scene = Object.create(null);      // id -> node
    var order = [];                       // ids, parents before children
    var scale = 1, W = 0, H = 0, R = 0, cx = 0, cy = 0;
    var dimmed = false, dimLevel = 0, lastDraw = 0, frame = 0, stamp = 0;
    var costs = [], fpsCap = FPS, checkedAt = 0, bad = 0, good = 0;
    var stats = { drawMs: 0, fps: 0, scale: 1, nodes: 0, frames: 0 };
    var sprite = null, bg = '#05070a', ink = '#a3aebb';
    var t0 = performance.now();

    function colours() {
      var cs = getComputedStyle(document.documentElement);
      bg = (cs.getPropertyValue('--ground') || '#05070a').trim() || '#05070a';
      ink = (cs.getPropertyValue('--dim') || '#a3aebb').trim() || '#a3aebb';
    }
    function makeSprite() {
      // The core and its halo, drawn once: a radial gradient is the dearest thing a 2D canvas draws.
      var s = Math.max(16, Math.round(R * 0.5));
      var c = document.createElement('canvas');
      c.width = c.height = s * 2;
      var x = c.getContext('2d');
      var gr = x.createRadialGradient(s, s, 0, s, s, s);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.07, 'rgba(255,255,255,1)');
      gr.addColorStop(0.1, 'rgba(225,250,255,0.55)');
      gr.addColorStop(0.3, 'rgba(120,225,240,0.16)');
      gr.addColorStop(1, 'rgba(54,220,229,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, s * 2, s * 2);
      sprite = c;
    }
    function size() {
      var w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      W = canvas.width; H = canvas.height;
      R = Math.min(W * 0.36, H * 0.56);
      cx = W / 2; cy = H / 2;
      colours();
      makeSprite();
    }

    // --- the tree: what the feed sent, as lasting nodes that grow, wait and fade ------------------------
    function place(n, parent) {
      var j = hash(n.id, 1), k = hash(n.id, 2), m = hash(n.id, 3);
      if (n.kind === 'tool') {
        n.len = 0.13 + 0.09 * j;
        n.at = 0.35 + 0.6 * k;
        n.splay = (m - 0.5) * 2;
        return;
      }
      if (!parent || parent.kind === 'root') {
        // A job: its own direction round the core, flattened front to back so the tree reads wide.
        var th = j * Math.PI * 2, ph = Math.acos(1 - 2 * (0.15 + 0.7 * k));
        n.dir = norm([Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.85, Math.sin(ph) * Math.sin(th) * 0.6]);
        n.from = [0, 0, 0];
        n.len = 0.62 + 0.14 * m;
        n.w = 1;
      } else {
        // A helper: forks off its job part of the way out, leaning away from it.
        var side = norm(cross(parent.dir, [0, 1, 0.3]));
        var up = norm(cross(side, parent.dir));
        var a = j * Math.PI * 2;
        n.fork = 0.52 + 0.3 * k;
        n.dir = norm(add(add(parent.dir, side, Math.cos(a) * 0.75), up, Math.sin(a) * 0.75));
        n.len = parent.len * (0.5 + 0.2 * m);
        n.w = parent.w * 0.62;
      }
      var s2 = norm(cross(n.dir, [0.3, 1, 0]));
      n.bend = add([0, 0, 0], s2, 0.19 * (hash(n.id, 4) - 0.5) * 2);
    }
    function setTree(root, serverNow) {
      if (!root || typeof root !== 'object') return;
      var now = performance.now() / 1000;
      var skew = serverNow ? serverNow - Date.now() / 1000 : 0;
      stamp++;
      order = [];
      var stack = [[root, null]], guard = 0;
      while (stack.length && guard++ < 1200) {
        var top = stack.pop(), raw = top[0], parent = top[1];
        if (!raw || typeof raw !== 'object') continue;
        var id = String(raw.id == null ? (parent ? parent.id : '') + '#' + order.length : raw.id);
        var n = scene[id];
        if (!n) {
          var age = raw.opened_at ? Date.now() / 1000 + skew - raw.opened_at : 99;
          n = scene[id] = { id: id, kind: raw.kind || 'tool', born: now - Math.max(0, Math.min(age, 99)), twig: 0 };
          if (n.kind !== 'root') place(n, parent);
          if (n.kind === 'tool') n.ink = PAL[toolKind(raw.label)];
        }
        n.parent = parent ? parent.id : null;
        n.label = String(raw.label || '').replace(/\s+/g, ' ').slice(0, 48);
        n.state = raw.state || 'running';
        n.seen = stamp;
        if (n.state === 'done' || n.state === 'failed' || n.state === 'lost') { if (!n.ended) n.ended = now; }
        else n.ended = 0;
        if (n.kind === 'tool' && raw.opened_at) {
          var end = raw.closed_at || (Date.now() / 1000 + skew);
          n.ran = Math.max(0, end - raw.opened_at);
        }
        order.push(id);
        var kids = raw.children || [];
        for (var i = kids.length - 1; i >= 0; i--) stack.push([kids[i], n]);
      }
      // What the feed no longer sends has finished: it fades like anything else that ended.
      for (var key in scene) {
        var o = scene[key];
        if (o.seen !== stamp && !o.ended) o.ended = now;
        if (o.seen !== stamp) order.push(key);
      }
    }

    // A name drawn once, with its dark backing, and kept: text is dear to draw thirty times a second.
    var labelCache = Object.create(null), labelCount = 0;
    function labelImage(text, warn, fs) {
      var k = fs + '|' + (warn ? 1 : 0) + '|' + bg + '|' + text;
      if (labelCache[k]) return labelCache[k];
      if (++labelCount > 200) { labelCache = Object.create(null); labelCount = 1; }
      var c = document.createElement('canvas'), x = c.getContext('2d');
      var font = '600 ' + fs + 'px "DejaVu Sans", system-ui, sans-serif';
      x.font = font;
      var pad = Math.round(fs * 0.35), tw = Math.ceil(x.measureText(text).width);
      c.width = tw + pad * 2; c.height = Math.round(fs * 1.44);
      x.globalAlpha = 0.78; x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
      x.globalAlpha = warn ? 1 : 0.9; x.font = font; x.textBaseline = 'middle';
      x.fillStyle = warn ? PAL.wait : ink;
      x.fillText(text, pad, c.height / 2);
      return (labelCache[k] = c);
    }

    // --- drawing ---------------------------------------------------------------------------------------
    function alphaOf(n, now) {
      var grow = Math.min(1, (now - n.born) / GROW);
      if (!n.ended || n.state === 'waiting') return { a: 1, grow: grow };
      var d = now - n.ended;
      if (d < GHOST_IN) return { a: 1 - (1 - GHOST_LEVEL) * d / GHOST_IN, grow: grow };
      if (d < GHOST_IN + GHOST_HOLD) return { a: GHOST_LEVEL, grow: grow };
      var out = (d - GHOST_IN - GHOST_HOLD) / GHOST_OUT;
      return out >= 1 ? null : { a: GHOST_LEVEL * (1 - out), grow: grow };
    }
    var rot = { s: 0, c: 1 };
    var TS = Math.sin(TILT), TC = Math.cos(TILT);
    function project(p) {
      var x = p[0] * rot.c + p[2] * rot.s, z = -p[0] * rot.s + p[2] * rot.c, y = p[1];
      var y2 = y * TC - z * TS, z2 = y * TS + z * TC;
      var k = 1 / (1 + z2 * 0.32);
      return [cx + x * R * k, cy - y2 * R * k, k];
    }
    function pathOf(n, parentNode, grow) {
      var from = n.from;
      if (!from) {
        var pp = parentNode && parentNode.pts3 ? parentNode.pts3 : null;
        from = pp ? pp[Math.round(n.fork * (pp.length - 1))] : [0, 0, 0];
      }
      var len = n.len * grow;
      var pts = [];
      for (var i = 0; i <= 6; i++) {
        var t = i / 6, b = Math.sin(t * Math.PI) * len;
        pts.push(add(add(from, n.dir, len * t), n.bend, b));
      }
      return pts;
    }
    function stroke(pts2, w0, w1, colour, alpha, dash) {
      // A tapering line: one short stroke per stretch, each a little thinner than the one before.
      g.strokeStyle = colour;
      g.globalAlpha = alpha;
      if (dash) g.setLineDash(dash);
      for (var i = 1; i < pts2.length; i++) {
        var t = (i - 0.5) / (pts2.length - 1);
        g.lineWidth = Math.max(0.6, (w0 + (w1 - w0) * t) * pts2[i][2]);
        g.beginPath();
        g.moveTo(pts2[i - 1][0], pts2[i - 1][1]);
        g.lineTo(pts2[i][0], pts2[i][1]);
        g.stroke();
      }
      if (dash) g.setLineDash([]);
    }
    function draw(nowMs) {
      var now = nowMs / 1000, el = (nowMs - t0) / 1000;
      var ang = reduced ? 0.6 : el * SPIN + 0.6;
      rot.s = Math.sin(ang); rot.c = Math.cos(ang);
      g.globalAlpha = 1;
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      var breath = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(el * Math.PI * 2 / 4.2);
      var u = R / 100;

      // The rings round the core: the one thing that moves when nothing is running.
      g.lineWidth = Math.max(1, 0.35 * u);
      for (var r = 0; r < 3; r++) {
        var ra = ang * (r === 1 ? -1.3 : 1) + r * 1.05;
        g.globalAlpha = 0.22 + 0.1 * breath;
        g.strokeStyle = r === 1 ? PAL.self : PAL.agent;
        g.beginPath();
        g.ellipse(cx, cy, R * 0.2, R * 0.2 * Math.abs(Math.cos(ra)) + 1, r * Math.PI / 3 + ang * 0.2, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 0.12 + 0.12 * breath;
      g.lineWidth = Math.max(1, 0.25 * u);
      g.beginPath();
      g.arc(cx, cy, R * (0.27 + 0.015 * breath), 0, Math.PI * 2);
      g.stroke();

      // The branches, parents first so a helper can start where its job is.
      var drawn = 0, twigsOf = Object.create(null), labels = [];
      for (var i = 0; i < order.length; i++) {
        var n = scene[order[i]];
        if (!n || n.kind === 'root') continue;
        var vis = alphaOf(n, now);
        if (!vis) { delete scene[n.id]; continue; }
        var parentNode = n.parent ? scene[n.parent] : null;
        if (n.kind === 'tool') {
          if (!parentNode || !parentNode.pts3) continue;
          var c = (twigsOf[n.parent] = (twigsOf[n.parent] || 0) + 1);
          if (c > MAX_TWIGS) continue;
          var base = parentNode.pts3[Math.max(1, Math.round(n.at * (parentNode.pts3.length - 1)))];
          var pd = parentNode.dir || [0, 1, 0];
          var side = norm(cross(pd, [0, 1, 0.2]));
          var grown = Math.min(1, 0.45 + (n.ran || 0) / 30) * vis.grow;
          var tip = add(add(base, side, n.splay * n.len * grown), pd, n.len * 0.6 * grown);
          var a2 = project(base), b2 = project(tip);
          var live = !n.ended;
          var colour = live ? n.ink : PAL.ghost;
          g.globalAlpha = vis.a * (live ? 0.95 : 1) * (parentNode.dim || 1);
          g.strokeStyle = colour;
          g.lineWidth = Math.max(1, 0.45 * u * b2[2]);
          g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke();
          g.fillStyle = colour;
          g.beginPath(); g.arc(b2[0], b2[1], Math.max(1.5, 0.75 * u * b2[2]), 0, Math.PI * 2); g.fill();
          drawn++;
          continue;
        }
        n.pts3 = pathOf(n, parentNode, vis.grow);
        n.dim = vis.a;
        var pts2 = n.pts3.map(project);
        var waiting = n.state === 'waiting';
        var ended = !!n.ended && !waiting;
        var col = waiting ? PAL.wait : ended ? PAL.ghost : (n.kind === 'self' ? PAL.self : PAL.agent);
        var w0 = 3.2 * u * n.w, w1 = w0 * 0.14;
        if (waiting) {
          stroke(pts2, w0 * 0.5, w1, col, 0.55 + 0.4 * breath, [1.6 * u, 1.1 * u]);
        } else {
          stroke(pts2, w0, w1 * 1.6, col, 0.2 * vis.a);              // the glass
          stroke(pts2, w0 * 0.55, w1, col, 0.3 * vis.a);              // its edge, brighter
          if (!ended) stroke(pts2, Math.max(1.2, w0 * 0.18), 0.8, '#d9fdff', 0.85 * vis.a); // the nerve
        }
        var tipP = pts2[pts2.length - 1];
        if (waiting) {
          var sq = (1.3 + 0.5 * breath) * u;
          g.globalAlpha = 1;
          g.fillStyle = PAL.wait;
          g.fillRect(tipP[0] - sq / 2, tipP[1] - sq / 2, sq, sq);
          g.strokeStyle = PAL.wait;
          g.lineWidth = Math.max(1, 0.3 * u);
          g.strokeRect(tipP[0] - sq * 1.4, tipP[1] - sq * 1.4, sq * 2.8, sq * 2.8);
        } else if (!ended && vis.grow >= 1) {
          g.globalAlpha = 0.25 + 0.55 * (1 - breath);
          g.strokeStyle = col;
          g.lineWidth = Math.max(1, 0.3 * u);
          g.beginPath(); g.arc(tipP[0], tipP[1], (0.8 + 1.4 * breath) * u * tipP[2], 0, Math.PI * 2); g.stroke();
        }
        if (n.parent && scene[n.parent] && scene[n.parent].kind === 'root' && n.label && vis.a > 0.3) {
          var short = n.label.length > 30 ? n.label.slice(0, 29).replace(/\s+\S*$/, '') + '…' : n.label;
          labels.push([tipP, waiting ? 'NEEDS YOU · ' + short : short, waiting, vis.a]);
        }
        drawn++;
      }

      // The core, over the roots of the branches.
      var cs = sprite.width * (0.92 + 0.08 * breath);
      g.globalAlpha = 1;
      g.drawImage(sprite, cx - cs / 2, cy - cs / 2, cs, cs);

      // The names of the jobs, beside their tips, on the side away from the core: large enough to read from
      // a sofa (2 hundredths of a 16:9 wall's width, the page's own unit), on a dark backing so no twig
      // crosses them, and stacked so that two on the same side never touch.
      if (labels.length) {
        var pu = Math.min(W, H * 1.7778) / 100;
        var fs = Math.max(11, Math.round(2 * pu));
        var gapY = fs * 1.5;
        [true, false].forEach(function (side) {
          var mine = labels.filter(function (l) { return (l[0][0] >= cx) === side; })
            .sort(function (p, q) { return p[0][1] - q[0][1]; });
          var lastY = -1e9;
          for (var L = 0; L < mine.length; L++) {
            var lb = mine[L], y = Math.max(lb[0][1], lastY + gapY);
            lastY = y;
            var img = labelImage(lb[1], lb[2], fs);
            var x = lb[0][0] + (side ? 1 : -1) * fs * 0.55;
            x = side ? Math.min(x, W - img.width) : Math.max(x - img.width, 0);
            g.globalAlpha = Math.min(1, lb[3]);
            g.drawImage(img, Math.round(x), Math.round(y - img.height / 2));
          }
        });
      }
      // Dimmed under a card: a veil of the ground drawn over it, eased in and out here rather than by the
      // page, since fading a whole-screen layer is what a Raspberry Pi 3 draws slowest.
      var want = dimmed ? DIM : 0;
      dimLevel += (want - dimLevel) * Math.min(1, (nowMs - (draw.last || nowMs)) / 450);
      draw.last = nowMs;
      if (dimLevel > 0.01) {
        g.globalAlpha = dimLevel;
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = 1;
      stats.nodes = drawn;
    }

    function loop(nowMs) {
      frame = requestAnimationFrame(loop);
      // Dimmed, and done fading: drawn a third as often, leaving the Pi to the card.
      var cap = dimmed && dimLevel > DIM - 0.02 ? FPS_DIM : fpsCap;
      if (nowMs - lastDraw < 1000 / cap - 2) return;
      var gap = nowMs - lastDraw;
      lastDraw = nowMs;
      var a = performance.now();
      draw(nowMs);
      var cost = performance.now() - a;
      // Judged only on frames drawn at full brightness: dimmed, it draws slower on purpose.
      if (dimmed || dimLevel > 0.02) { costs = []; checkedAt = nowMs; return; }
      costs.push([cost, gap]);
      stats.frames++;
      if (nowMs - checkedAt > 3000 && costs.length > 10) {
        checkedAt = nowMs;
        var sum = 0, gaps = 0;
        for (var i = 0; i < costs.length; i++) { sum += costs[i][0]; gaps += costs[i][1]; }
        stats.drawMs = +(sum / costs.length).toFixed(1);
        stats.fps = +(1000 / (gaps / costs.length)).toFixed(1);
        costs = [];
        // Too slow for its frame rate: draw less often, evenly, rather than at an uneven pace. (Drawing
        // smaller does not help on a Pi 3 without its graphics chip: stretching the picture costs more.)
        // Not in the first seconds, while the page itself is still settling; slower only after two slow
        // spells in a row, and back up after three easy ones.
        if (nowMs - t0 > 6000) {
          var slow = stats.fps < fpsCap * 0.8;
          bad = slow ? bad + 1 : 0;
          good = !slow && stats.drawMs < 10 ? good + 1 : 0;
          if (bad >= 2 && fpsCap > 15) { fpsCap = fpsCap > 20 ? 20 : 15; bad = 0; }
          if (good >= 3 && fpsCap < FPS) { fpsCap = Math.min(FPS, fpsCap + 5); good = 0; }
        }
        stats.scale = scale; stats.cap = fpsCap;
      }
    }

    size();
    window.addEventListener('resize', size);
    if (opts.scale) { scale = opts.scale; size(); }
    frame = requestAnimationFrame(loop);
    var api = {
      tree: setTree,
      dim: function (on) { dimmed = !!on; },
      stats: function () { return JSON.parse(JSON.stringify(stats)); },
      recolour: colours,
      stop: function () { cancelAnimationFrame(frame); }
    };
    return api;
  }

  window.ProjectorOrb = { start: start };
})();
