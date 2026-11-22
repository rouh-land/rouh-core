/* Rouh's page: an example put in the box, and Search's wiring (section welcome of what was one app.js).
 *
 * Imports app/address.js first so that it runs after it, exactly where its
 * code ran in the one file: app.js says why that matters.
 *
 * It was the empty conversation's welcome as well, from 24 September to 22 November 2026: "Hello,
 * <name>", the box in the middle of the column and things to try on the canvas beside it. Petar gave
 * that up on 22 November 2026 (review 51, problem 329: "here we should have the standard rouh chat
 * page. not this version. we are giving this version up, so delete this custom setup."), so an empty
 * conversation is the standard chat, and while no AI service is connected it says so above the box
 * (`#chatSetup`). The file keeps its name and its place in the chain; what it drew is in git.
 */
import 'app/address.js';
import { $ } from 'app/helpers.js';
import { FIND, FIND_KEYS, findAct, findAsk, findMenuShow, findMove, findPaint, findShow } from 'app/search.js';
import { chatIsWanted, growInput, narrow, setPane } from 'app/controls.js';

// An example is somewhere to start from, not what the person meant to say,
// so it goes in the box to be changed and sent rather than being sent.
function tryThis(say) {
  var box = $('input');
  if (!box) return;
  // The box has to be on the screen to be written in. A conversation folded
  // away at a desk comes back, and a phone looking at the canvas goes back
  // to the conversation.
  var app = $('app');
  if (app && app.classList.contains('no-chat')) chatIsWanted();
  if (narrow()) setPane('chat');
  box.value = say;
  growInput();
  box.focus();
  try { box.setSelectionRange(say.length, say.length); } catch (err) {}
}

/* ---------- wiring ---------- */

(function () {
  var dlg = $('searchDialog'), box = $('findInput');
  if (!dlg || !box) return;

  if ($('searchBtn')) {
    $('searchBtn').addEventListener('click', function () { findShow(!FIND.open); });
  }
  if ($('findClose')) {
    $('findClose').addEventListener('click', function () { findShow(false); });
  }
  // `close` is the one place FIND.open is put back, because a dialog can be
  // closed by the browser as well as by this file.
  dlg.addEventListener('close', function () {
    FIND.open = false;
    findMenuShow(false);
    if ($('searchBtn')) $('searchBtn').setAttribute('aria-expanded', 'false');
  });
  // Escape closes a row's menu first, and the box only when there is no menu.
  dlg.addEventListener('cancel', function (e) {
    if (FIND.menu >= 0) { e.preventDefault(); findMenuShow(false); }
  });
  // A press on the backdrop, which is the dialog element itself: anywhere
  // that is not the panel closes it, the way every modal does.
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) { findShow(false); return; }
    if (FIND.menu >= 0 && e.target.closest && !e.target.closest('.find-menu')
        && !e.target.closest('.find-dots')) {
      findMenuShow(false);
    }
  });

  box.addEventListener('input', function () {
    FIND.q = box.value;
    findAsk(false);
  });

  $('findPills').addEventListener('click', function (e) {
    var pill = e.target && e.target.closest ? e.target.closest('.find-pill') : null;
    if (!pill) return;
    FIND.kind = pill.getAttribute('data-kind') || 'all';
    box.focus();
    // The pills narrow the same question, so this is asked again with the
    // same words rather than being filtered here: the answer is capped at a
    // screenful, and a pill filtering that screenful would hide rows the
    // count beside it says are there.
    findAsk(true);
  });

  var list = $('findList');
  list.addEventListener('click', function (e) {
    var node = e.target && e.target.closest ? e.target.closest('.find-row') : null;
    if (!node) return;
    var i = Number(node.getAttribute('data-i'));
    var act = e.target.closest('[data-act]');
    var was = FIND.at;
    FIND.at = i;
    findPaint(was);
    if (act && act.getAttribute('data-act') === 'menu') {
      e.stopPropagation();
      findMenuShow(FIND.menu !== i, i);
      return;
    }
    findAct('open', i);
  });
  // Hovering a row moves the highlight with it, so the keys and the pointer
  // never disagree about which row the next press belongs to.
  list.addEventListener('mousemove', function (e) {
    if (FIND.menu >= 0) return;
    var node = e.target && e.target.closest ? e.target.closest('.find-row') : null;
    if (!node) return;
    var i = Number(node.getAttribute('data-i'));
    if (i === FIND.at) return;
    var was = FIND.at;
    FIND.at = i;
    findPaint(was);
  });

  $('findMenu').addEventListener('click', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-do]') : null;
    if (!item) return;
    findAct(item.getAttribute('data-do'), FIND.menu);
  });

  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); findMenuShow(false); findMove(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); findMenuShow(false); findMove(-1); return; }
    if (e.key === 'ArrowRight' && FIND.at >= 0 && FIND.menu < 0
        && box.selectionStart === box.value.length) {
      e.preventDefault(); findMenuShow(true, FIND.at); return;
    }
    if (e.key === 'ArrowLeft' && FIND.menu >= 0) {
      e.preventDefault(); findMenuShow(false); return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (FIND.at >= 0) findAct('open', FIND.at);
      return;
    }
    // The five numbers, live while a menu is open and only then: the squares
    // beside the menu's items are the promise, and a digit with no menu on
    // the screen belongs to the field it was typed into.
    if (FIND.menu >= 0 && FIND_KEYS[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      findAct(FIND_KEYS[e.key], FIND.menu);
    }
  });

  /* The key. Cmd+K on a Mac, Ctrl+K everywhere else, which is what every
     program with a search box has settled on. Taken even while the text box
     has the cursor: the person pressing it meant search. */
  var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  var caps = document.querySelectorAll('.find-key');
  for (var i = 0; i < caps.length; i++) caps[i].textContent = mac ? '⌘K' : 'Ctrl+K';
  if ($('searchBtn')) {
    $('searchBtn').title = 'Search everything  ' + (mac ? '⌘K' : 'Ctrl+K');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'k' && e.key !== 'K') return;
    if (e.altKey || e.shiftKey) return;
    if (mac ? !e.metaKey : !(e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    findShow(!FIND.open);
  });
}());

export { tryThis };
