/* Rouh's page, four genes for building Rouh faster (`rouh/build_proof.py`, night 54).
 *
 * Outside the chain, like app/first_help.js, and imported by app.js after it. The page is told which
 * are on in `#rouhBuildProof`:
 *
 * - run_pictures: a run's head (`oneRenderHead` in app/runs.js sends `rouh:run-head`) shows the
 *   pictures the run took while it proved its change, read with the one program's `proof` message
 *   (`one/proof.py`); each opens full size, with the next and the one before.
 * - run_screens: the same head, once the run's work is saved, lists the screens its design check
 *   covered, See it live, each a press that opens it here.
 * - point_change: Change something here (the menu's link presses `#pointChangeBtn`, or Alt+Shift+C)
 *   lets the person press a thing on the screen; Start a run then opens on Rouh's own code with the
 *   screen's address, the thing's words and where it is in the brief, and they say what to change.
 * - brief_workspace is the server's alone (`rouh/build_proof.py`).
 */
import { $, el } from 'app/helpers.js';
import { goToAddress } from 'app/cards.js';
import { sbSet } from 'app/controls.js';
import { oneSend, oneStartOpen } from 'app/runs.js';

/** @type {{on: string[], code: string}} */
var PROOF = (function () {
  try {
    var node = document.getElementById('rouhBuildProof');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return { on: Array.isArray(got.on) ? got.on : [], code: String(got.code || '') };
  } catch (err) { return { on: [], code: '' }; }
}());

/** @param {string} name */
function proofOn(name) { return PROOF.on.indexOf(name) >= 0; }

/** One of them used: counted by the server. @param {string} name @param {string} event @param {string} detail */
function proofUsed(name, event, detail) {
  fetch('/api/build-proof', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switch: name, event: event, detail: String(detail || '').slice(0, 120) }) }).catch(function () {});
}

/* ---------- run_pictures and run_screens ---------- */

/** What each run saw, once read, by the run and its state when read.
    @type {Record<string, {key: string, pictures: {name: string, type: string, data: string}[], screens: string[]}>} */
var SAW = {};
/** @type {Record<string, boolean>} */
var SEEN = {};
var ENDED = { done: true, unfinished: true, failed: true, lost: true, refused: true, reaped: true };

/** @param {any} run */
function sawKey(run) { return String(run.state || '') + '|' + String(run.landed || '') + '|' + String(run.checkout || ''); }

/** @param {any} run */
function proofHead(run) {
  var box = $('oneProof');
  if (!box || !run || !run.id) return;
  if (!proofOn('run_pictures') && !proofOn('run_screens')) { box.hidden = true; return; }
  var id = String(run.id), key = sawKey(run), got = SAW[id];
  if (box.dataset.run !== id) { box.hidden = true; box.textContent = ''; box.dataset.run = id; }
  if (got && got.key === key) { proofDraw(run, got); return; }
  // Read once the run has ended (its pictures are all there), and again only when its state moves.
  if (!ENDED[String(run.state || '')] && !run.landed) { box.hidden = true; return; }
  SAW[id] = { key: key, pictures: got ? got.pictures : [], screens: got ? got.screens : [] };
  oneSend('proof', { run: id }).then(function (/** @type {any} */ d) {
    SAW[id] = { key: key, pictures: Array.isArray(d && d.pictures) ? d.pictures : [],
                screens: Array.isArray(d && d.screens) ? d.screens : [] };
    var now = $('oneProof');
    if (now && now.dataset.run === id) proofDraw(run, SAW[id]);
  }, function () { /* an older program has no `proof`: nothing is drawn */ });
}

/** The name of one of Rouh's own screens, from the navigation's genes, else its address.
    @param {string} path */
function screenName(path) {
  try {
    var raw = $('rouhGenes');
    var reg = raw ? JSON.parse(raw.textContent || '{}') : {};
    var bare = path.split('?')[0].replace(/\/+$/, '') || '/';
    var best = '';
    (reg.genes || []).forEach(function (/** @type {any} */ g) {
      if (g.route && g.route === bare && g.name && (!best || g.name.length < best.length)) best = g.name;
    });
    return best || bare;
  } catch (err) { return path; }
}

