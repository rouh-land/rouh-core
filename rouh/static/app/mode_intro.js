/* Rouh's page: once, at about the owner's tenth message, what Unrestricted means (`rouh/mode_intro.py`).
 *
 * Task 98, gaps G1 and G5. A new Rouh starts Unrestricted, on purpose. Early on, the owner is told
 * once, in one window, what that lets Rouh do and what it costs, and can switch to Restricted there
 * and then. The page is told in `#rouhModeIntro` whether to show it, at which message, and how many
 * the owner had sent when the page was drawn; it counts on from there with each message sent
 * (`rouh:said`, from app/controls.js), and opens when Rouh has finished answering. The answer goes
 * to POST /api/permissions/intro, where Switch to Restricted is the Permissions page's own press.
 */
import { $, el } from 'app/helpers.js';
import { notify } from 'app/notices.js';
import { S } from 'app/socket.js';

/** @typedef {{title: string, lede: string, pros_head: string, pros: string[], cons_head: string,
 *   cons: string[], still: string, restricted: string, later: string, keep: string, switch: string,
 *   guide: string}} IntroWords */

/** @type {{show: boolean, at?: number, said?: number, words?: IntroWords, guide?: string, permissions?: string}} */
var INTRO = (function () {
  try {
    var node = document.getElementById('rouhModeIntro');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    return got && typeof got === 'object' ? got : { show: false };
  } catch (err) { return { show: false }; }
}());

var LOCAL = 'rouh.modeIntro.answered';
var count = Number(INTRO.said || 0);
var due = false;
var shown = false;
var sent = false;
var timer = 0;

function csrfToken() {
  var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
  return found ? decodeURIComponent(found[1]) : '';
}

/** A small mark beside each line, so what is a gain and what is a cost is said by shape too.
 * @param {boolean} plus */
function mark(plus) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'mode-intro-mark');
  var p = document.createElementNS(ns, 'path');
  p.setAttribute('d', plus ? 'M3.5 8.5l3 3 6-7' : 'M8 3v6.5M8 12.2v.3');
  svg.appendChild(p);
  return svg;
}

/** @param {string} head @param {string[]} lines @param {boolean} plus */
function list(head, lines, plus) {
  var box = el('section', 'mode-intro-part ' + (plus ? 'gain' : 'cost'));
  var h = el('h3', null, head);
  box.appendChild(h);
  var ul = el('ul');
  (lines || []).forEach(function (line) {
    var li = el('li');
    li.appendChild(mark(plus));
    li.appendChild(el('span', null, line));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}

/** @param {string} act @param {HTMLDialogElement} dlg @param {HTMLElement} said */
function answer(act, dlg, said) {
  sent = true;
  // Kept in this browser too, so a page drawn before the server had it does not open it again.
  try { localStorage.setItem(LOCAL, act); } catch (err) {}
  var buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (dlg.querySelectorAll('button'));
  buttons.forEach(function (b) { b.disabled = true; });
  return fetch('/api/permissions/intro', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
    body: JSON.stringify({ act: act })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) {
        sent = false;
        buttons.forEach(function (b) { b.disabled = false; });
        said.textContent = (j && j.error) || 'That could not be saved. Try again, or change it in Permissions.';
        said.hidden = false;
        return;
      }
      if (dlg.open) dlg.close('answered');
      if (act !== 'closed' && j && j.said) notify(j.said, { tone: act === 'restricted' ? 'info' : 'success' });
    });
  }).catch(function () {
    sent = false;
    buttons.forEach(function (b) { b.disabled = false; });
    said.textContent = 'Rouh could not be reached. Check the connection and try again.';
    said.hidden = false;
  });
}

function build() {
  var w = /** @type {IntroWords} */ (INTRO.words);
  var dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'one-dialog mode-intro'));
  dlg.id = 'modeIntro';
  dlg.setAttribute('aria-labelledby', 'modeIntroHead');
  dlg.setAttribute('aria-describedby', 'modeIntroLede');
  var form = el('form', 'mode-intro-form');
  form.setAttribute('method', 'dialog');
  var head = el('h2', null, w.title);
  head.id = 'modeIntroHead';
  form.appendChild(head);
  var lede = el('p', 'mode-intro-lede', w.lede);
  lede.id = 'modeIntroLede';
  form.appendChild(lede);
  var parts = el('div', 'mode-intro-parts');
  parts.appendChild(list(w.pros_head, w.pros, true));
  parts.appendChild(list(w.cons_head, w.cons, false));
  form.appendChild(parts);
  form.appendChild(el('p', 'mode-intro-note', w.still));
  form.appendChild(el('p', 'mode-intro-note', w.restricted + ' ' + w.later));
  var said = el('p', 'error');
  said.setAttribute('role', 'alert');
  said.hidden = true;
  form.appendChild(said);
  var acts = el('div', 'one-actions mode-intro-actions');
  var guide = /** @type {HTMLAnchorElement} */ (el('a', 'mode-intro-guide', w.guide));
  guide.href = String(INTRO.guide || '/guide');
  acts.appendChild(guide);
  var sw = /** @type {HTMLButtonElement} */ (el('button', 'ctl small', w.switch));
  sw.type = 'button';
  sw.id = 'modeIntroRestricted';
  sw.addEventListener('click', function () { answer('restricted', dlg, said); });
  acts.appendChild(sw);
  var keep = /** @type {HTMLButtonElement} */ (el('button', 'ctl small primary', w.keep));
  keep.type = 'button';
  keep.id = 'modeIntroKeep';
  keep.addEventListener('click', function () { answer('kept', dlg, said); });
  acts.appendChild(keep);
  form.appendChild(acts);
  dlg.appendChild(form);
  // Closed any other way (Escape, or the page's own Escape that closes what is open) puts it
  // away too: it is shown once.
  dlg.addEventListener('close', function () { if (!sent) answer('closed', dlg, said); });
  // The lesson's link goes once its answer is kept, so leaving the page cannot lose it.
  guide.addEventListener('click', function (e) {
    if (sent || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    var go = function () { location.href = guide.href; };
    var late = window.setTimeout(go, 8000);
    answer('closed', dlg, said).then(function () { window.clearTimeout(late); go(); });
  });
  document.body.appendChild(dlg);
  return { dlg: dlg, keep: keep };
}

/** Open once nothing else is: Rouh not answering, no other window open, the page in front. */
function tryOpen() {
  timer = 0;
  if (shown || !due) return;
  if (S.busy || document.hidden || document.querySelector('dialog[open]')) {
    timer = window.setTimeout(tryOpen, 1500);
    return;
  }
  shown = true;
  var made = build();
  made.dlg.showModal();
  made.keep.focus();
}

function check() {
  if (shown || due || !INTRO.show || count < Number(INTRO.at || 10)) return;
  due = true;
  if (!timer) timer = window.setTimeout(tryOpen, 2500);
}

/** @returns {boolean} */
function answeredHere() {
  try { return !!localStorage.getItem(LOCAL); } catch (err) { return false; }
}

if (INTRO.show && INTRO.words && !answeredHere()) {
  document.addEventListener('rouh:said', function () { count += 1; check(); });
  check();
}

export { };
