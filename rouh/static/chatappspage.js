/* Anatomy, Connections, Discord, Signal and WhatsApp (`rouh/chat_apps.py`, `rouh/web/chat_apps.py`).

   Petar, 25 November 2026 (task 98, gap G24): "g24 do those" - more ways to talk with Rouh, like
   Telegram: the owner's own messages are turns in General, anybody else's are dropped unless they are
   a trusted contact, and the keys are set here, sealed, never in a chat.

   One page per app, all drawn by this file into `#<app>AppBody` from `/api/chat-apps/<app>`:

   - the status first: one sentence that says whether Rouh is reading the app, and since when it last
     heard and answered, with the values kept (a secret only as set and its last four) and the last check;
   - setting it up: the app's steps and its fields, saved through Keys' own endpoints
     (`/api/settings/keys/save`), so it is checked with the app, sealed and used at once. A secret leaves
     the page in that one request and its field is emptied at once;
   - Signal: registering Rouh's own number with Signal, the code sent and typed back;
   - WhatsApp: the webhook address and verify token to give Meta, each with Copy;
   - the trusted contacts linked to an account on the app, and a row to link one more.

   Anatomy tells it when a page shows and when it is left (`settingsPages` in app/runs.js). */
(function () {
  'use strict';

  var APPS = ['discord', 'signal', 'whatsapp'];
  var ABOUT = {
    discord: 'Your own messages to the bot are turns in General, answered there.',
    signal: 'Signal has no bots, so Rouh needs a number of its own, and signal-cli running beside Rouh to ' +
      'speak Signal. Your own messages to that number are turns in General, answered there.',
    whatsapp: 'Meta\'s official WhatsApp Business Cloud API only: it needs a Meta business account and a ' +
      'number of Rouh\'s own, and Meta charges per conversation. Your own messages are turns in General.'
  };
  var DROPPED = 'Anybody else who writes is dropped, unread, unless you link them below as a trusted contact.';

  var S = { app: '', data: null, busy: '', error: '', said: '', changing: false, typed: {}, seq: 0,
            sig: { address: '', number: '', captcha: false, voice: false, sent: false, error: '', said: '' },
            link: { contact: '', ident: '', error: '' } };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function button(text, cls, act, label) {
    var b = el('button', 'ctl small' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.disabled = !!S.busy;
    b.addEventListener('click', act);
    return b;
  }
  function csrfToken() {
    var found = /(?:^|;\s*)rouh_csrftoken=([^;]+)/.exec(document.cookie || '');
    return found ? decodeURIComponent(found[1]) : '';
  }
  function deviceZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { return ''; }
  }
  /* Words with an address in them, the address a link. */
  function linked(text) {
    var span = el('span');
    String(text || '').split(/(https:\/\/[^\s,]+[^\s,.])/).forEach(function (part, i) {
      if (i % 2) {
        var a = el('a', '', part.replace(/^https:\/\//, ''));
        a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
        span.appendChild(a);
      } else if (part) span.appendChild(document.createTextNode(part));
    });
    return span;
  }

  function call(method, url, body, where) {
    var app = S.app;
    var seq = ++S.seq;
    if (method === 'POST') { S.busy = where || 'x'; draw(); }
    return fetch(url, { method: method, credentials: 'same-origin', cache: 'no-store',
                        headers: { 'Content-Type': 'application/json', 'X-Time-Zone': deviceZone(),
                                   'X-CSRFToken': csrfToken() },
                        body: method === 'POST' ? JSON.stringify(body || {}) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = '/login'; return null; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (method === 'POST') S.busy = '';
          if (app !== S.app) return j;
          if (method === 'GET' && seq !== S.seq) return j;
          if (j && j.app) S.data = j;
          else if (j && j.services && S.data) {
            var kept = j.services.filter(function (sv) { return sv.id === app; })[0];
            if (kept) S.data.keys = kept;
          }
          var words = (j && (j.said || j.error)) || (r.ok ? '' : 'The server said ' + r.status + '.');
          if (where === 'sig') { if (r.ok) { S.sig.said = words; S.sig.error = ''; } else { S.sig.error = words; S.sig.said = ''; } }
          else if (where === 'link') { if (r.ok) { S.said = words; S.link = { contact: '', ident: '', error: '' }; } else S.link.error = words; }
          else if (r.ok) { if (method === 'POST') S.said = words; S.error = ''; if (where === 'save') { S.changing = false; S.typed = {}; } }
          else S.error = words;
          draw();
          if (r.ok && where === 'save') load();
          return j;
        });
      })
      .catch(function () {
        if (method === 'POST') S.busy = '';
        var words = 'Rouh could not be reached. Check the connection and try again.';
        if (where === 'sig') S.sig.error = words; else if (where === 'link') S.link.error = words; else S.error = words;
        draw();
      });
  }
  function load() { return call('GET', '/api/chat-apps/' + S.app); }

  /* ---- the one state, in words ---- */

  function state(d) {
    var name = d.name;
    if (!d.set) return { pill: 'Not set', cls: 'no', line: 'Not set yet: a message to Rouh on ' + name + ' reaches nobody.' };
    var last = d.heard ? 'Last heard ' + d.heard + (d.answered ? ', last answered ' + d.answered : '') + '.' : 'Nothing heard yet.';
    if (d.trouble) return { pill: 'Not reading', cls: 'failed', line: 'Set, but Rouh cannot read ' + name + ' right now: ' + d.trouble, last: last };
    var check = (d.keys || {}).check;
    if (check && check.ok === false) return { pill: 'Not reading', cls: 'failed', checked: true,
      line: 'Set, but ' + name + ' refused the last check (' + check.at + '): ' + check.said, last: last };
    if (d.app === 'whatsapp') return { pill: 'Set', cls: 'yes', line: 'Set: Meta posts your messages to Rouh, and they are turns in General.', last: last };
    if (d.listening) return { pill: 'Listening', cls: 'yes', line: 'Listening: your messages on ' + name + ' are turns in General.', last: last };
    return { pill: 'Starting', cls: 'no', line: 'Set, and starting to read ' + name + '. This takes up to half a minute.', last: '' };
  }

  /* ---- drawing ---- */

  function body() { return S.app ? $(S.app + 'AppBody') : null; }

  function draw() {
    var host = body();
    if (!host) return;
    host.setAttribute('aria-busy', S.busy ? 'true' : 'false');
    var focusId = document.activeElement && host.contains(document.activeElement) ? document.activeElement.id : '';
    host.textContent = '';
    var page = el('div', 'hb-page chatapp-page');
    host.appendChild(page);
    var d = S.data;
    if (!d) {
      if (S.error) {
        page.appendChild(problem(S.error));
        var again = el('div', 'hb-actions');
        again.appendChild(button('Try again', '', function () { S.error = ''; draw(); load(); }));
        page.appendChild(again);
      } else page.appendChild(el('p', 'hb-empty', 'Reading ' + S.app + '…'));
      return;
    }
    var say = el('p', 'hb-say', S.said);
    say.setAttribute('role', 'status');
    say.hidden = !S.said;
    page.appendChild(say);
    page.appendChild(statusCard(d));
    if (d.admin && (!d.set || S.changing)) page.appendChild(setupCard(d));
    if (d.app === 'whatsapp') page.appendChild(hookCard(d));
    if (d.admin && d.app === 'signal' && d.set && !S.changing) page.appendChild(signalCard(d));
    page.appendChild(contactsCard(d));
    if (focusId && $(focusId)) $(focusId).focus();
  }

  function card(title, id) {
    var s = el('section', 'setting-card hb-card chatapp-card');
    if (id) s.id = id;
    s.appendChild(el('h4', 'hb-h', title));
    return s;
  }

  function statusCard(d) {
    var st = state(d);
    var s = card(d.name, S.app + '-status');
    s.querySelector('.hb-h').appendChild(el('span', 'hb-pill keys-pill ' + st.cls, st.pill));
    s.appendChild(el('p', 'keys-lead chatapp-lead', st.line));
    if (st.last) s.appendChild(el('p', 'chatapp-last', st.last));
    s.appendChild(el('p', 'settings-help', ABOUT[d.app]));
    s.appendChild(el('p', 'settings-help', DROPPED));
    var keys = d.keys || { fields: [] };
    if (d.set && !S.changing) {
      var dl = el('dl', 'hb-ask-dl keys-fields');
      keys.fields.forEach(function (f) {
        if (!f.set || f.name === 'ROUH_WHATSAPP_VERIFY_TOKEN') return;   // in Meta's webhook card
        var shown = f.source === 'settings_file' ? (f.secret ? 'set, in the settings file' : f.value + ' (in the settings file)')
          : (f.secret ? 'set, ending …' + f.last4 : f.value) + (f.saved ? ', saved ' + f.saved : '');
        dl.appendChild(el('dt', '', f.label));
        dl.appendChild(el('dd', f.secret ? 'keys-mono' : 'keys-plain', shown));
      });
      s.appendChild(dl);
    }
    if (keys.check && keys.check.said && !st.checked) {
      var line = el('p', 'keys-check ' + (keys.check.ok === false ? 'bad' : 'good'));
      line.appendChild(el('span', 'keys-mark'));
      line.appendChild(el('span', '', (keys.check.ok === false ? 'Failed, checked ' : 'Passed, checked ') +
                                      keys.check.at + ': ' + keys.check.said));
      s.appendChild(line);
    }
    if (S.error && !(d.admin && (!d.set || S.changing))) s.appendChild(problem(S.error));
    if (!d.admin) {
      s.appendChild(el('p', 'settings-help', 'Only an administrator of this Rouh sets it up or changes it.'));
      return s;
    }
    if (d.set && !S.changing) {
      var acts = el('div', 'hb-actions');
      acts.appendChild(button('Change', '', function () {
        S.changing = true; S.error = ''; S.said = ''; draw();
        var first = $(S.app + '-f-0'); if (first) first.focus();
      }, 'Change ' + d.name));
      acts.appendChild(button(S.busy === 'check' ? 'Checking…' : 'Check again', st.cls === 'failed' ? 'primary' : '', function () {
        S.said = ''; call('POST', '/api/settings/keys/check', { service: d.app }, 'check');
      }, 'Ask ' + d.name + ' again whether this still works'));
      if (keys.from_page) {
        acts.appendChild(button('Remove', 'danger', function () {
          if (!window.confirm('Remove ' + d.name + '? Rouh forgets what was kept here and stops reading it.')) return;
          S.said = ''; call('POST', '/api/settings/keys/remove', { service: d.app }, 'remove').then(load);
        }, 'Remove ' + d.name));
      }
      s.appendChild(acts);
    }
    return s;
  }

  function problem(words) {
    var bad = el('p', 'keys-check bad keys-error');
    bad.appendChild(el('span', 'keys-mark'));
    bad.appendChild(el('span', '', words));
    bad.setAttribute('role', 'alert');
    return bad;
  }

  function setupCard(d) {
    var keys = d.keys || { fields: [], steps: [] };
    var s = card(d.set ? 'Change ' + d.name : 'Set up ' + d.name, S.app + '-setup');
    if (keys.steps && keys.steps.length) {
      var ol = el('ol', 'settings-steps');
      keys.steps.forEach(function (t) { var li = el('li'); li.appendChild(linked(t)); ol.appendChild(li); });
      s.appendChild(ol);
    }
    var f = el('form', 'hb-form keys-form');
    f.setAttribute('aria-label', 'Set up ' + d.name);
    f.setAttribute('autocomplete', 'off');
    var inputs = [];
    keys.fields.forEach(function (fd, i) {
      var label = el('label', 'hb-field wide');
      label.setAttribute('for', S.app + '-f-' + i);
      var words = fd.label + (fd.required ? '' : ' (optional)');
      if (fd.secret && fd.set) words += ' - empty keeps the one ending …' + fd.last4;
      label.appendChild(el('span', '', words));
      var input = el('input', fd.secret ? 'keys-mono' : '');
      input.id = S.app + '-f-' + i;
      input.type = fd.secret ? 'password' : 'text';
      input.setAttribute('autocomplete', fd.secret ? 'new-password' : 'off');
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = false;
      input.maxLength = 2000;
      input.placeholder = fd.placeholder || '';
      var kept = S.typed[fd.name];
      if (!fd.secret && kept != null) input.value = kept;
      else if (!fd.secret && fd.value) input.value = fd.value;
      input.setAttribute('data-name', fd.name);
      label.appendChild(input);
      f.appendChild(label);
      inputs.push(input);
    });
    if (d.app === 'signal') f.appendChild(registerPart(function () {
      return { address: inputs[0].value, number: inputs[1].value };
    }));
    f.appendChild(el('p', 'settings-help', 'What you type goes straight to Rouh on this computer, is checked with ' +
      d.name + ' and kept sealed. Never paste a key to Rouh in a message.'));
    if (S.error) f.appendChild(problem(S.error));
    var acts = el('div', 'hb-actions');
    var save = el('button', 'ctl small primary', S.busy === 'save' ? 'Checking with ' + d.name + '…' : 'Save');
    save.type = 'submit';
    save.disabled = !!S.busy;
    acts.appendChild(save);
    if (d.set) {
      acts.appendChild(button('Cancel', '', function () {
        inputs.forEach(function (i) { i.value = ''; });
        S.changing = false; S.error = ''; S.typed = {}; draw();
      }));
    }
    f.appendChild(acts);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (S.busy) return;
      var values = {};
      S.typed = {};
      inputs.forEach(function (i) {
        values[i.getAttribute('data-name')] = i.value;
        if (i.type !== 'password') S.typed[i.getAttribute('data-name')] = i.value;
        if (i.type === 'password') i.value = '';
      });
      S.said = ''; S.error = '';
      call('POST', '/api/settings/keys/save', { service: d.app, values: values }, 'save');
      values = null;
    });
    s.appendChild(f);
    return s;
  }

  /* Registering Rouh's number with Signal: the address and number come from the fields beside it
     (`where`), so nothing is typed twice. Not a form of its own: it sits inside the set-up form. */
  function registerPart(where) {
    var box = el('div', 'chatapp-register');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Register Rouh\'s number with Signal');
    box.appendChild(el('p', 'chatapp-register-h', 'Not registered with Signal yet? Register Rouh\'s number here.'));
    box.appendChild(el('p', 'settings-help', 'Signal sends it a code by text message, or rings it. Use a number nobody ' +
      'uses Signal on: registering takes the number over.'));
    function field(id, words, ph, type) {
      var label = el('label', 'hb-field wide');
      label.setAttribute('for', id);
      label.appendChild(el('span', '', words));
      var input = el('input');
      input.id = id; input.type = type || 'text'; input.placeholder = ph || '';
      input.setAttribute('autocomplete', 'off'); input.setAttribute('autocapitalize', 'off'); input.spellcheck = false;
      label.appendChild(input);
      return label;
    }
    if (S.sig.captcha) {
      box.appendChild(field('sig-captcha', 'Captcha, from signalcaptchas.org', 'signalcaptcha://signal-hcaptcha...'));
      var how = el('p', 'settings-help');
      how.appendChild(linked('Solve it at https://signalcaptchas.org/registration/generate.html, then copy the address of Open Signal and paste it here.'));
      box.appendChild(how);
    }
    var voice = el('label', 'chatapp-check');
    var tick = el('input'); tick.type = 'checkbox'; tick.id = 'sig-voice'; tick.checked = !!S.sig.voice;
    tick.addEventListener('change', function () { S.sig.voice = tick.checked; });
    voice.appendChild(tick);
    voice.appendChild(el('span', '', 'Ring the number with the code instead (a landline)'));
    box.appendChild(voice);
    var acts = el('div', 'hb-actions');
    acts.appendChild(button(S.busy === 'sig' && !S.sig.sent ? 'Asking Signal…' : (S.sig.sent ? 'Send the code again' : 'Send the code'), '', function () {
      if (S.busy) return;
      var got = where();
      S.sig.address = got.address; S.sig.number = got.number;
      keepTyped();
      var captcha = $('sig-captcha') ? $('sig-captcha').value : '';
      call('POST', '/api/chat-apps/signal/register', { address: got.address, number: got.number, captcha: captcha,
                                                       voice: S.sig.voice }, 'sig').then(function (j) {
        if (j && j.ok) S.sig.sent = true;
        else if (j && /captcha/i.test(j.error || '')) S.sig.captcha = true;
        draw();
      });
    }, 'Send Rouh\'s number a code from Signal'));
    box.appendChild(acts);
    if (S.sig.sent) {
      box.appendChild(field('sig-code', 'The six digits Signal sent', '123456'));
      box.querySelector('#sig-code').setAttribute('inputmode', 'numeric');
      box.appendChild(field('sig-pin', 'Registration lock PIN, if the number has one (optional)', ''));
      var va = el('div', 'hb-actions');
      va.appendChild(button(S.busy === 'sig' ? 'Checking…' : 'Verify', '', function () {
        if (S.busy) return;
        keepTyped();
        call('POST', '/api/chat-apps/signal/verify', { address: S.sig.address, number: S.sig.number,
                                                       code: $('sig-code').value, pin: $('sig-pin').value }, 'sig')
          .then(function (j) { if (j && j.ok) { S.sig.sent = false; draw(); } });
      }, 'Verify the code'));
      box.appendChild(va);
    }
    if (S.sig.said) {
      var ok = el('p', 'keys-check good');
      ok.appendChild(el('span', 'keys-mark'));
      ok.appendChild(el('span', '', S.sig.said));
      ok.setAttribute('role', 'status');
      box.appendChild(ok);
    }
    if (S.sig.error) box.appendChild(problem(S.sig.error));
    return box;
  }

  /* What is typed in the set-up form's plain fields, kept across a redraw. */
  function keepTyped() {
    var host = body();
    if (!host) return;
    host.querySelectorAll('.keys-form input[data-name]').forEach(function (i) {
      if (i.type !== 'password') S.typed[i.getAttribute('data-name')] = i.value;
    });
  }

  /* Signal, once set: registering another number, folded away. */
  function signalCard(d) {
    var s = card('Rouh\'s number', S.app + '-register');
    var det = el('details', 'brown-toggle');
    det.appendChild(el('summary', '', 'Register another number with Signal'));
    var inner = el('div', 'brown-toggle-body');
    det.appendChild(inner);
    det.open = !!(S.sig.sent || S.sig.error || S.sig.said);
    var kept = {};
    ((d.keys || {}).fields || []).forEach(function (fd) { kept[fd.name] = fd.value || ''; });
    var addr = el('label', 'hb-field wide');
    addr.setAttribute('for', 'sig-address');
    addr.appendChild(el('span', '', 'signal-cli\'s address'));
    var ai = el('input'); ai.id = 'sig-address'; ai.value = S.sig.address || kept.ROUH_SIGNAL_API || '';
    addr.appendChild(ai);
    var num = el('label', 'hb-field wide');
    num.setAttribute('for', 'sig-number');
    num.appendChild(el('span', '', 'The number'));
    var ni = el('input'); ni.id = 'sig-number'; ni.type = 'tel'; ni.value = S.sig.number || '';
    ni.placeholder = '+44 7700 900123';
    num.appendChild(ni);
    inner.appendChild(addr);
    inner.appendChild(num);
    inner.appendChild(registerPart(function () { return { address: ai.value, number: ni.value }; }));
    s.appendChild(det);
    return s;
  }

  function copyRow(label, value, id) {
    var row = el('div', 'chatapp-copy');
    var words = el('div', 'chatapp-copy-words');
    words.appendChild(el('span', 'chatapp-copy-label', label));
    var code = el('code', 'keys-mono chatapp-copy-value', value);
    code.id = id;
    words.appendChild(code);
    row.appendChild(words);
    var b = button('Copy', '', function () {
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
      var fallback = function () {
        var range = document.createRange(); range.selectNodeContents(code);
        var sel = window.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(range); }
        try { document.execCommand('copy'); } catch (err) { /* selected: the person copies it */ }
        done();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done, fallback);
      else fallback();
    }, 'Copy ' + label.toLowerCase());
    b.disabled = false;
    row.appendChild(b);
    return row;
  }

  function hookCard(d) {
    var s = card('Meta\'s webhook', S.app + '-hook');
    if (!d.set) {
      s.appendChild(el('p', 'settings-help', 'Once WhatsApp is saved, the address and the token to give Meta are here.'));
      return s;
    }
    if (!d.hook) {
      s.appendChild(el('p', 'settings-help', 'Meta can only post to a public https address, and this Rouh has none ' +
        'yet. Give it one on Anatomy, Your Rouh, then come back here.'));
      return s;
    }
    s.appendChild(el('p', 'settings-help', 'In your app, WhatsApp, Configuration, Webhook, press Edit, paste these two, ' +
      'press Verify and save, then subscribe to messages.'));
    s.appendChild(copyRow('Callback URL', d.hook, 'wa-hook'));
    if (d.admin) s.appendChild(copyRow('Verify token', d.verify || '', 'wa-verify'));
    return s;
  }

  function contactsCard(d) {
    var s = card('Trusted contacts here', S.app + '-contacts');
    s.appendChild(el('p', 'settings-help', 'A trusted contact you link here may write to Rouh on ' + d.name +
      ': each message is handled like their email, within what they may do, and answered there.'));
    if (d.links.length) {
      var ul = el('ul', 'chatapp-links');
      ul.setAttribute('aria-label', 'Linked on ' + d.name);
      d.links.forEach(function (one) {
        var li = el('li', 'chatapp-link');
        var who = el('span', 'chatapp-who');
        who.appendChild(el('strong', '', one.name || 'A contact'));
        who.appendChild(el('span', 'keys-mono chatapp-ident', one.ident));
        li.appendChild(who);
        if (d.admin) {
          li.appendChild(button('Unlink', '', function () {
            if (!window.confirm('Unlink ' + (one.name || 'them') + '? Their messages on ' + d.name + ' are dropped again.')) return;
            S.said = ''; call('POST', '/api/chat-apps/' + d.app + '/unlink', { contact_id: one.contact_id }, 'link');
          }, 'Unlink ' + (one.name || 'them')));
        }
        ul.appendChild(li);
      });
      s.appendChild(ul);
    } else {
      s.appendChild(el('p', 'hb-empty chatapp-empty', 'Nobody else can reach Rouh on ' + d.name + ' yet.'));
    }
    if (!d.admin) return s;
    var free = d.contacts.filter(function (c) { return !d.links.some(function (l) { return l.contact_id === c.id; }); });
    if (!d.contacts.length) {
      var p = el('p', 'settings-help');
      p.appendChild(document.createTextNode('To link somebody, add them on '));
      var a = el('a', '', 'Trusted contacts');
      a.href = '/anatomy/behaviour/trusted-contacts';
      p.appendChild(a);
      p.appendChild(document.createTextNode(' first.'));
      s.appendChild(p);
      return s;
    }
    if (!free.length) {
      s.appendChild(el('p', 'settings-help', 'Every trusted contact you have is linked here.'));
      return s;
    }
    var f = el('form', 'hb-form chatapp-linkform');
    f.setAttribute('aria-label', 'Link a trusted contact');
    var l1 = el('label', 'hb-field');
    l1.setAttribute('for', S.app + '-lk-who');
    l1.appendChild(el('span', '', 'Trusted contact'));
    var sel = el('select');
    sel.id = S.app + '-lk-who';
    sel.appendChild(el('option', '', 'Pick one'));
    sel.options[0].value = '';
    free.forEach(function (c) {
      var o = el('option', '', c.name);
      o.value = String(c.id);
      if (String(c.id) === S.link.contact) o.selected = true;
      sel.appendChild(o);
    });
    l1.appendChild(sel);
    f.appendChild(l1);
    var l2 = el('label', 'hb-field wide');
    l2.setAttribute('for', S.app + '-lk-id');
    l2.appendChild(el('span', '', 'Their ' + d.ident));
    var input = el('input', 'keys-mono');
    input.id = S.app + '-lk-id';
    input.value = S.link.ident;
    input.placeholder = d.app === 'discord' ? '123456789012345678' : '+44 7700 900789';
    input.setAttribute('autocomplete', 'off'); input.spellcheck = false;
    if (d.app !== 'discord') input.type = 'tel';
    l2.appendChild(input);
    f.appendChild(l2);
    var go = el('button', 'ctl small', S.busy === 'link' ? 'Linking…' : 'Link');
    go.type = 'submit'; go.disabled = !!S.busy;
    var acts = el('div', 'hb-actions chatapp-linkgo');
    acts.appendChild(go);
    f.appendChild(acts);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (S.busy) return;
      S.link.contact = sel.value; S.link.ident = input.value;
      if (!sel.value) { S.link.error = 'Pick the trusted contact first.'; draw(); return; }
      S.said = '';
      call('POST', '/api/chat-apps/' + d.app + '/link', { contact_id: Number(sel.value), ident: input.value }, 'link');
    });
    s.appendChild(f);
    if (S.link.error) s.appendChild(problem(S.link.error));
    return s;
  }

  /* ---- shown and left ---- */

  function shown(app) {
    if (S.app === app) return;
    S.app = app;
    S.data = null; S.error = ''; S.said = ''; S.changing = false; S.typed = {};
    S.sig = { address: '', number: '', captcha: false, voice: false, sent: false, error: '', said: '' };
    S.link = { contact: '', ident: '', error: '' };
    draw();
    load();
  }

  function hidden(app) {
    if (S.app !== app) return;
    var host = body();
    if (host) host.querySelectorAll('input').forEach(function (i) { i.value = ''; });
    S.app = '';
  }

  var pages = {};
  APPS.forEach(function (app) {
    pages[app] = { shown: function () { shown(app); }, hidden: function () { hidden(app); } };
  });
  window.RouhChatApps = pages;
})();
