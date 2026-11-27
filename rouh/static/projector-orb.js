/* The orb on the projector's wall (`rouh/projector.py`, projector.js): Rouh's own orb, in the shapes and the
 * colours of the one on Rouh's page, drawn by what a Raspberry Pi 3 can draw.
 *
 * Petar, 27 November 2026: "can we make the tentacles the same shape as the normal 3d orb? basically get the
 * same look + the names you have added". The orb on Rouh's page (app/orb3d.js) is three.js glass, which needs
 * WebGL 2. Measured on the Pi 3 that day: its VC4 chip gives WebGL 1 only, and Chromium's software WebGL 2
 * (SwiftShader) drew the real orb at one frame in about 54 seconds, using half the Pi's memory. So this draws
 * the very same tree on one 2D canvas, from the same code paths, ported line for line:
 *
 *   the same      branching rules (rouh/static/orb-branching.json, read from Rouh), the same seeded numbers
 *                 from each job's id (so a job has the shape here it has on Rouh's page), the same paths
 *                 (bend, wander, wobble, taper), forks, twig lengths by how long a call ran, growth (the tip
 *                 travels out in a second, then the branch thickens), fading (30 s down to half with brief
 *                 flashes, 3 minutes held, 3 minutes as a grey trace), palette, camera (38 degree view,
 *                 framed on what is drawn), and the slow turn of the whole tree.
 *   drawn as      the glass's look: a faint body, bright coloured edges (the glass is nearly see-through in
 *                 the middle and nearly solid at its edges), a white-hot nerve down the middle, and a soft
 *                 glow round each branch; the white core with its halo, red while anything waits.
 *   left out      what needs a 3D renderer: the studio reflections and clear coat, the lighting of the
 *                 tube's surface, and the bloom pass (a glow drawn round each line stands in for it).
 *   added         each job's short name at its tip, large, for a room (`short`); NEEDS YOU at a waiting one.
 *
 * While a card is up over it, the orb moves to the corner and draws a third as often; it comes back when the
 * card goes. `ProjectorOrb.stats()` says how fast it draws.
 *
 *   var orb = ProjectorOrb.start(canvas, { rules: '/a/<hash>/orb-branching.json' });
 *   orb.tree(feed.tree, feed.now);  orb.corner(true);
 */
