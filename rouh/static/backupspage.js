/* Anatomy, Meta, Copy off this machine, at /anatomy/meta/backups (`rouh/offsite_setup.py`, `rouh/web/backups.py`).

   Task 98, gap G18 (25 November 2026). Petar: "we should offer only s3, r2 backups" ... "We should have a
   sign in settings -> meta, no other nagging. one time ask at some point with a modal popup."

   Not set up: a headline sentence, then one card: Cloudflare R2 or Amazon S3, the chosen one's steps, its
   boxes, and Check and turn on. Checked: the password Rouh made, shown once, with Copy and I have saved it,
   until it is confirmed. Set up: the verdict, three tiles (where, the newest copy, what locks it), Send a copy
   now, what a copy holds, how to bring it back, and the quiet row (Make a new password, Change the bucket,
   Stop the copies), each of the two that change something asking first. `?kind=r2|s3`, from the one popup
   (`app/offsite_ask.js`), chooses the kind and puts the cursor in its first box. Drawn into `#backupsBody`. */
(function () {
  'use strict';

  /* data: the last answer. kind: the kind chosen. password: shown once, until saved. confirm: the change
     waiting for its second press. said / fail: what the last action did, or why it did not. */
  var S = { open: false, data: null, seq: 0, busy: '', kind: '', password: '', confirm: '', said: '', fail: '',
            changing: false, focus: '', poll: 0, copied: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function button(text, cls, act) {
    var b = el('button', 'ctl small bk-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.disabled = !!S.busy;
    b.addEventListener('click', act);
    return b;
  }
  function csrfToken() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }

  function call(method, url, body, busy) {
    var seq = ++S.seq;
    if (method === 'POST') { S.busy = busy || 'page'; S.fail = ''; S.said = ''; draw(); }
    return fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                        body: method === 'POST' ? JSON.stringify(body || {}) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (method === 'POST') S.busy = '';
          if (method === 'GET' && seq !== S.seq) return j;
          if (j && j.kinds) S.data = j;
          if (j && j.password) { if (j.password !== S.password) S.copied = false; S.password = j.password; }
          if (!r.ok) S.fail = (j && j.error) || 'Rouh answered ' + r.status + '. Nothing changed.';
          draw();
          watch();
          return { ok: r.ok, body: j || {} };
        });
      })
      .catch(function () {
        S.busy = '';
        S.fail = 'Rouh could not be reached. Check the connection and try again.';
        draw();
        return { ok: false, body: {} };
      });
  }
  function load() { return call('GET', '/api/anatomy/backups'); }

  /* While a copy is being sent, look again every few seconds for how it went. */
  function watch() {
    clearTimeout(S.poll);
    if (S.open && S.data && S.data.sending) S.poll = window.setTimeout(load, 4000);
  }

  /* ---- the form ---- */

  function kindOf(id) {
    var ks = (S.data && S.data.kinds) || [];
    for (var i = 0; i < ks.length; i++) if (ks[i].id === id) return ks[i];
    return ks[0];
  }

  function field(id, label, opts) {
    var wrap = el('div', 'bk-field');
    var lab = el('label', null, label);
    lab.htmlFor = id;
    var input = /** @type {HTMLInputElement} */ (el('input', 'bk-input'));
    input.id = id;
    input.type = opts.secret ? 'password' : 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.value) input.value = opts.value;
    wrap.appendChild(lab);
    wrap.appendChild(input);
    if (opts.hint) {
      var hint = el('small', null, opts.hint);
      hint.id = id + 'Hint';
      input.setAttribute('aria-describedby', hint.id);
      wrap.appendChild(hint);
    }
    return wrap;
  }

  function setupCard(d) {
    var card = el('section', 'setting-card hb-card bk-card');
    card.setAttribute('aria-labelledby', 'bkKindH');
    var set = el('fieldset', 'bk-kinds');
    var leg = el('legend', 'bk-legend', 'Where should the copy go?');
    leg.id = 'bkKindH';
    set.appendChild(leg);
    var chosen = kindOf(S.kind || (d.kind === 's3' ? 's3' : 'r2'));
    (d.kinds || []).forEach(function (k) {
      var lab = el('label', 'bk-kind');
      var r = /** @type {HTMLInputElement} */ (el('input'));
      r.type = 'radio';
      r.name = 'bkKind';
      r.value = k.id;
      r.id = 'bkKind-' + k.id;
      r.checked = k.id === chosen.id;
      r.addEventListener('change', function () { keepTyped(); S.kind = k.id; S.fail = ''; draw(); });
      lab.appendChild(r);
      lab.appendChild(el('b', null, k.name));
      lab.appendChild(el('span', null, k.why));
      set.appendChild(lab);
    });
    card.appendChild(set);
    var steps = el('ol', 'settings-steps bk-steps');
    (chosen.steps || []).forEach(function (s) { steps.appendChild(el('li', null, s)); });
    card.appendChild(steps);
    if (chosen.policy) {
      var pol = el('div', 'bk-policy');
      var pre = el('pre', 'bk-pre', chosen.policy);
      pre.id = 'bkPolicy';
      pre.setAttribute('aria-label', 'The policy to paste in IAM');
      pre.tabIndex = 0;
      pol.appendChild(pre);
      var cp = button(S.policyCopied ? 'Policy copied' : 'Copy the policy', '', function () {
        try { navigator.clipboard.writeText(chosen.policy).then(function () { S.policyCopied = true; keepTyped(); draw(); }); }
        catch (err) {}
      });
      pol.appendChild(cp);
      card.appendChild(pol);
    }
    var fields = el('div', 'bk-fields');
    var typed = S.typed || {};
    fields.appendChild(field('bkWhere', chosen.where.label, { placeholder: chosen.where.placeholder, hint: chosen.where.hint,
                                                              value: typed.where }));
    fields.appendChild(field('bkBucket', 'Bucket', { placeholder: 'for example rouh-backups', value: typed.bucket || (S.changing ? d.bucket : '') }));
    fields.appendChild(field('bkKeyId', 'Access key ID', { value: typed.key_id }));
    fields.appendChild(field('bkSecret', 'Secret access key', { secret: true,
      hint: S.changing ? 'Leave it empty to keep the one Rouh has.' : 'Kept locked on this machine, and never shown again.' }));
    card.appendChild(fields);
    if (S.fail) { var err = say(S.fail, 'bad', true); err.id = 'bkErr'; err.tabIndex = -1; card.appendChild(err); }
    var acts = el('div', 'hb-actions bk-acts');
    acts.appendChild(button(S.busy === 'save' ? 'Checking the bucket…' : 'Check and turn on', 'primary', save));
    if (S.changing) acts.appendChild(button('Cancel', 'bk-quiet', function () { S.changing = false; S.fail = ''; S.typed = null; draw(); }));
    card.appendChild(acts);
    return card;
  }

  function keepTyped() {
    var v = function (id) { var n = /** @type {HTMLInputElement | null} */ ($(id)); return n ? n.value : ''; };
    S.typed = { where: v('bkWhere'), bucket: v('bkBucket'), key_id: v('bkKeyId') };
  }

  function save() {
    keepTyped();
    var secret = /** @type {HTMLInputElement | null} */ ($('bkSecret'));
    var body = { kind: S.kind || 'r2', where: S.typed.where, bucket: S.typed.bucket, key_id: S.typed.key_id,
                 secret: secret ? secret.value : '' };
    if (secret) secret.value = '';
    call('POST', '/api/anatomy/backups', body, 'save').then(function (got) {
      if (got && got.ok) { S.changing = false; S.typed = null; S.focus = S.password ? 'bkPw' : 'bkSend'; }
      else S.focus = 'bkErr';
      draw();
    });
  }

  /* ---- the password, once ---- */

  function passwordCard() {
    var card = el('section', 'setting-card hb-card bk-card bk-pwcard');
    card.setAttribute('aria-labelledby', 'bkPwH');
    var h = el('h4', 'hb-h', 'Your copies’ password');
    h.id = 'bkPwH';
    card.appendChild(h);
    card.appendChild(el('p', 'settings-help', 'It is the only way to open a copy on another machine. Put it in your password '
      + 'manager now: once you press I have saved it, Rouh will not show it again.'));
    var pw = el('output', 'bk-pw', S.password);
    pw.id = 'bkPw';
    pw.tabIndex = -1;
    pw.setAttribute('aria-label', 'The password');
    card.appendChild(pw);
    var acts = el('div', 'hb-actions bk-acts');
    acts.appendChild(button(S.copied ? 'Copied' : 'Copy the password', 'primary', function () {
      var done = function () { S.copied = true; draw(); };
      try {
        navigator.clipboard.writeText(S.password).then(done, function () { selectPw(); });
      } catch (err) { selectPw(); }
    }));
    acts.appendChild(button('I have saved it', '', function () {
      call('POST', '/api/anatomy/backups/saved', {}, 'saved').then(function (got) {
        if (!got.ok) return;
        S.password = '';
        S.focus = 'bkSend';
        S.said = 'The password is put away. Rouh keeps it locked here only to lock each copy with.';
        draw();
      });
    }));
    card.appendChild(acts);
    return card;
  }
  function selectPw() {
    var n = $('bkPw');
    if (!n) return;
    var r = document.createRange();
    r.selectNodeContents(n);
    var sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
    S.said = 'Selected: copy it with your keyboard.';
  }

  /* ---- set up ---- */

  function say(text, cls, alert) {
    text = String(text || '');
    if (text && !/[.!?)]$/.test(text)) text += '.';
    var p = el('p', 'bk-say' + (cls ? ' ' + cls : ''));
    p.appendChild(el('i', 'bk-mark'));
    p.appendChild(el('span', null, text));
    p.setAttribute('role', alert ? 'alert' : 'status');
    return p;
  }
  function mb(bytes) {
    var n = (bytes || 0) / 1e6;
    return n >= 1000 ? (n / 1000).toFixed(1) + ' GB' : n.toFixed(n < 10 ? 1 : 0) + ' MB';
  }
  function tile(label, main, small) {
    var t = el('div', 'bk-tile');
    t.appendChild(el('dt', null, label));
    var dd = el('dd', null, main);
    if (small) dd.appendChild(el('small', null, small));
    t.appendChild(dd);
    return t;
  }
  function headline(d) {
    var bucket = d.in_bucket || {};
    var where = 'A copy goes to ' + d.kind_name + ' every week.' + (d.last_failed ? ' The last try did not go.' : '');
    if (bucket.ok && bucket.count) return where + ' The newest arrived ' + bucket.arrived_at + '; ' + bucket.count
      + (bucket.count === 1 ? ' is' : ' are') + ' in the bucket.';
    if (d.last_good) return where + ' The newest was sent ' + d.last_good.at + '.';
    return where + ' None has been sent yet.';
  }

  function statusCard(d) {
    var card = el('section', 'setting-card hb-card bk-card');
    card.setAttribute('aria-label', 'The copies');
    var tiles = el('dl', 'bk-tiles');
    tiles.appendChild(tile('Where', d.kind_name, 'bucket ' + d.bucket + (d.region ? ', ' + d.region : '')));
    var b = d.in_bucket || {};
    var newest = b.ok && b.count ? b.arrived_at : d.last_good ? d.last_good.at : 'None yet';
    var size = b.ok && b.count ? mb(b.bytes) + '; ' + b.count + ' of at most ' + d.keep + ' in the bucket' :
      d.last_good ? mb(d.last_good.bytes) + ', the newest ' + d.keep + ' kept' : 'the newest ' + d.keep + ' are kept';
    tiles.appendChild(tile('Newest copy', newest, size));
    tiles.appendChild(d.lock === 'key' ? tile('Locked with', 'Your own age key', 'its private half kept off this machine')
      : tile('Locked with', 'A password', d.password_made ? 'made ' + d.password_made : ''));
    card.appendChild(tiles);
    if (d.admin) {
      var acts = el('div', 'hb-actions bk-acts');
      var send = button(d.sending ? 'Sending…' : 'Send a copy now', 'primary', function () {
        call('POST', '/api/anatomy/backups/send', {}, 'send');
      });
      send.id = 'bkSend';
      if (d.sending) { send.disabled = true; send.setAttribute('aria-busy', 'true'); }
      acts.appendChild(send);
      card.appendChild(acts);
    }
    var now = d.sent_now || {};
    if (d.sending) card.appendChild(say('Sending a copy now. It can take a few minutes; you can leave this page.', 'going'));
    else if (now.ok === false) card.appendChild(say('That copy did not go: ' + now.error, 'bad'));
    else if (now.ok) card.appendChild(say('The copy went: ' + mb(now.bytes) + ', sent ' + now.at + '.', ''));
    else if (d.last_failed) card.appendChild(say('The last try, ' + d.last_failed.at + ', did not go: ' + d.last_failed.error
      + '. Rouh tries again in ' + (d.retry_hours || 6) + ' hours.', 'bad'));
    else if (d.last_good) card.appendChild(say('The last copy went on ' + d.last_good.at + '.', ''));
    else if (b.ok && b.count) card.appendChild(say('The next copy goes within a week, or press Send a copy now.', 'note'));
    else card.appendChild(say('The first copy goes within the hour, or press Send a copy now.', 'note'));
    if (b.ok === false && b.count === null && b.human) card.appendChild(say(b.human, 'bad'));
    return card;
  }

  function holdsCard() {
    var card = el('section', 'setting-card hb-card bk-card');
    card.setAttribute('aria-labelledby', 'bkHoldsH');
    var h = el('h4', 'hb-h', 'What is in a copy');
    h.id = 'bkHoldsH';
    card.appendChild(h);
    var ul = el('ul', 'bk-holds');
    ['The database: chats, tasks, contacts and memory', 'Both keys that open its saved logins',
     'Its files and its workspace', 'Its own code, with its whole history',
     'Its update ledger: which releases it took and which wait'].forEach(function (x) { ul.appendChild(el('li', null, x)); });
    card.appendChild(ul);
    return card;
  }

  function backCard(d) {
    var card = el('section', 'setting-card hb-card bk-card');
    card.setAttribute('aria-labelledby', 'bkBackH');
    var h = el('h4', 'hb-h', 'To bring it back');
    h.id = 'bkBackH';
    card.appendChild(h);
    var ol = el('ol', 'settings-steps bk-steps');
    ['Download the newest copy from your bucket, under ' + d.prefix + '.',
     d.lock === 'key' ? 'Open it with your age key: age -d -i your-key.txt -o rouh.bundle copy.bundle.age'
       : 'Open it with age and the password: age -d -o rouh.bundle copy.bundle.age',
     'Bring it into a new machine (linux_stack.py import). Its own code is checked by the protected core before it runs.'
    ].forEach(function (x) { ol.appendChild(el('li', null, x)); });
    card.appendChild(ol);
    return card;
  }

  function quietRow(d) {
    var row = el('div', 'hb-actions bk-quietrow');
    if (S.confirm) {
      var box = el('div', 'bk-confirm');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Confirm');
      var text = S.confirm !== 'password'
        ? 'Rouh stops sending copies and forgets the bucket’s keys. The copies already in the bucket stay there.'
        : d.lock === 'key'
          ? 'From now on the copies are locked with a password Rouh makes, not your age key. The copies already in the bucket still open only with your age key.'
          : 'A new password locks the copies from now on. The copies already in the bucket still open only with the old one.';
      box.appendChild(el('p', 'settings-help', text));
      var acts = el('div', 'hb-actions');
      var go = button(S.confirm === 'password' ? 'Make the new password' : 'Stop the copies', S.confirm === 'password' ? '' : 'bk-stop', function () {
        var which = S.confirm;
        S.confirm = '';
        call('POST', which === 'password' ? '/api/anatomy/backups/password' : '/api/anatomy/backups/stop', {}, which)
          .then(function (got) {
            if (!got.ok) return;
            S.focus = which === 'password' ? 'bkPw' : '';
            S.said = which === 'stop' ? 'The copies are stopped. Those already in the bucket are still there.' : '';
            draw();
          });
      });
      go.id = 'bkConfirmGo';
      acts.appendChild(go);
      acts.appendChild(button('Cancel', 'bk-quiet', function () { S.confirm = ''; draw(); }));
      box.appendChild(acts);
      row.appendChild(box);
      return row;
    }
    row.appendChild(button('Make a new password', 'bk-quiet', function () { S.confirm = 'password'; S.focus = 'bkConfirmGo'; draw(); }));
    row.appendChild(button('Change the bucket', 'bk-quiet', function () {
      S.changing = true; S.kind = d.kind === 's3' ? 's3' : 'r2'; S.typed = null; S.focus = 'bkWhere'; draw();
    }));
    row.appendChild(button('Stop the copies', 'bk-quiet', function () { S.confirm = 'stop'; S.focus = 'bkConfirmGo'; draw(); }));
    return row;
  }

  /* ---- the page ---- */

  function draw() {
    var host = $('backupsBody');
    if (!host) return;
    var active = document.activeElement;
    var keep = S.focus || (active && active.id && host.contains(active) ? active.id : '');
    if (keep === 'bkWhere' || keep === 'bkBucket' || keep === 'bkKeyId') keepTyped();
    host.textContent = '';
    host.setAttribute('aria-busy', S.data ? 'false' : 'true');
    var d = S.data;
    // A place for the cursor asked for before the page was read is kept until there is a page.
    if (!d) { host.appendChild(el('p', 'settings-help', S.fail || 'Reading…')); return; }
    S.focus = '';
    var page = el('div', 'bk-page');
    var lead = el('p', 'bk-lead');
    if (S.password) {
      lead.textContent = 'The bucket answered, and the copies are on. Now keep this password.';
      page.appendChild(lead);
      page.appendChild(passwordCard());
    } else if (!d.set_up || S.changing) {
      lead.textContent = S.changing ? 'Change where the copy goes. The copies already in the old bucket stay there.'
        : 'Rouh sends no copy off this machine.';
      page.appendChild(lead);
      if (!S.changing) page.appendChild(el('p', 'settings-help bk-why', 'If this machine is lost, stolen or its disk fails, '
        + 'everything on it goes too. A locked copy each week, to a bucket of yours, takes a few minutes to set up.'));
      if (d.problem) page.appendChild(say(d.problem[0].toUpperCase() + d.problem.slice(1) + '.', 'bad'));
      if (d.admin) page.appendChild(setupCard(d));
      else page.appendChild(el('p', 'settings-help', 'Only this Rouh’s administrator sets up where the copy goes.'));
    } else {
      lead.textContent = headline(d);
      page.appendChild(lead);
      page.appendChild(statusCard(d));
      page.appendChild(holdsCard());
      page.appendChild(backCard(d));
      if (d.admin) page.appendChild(quietRow(d));
    }
    if (S.said) page.insertBefore(say(S.said, ''), page.children[1] || null);
    if (S.fail && d.set_up && !S.changing) page.appendChild(say(S.fail, 'bad', true));
    host.appendChild(page);
    var target = keep && $(keep);
    if (target) {
      target.focus({ preventScroll: true });
      if (keep === 'bkWhere' || keep === 'bkPw' || keep === 'bkErr' || keep === 'bkConfirmGo') target.scrollIntoView({ block: 'center' });
    }
  }

  function shownNow() {
    var asked = /[?&]kind=(r2|s3)\b/.exec(location.search || '');
    if (asked) { S.kind = asked[1]; S.focus = 'bkWhere'; }
    if (S.open) { draw(); return; }
    S.open = true;
    S.fail = '';
    S.said = '';
    S.confirm = '';
    draw();
    load().then(function () { if (asked) draw(); });
  }
  function hiddenNow() {
    S.open = false;
    S.confirm = '';
    clearTimeout(S.poll);
    // The password stays until "I have saved it" is pressed: the server shows it again until then.
  }

  window.RouhBackups = { shown: shownNow, hidden: hiddenNow, reload: load };
})();
