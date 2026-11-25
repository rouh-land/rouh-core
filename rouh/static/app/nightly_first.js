/* The nightly feature run explains itself once, the first time it has run (task 98, gap G4).
 *
 * Outside the chain, like app/new_owner.js, and imported by app.js after it. A while after the page
 * opens it asks `/api/evolution/nightly/first` (`rouh/web/nightly_run.py`, `nightly_feature.first_run`);
 * when the person has a first night they were not told about, one dialog says what the run does, that it
 * changes Rouh's own code, what it may really spend, and that it can be paused, with Keep it on and
 * Pause it. Closed any way, it is put away on the server for good, so it is said once on every device.
 */
import { el } from 'app/helpers.js';
import { goToAddress } from 'app/cards.js';

var API = '/api/evolution/nightly/first';
/* Its own few styles, on the page's tokens, kept here so the dialog is one file. */
var STYLE = [
  '.nightly-first-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 20px; }',
  '.nightly-first-form h2 { margin: 0; font-size: 17px; line-height: 1.3; text-wrap: balance; }',
  '.nightly-first-lede { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--dim); }',
  '.nightly-first-list { display: grid; gap: 4px; margin: 0; }',
  '.nightly-first-list dt { margin: 8px 0 0; font-size: 13px; font-weight: 650; color: var(--text); }',
  '.nightly-first-list dt:first-child { margin-top: 0; }',
  '.nightly-first-list dd { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dim); }',
  '.nightly-first-said { margin: 0; font-size: 13px; font-weight: 600; color: var(--text); }',
  '.nightly-first-actions { flex-wrap: wrap; align-items: center; }',
  '.nightly-first-open {',
  '  margin-right: auto; display: inline-flex; align-items: center; min-height: 44px;',
  '  font-size: 13px; color: var(--accent); text-decoration: underline; text-underline-offset: 3px;',
  '}',
  '.nightly-first-open:focus-visible, .nightly-first-actions .ctl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }',
  '.nightly-first-actions .ctl { min-height: 44px; padding-inline: 16px; }',
  '@media (max-width: 480px) {',
  '  .nightly-first-actions { justify-content: stretch; }',
  '  .nightly-first-open { width: 100%; margin-right: 0; }',
  '  .nightly-first-actions .ctl { flex: 1 1 0; }',
  '}'
].join('\n');

/** How long after the page opens it asks, so the screen has settled first. */
var AFTER = 2500;

/** @param {Record<string, any> | null} body @returns {Promise<any>} */
function call(body) {
  /** @type {RequestInit} */
  var init = { credentials: 'same-origin', cache: 'no-store' };
  if (body) {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return fetch(API, init).then(function (r) { return r.ok ? r.json() : null; });
}

/** @param {number} t */
function when(t) {
  try {
    return new Date(t * 1000).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  } catch (err) { return ''; }
}

/** @param {{night: number, started_at: number, state: string, spend: string, at: string}} d */
function show(d) {
  if (document.getElementById('nightlyFirstDialog') || document.querySelector('dialog[open]')) return;
  if (!document.getElementById('nightlyFirstStyle')) {
    var st = el('style');
    st.id = 'nightlyFirstStyle';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }
  var dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'one-dialog nightly-first'));
  dlg.id = 'nightlyFirstDialog';
  dlg.setAttribute('aria-labelledby', 'nightlyFirstHead');
  dlg.setAttribute('aria-describedby', 'nightlyFirstLede');
  var form = el('form', 'nightly-first-form');
  form.setAttribute('method', 'dialog');
  var head = el('h2', null, 'Rouh has started building new features for itself');
  head.id = 'nightlyFirstHead';
  form.appendChild(head);
  var started = when(d.started_at);
  var lede = el('p', 'nightly-first-lede', 'Its nightly feature run started for the first time'
    + (started ? ' on ' + started : '') + '. It runs every night at ' + (d.at || '04:30') + ' while it is on.');
  lede.id = 'nightlyFirstLede';
  form.appendChild(lede);
  var list = el('dl', 'nightly-first-list');
  [['What it does', 'Picks ideas from the Incubator, builds each as a new gene and puts it on trial in Mutations, where you keep or reject it.'],
    ['It changes Rouh’s own code', 'Each gene is tested, landed and live by morning. Rejecting one in Mutations takes its code out again.'],
    ['What it may spend', d.spend],
    ['You can pause it', 'Here, or at any time on the Nightly run page in Evolution.']].forEach(function (row) {
    list.appendChild(el('dt', null, row[0]));
    list.appendChild(el('dd', null, row[1]));
  });
  form.appendChild(list);
  var said = el('p', 'nightly-first-said');
  said.setAttribute('role', 'status');
  said.hidden = true;
  form.appendChild(said);
  var acts = el('div', 'one-actions nightly-first-actions');
  var open = /** @type {HTMLAnchorElement} */ (el('a', 'nightly-first-open', 'Open the nightly run'));
  open.href = '/evolution/nightly';
  var pause = /** @type {HTMLButtonElement} */ (el('button', 'ctl small', 'Pause it'));
  pause.type = 'button';
  var keep = /** @type {HTMLButtonElement} */ (el('button', 'ctl small primary', d.state === 'paused' ? 'Close' : 'Keep it on'));
  keep.setAttribute('value', 'keep');
  if (d.state === 'paused') { pause.hidden = true; }
  acts.appendChild(open);
  acts.appendChild(pause);
  acts.appendChild(keep);
  form.appendChild(acts);
  dlg.appendChild(form);

  var put = false;
  function putAway() {
    if (put) return;
    put = true;
    call({ seen: true }).catch(function () {});
  }
  open.addEventListener('click', function (e) {
    e.preventDefault();
    putAway();
    dlg.close();
    goToAddress('/evolution/nightly');
  });
  pause.addEventListener('click', function () {
    pause.disabled = true;
    call({ pause: true }).then(function (j) {
      put = true;
      said.hidden = false;
      said.textContent = j && j.paused
        ? 'Paused. No night starts until you turn it on again on the Nightly run page.'
        : 'It could not be paused just now. Pause it on the Nightly run page.';
      pause.hidden = true;
      keep.textContent = 'Close';
      keep.focus();
    }, function () {
      pause.disabled = false;
      said.hidden = false;
      said.textContent = 'It could not be paused just now. Pause it on the Nightly run page.';
    });
  });
  dlg.addEventListener('close', function () { putAway(); dlg.remove(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  document.body.appendChild(dlg);
  try { dlg.showModal(); } catch (err) { dlg.setAttribute('open', ''); }
  keep.focus();
}

setTimeout(function () {
  call(null).then(function (d) { if (d && d.show) show(d); }).catch(function () {});
}, AFTER);