/** @param {any} run @param {{pictures: any[], screens: string[]}} got */
function proofDraw(run, got) {
  var box = $('oneProof');
  if (!box) return;
  box.textContent = '';
  var pics = proofOn('run_pictures') ? got.pictures : [];
  // Once its work is saved: live, or saved and not live yet, which is said rather than hidden.
  var live = proofOn('run_screens') && run.landed ? got.screens : [];
  if (!pics.length && !live.length) { box.hidden = true; return; }
  if (pics.length) {
    var sec = el('div', 'run-proof-pics');
    sec.appendChild(el('p', 'run-proof-head', pics.length === 1 ? 'The picture it took' : 'The ' + pics.length + ' pictures it took'));
    var row = el('div', 'run-proof-row');
    pics.forEach(function (p, i) {
      var b = /** @type {HTMLButtonElement} */ (el('button', 'run-proof-pic'));
      b.type = 'button';
      b.setAttribute('aria-label', 'Open the picture ' + p.name);
      var img = /** @type {HTMLImageElement} */ (el('img'));
      img.src = 'data:' + p.type + ';base64,' + p.data;
      img.alt = '';
      img.loading = 'lazy';
      b.appendChild(img);
      b.addEventListener('click', function () { picOpen(pics, i, String(run.id)); });
      row.appendChild(b);
    });
    sec.appendChild(row);
    box.appendChild(sec);
    if (!SEEN[run.id]) { SEEN[run.id] = true; proofUsed('run_pictures', 'seen', String(run.id) + ': ' + pics.length); }
  }
  if (live.length) {
    var s2 = el('div', 'run-proof-live');
    s2.appendChild(el('p', 'run-proof-head', run.deployed ? 'See it live'
      : 'The screens it changed (not live yet)'));
    var list = el('div', 'run-proof-row');
    live.forEach(function (path) {
      var b = /** @type {HTMLButtonElement} */ (el('button', 'ctl small run-proof-screen', screenName(path)));
      b.type = 'button';
      b.title = 'Open ' + path + ' here';
      b.addEventListener('click', function () {
        proofUsed('run_screens', 'opened', String(run.id) + ' ' + path);
        goToAddress(path);
      });
      list.appendChild(b);
    });
    s2.appendChild(list);
    box.appendChild(s2);
  }
  box.hidden = false;
}

/** The picture, full size, with the next and the one before.
    @param {{name: string, type: string, data: string}[]} pics @param {number} at @param {string} run */
function picOpen(pics, at, run) {
  var d = /** @type {HTMLDialogElement|null} */ ($('runProofView'));
  if (!d) {
    d = /** @type {HTMLDialogElement} */ (el('dialog', 'run-proof-view'));
    d.id = 'runProofView';
    d.setAttribute('aria-label', 'A picture the run took');
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d);
  }
  var dlg = d;
  /** @param {number} i */
  function show(i) {
    at = (i + pics.length) % pics.length;
    var p = pics[at];
    dlg.textContent = '';
    var bar = el('div', 'run-proof-bar');
    bar.appendChild(el('span', 'run-proof-name', p.name + (pics.length > 1 ? '  ·  ' + (at + 1) + ' of ' + pics.length : '')));
    /** @param {string} t @param {string} label @param {() => void} fn */
    function btn(t, label, fn) {
      var b = /** @type {HTMLButtonElement} */ (el('button', 'ctl small', t));
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    if (pics.length > 1) {
      btn('‹', 'The picture before', function () { show(at - 1); });
      btn('›', 'The next picture', function () { show(at + 1); });
    }
    var x = btn('×', 'Close the picture', function () { dlg.close(); });
    dlg.appendChild(bar);
    var img = /** @type {HTMLImageElement} */ (el('img', 'run-proof-big'));
    img.src = 'data:' + p.type + ';base64,' + p.data;
    img.alt = 'A picture run ' + run + ' took: ' + p.name;
    dlg.appendChild(img);
    x.focus();
  }
  dlg.onkeydown = function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
  };
  show(at);
  if (!dlg.open) dlg.showModal();
  proofUsed('run_pictures', 'opened', run + ': ' + pics[at].name);
}

window.addEventListener('rouh:run-head', function (e) { proofHead(/** @type {CustomEvent} */ (e).detail); });

/* ---------- point_change ---------- */

var POINT = { on: false, lit: /** @type {HTMLElement|null} */ (null), bar: /** @type {HTMLElement|null} */ (null),
              expect: false };

/** A short way to find the thing again in the code: the nearest id, then the classes down to it.
    @param {Element} n */
function whereIs(n) {
  var parts = [];
  /** @type {Element|null} */
  var at = n;
  while (at && at !== document.body && parts.length < 5) {
    if (at.id) { parts.unshift('#' + at.id); break; }
    var cls = Array.prototype.filter.call(at.classList, function (/** @type {string} */ c) { return !/^(on|open|lit|point-lit)$|^is-/.test(c); })
      .slice(0, 2).map(function (/** @type {string} */ c) { return '.' + c; }).join('');
    var data = at.getAttribute('data-provider') || at.getAttribute('data-k') || '';
    parts.unshift(at.tagName.toLowerCase() + cls + (data ? '[data-' + (at.hasAttribute('data-provider') ? 'provider' : 'k') + '="' + data + '"]' : ''));
    at = at.parentElement;
  }
  return parts.join(' > ');
}