(function () {
  'use strict';

  var FPS = 30, FPS_CORNER = 10;
  var SEGMENTS = 32;
  var SPIN = 0.07;                 // radians a second, the group's turn on Rouh's page
  var PITCH = 0.18;                // the camera a little above the tree
  var MAX_TWIGS = 24;

  // --- vectors ---------------------------------------------------------------------------------------
  function v(x, y, z) { return [x, y, z]; }
  function add(a, b, k) { if (k == null) k = 1; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function smoothstep(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  // --- the same seeded numbers as app/orb3d.js -------------------------------------------------------
  function hashId(s) {
    var h = 2166136261, i;
    s = String(s);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(id) {
    var a = hashId(id) || 1;
    function next() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    return { next: next, R: function (lo, hi) { return lo + (hi - lo) * next(); } };
  }

  // The kind of a tool call, by its name: the colour of its twig (app/orb.js's kindOf, its main names).
  var KINDS = {
    search: /^(web_?search|websearch|web_search_call|search_web|google_search|brave_web_search|tavily_search|youtube_search|linkedin_search)$/i,
    page: /^(web_?fetch|fetch|fetch_url|open_url|read_url|read_rouh_link|browser\w*|youtube_transcript|linkedin_profile)$/i,
    code: /(code_execution$|^python$|^js_repl$|^run_code$|^execute_code$)/i,
    shell: /^(bash|bashoutput|killshell|run_command|exec_command|shell|local_shell|local_shell_call|write_stdin|unified_exec|container_exec)$/i,
    edit: /^(edit|write|multiedit|notebookedit|apply_patch|str_replace\w*|edit_page)$/i,
    read: /^(read|glob|grep|ls|notebookread|view|read_workspace|recall_result|thoughts|list_memory|todowrite|toolsearch)$/i,
    api: /^(mail_|read_mail|read_recent_mail|draft_mail|send_|forward_|modify_mail|slack_|stripe|cloudflare|payments|shipping|calendar|list_calendar|read_calendar|create_calendar|update_calendar|when_free|upcoming|drive|search_drive|list_drive|doc|read_doc|create_doc|edit_doc|edit_sheet|edit_slides|contact|search_contacts|meeting_|hue|notify_|request_from_rouh|one_|assistant_job|delegate_task)/i
  };
  function kindOf(label) {
    var name = String(label || '').trim().split(/[\s:(]/)[0];
    var mcp = /^mcp__(.+?)__(.+)$/.exec(name);
    if (mcp) name = mcp[2];
    if (/^browser_(evaluate|run_code_unsafe)$/i.test(name)) return 'code';
    for (var k in KINDS) if (KINDS[k].test(name)) return k;
    if (mcp && mcp[1] !== 'rouh') return 'api';
    return 'other';
  }

  // A job's short name for the wall: the part before a colon or a dash, at most four words.
  function short(label) {
    var s = String(label || '').replace(/\s+/g, ' ').trim();
    s = s.split(/\s*(?::|—|–| - |\|)\s*/)[0] || s;
    s = s.replace(/^(task|step)\s+\d+(-\d+)?\s*/i, '');
    var words = s.split(' ');
    if (words.length > 4) s = words.slice(0, 4).join(' ') + '…';
    return s.length > 28 ? s.slice(0, 27).replace(/\s+\S*$/, '') + '…' : s;
  }

  function hexRgb(hex) { var n = parseInt(String(hex).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function mix(c, d, t) { return [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t), Math.round(c[2] + (d[2] - c[2]) * t)]; }

  function start(canvas, opts) {
    opts = opts || {};
    var g = canvas.getContext('2d', { alpha: false });
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var RULES = null, PAL = {}, D = null;
    var REC = new Map();
    var tree = null, skew = 0, stamp = 0, frameNo = 0;
    var W = 0, H = 0, cornerT = 0, cornerOn = false, reserve = 0, reserveNow = 0;
    var growth = 0, lastT = 0, spin = 0.6, lastDraw = 0, frame = 0, checkedAt = 0, costs = [];
    var fpsCap = FPS, bad = 0, good = 0;
    var stats = { drawMs: 0, fps: 0, records: 0, frames: 0, cap: FPS, rules: false, waiting: 0 };
    var labelCache = Object.create(null), labelCount = 0;
    var haloSprite = null, haloKey = '';
    var t0 = performance.now();

    function size() {
      W = canvas.width = Math.max(1, Math.round(window.innerWidth));
      H = canvas.height = Math.max(1, Math.round(window.innerHeight));
      haloKey = '';
    }

    // --- the rules, read from Rouh: the same file the orb on Rouh's page reads ---------------------------
    // The person's own settings from the orb's cog on their screen (`settings.ORB3D`, in the feed as `orb3d`),
    // over the design's (task 200, 200-05: "Whatever I see on the settings should be valid for the projector
    // too"). Drawn here: glow, core glow, edge glow, thickness, the nerve, growth speed and the whole fade.
    // Not drawn: reflections and light, which light the glass's surface and need a 3D renderer.
    var SAVED = null;
    function settle() {
      if (!RULES) return;
      var out = {}, k, lim = RULES.limits || {};
      for (k in RULES.defaults) out[k] = RULES.defaults[k];
      if (SAVED) {
        for (k in lim) if (typeof SAVED[k] === 'number' && isFinite(SAVED[k])) out[k] = Math.max(lim[k][0], Math.min(lim[k][1], SAVED[k]));
        if (typeof SAVED.nerve === 'number') out.nerve = SAVED.nerve !== 0;
        if (typeof SAVED.blinkDown === 'number') out.blinkDirection = SAVED.blinkDown ? 'down' : 'up';
      }
      D = out;
      haloKey = '';
    }
    function settings(saved) {
      var next = saved && typeof saved === 'object' ? saved : null;
      if (JSON.stringify(next) === JSON.stringify(SAVED)) return;
      SAVED = next;
      settle();
    }
    function useRules(r) {
      RULES = r;
      settle();
      for (var k in r.palette) PAL[k] = hexRgb(r.palette[k]);
      stats.rules = true;
    }
    function fetchRules() {
      if (!opts.rules) return;
      fetch(opts.rules, { credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(useRules)
        .catch(function () { setTimeout(fetchRules, 10000); });
    }
    fetchRules();

    // --- shapes: app/orb3d.js's branchPath, tubeGeometry's centre line, jobDirection, makeRecord -------------
    function branchPath(rng, origin, d, length, radius) {
      var P = RULES.path, R = rng.R;
      var Z = v(0, 0, 1), Y = v(0, 1, 0);
      var side = norm(cross(d, Math.abs(d[2]) < 0.9 ? Z : Y));
      var up = norm(cross(d, side));
      var phase = R(0, Math.PI * 2), phase2 = R(0, Math.PI * 2);
      var bend = add(scale(side, R(-P.bendSide, P.bendSide)), up, R(-P.bendUp, P.bendUp));
      var pts = [origin.slice()];
      for (var i = 1; i <= P.samples; i++) {
        var t = i / P.samples;
        var wander = scale(add(scale(side, Math.sin(t * P.wanderFreqSide + phase) - Math.sin(phase)), up,
          Math.sin(t * P.wanderFreqUp + phase2) - Math.sin(phase2)), length * P.wander * t);
        pts.push(add(add(add(origin, d, length * t), bend, length * t * t), wander));
      }
      return { pts: pts, radius: Math.max(radius, P.minRadius),
               wob: function (u) { return 1 + P.wobble * Math.sin(u * P.wobbleFreq + phase); } };
    }
    // The centre line, smoothed through the path's points (centripetal Catmull-Rom, as three.js's
    // CatmullRomCurve3), then taken at SEGMENTS + 1 even steps along its length.
    function centreLine(P) {
      var fine = [], n = P.length;
      function pt(i) {
        if (i < 0) return add(P[0], add(P[0], P[1], -1), 1);
        if (i >= n) return add(P[n - 1], add(P[n - 1], P[n - 2], -1), 1);
        return P[i];
      }
      for (var i = 0; i < n - 1; i++) {
        var p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
        var t01 = Math.pow(dist(p0, p1), 0.5) || 1e-4, t12 = Math.pow(dist(p1, p2), 0.5) || 1e-4, t23 = Math.pow(dist(p2, p3), 0.5) || 1e-4;
        for (var s = 0; s < 12; s++) {
          var u = s / 12, c = [];
          for (var k = 0; k < 3; k++) {
            var m1 = (p2[k] - p1[k] + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)));
            var m2 = (p2[k] - p1[k] + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23)));
            var a = 2 * p1[k] - 2 * p2[k] + m1 + m2, b = -3 * p1[k] + 3 * p2[k] - 2 * m1 - m2;
            c.push(a * u * u * u + b * u * u + m1 * u + p1[k]);
          }
          fine.push(c);
        }
      }
      fine.push(P[n - 1].slice());
      var acc = [0];
      for (var j = 1; j < fine.length; j++) acc.push(acc[j - 1] + dist(fine[j - 1], fine[j]));
      var total = acc[acc.length - 1] || 1, out = [], at = 0;
      for (var q = 0; q <= SEGMENTS; q++) {
        var want = total * q / SEGMENTS;
        while (at < acc.length - 2 && acc[at + 1] < want) at++;
        var span = acc[at + 1] - acc[at] || 1, f = Math.max(0, Math.min(1, (want - acc[at]) / span));
        out.push(add(fine[at], add(fine[at + 1], fine[at], -1), f));
      }
      var tans = out.map(function (p, i2) { return norm(add(out[Math.min(SEGMENTS, i2 + 1)], out[Math.max(0, i2 - 1)], -1)); });
      return { centres: out, tangents: tans, length: total };
    }
    function jobDirection(rng) {
      var A = RULES.agent, best = null, bestScore = -1, taken = [];
      REC.forEach(function (r) { if (r.depth === 1 && !r.removed) taken.push(r.dir); });
      for (var c = 0; c < 8; c++) {
        var z = rng.R(-1, 1), a = rng.R(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
        var d = norm(v(Math.cos(a) * s, Math.sin(a) * s, z * A.zSquash));
        var score = 4;
        for (var i = 0; i < taken.length; i++) score = Math.min(score, dist(d, taken[i]));
        if (score > bestScore) { bestScore = score; best = d; }
        if (!taken.length) break;
      }
      return best;
    }
    function makeRecord(n, parent, tnow) {
      var A = RULES.agent, Pr = RULES.process, rng = seeded(n.id), role = n.kind === 'tool' ? 'twig' : 'branch';
      var depth = parent ? parent.depth + 1 : 1, origin, dir, length, radius, fork = 0;
      if (!parent) {
        origin = v(0, 0, 0);
        dir = jobDirection(rng);
        if (role === 'twig') {
          length = rng.R(A.length[0], A.length[1]) * rng.R(Pr.length[0], Pr.length[1]) * Pr.longest;
          radius = Pr.radius;
        } else {
          length = rng.R(A.length[0], A.length[1]);
          radius = A.radius;
        }
      } else {
        var lo = role === 'twig' ? Pr.fork[0] : A.childFork[0], hi = role === 'twig' ? Pr.fork[1] : A.childFork[1];
        fork = rng.R(lo, hi);
        var at = Math.round(fork * SEGMENTS);
        origin = parent.centres[at].slice();
        var tan = norm(parent.tangents[at]);
        var side = norm(v(-tan[1], tan[0], rng.R(-0.4, 0.4)));
        if (role === 'twig') {
          var sign = rng.next() < 0.5 ? -1 : 1;
          var angle = sign * (Pr.minAngle + rng.R(0, Pr.spread)) + rng.R(-Pr.spreadJitter, Pr.spreadJitter);
          dir = norm(add(scale(tan, Math.cos(angle)), side, Math.sin(angle)));
          length = parent.length * rng.R(Pr.length[0], Pr.length[1]) * Math.pow(Pr.lengthFalloff, depth - 2) * Pr.longest;
          radius = Math.max(Pr.minRadius, Pr.radius * Math.pow(Pr.radiusFalloff, depth - 2));
        } else {
          dir = norm(add(scale(tan, A.childLean), side, (rng.next() < 0.5 ? 1 : -1) * rng.R(A.childSpread[0], A.childSpread[1])));
          length = parent.length * rng.R(A.childLength[0], A.childLength[1]);
          radius = Math.min(A.radius * Math.pow(A.radiusFalloff, depth - 1), parent.radius * A.childRadiusOfParent);
        }
      }
      var path = branchPath(rng, origin, dir, length, radius);
      var line = centreLine(path.pts);
      var seenLate = n.opened && tnow - n.opened > 2500;
      var born = seenLate ? growth - 60 : growth;
      if (parent && !seenLate) born = Math.max(born, parent.born + RULES.growth.tipSeconds * fork);
      var wob = [];
      for (var i = 0; i <= SEGMENTS; i++) wob.push(path.wob(i / SEGMENTS));
      var r = { id: n.id, node: n, role: role, depth: depth, dir: dir,
                centres: line.centres, tangents: line.tangents, length: length, radius: path.radius, wob: wob,
                fork: fork, born: born, finished: 0, life: null, seen: 0, removed: false, reveal: -1 };
      REC.set(n.id, r);
      return r;
    }

    // --- a frame's state: app/orb3d.js's lifecycle and updateRecord ------------------------------------------
    function lifecycle(age) {
      var c = { end: D.endLevel / 100, seconds: D.fadeSeconds, rate: D.blinkRate, length: D.blinkLength / 1000,
                hold: D.holdMinutes * 60, ghost: D.ghostSeconds, direction: D.blinkDirection };
      var level = 1 + (c.end - 1) * Math.min(1, Math.max(0, age) / c.seconds);
      if (age >= c.seconds + c.hold + c.ghost) return { state: 'removed', alpha: 0 };
      if (age >= c.seconds + c.hold) return { state: 'ghost', alpha: 0 };
      if (age >= c.seconds) return { state: 'holding', alpha: c.end };
      var flashing = !reduced && age >= 1 / c.rate && (age % (1 / c.rate)) < c.length;
      return { state: 'fading', alpha: flashing ? (c.direction === 'down' ? 0 : 1) : level };
    }
    function costOf(n, tnow) {
      var secs = n.ms != null && n.closed ? n.ms / 1000 : Math.max(0, ((n.closed || tnow) - n.opened) / 1000);
      return Math.max(0, Math.min(1, Math.log(1 + secs) / Math.log(1 + RULES.process.fullAfterSeconds)));
    }

    // The feed's tree, as app/orb.js hands it on: nodes with their calls and their helpers, times in ms,
    // `fade` set from when this page saw a node finish (or go from the tree).
    var NODES = Object.create(null);
    var SELF_ID = 'rouh-self';
    function setTree(root, serverNow) {
      if (!root || typeof root !== 'object') return;
      skew = serverNow ? serverNow * 1000 - Date.now() : 0;
      stamp++;
      var now = Date.now();
      function take(raw, parentId) {
        if (!raw || typeof raw !== 'object' || raw.id == null) return null;
        var id = String(raw.id), n = NODES[id];
        if (!n) n = NODES[id] = { id: id, fade: 0 };
        n.kind = raw.kind === 'tool' ? 'tool' : raw.kind || 'worker';
        n.label = String(raw.label || '');
        n.state = raw.state || 'running';
        n.asking = raw.asking || '';
        n.opened = raw.opened_at ? raw.opened_at * 1000 - skew : (n.opened || now);
        n.closed = raw.closed_at ? raw.closed_at * 1000 - skew : 0;
        n.ms = raw.ms;
        n.parent = parentId;
        n.seen = stamp;
        var done = n.state === 'done' || n.state === 'failed' || n.state === 'lost';
        if (done && !n.fade) n.fade = now;
        if (!done) n.fade = 0;
        n.calls = []; n.subs = [];
        (raw.children || []).forEach(function (k) {
          var c = take(k, id);
          if (c) (c.kind === 'tool' ? n.calls : n.subs).push(c);
        });
        return n;
      }
      var jobs = [], own = [];
      // Rouh's own calls (kind tool, straight under the root) hang off Rouh's own line, as on Rouh's page,
      // not off the core: drawn from the core they stood round it as a star of spikes (Petar's photo, 200-05).
      (root.children || []).forEach(function (k) {
        var j = take(k, null);
        if (j) (j.kind === 'tool' ? own : jobs).push(j);
      });
      // What the feed no longer sends has finished: it fades like anything else that ended.
      for (var id in NODES) {
        var o = NODES[id];
        if (o.seen !== stamp && o.id !== SELF_ID) {
          if (!o.fade) o.fade = now;
          if (!o.parent) (o.kind === 'tool' ? own : jobs).push(o);
        }
      }
      // Rouh's own line: drawn while Rouh answers in any chat (the feed's `self`) or a call of its own is open,
      // then fading like finished work, from whichever ended last, so its calls never outlive it.
      var open = !!(root.self && typeof root.self === 'object' && Object.keys(root.self).length);
      var last = 0;
      own.forEach(function (c) { if (!c.fade) open = true; else last = Math.max(last, c.fade); });
      var me = NODES[SELF_ID];
      if (open || own.length) {
        if (!me) me = NODES[SELF_ID] = { id: SELF_ID, fade: 0, opened: now, kind: 'self', label: 'Rouh', state: 'running' };
        me.seen = stamp; me.parent = null; me.subs = []; me.calls = own;
        me.fade = open ? 0 : Math.max(me.fade || 0, last || now);
        me.state = open ? 'running' : 'done';
        jobs.unshift(me);
      } else if (me) {
        me.seen = stamp; me.calls = [];
        if (!me.fade) me.fade = now;
        // Gone for good once its fade, hold and grey trace are over; drawn afresh at the next answer.
        var life = D ? (D.fadeSeconds + D.holdMinutes * 60 + D.ghostSeconds) * 1000 : 0;
        if (D && now - me.fade > life) delete NODES[SELF_ID];
        else jobs.unshift(me);
      }
      tree = jobs;
    }

    function sync(tnow) {
      var live = 0, waiting = [];
      frameNo++;
      function visit(n, parent) {
        var r = REC.get(n.id);
        if (!r) r = makeRecord(n, parent, tnow);
        r.node = n; r.seen = frameNo;
        if (n.fade && r.finished !== n.fade) r.finished = n.fade;
        if (!n.fade) r.finished = 0;
        r.life = r.finished ? lifecycle((tnow - r.finished) / 1000) : null;
        if (r.life && r.life.state === 'removed') {
          REC.delete(r.id); r.removed = true;
          if (NODES[n.id] && NODES[n.id].seen !== stamp) delete NODES[n.id];
          return;
        }
        var lenU = r.role === 'twig' ? (RULES.process.shortest + (RULES.process.longest - RULES.process.shortest) * costOf(n, tnow)) / RULES.process.longest : 1;
        r.lenU = lenU;
        r.age = growth - r.born;
        r.reveal = r.age < 0 ? -1 : Math.min(lenU, r.age / RULES.growth.tipSeconds);
        r.waiting = !n.fade && n.state === 'waiting';
        r.kind = r.role === 'twig' ? kindOf(n.label) : n.kind === 'self' ? 'self' : 'agent';
        if (r.waiting) waiting.push(r);
        else if (!n.fade && r.role !== 'twig') live++;
        var calls = n.calls || [];
        if (calls.length > MAX_TWIGS) calls = calls.slice().sort(function (a, b) { return a.opened - b.opened; }).slice(-MAX_TWIGS);
        for (var i = 0; i < calls.length; i++) visit(calls[i], r);
        var subs = n.subs || [];
        for (var j = 0; j < subs.length; j++) visit(subs[j], r);
      }
      (tree || []).forEach(function (j) { visit(j, null); });
      REC.forEach(function (r) { if (r.seen !== frameNo) REC.delete(r.id); });
      return { live: live, waiting: waiting };
    }

    // --- the camera: app/orb3d.js's framing of what is drawn, the group's turn, a little from above ---------
    var cam = { d: 2.2, cx: 0, cy: 0, f: 1, ry: 0 };
    function reach() {
      var far = 0.45;
      REC.forEach(function (r) {
        if (r.reveal <= 0) return;
        var at = r.centres[Math.min(SEGMENTS, Math.round(r.reveal * SEGMENTS))];
        far = Math.max(far, len(at) + 0.04);
      });
      return far;
    }
    function project(p) {
      var c = Math.cos(cam.ry), s = Math.sin(cam.ry);
      var x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c, y = p[1];
      var cp = Math.cos(PITCH), sp = Math.sin(PITCH);
      var y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      var k = cam.f / Math.max(0.05, cam.d - z2);
      return [cam.cx + x * k, cam.cy - y2 * k, k];
    }

    // --- drawing ----------------------------------------------------------------------------------------
    function halo(waiting, live) {
      // The core never larger than a bright point, and its halo never a lit disc on the wall: a projector
      // shows every grey as light.
      var core = Math.max(3, Math.min(H * 0.014, cam.f * RULES.core.radius / cam.d));
      var key = (waiting ? 'w' : live ? 'l' : 'i') + Math.round(core) + '|' + D.coreGlow;
      if (key === haloKey && haloSprite) return haloSprite;
      haloKey = key;
      var rad = Math.ceil(Math.min(H * 0.16, core * (5 + 5 * Math.sqrt(D.coreGlow / 80)) * 1.2));
      var c = document.createElement('canvas');
      c.width = c.height = rad * 2;
      var x = c.getContext('2d');
      var tint = waiting ? PAL.wait : live ? PAL.agent : [255, 255, 255];
      var soft = mix(tint, [255, 255, 255], waiting ? 0.3 : 0.15);
      var gr = x.createRadialGradient(rad, rad, 0, rad, rad, rad);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(Math.min(0.5, core / rad * 0.9), 'rgba(255,255,255,1)');
      gr.addColorStop(Math.min(0.6, core / rad * 1.6), rgba(soft, waiting || live ? 0.5 : 0.35));
      gr.addColorStop(0.3, rgba(tint, waiting || live ? 0.16 : 0.05));
      gr.addColorStop(0.7, rgba(tint, waiting || live ? 0.05 : 0.01));
      gr.addColorStop(1, rgba(tint, 0));
      x.fillStyle = gr;
      x.fillRect(0, 0, rad * 2, rad * 2);
      haloSprite = c;
      return c;
    }
    function labelImage(text, warn, fs) {
      var k = fs + '|' + (warn ? 1 : 0) + '|' + text;
      if (labelCache[k]) return labelCache[k];
      if (++labelCount > 200) { labelCache = Object.create(null); labelCount = 1; }
      var c = document.createElement('canvas'), x = c.getContext('2d');
      var font = '700 ' + fs + 'px "DejaVu Sans", system-ui, sans-serif';
      x.font = font;
      var pad = Math.round(fs * 0.3), tw = Math.ceil(x.measureText(text).width);
      c.width = tw + pad * 2; c.height = Math.round(fs * 1.4);
      x.globalAlpha = 0.7; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
      x.globalAlpha = 1; x.font = font; x.textBaseline = 'middle';
      x.fillStyle = warn ? '#ff5c74' : '#e6f6f8';
      x.fillText(text, pad, c.height / 2);
      return (labelCache[k] = c);
    }
    function poly(p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); }

    // One branch or twig: the glow round it, the faint body, the bright edges, and the nerve.
    function drawTube(r, t) {
      if (r.reveal <= 0) return null;
      var G = RULES.glass, P = RULES.path;
      var ghost = r.life && r.life.state === 'ghost';
      var col = PAL[ghost ? 'ghost' : r.waiting ? 'wait' : r.kind] || PAL.other;
      var alpha = r.life ? (ghost ? 1 : r.life.alpha) : 1;
      var last = Math.max(1, Math.min(SEGMENTS, Math.round(r.reveal * SEGMENTS)));
      var pts = [], rads = [], twig = r.role === 'twig';
      // A twig is thin: half the points draw it as smoothly, and it is most of what is drawn on a busy night.
      for (var i = 0; i <= last; i += (twig && i + 2 <= last ? 2 : 1)) {
        var u = i / SEGMENTS;
        var taper = Math.pow(1 - Math.min(1, u / Math.max(r.lenU, 0.0001)), P.taperPower) * P.taperScale + P.taperFloor;
        var mature = smoothstep(0, RULES.growth.thickenSeconds, r.age - u * RULES.growth.tipSeconds);
        var rad = r.radius * r.wob[i] * taper * D.thickness * (RULES.growth.seedRadius + (1 - RULES.growth.seedRadius) * mature);
        var p = project(r.centres[i]);
        pts.push(p);
        rads.push(Math.max(0.6, rad * p[2]));
      }
      if (ghost) {
        g.globalAlpha = 0.22; g.strokeStyle = rgba(col, 1); g.lineWidth = Math.max(1, rads[0] * 0.6);
        poly(pts); g.stroke();
        return pts[pts.length - 1];
      }
      // The two edges: the centre line moved out by the tube's radius, across the screen.
      var left = [], right = [];
      for (var j = 0; j < pts.length; j++) {
        var a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        var nx = -dy / l, ny = dx / l;
        left.push([pts[j][0] + nx * rads[j], pts[j][1] + ny * rads[j]]);
        right.push([pts[j][0] - nx * rads[j], pts[j][1] - ny * rads[j]]);
      }
      var dash = r.waiting ? [Math.max(6, rads[0] * 3), Math.max(4, rads[0] * 2.2)] : null;
      var breath = r.waiting && !reduced ? 0.75 + 0.25 * Math.sin(t * 2.3) : 1;
      if (!twig) {
        // The glow: the bloom on Rouh's page, as a soft wide line.
        g.globalAlpha = Math.min(0.6, D.glow * 0.65) * alpha * breath;
        g.strokeStyle = rgba(col, 1);
        g.lineWidth = Math.max(4, rads[0] * 4.5);
        poly(pts); g.stroke();
        // The body: mostly see-through.
        g.globalAlpha = 0.18 * alpha;
        g.fillStyle = rgba(col, 1);
        g.beginPath();
        g.moveTo(left[0][0], left[0][1]);
        for (var k2 = 1; k2 < left.length; k2++) g.lineTo(left[k2][0], left[k2][1]);
        for (var k3 = right.length - 1; k3 >= 0; k3--) g.lineTo(right[k3][0], right[k3][1]);
        g.closePath(); g.fill();
      }
      // The edges: where the glass is nearly solid and its coloured light runs; Edge glow sets how bright.
      var edgeK = Math.min(1.6, Math.sqrt(Math.max(0, D.edge)));
      g.globalAlpha = Math.min(1, 0.95 * edgeK * alpha * breath);
      g.strokeStyle = rgba(mix(col, [255, 255, 255], Math.min(0.6, 0.25 * edgeK)), 1);
      g.lineWidth = Math.max(1, rads[0] * 0.3 * (0.7 + 0.3 * edgeK));
      if (dash) g.setLineDash(dash);
      poly(left); g.stroke();
      poly(right); g.stroke();
      // The nerve: a bright line down the middle.
      if (D.nerve) {
        g.globalAlpha = G.nerve.alpha * alpha;
        g.strokeStyle = rgba(mix(col, [255, 255, 255], 0.7), 1);
        g.lineWidth = Math.max(1, rads[0] * G.nerve.radius * 1.4);
        poly(pts); g.stroke();
      }
      if (dash) g.setLineDash([]);
      return pts[pts.length - 1];
    }

    function draw(nowMs) {
      var tnow = Date.now(), t = nowMs / 1000;
      var dt = lastT ? Math.min(0.2, t - lastT) : 0;
      lastT = t;
      growth += dt * D.speed;
      if (!reduced) spin += dt * SPIN;
      cam.ry = spin;
      var said = sync(tnow);
      // Into the corner while a card is up (bottom right, about a quarter of the height), back when it goes.
      cornerT += ((cornerOn ? 1 : 0) - cornerT) * Math.min(1, dt * 3.2);
      var e = cornerT * cornerT * (3 - 2 * cornerT);
      // Above a question shown low on the wall (`reserve`), the orb fits in the room left.
      reserveNow += (reserve - reserveNow) * Math.min(1, dt * 3.2);
      var room = Math.max(H * 0.3, H - reserveNow);
      var corner = Math.min(H * 0.26, W * 0.34);   // the corner's size: smaller on a tall, narrow screen
      var span = Math.min(W * 0.62, room) * (1 - e) + corner * e;
      cam.cx = W / 2 * (1 - e) + (W - corner * 0.62) * e;
      cam.cy = room / 2 * (1 - e) + (H - corner * 0.62) * e;
      var half = 19 * Math.PI / 180;
      var want = Math.min(3.1, Math.max(0.9, reach() / Math.tan(half) * 1.12));
      cam.d += (want - cam.d) * Math.min(1, dt * 2);
      cam.f = span / 2 / Math.tan(half);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'round';
      var labels = [];
      var order = Array.from(REC.values()).sort(function (a, b) {
        var ga = a.life && a.life.state === 'ghost' ? -1 : a.depth, gb = b.life && b.life.state === 'ghost' ? -1 : b.depth;
        return ga - gb;
      });
      for (var i = 0; i < order.length; i++) {
        var r = order[i];
        var tip = drawTube(r, t);
        if (tip && r.depth === 1 && r.role === 'branch' && r.kind !== 'self' && !(r.life && r.life.state === 'ghost') && e < 0.5) {
          labels.push({ tip: tip, text: r.waiting ? 'NEEDS YOU · ' + short(r.node.label) : short(r.node.label),
                        warn: r.waiting, alpha: r.life ? Math.max(0.4, r.life.alpha) : 1 });
        }
      }
      // The core and its halo: red while anything waits, turquoise-white while work runs.
      var hs = halo(said.waiting.length > 0, said.live > 0);
      var pulse = reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 1.5);
      var hw = hs.width * pulse;
      g.globalAlpha = 1;
      g.drawImage(hs, cam.cx - hw / 2, cam.cy - hw / 2, hw, hw);
      // The short names at the tips of the jobs, large, never on each other.
      if (labels.length) {
        var fs = Math.max(14, Math.round(Math.min(W, H * 1.7778) / 100 * 1.5));   // half of 04:04's names (200-05)
        [true, false].forEach(function (rightSide) {
          var mine = labels.filter(function (l) { return (l.tip[0] >= cam.cx) === rightSide; })
            .sort(function (a, b) { return a.tip[1] - b.tip[1]; });
          var lastY = -1e9;
          mine.forEach(function (l) {
            var img = labelImage(l.text, l.warn, fs);
            var y = Math.max(l.tip[1], lastY + img.height * 1.08);
            lastY = y;
            var x = l.tip[0] + (rightSide ? fs * 0.5 : -fs * 0.5 - img.width);
            // Clear of the wall's edges, which a projector may crop.
            var edge = Math.min(W, H * 1.7778) / 100 * 2;
            x = Math.max(edge, Math.min(W - img.width - edge, x));
            y = Math.max(img.height / 2 + edge, Math.min(H - img.height / 2 - edge, y));
            g.globalAlpha = l.alpha * (1 - e * 2);
            g.drawImage(img, Math.round(x), Math.round(y - img.height / 2));
          });
        });
      }
      g.globalAlpha = 1;
      stats.records = REC.size;
      stats.waiting = said.waiting.length;
    }

    function loop(nowMs) {
      frame = requestAnimationFrame(loop);
      if (!RULES) return;
      var cap = cornerOn && cornerT > 0.98 ? FPS_CORNER : fpsCap;
      if (nowMs - lastDraw < 1000 / cap - 2) return;
      var gap = nowMs - lastDraw;
      lastDraw = nowMs;
      var a = performance.now();
      draw(nowMs);
      var cost = performance.now() - a;
      stats.frames++;
      if (cornerOn || cornerT > 0.02) { costs = []; checkedAt = nowMs; return; }
      costs.push([cost, gap]);
      if (nowMs - checkedAt > 3000 && costs.length > 10) {
        checkedAt = nowMs;
        var sum = 0, gaps = 0;
        for (var i = 0; i < costs.length; i++) { sum += costs[i][0]; gaps += costs[i][1]; }
        stats.drawMs = +(sum / costs.length).toFixed(1);
        stats.fps = +(1000 / (gaps / costs.length)).toFixed(1);
        costs = [];
        // Not in the first seconds, while the page settles; slower only after two slow spells in a row,
        // and back up after three easy ones: an even pace rather than an uneven one.
        if (nowMs - t0 > 6000) {
          var slow = stats.fps < fpsCap * 0.8;
          bad = slow ? bad + 1 : 0;
          good = !slow && stats.drawMs < 1000 / fpsCap * 0.5 ? good + 1 : 0;
          if (bad >= 2 && fpsCap > 15) { fpsCap = fpsCap > 20 ? 20 : 15; bad = 0; }
          if (good >= 3 && fpsCap < FPS) { fpsCap = Math.min(FPS, fpsCap + 5); good = 0; }
        }
        stats.cap = fpsCap;
      }
    }

    size();
    window.addEventListener('resize', size);
    frame = requestAnimationFrame(loop);
    return {
      tree: setTree,
      rules: useRules,
      settings: settings,
      corner: function (on) { cornerOn = !!on; },
      reserve: function (px) { reserve = Math.max(0, +px || 0); },
      waiting: function () {
        var out = [];
        REC.forEach(function (r) { if (r.waiting && r.depth === 1) out.push({ title: short(r.node.label), asking: r.node.asking || '' }); });
        return out;
      },
      stats: function () { return JSON.parse(JSON.stringify(stats)); },
      stop: function () { cancelAnimationFrame(frame); }
    };
  }

  window.ProjectorOrb = { start: start, short: short };
})();
