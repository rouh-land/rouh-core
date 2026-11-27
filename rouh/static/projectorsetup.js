/* The projector's setup page (`rouh/projector.py`): says whether a projector is set up, makes its setup file
 * and turns it off.
 *
 * Download the setup file asks Rouh for a new key for this person's projector, in a cloud-init file (the
 * first-start settings Raspberry Pi OS reads from its SD card), and fills in the Wi-Fi name, password and
 * country and the time zone here, in this browser, so the Wi-Fi password never reaches Rouh. Then it is
 * saved as `user-data`, the name Raspberry Pi OS looks for.
 *
 * The blank-card steps (the Wi-Fi fields and the file) are folded away under "Set up a new Pi" (task 200,
 * 200-05): a projector is set up once, and paired with the code after that.
 *
 * Pair this projector: a Pi already showing the wall with no key shows a six-letter code; typed here, Rouh
 * makes the key and hands it to that wall alone (`rouh/projector.py`, pairing).
 *
 * window.PROJECTOR_SETUP_DEMO, when a design's page sets it, is the state to show instead of asking.
 */
(function () {
  'use strict';

  var DEMO = window.PROJECTOR_SETUP_DEMO || null;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('make'), go = $('go'), said = $('said'), verdict = $('verdict');
  var setUp = false;

  //: The Wi-Fi country from the time zone, for the places a Rouh is most likely to be; anything else is typed.
  var COUNTRY = { Sofia: 'BG', London: 'GB', Dublin: 'IE', Berlin: 'DE', Paris: 'FR', Madrid: 'ES', Rome: 'IT',
    Amsterdam: 'NL', Brussels: 'BE', Vienna: 'AT', Zurich: 'CH', Prague: 'CZ', Warsaw: 'PL', Athens: 'GR',
    Bucharest: 'RO', Belgrade: 'RS', Istanbul: 'TR', Lisbon: 'PT', Stockholm: 'SE', Oslo: 'NO', Copenhagen: 'DK',
    Helsinki: 'FI', Budapest: 'HU', Kyiv: 'UA', New_York: 'US', Chicago: 'US', Denver: 'US', Los_Angeles: 'US',
    Toronto: 'CA', Vancouver: 'CA', Sydney: 'AU', Tokyo: 'JP', Singapore: 'SG', Dubai: 'AE' };

  function ago(seconds) {
    var s = Math.max(0, Date.now() / 1000 - seconds);
    if (s < 90) return 'just now';
    var m = Math.round(s / 60), h = Math.round(s / 3600);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    if (s < 86400 * 2) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return 'on ' + new Date(seconds * 1000).toLocaleDateString([], { day: 'numeric', month: 'long' });
  }

  function showState(st) {
    setUp = !!st.set_up;
    verdict.textContent = '';
    var b = document.createElement('strong');
    if (!setUp) {
      b.textContent = 'No projector is paired.';
      verdict.appendChild(b);
      verdict.appendChild(document.createTextNode(' Type the code it shows, below.'));
    } else if (st.showing) {
      b.textContent = 'Paired. Your projector is showing your Robot Chat now.';
      verdict.appendChild(b);
    } else if (st.last_seen_at) {
      b.textContent = 'Paired.';
      verdict.appendChild(b);
      verdict.appendChild(document.createTextNode(' Your projector last showed it ' + ago(st.last_seen_at) + '; it is probably switched off.'));
    } else {
      verdict.appendChild(document.createTextNode('A setup file was made ' + ago(st.created_at) + ', and no projector has used it yet.'));
    }
    // Paired (a projector has used its key): the code box is the rare case, said so; a new card's file would
    // end this projector's key. A file made and never used is not a pairing yet.
    var paired = setUp && !!(st.showing || st.last_seen_at);
    $('keeps').hidden = !paired;
    $('pairTitle').textContent = paired ? 'Showing a code again?' : 'Is your projector showing a code?';
    $('pairHelp').textContent = paired
      ? 'Only if the wall shows a code. Pairing gives that projector a new key and ends the one before.'
      : 'A projector that is not paired shows a six-letter code. Type it here and it shows your Robot Chat within a few seconds.';
    $('freshWarn').hidden = !setUp;
    $('offSaid').hidden = true;
    $('off').hidden = !setUp;
    $('offSure').hidden = true;
    $('offKeep').hidden = true;
    go.textContent = setUp ? 'Download a new setup file' : 'Download the setup file';
  }

  function load() {
    if (DEMO) { showState(DEMO.state || {}); return; }
    fetch('/api/projector/state', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(showState)
      .catch(function () { verdict.textContent = 'Rouh could not be reached. Try again in a moment.'; });
  }

  function say(text, ok) {
    said.textContent = text;
    said.className = 'said ' + (ok ? 'good' : 'bad');
    said.hidden = false;
  }

  function b64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    bytes.forEach(function (x) { bin += String.fromCharCode(x); });
    return btoa(bin);
  }

  function filled(template) {
    var country = $('country').value.trim().toUpperCase();
    var tz = $('tz').value.trim();
    if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) tz = 'UTC';
    return template
      .replace('__WIFI_SSID_B64__', b64($('ssid').value))
      .replace('__WIFI_PSK_B64__', b64($('psk').value))
      .replace('__WIFI_COUNTRY__', country)
      .replace('__TIMEZONE__', tz);
  }

  function save(text) {
    var blob = new Blob([text], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'user-data';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var psk = $('psk').value;
    if (psk && (psk.length < 8 || psk.length > 63)) {
      say('A Wi-Fi password is 8 to 63 characters. Leave it empty for a network with none.', false);
      $('psk').focus();
      return;
    }
    var replacing = setUp;
    go.disabled = true;
    var done = function () { go.disabled = false; };
    var got = DEMO ? Promise.resolve({ ok: true, file: DEMO.file || '' })
      : fetch('/api/projector/setup-file', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: $('origin').value.trim() })
      }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Rouh refused it.'); return d; }); });
    got.then(function (d) {
      save(filled(d.file));
      say('Saved user-data to your Downloads. ' + (replacing ? 'The projector set up before stops showing your chat. ' : '') + 'Next: put it on the card.', true);
      load();
    }).catch(function (err) {
      say('The setup file was not made: ' + err.message, false);
    }).then(done);
  });

  // A projector already on the wall, showing a code: typing it makes its key and hands it to that wall alone.
  $('pairForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var box = $('pairSaid'), btn = $('pairGo');
    var tell = function (text, ok) { box.textContent = text; box.className = 'said ' + (ok ? 'good' : 'bad'); box.hidden = false; };
    var code = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { tell('The code on the wall is six letters and digits, such as K7Q-4MX.', false); $('code').focus(); return; }
    var replacing = setUp;
    btn.disabled = true;
    var got = DEMO ? Promise.resolve({ ok: true }) : fetch('/api/projector/pair/claim', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Rouh refused it.'); return d; }); });
    got.then(function () {
      tell('Paired. The wall shows your Robot Chat within a few seconds.' + (replacing ? ' The projector paired before stops showing it.' : ''), true);
      $('code').value = '';
      setTimeout(load, 4000);
    }).catch(function (err) { tell(err.message, false); }).then(function () { btn.disabled = false; });
  });

  $('showPsk').addEventListener('click', function () {
    var shown = $('psk').type === 'text';
    $('psk').type = shown ? 'password' : 'text';
    this.textContent = shown ? 'Show' : 'Hide';
    this.setAttribute('aria-pressed', String(!shown));
  });

  $('off').addEventListener('click', function () {
    $('off').hidden = true;
    $('offSure').hidden = false;
    $('offKeep').hidden = false;
    $('offSure').focus();
  });
  $('offKeep').addEventListener('click', function () { showState({ set_up: setUp }); load(); $('off').focus(); });
  $('offSure').addEventListener('click', function () {
    var done = DEMO ? Promise.resolve() : fetch('/api/projector/off', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(); });
    done.then(function () {
      showState({ set_up: false });
      verdict.textContent = 'Turned off. That projector no longer shows your Robot Chat.';
    }).catch(function () {
      var box = $('offSaid');
      box.textContent = 'It was not turned off. Try again.'; box.className = 'said bad'; box.hidden = false;
    });
  });

  var zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
  $('tz').value = zone || 'UTC';
  var city = zone.split('/').pop();
  var region = '';
  try { region = (new Intl.Locale(navigator.language).maximize().region) || ''; } catch (e) { region = ''; }
  $('country').value = COUNTRY[city] || region || 'GB';
  $('origin').value = location.origin;
  if (location.hash === '#new') $('fresh').open = true;
  load();
})();
