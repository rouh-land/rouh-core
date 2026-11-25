/* Rouh's page: the one popup about a copy off this machine (task 98, gap G18, `rouh/offsite_setup.py`).
 *
 * Petar, 25 November 2026: "one time ask at some point with a modal popup", and "no other nagging".
 * Outside the chain, like app/newcomer.js. A while after the page opens it asks the server whether to
 * ask (`GET /api/anatomy/backups/ask`: the administrator, once, some days after setup, while no copy
 * is set up), and if so shows why a copy off the machine matters with Cloudflare R2, Amazon S3 or
 * Not now. Being shown counts as asked; the two kinds open Anatomy, Meta, Copy off this machine with
 * that kind chosen. After it the only reminder is the sign on Anatomy's board.
 */
import { el } from 'app/helpers.js';

/** How long after the page opens it asks, so it never lands on the first moments of a visit. */
var WAIT_MS = 45000;

/** @param {string} answer */
function told(answer) {
  return fetch('/api/anatomy/backups/ask', { method: 'POST', keepalive: true, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: answer }) }).catch(function () {});
}

function show() {
  // Never over another dialog, or while somebody is typing: the next visit asks instead.
  if (document.querySelector('dialog[open]')) return;
  var dlg = /** @type {HTMLDialogElement} */ (el('dialog', 'one-dialog offsite-ask'));
  dlg.id = 'offsiteAsk';
  dlg.setAttribute('aria-labelledby', 'offsiteAskH');
  var form = el('form');
  form.setAttribute('method', 'dialog');
  var head = el('h2', null, 'Keep a copy of Rouh off this machine?');
  head.id = 'offsiteAskH';
  form.appendChild(head);
  form.appendChild(el('p', null, 'Everything Rouh knows lives on this one machine: your chats, tasks, saved logins and its '
    + 'own code. If the machine is lost, stolen or its disk fails, it all goes with it.'));
  form.appendChild(el('p', null, 'Once a week Rouh can send one locked copy to a bucket of yours. Only you can open it, '
    + 'with a password Rouh makes for you.'));
  var acts = el('div', 'oa-acts');
  [['r2', 'Cloudflare R2'], ['s3', 'Amazon S3']].forEach(function (k) {
    var a = /** @type {HTMLAnchorElement} */ (el('a', 'oa-choice', k[1]));
    a.href = '/anatomy/meta/backups?kind=' + k[0];
    a.addEventListener('click', function () { told(k[0]); dlg.close(); });
    acts.appendChild(a);
  });
  var later = el('button', 'oa-later', 'Not now');
  later.setAttribute('value', 'later');
  later.addEventListener('click', function () { told('later'); });
  acts.appendChild(later);
  form.appendChild(acts);
  form.appendChild(el('p', 'oa-small', 'Rouh asks this once. It is always in Anatomy, Meta, Copy off this machine.'));
  dlg.appendChild(form);
  dlg.addEventListener('close', function () { dlg.remove(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  // Shown is asked: a closed tab or Escape never brings it back.
  told('shown');
  // Neither kind is pushed by where the cursor starts.
  later.focus();
}

window.setTimeout(function () {
  if (document.hidden) return;
  fetch('/api/anatomy/backups/ask', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ask) show(); })
    .catch(function () {});
}, WAIT_MS);

export { show as offsiteAskShow };