/** What the thing is, in words. @param {Element} n */
function whatIs(n) {
  var words = String((/** @type {HTMLElement} */ (n)).innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
  if (words.length > 140) words = words.slice(0, 137) + '...';
  var label = n.getAttribute('aria-label') || n.getAttribute('title') || n.getAttribute('placeholder') || '';
  var tag = n.tagName.toLowerCase();
  var kind = tag === 'button' || n.getAttribute('role') === 'button' ? 'a button'
    : tag === 'a' ? 'a link' : /^h[1-6]$/.test(tag) ? 'a heading' : tag === 'input' || tag === 'textarea' ? 'a box to type in'
    : tag === 'img' || tag === 'svg' ? 'a picture' : tag === 'li' ? 'a line of a list' : 'a part of the page';
  return kind + (words ? ' that says “' + words + '”' : '') + (label && label !== words ? ', named “' + label + '”' : '');
}

/** Where on the screen. @param {Element} n */
function whichSide(n) {
  if (n.closest('#canvasPanel')) {
    // The heading of the page the canvas shows: the first one that is on the screen.
    var t = Array.prototype.filter.call(document.querySelectorAll('#canvasPanel h1, #canvasPanel h2, #canvasPanel h3'),
      function (/** @type {HTMLElement} */ h) { return h.offsetParent !== null && h.getBoundingClientRect().height > 0; })[0];
    return 'on the canvas' + (t && t.textContent ? ', on the page “' + t.textContent.trim().slice(0, 60) + '”' : '');
  }
  if (n.closest('#tasksPanel, .sidebar, nav')) return 'in the menu';
  if (n.closest('.composer')) return 'in the box you type to Rouh in';
  if (n.closest('#transcript, .conversation')) return 'in the chat';
  return 'on the screen';
}

/** @param {MouseEvent} e */
function pointOver(e) {
  var t = /** @type {HTMLElement} */ (e.target);
  if (!POINT.on || !t || (POINT.bar && POINT.bar.contains(t))) return;
  if (POINT.lit) POINT.lit.classList.remove('point-lit');
  POINT.lit = t;
  t.classList.add('point-lit');
}

/** @param {MouseEvent} e */
function pointPress(e) {
  var t = /** @type {Element} */ (e.target);
  if (!POINT.on || !t || (POINT.bar && POINT.bar.contains(t))) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  var path = location.pathname + location.search.replace(/([?&])chat=[^&]*&?/, '$1').replace(/[?&]$/, '');
  var brief = 'Change something on Rouh’s own screen, at ' + path + ' (' + document.title + ').\n'
    + 'The thing I pressed is ' + whatIs(t) + ', ' + whichSide(t) + ',\n'
    + 'found in the page as `' + whereIs(t) + '`, at ' + window.innerWidth + ' px wide.\n\n'
    + 'What should change: ';
  pointStop();
  proofUsed('point_change', 'pointed', path);
  POINT.expect = true;
  oneStartOpen({ brief: brief, space: PROOF.code, agent: 'claude' });
  var box = /** @type {HTMLTextAreaElement|null} */ ($('oneStartBrief'));
  if (box) { box.setSelectionRange(box.value.length, box.value.length); box.scrollTop = box.scrollHeight; }
}

/** @param {KeyboardEvent} e */
function pointKey(e) { if (POINT.on && e.key === 'Escape') { e.preventDefault(); pointStop(); } }

function pointStop() {
  POINT.on = false;
  if (POINT.lit) POINT.lit.classList.remove('point-lit');
  POINT.lit = null;
  if (POINT.bar) POINT.bar.remove();
  POINT.bar = null;
  document.documentElement.classList.remove('pointing');
  document.removeEventListener('mouseover', pointOver, true);
  document.removeEventListener('click', pointPress, true);
  document.removeEventListener('keydown', pointKey, true);
}

function pointStart() {
  if (!proofOn('point_change') || !PROOF.code || POINT.on) return;
  POINT.on = true;
  // The menu it was started from goes, so the screen behind it can be pressed.
  sbSet(false);
  var bar = el('div', 'point-bar');
  bar.setAttribute('role', 'status');
  bar.appendChild(el('span', null, 'Press the thing you want changed.'));
  var stop = /** @type {HTMLButtonElement} */ (el('button', 'ctl small', 'Stop'));
  stop.type = 'button';
  stop.addEventListener('click', function (e) { e.stopPropagation(); pointStop(); });
  bar.appendChild(stop);
  document.body.appendChild(bar);
  POINT.bar = bar;
  document.documentElement.classList.add('pointing');
  // After the press that started it has finished, so that press is not taken as the thing.
  window.setTimeout(function () {
    if (!POINT.on) return;
    document.addEventListener('mouseover', pointOver, true);
    document.addEventListener('click', pointPress, true);
    document.addEventListener('keydown', pointKey, true);
  }, 0);
}

if (proofOn('point_change') && PROOF.code) {
  var go = $('pointChangeBtn');
  if (go) go.addEventListener('click', pointStart);
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyC' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      if (POINT.on) pointStop(); else pointStart();
    }
  });
  window.addEventListener('rouh:run-started', function (e) {
    var m = /** @type {CustomEvent} */ (e).detail || {};
    if (!POINT.expect) return;
    POINT.expect = false;
    if (m.ok && m.id) proofUsed('point_change', 'started', String(m.id));
  });
  var dlg = $('oneStartDialog');
  if (dlg) dlg.addEventListener('close', function () { window.setTimeout(function () { POINT.expect = false; }, 4000); });
}

export { pointStart };
