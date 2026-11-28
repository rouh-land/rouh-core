/* The pages in front of the sign-in: Caps Lock is on, and Show the password (`rouh/new_here.py`,
 * night 57). Loaded by `{% new_here_signin %}` in signin_base.html only while one of the two is on,
 * which it says in `#rouhNewHereSignin`.
 *
 * - caps_lock: under each password box, "Caps Lock is on" while it is, as the person types.
 * - show_password: a Show button inside each password box, which shows what was typed, and Hide.
 *
 * Nobody is signed in here yet, so a use is kept in this tab's session storage and the main page
 * (app/new_here.js) sends it once the person is in.
 */
(function () {
  'use strict';
  var on = [];
  try {
    var node = document.getElementById('rouhNewHereSignin');
    var got = node ? JSON.parse(node.textContent || '{}') : {};
    on = Array.isArray(got.on) ? got.on : [];
  } catch (err) { on = []; }
  var caps = on.indexOf('caps_lock') >= 0;
  var show = on.indexOf('show_password') >= 0;
  if (!caps && !show) return;

  /** Kept for the main page to count once the person is in. */
  function keep(name) {
    try { sessionStorage.setItem('rouh.nh.' + name, '1'); } catch (err) { /* no storage: not counted */ }
  }

  var style = document.createElement('style');
  style.textContent =
    '.pw-wrap{position:relative;display:block}' +
    '.pw-wrap input{padding-right:76px}' +
    '.pw-show{position:absolute;top:50%;right:6px;transform:translateY(-50%);margin:0;display:inline-flex;' +
    'align-items:center;justify-content:center;min-width:60px;min-height:44px;padding:0 10px;' +
    'background:transparent;color:#8fb8ff;font-size:14px;font-weight:600;border-radius:8px}' +
    '.pw-show:hover{background:#171c22}' +
    '.pw-show:focus-visible{outline:2px solid #4c8dff;outline-offset:1px}' +
    '.pw-caps{display:flex;align-items:center;gap:6px;color:#ffc46b;font-size:13px;margin-top:2px}' +
    '.pw-caps svg{flex:none}';
  document.head.appendChild(style);

  var boxes = document.querySelectorAll('input[type="password"]');
  Array.prototype.forEach.call(boxes, function (input, n) {
    var how = String(input.getAttribute('autocomplete') || '');
    // Only a password: a key pasted on a page in front of the sign-in is no place for these.
    if (how.indexOf('password') < 0) return;
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    if (show) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-show';
      btn.textContent = 'Show';
      btn.setAttribute('aria-label', 'Show the password');
      btn.setAttribute('aria-pressed', 'false');
      if (input.id) btn.setAttribute('aria-controls', input.id);
      btn.addEventListener('click', function () {
        var shown = input.type === 'password';
        input.type = shown ? 'text' : 'password';
        btn.textContent = shown ? 'Hide' : 'Show';
        btn.setAttribute('aria-label', shown ? 'Hide the password' : 'Show the password');
        btn.setAttribute('aria-pressed', String(shown));
        if (shown) keep('show_password');
        input.focus();
      });
      wrap.appendChild(btn);
      // Whatever it is showing, the form sends it as a password box would, and the browser keeps it as one.
      if (input.form) input.form.addEventListener('submit', function () { input.type = 'password'; });
    }
    if (caps) {
      var said = document.createElement('p');
      said.className = 'pw-caps';
      said.id = 'pwCaps' + n;
      said.setAttribute('role', 'status');
      said.hidden = true;
      said.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 4l8 9h-4v6H8v-6H4z"/></svg><span>Caps Lock is on</span>';
      wrap.parentNode.insertBefore(said, wrap.nextSibling);
      var was = String(input.getAttribute('aria-describedby') || '');
      input.setAttribute('aria-describedby', (was ? was + ' ' : '') + said.id);
      var look = function (e) {
        if (!e.getModifierState) return;
        var lit = e.getModifierState('CapsLock');
        if (lit && said.hidden) keep('caps_lock');
        said.hidden = !lit;
      };
      input.addEventListener('keydown', look);
      input.addEventListener('keyup', look);
      input.addEventListener('mousedown', look);
      input.addEventListener('blur', function () { said.hidden = true; });
    }
  });
}());
