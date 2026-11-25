/* You, Your account: the card "Your rouh.land account" (`rouh/landaccount.py`,
   `rouh/web/landaccount.py`). Rouh Land Account, Your profile from 4 to 7 November 2026.

   Task 141, step 141-17 ("one home for each journey"): if it is about you, it is on Your account;
   if it is about the Rouh, it is on Your Rouh; if it is about your rouh.land account itself, it is
   done on rouh.land. So this card says whether you have a rouh.land account this Rouh is in, what
   rouh.land keeps about you, that nothing about you is public, and what is done only on rouh.land,
   each a press away there, in a new tab, which it says. Connecting, disconnecting and anything
   wrong between this Rouh and rouh.land are Your Rouh's (`birthpage.js`), and a link says so.

   Task 98, gap G22 (25 November 2026), two more, both an administrator's: "Your data", a download of
   the owner's data in plain formats in one zip (`rouh/data_export.py`, GET /api/your-data/export),
   and, for a Connected Rouh, "Delete my rouh.land account": rouh.land is asked what it holds, the
   sheet says what goes and what stays, and one press deletes it; the Rouh is Independent after.

   Anatomy tells it when Your account shows and when it is left (`settingsPages` in app/runs.js). */
(function () {
  'use strict';

  var A = { open: false, data: null, error: '', said: '', sending: false, checked: false,
            making: false, gone: '', asking: false, delSaid: '' };
  var OUT = '<svg class="yr-out" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/>' +
    '<path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  var GLOBE = '<svg class="yr-globe" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" ' +
    'r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-' +
    '8.5s1.2-6.2 3.6-8.5z"/></svg>';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function zone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { return ''; }
  }
  function out(text, href, label) {
    var a = el('a', 'ctl small yr-quiet', text + ' ');
    a.insertAdjacentHTML('beforeend', OUT);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', (label || text) + ' (opens rouh.land in a new tab)');
    return a;
  }
  function inapp(text, href) {
    var a = el('a', 'bd-inline', text);
    a.href = href;
    a.setAttribute('data-inapp', '');
    a.addEventListener('click', function (e) {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if (window.RouhGenesHost) window.RouhGenesHost.go(href);
      else location.href = href;
    });
    return a;
  }
  function rows(list) {
    var dl = el('dl', 'yr-rows');
    list.forEach(function (r) {
      var d = el('div');
      d.appendChild(el('dt', null, r[0]));
      d.appendChild(el('dd', null, r[1]));
      dl.appendChild(d);
    });
    return dl;
  }

  function load() {
    return fetch('/api/rouh-land/account', { credentials: 'same-origin', cache: 'no-store',
                                             headers: { 'X-Time-Zone': zone() } })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && j.error) || 'The server said ' + r.status + '.');
          return j;
        });
      })
      .then(function (j) {
        if (j) { A.data = j; A.error = ''; }
        draw();
        // Ask rouh.land once as the card opens, when a check is due: an account confirmed by the
        // emailed link a moment ago shows as connected now, not hours later (step 176-16).
        if (j && j.check_due && !A.checked) { A.checked = true; checkNow(); }
      })
      .catch(function (e) { A.error = e.message || 'Rouh could not be reached.'; draw(); });
  }
  function checkNow() {
    fetch('/api/rouh-land/account/check', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                                            headers: { 'Content-Type': 'application/json', 'X-Time-Zone': zone(),
                                                       'X-CSRFToken': csrfToken() }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && A.open) { A.data = j; draw(); } })
      .catch(function () {});
  }

  /* Your data: what the zip holds, and the one press that downloads it. A plain link, so the browser
     downloads it as it would any file, with a line that says it is being made. */
  function dataCard(body) {
    var s = el('section', 'setting-card hb-card yr-card');
    s.setAttribute('aria-labelledby', 'ydH');
    var h = el('h4', 'hb-h', 'Your data');
    h.id = 'ydH';
    s.appendChild(h);
    s.appendChild(el('p', 'yr-lede', 'Everything this Rouh keeps of yours, in one zip, in files other programs open without Rouh.'));
    s.appendChild(rows([
      ['Chats', 'Every chat, as text you can read (Markdown) and as data (JSON)'],
      ['Contacts', 'Everyone Rouh knows, as vCards your phone imports, and as a table (CSV)'],
      ['Tasks', 'Every project and task, with your workspace’s notes and pages'],
      ['Files', 'Every file kept in Rouh, as it is'],
      ['Settings', 'Your account, your settings and which models answer (JSON)'],
      ['Never in it', 'Passwords, keys, tokens and saved logins'],
    ]));
    var acts = el('div', 'hb-actions');
    var a = el('a', 'ctl small', A.making ? 'Making your zip…' : 'Download your data');
    a.href = '/api/your-data/export';
    a.setAttribute('download', '');
    a.id = 'ydGo';
    a.addEventListener('click', function () {
      A.making = true;
      draw();
      setTimeout(function () { A.making = false; if (A.open) draw(); }, 8000);
    });
    acts.appendChild(a);
    s.appendChild(acts);
    var say = el('p', 'settings-help', A.making
      ? 'Rouh is putting it together. The download starts by itself; a large workspace takes a minute.'
      : 'To move the whole Rouh to another machine, keys and all, use its full copy instead (export_rouh, in its guide).');
    say.setAttribute('role', 'status');
    s.appendChild(say);
    body.appendChild(s);
  }

  function draw() {
    var body = $('landAccountBody');
    if (!body || !A.open) return;
    body.textContent = '';
    if (A.data && A.data.admin) dataCard(body);
    var s = el('section', 'setting-card hb-card yr-card');
    s.setAttribute('aria-labelledby', 'laH');
    var h = el('h4', 'hb-h', 'Your rouh.land account');
    h.id = 'laH';
    var where = el('span', 'yr-where');
    where.innerHTML = GLOBE;
    where.appendChild(document.createTextNode('on rouh.land'));
    h.appendChild(where);
    s.appendChild(h);
    body.appendChild(s);
    if (A.error) { s.appendChild(el('p', 'hb-say bad', A.error)); return; }
    var d = A.data;
    if (!d) { s.appendChild(el('p', 'settings-help', 'Reading…')); return; }
    var yourRouh = (window.RouhNav && window.RouhNav.route('birthday')) || '/anatomy/your-rouh';

    if (!d.admin) {
      s.appendChild(el('p', 'yr-lede', d.connected
        ? 'This Rouh is in ' + (d.owner || 'its owner') + '’s rouh.land account. You don’t need one of your own.'
        : 'This Rouh is not in a rouh.land account. You don’t need one of your own.'));
      return;
    }
    var lede = el('p', 'yr-lede');
    if (A.gone && !d.connected) {
      lede.appendChild(el('strong', null, 'Deleted. '));
      lede.appendChild(document.createTextNode(A.gone));
    } else if (d.connected) {
      lede.appendChild(el('strong', null, 'Connected. '));
      lede.appendChild(document.createTextNode((d.rouh_name || 'This Rouh') + ' is your Rouh on rouh.land.'));
    } else if (d.can_confirm) {
      // Connected, and the account waits on the emailed link (task 176, step 176-16).
      lede.appendChild(el('strong', null, d.waiting_email ? 'Waiting for your email. ' : 'Not made yet. '));
      lede.appendChild(document.createTextNode(d.waiting_email
        ? 'rouh.land sent a link to ' + d.waiting_email + '. Press it to make your rouh.land account, with '
          + (d.rouh_name || 'this Rouh') + ' in it. Then Sign in on rouh.land works with that email.'
        : (d.rouh_name || 'This Rouh') + ' is connected. Your rouh.land account is made when you confirm your email, '
          + (d.sign_in_email || '') + ', from a link rouh.land emails you.'));
    } else {
      lede.appendChild(el('strong', null, 'None linked. '));
      lede.appendChild(document.createTextNode('You get one when you connect your Rouh, on '));
      lede.appendChild(inapp('Your Rouh', yourRouh));
      lede.appendChild(document.createTextNode('. It uses this same email.'));
    }
    s.appendChild(lede);
    s.appendChild(rows([
      ['rouh.land keeps', d.connected ? 'Your email, your passkeys for rouh.land, and your Rouhs’ official names and URLs'
        : 'Nothing about you'],
      ['Public', d.connected ? 'Nothing about you. Only your Rouh’s public card, which Your Rouh shows' : 'Nothing'],
    ]));
    if (d.can_confirm) {
      var b = el('button', 'ctl small', A.sending ? 'Sending…' : (d.waiting_email ? 'Send the link again' : 'Email me the link'));
      b.type = 'button';
      b.disabled = A.sending;
      b.addEventListener('click', confirmAgain);
      s.appendChild(b);
      if (A.said) {
        var said = el('p', 'hb-say', A.said);
        said.setAttribute('role', 'status');
        s.appendChild(said);
      }
    }
    if (!d.connected) return;
    s.appendChild(el('p', 'yr-subhead', 'Done on rouh.land'));
    var ul = el('ul', 'yr-there');
    [['Your other Rouhs, and connecting a new one', 'See your Rouhs'],
     ['Install codes for a new Rouh', 'Install codes'],
     ['A machine is lost or stolen: stop that Rouh', 'Stop a Rouh'],
     ['Passkeys for rouh.land', 'Passkeys']].forEach(function (r) {
      var li = el('li');
      li.appendChild(el('span', null, r[0]));
      li.appendChild(out(r[1], d.account_url, r[1] + ' on rouh.land'));
      ul.appendChild(li);
    });
    s.appendChild(ul);
    s.appendChild(el('p', 'yr-subhead', 'Leave rouh.land'));
    s.appendChild(el('p', 'settings-help', 'Deletes your rouh.land account and what rouh.land keeps for it. '
      + (d.rouh_name || 'This Rouh') + ' keeps working here, as an Independent Rouh.'));
    var acts = el('div', 'hb-actions');
    var del = el('button', 'ctl small danger', A.asking ? 'Asking rouh.land…' : 'Delete my rouh.land account…');
    del.type = 'button';
    del.id = 'laDelete';
    del.disabled = A.asking;
    del.addEventListener('click', askDelete);
    acts.appendChild(del);
    s.appendChild(acts);
    if (A.delSaid) {
      var said2 = el('p', 'hb-say bad', A.delSaid);
      said2.setAttribute('role', 'alert');
      s.appendChild(said2);
    }
  }

  function three(cols) {
    var box = el('div', 'yr-three');
    cols.forEach(function (c) {
      var col = el('div');
      col.appendChild(el('p', 'yr-three-h', c[0]));
      var ul = el('ul');
      c[1].forEach(function (x) { ul.appendChild(el('li', '', x)); });
      col.appendChild(ul);
      box.appendChild(col);
    });
    return box;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function call(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json', 'X-Time-Zone': zone(), 'X-CSRFToken': csrfToken() },
                        body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && j.error) || 'The server said ' + r.status + '.');
          return j;
        });
      });
  }

  /* First rouh.land is asked what it holds, so the sheet says what is really there; then it asks once. */
  function askDelete() {
    A.asking = true; A.delSaid = ''; draw();
    call('GET', '/api/rouh-land/account/delete')
      .then(function (j) { A.asking = false; draw(); sheet(j); })
      .catch(function (e) { A.asking = false; A.delSaid = e.message || 'rouh.land could not be reached.'; draw(); });
  }

  function sheet(j) {
    var dlg = /** @type {HTMLDialogElement | null} */ ($('laSheet'));
    if (!dlg) return;
    var nm = j.rouh_name || 'This Rouh';
    dlg.textContent = '';
    var h = el('h2', 'yr-sheet-h', 'Delete your rouh.land account?');
    h.id = 'laSheetH';
    dlg.appendChild(h);
    if (j.admin) {
      dlg.appendChild(el('p', 'yr-lede', 'The account ' + j.email + ' is an administrator’s of rouh.land, so it can’t be '
        + 'deleted from here. Its admin role is taken away on rouh.land’s server first.'));
      var ok = el('button', 'ctl small yr-quiet', 'Close');
      ok.type = 'button';
      ok.addEventListener('click', function () { dlg.close(); });
      var row = el('div', 'hb-actions');
      row.appendChild(ok);
      dlg.appendChild(row);
      dlg.showModal();
      ok.focus();
      return;
    }
    dlg.appendChild(el('p', 'yr-lede', 'This can’t be undone. ' + nm + ' keeps working here, as an Independent Rouh.'));
    var goes = ['Your account, ' + j.email].concat(j.passkeys ? [plural(j.passkeys, 'passkey', 'passkeys') + ' for rouh.land'] : [],
                ['Sign-in links, install codes and anything waiting to be sent to you']);
    if (j.others && j.others.length) goes.push('Your other ' + plural(j.others.length, 'Rouh', 'Rouhs') + ' leave the account too: ' + j.others.join(', '));
    dlg.appendChild(three([
      ['Deleted on rouh.land', goes],
      [nm + ' stops', ['Being Connected: its URL for phones, and Gene Pool sharing', 'Security fixes and the model price list from rouh.land']],
      [nm + ' keeps', ['Its official name and keys', 'Everything on this machine', 'Your sign-in here, with ' + j.email]
        .concat(j.shared ? [plural(j.shared, 'gene', 'genes') + ' already shared stay, under its name'] : [])],
    ]));
    var acts = el('div', 'hb-actions');
    var go = el('button', 'ctl small danger', 'Delete my rouh.land account');
    go.type = 'button';
    go.addEventListener('click', function () {
      go.disabled = true;
      go.textContent = 'Deleting…';
      call('POST', '/api/rouh-land/account/delete', { email: j.email })
        .then(function (r) { dlg.close(); A.data = r; A.gone = r.said || 'Your rouh.land account is deleted.'; A.delSaid = ''; draw(); })
        .catch(function (e) { dlg.close(); A.delSaid = e.message || 'rouh.land could not be reached.'; draw(); });
    });
    var keep = el('button', 'ctl small yr-quiet', 'Keep my account');
    keep.type = 'button';
    keep.addEventListener('click', function () { dlg.close(); });
    acts.appendChild(go);
    acts.appendChild(keep);
    dlg.appendChild(acts);
    if (!dlg.dataset.wired) {
      dlg.dataset.wired = '1';
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }
    dlg.showModal();
    keep.focus();
  }

  function csrfToken() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }
  function confirmAgain() {
    A.sending = true; A.said = ''; draw();
    fetch('/api/rouh-land/account/confirm', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                                              headers: { 'Content-Type': 'application/json', 'X-Time-Zone': zone(),
                                                         'X-CSRFToken': csrfToken() },
                                              body: '{}' })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && j.error) || 'The server said ' + r.status + '.');
          return j;
        });
      })
      .then(function (j) { A.sending = false; if (j) { A.data = j; A.said = j.said || ''; } draw(); })
      .catch(function (e) { A.sending = false; A.said = e.message || 'Rouh could not be reached.'; draw(); });
  }

  window.RouhLandAccount = {
    shown: function () { A.open = true; draw(); load(); },
    hidden: function () { A.open = false; A.error = ''; A.checked = false; A.gone = ''; A.delSaid = ''; },
    reload: load,
  };
})();
