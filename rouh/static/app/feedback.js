/* Rouh's page, Feedback: the panel on the right, and All feedback, the person's own (section 12 of what was one app.js).
 *
 * Imports app/attachments.js first so that it runs after it, exactly where its
 * code ran in the one file: app.js says why that matters.
 */
import { ATT_BLOCKED, ATT_MAX, ATT_SHOWABLE, attExt, attRetryButton, attSize, attTookIn, dragHasFiles, droppedFiles,
  dropTypes, openImage, takeInFile } from 'app/attachments.js';
import { $, el, now, safeParse } from 'app/helpers.js';
import { cfg, load } from 'app/settings.js';
import { S } from 'app/socket.js';
import { A, debug, MIC, openThreshold } from 'app/voice.js';
import { PB, pbLevel, SPK } from 'app/playback.js';
import { O3, orb3dPoints } from 'app/orb3d.js';
import { applyTree, haveTree, KEY_ORB, memColour, orb, ORB_BASE, ORB_CFG, ORB_HIT, ORB_ROWS,
  ORB_SOUND, orbFrameNo, orbMoved, orbPanelOpen, orbPointAt, orbRaf, orbStats, orbUnsent, orbW,
  ORDER, SCENE, SELF, setState } from 'app/orb.js';
import { stillSpeaking, turnIsRunning } from 'app/transcript.js';
import { cfState } from 'app/orb_sound.js';
import { CARDS, layerOpen, loadOlderCards, renderCard, showLayer, streamEl, WORKSPACE_ROUTE } from 'app/cards.js';
import { applyTaskList, since, taskRecs, upsertTask } from 'app/tasks.js';
import { oneOpen, POLICY_MEANS, projectsClose, tasksFrame, whenWords } from 'app/runs.js';
import { CHATS } from 'app/chats.js';
import { bootWaiting } from 'app/address.js';
import { accountMenu, cols, SB, sidebarDone } from 'app/controls.js';

/* ------------------------------------------------------------------ 12 */
/* Feedback: the panel on the right, and All feedback.
 *
 * Petar, 23 November 2026: "Replace Gene therapy with Feedback ... Pressing
 * send does NOT start any gene therapy run and changes nothing in Rouh. It
 * sends the feedback ... After sending, the panel simply thanks the person for
 * their feedback. Do NOT add any wording saying it goes to rouh.land or
 * anywhere else; just a thank-you." So Send writes it to the server
 * (`POST /api/feedback/send`, `rouh/feedback.py`), which keeps it and sends it
 * on, and the panel says Thank you and nothing more, whether it went at once
 * or waits to go.
 *
 * It was Gene therapy from 12 October to 23 November 2026, and Feedback
 * before that. What Gene therapy was asked and built is in Evolution >
 * Mutations, marked Gene therapy (`rouh/everychange.py`). The frame messages a
 * workspace page sends a report with keep their names, `rouh-page-feedback`
 * and `rouh-frame-feedback`, because pages already written send them.
 *
 * The panel is the fourth column of the app's grid, so opening it pushes the
 * conversation and the canvas in rather than lying over them: whatever the
 * person is writing about is still on the screen beside what they are
 * writing. All of that is in app.css - this only sets `data-gt` on the app
 * element and the stylesheet does the rest.
 *
 * All feedback takes the board's place, over the conversation and the canvas:
 * the signed-in person's own feedback, newest first, each with its status
 * (`GET /api/feedback/mine`). Nobody sees anybody else's here.
 *
 * Files are uploaded the moment they are attached, into a folder of their
 * own, through the same `/attachments/{session}` route the composer uses
 * (rouh/attachments.py). Sending is what binds those ids to the feedback, so
 * a screenshot that is still going up never delays the sentence it came with:
 * Send waits for it instead.
 */

var GT = {
  //: The panel.
  open: false,
  //: All feedback, over the conversation and the canvas.
  board: false,
  //: The last list the server gave, so a redraw needs no request.
  data: null,
  //: Which feedback is opened in the list, by id.
  opened: {},
  //: The timer that retracts the panel after Thank you.
  thanks: 0,
  //: Told once a report handed over by Rouh's own page is sent (`gtHandOver`).
  onSent: null,
  //: The read of All feedback in flight, if one is.
  loading: /** @type {Promise<void>|null} */ (null)
};

//: How long Thank you stays before the panel goes back off to the right.
//: Send more is on the same screen for whoever wants to stay.
var GT_THANKS_MS = 2500;

//: A status as rouh.land says it, and its shape: received, being looked at, done;
//: "" is one not sent yet.
var GT_STATUS = { '': 'Not sent yet', received: 'Received', looking: 'Being looked at', done: 'Done' };


function gtFetch(url, opts) {
  opts = opts || {};
  opts.credentials = 'same-origin';
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) { location.href = '/login'; throw new Error('Sign in again.'); }
    return r.text().then(function (text) {
      var body = safeParse(text) || {};
      if (!r.ok) throw new Error(body.error || ('That came back ' + r.status + '.'));
      return body;
    });
  });
}

/* ---------- files, wherever they are attached ----------

   The panel has a set of these. Each set uploads into a folder of its own, which is
   minted here and not by the server: the folder is half of a file's address,
   so a set that has not uploaded anything costs nothing and two sets can
   never collide. */

function gtNewSession() {
  return 'fb-' + Date.now().toString(36) + '-' +
         Math.random().toString(36).slice(2, 10);
}

function gtFiles(node) {
  var list = [], seq = 0, session = gtNewSession(), onSettled = null;

  function draw() {
    if (!node) return;
    node.textContent = '';
    node.hidden = list.length === 0;
    list.forEach(function (a) {
      var chip = el('div', 'att' + (a.status === 'uploading' ? ' is-uploading' :
                                    a.status === 'failed' ? ' is-failed' : ''));
      chip.appendChild(gtThumb(a));
      var text = el('div', 'att-text');
      var name = el('div', 'att-name', a.name);
      name.title = a.name;
      text.appendChild(name);
      if (a.status === 'failed') text.appendChild(el('div', 'att-err', a.error));
      else if (a.note) text.appendChild(el('div', 'att-err', a.note));
      else if (a.reading) text.appendChild(el('div', 'att-size', 'Reading it…'));
      else if (a.status === 'uploading') {
        text.appendChild(el('div', 'att-size',
          Math.round(a.pct * 100) + '% of ' + attSize(a.size)));
      } else text.appendChild(el('div', 'att-size', attSize(a.size)));
      chip.appendChild(text);
      if (a.status === 'failed' && a.retry) chip.appendChild(attRetryButton(a, retry));
      var x = el('button', 'att-x', '×');
      x.type = 'button';
      x.title = 'Remove ' + a.name;
      x.setAttribute('aria-label', 'Remove ' + a.name);
      x.addEventListener('click', function () { remove(a.key); });
      chip.appendChild(x);
      if (a.status === 'uploading') {
        var bar = el('div', 'att-bar');
        bar.style.width = Math.round(a.pct * 100) + '%';
        chip.appendChild(bar);
        a.bar = bar;
      }
      node.appendChild(chip);
    });
  }

  // Retry: the same file again, from where it failed (`attRetry` says why).
  function retry(a) {
    var go = a.retry;
    if (!go || list.indexOf(a) < 0) return;
    a.retry = null;
    a.status = 'uploading';
    a.error = '';
    a.pct = 0;
    go();
    draw();
  }

  function remove(key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].key !== key) continue;
      if (list[i].xhr) { try { list[i].xhr.abort(); } catch (e) {} }
      if (list[i].thumb) { try { URL.revokeObjectURL(list[i].thumb); } catch (e) {} }
      list.splice(i, 1);
      break;
    }
    draw();
  }

  function add(files) {
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) queue(files[i]);
    draw();
  }

  function queue(file) {
    var a = {
      key: 'f' + (++seq), name: file.name || 'file', size: file.size || 0,
      status: 'uploading', pct: 0, id: null, media_type: '', kind: '',
      thumb: null, error: '', xhr: null
    };
    list.push(a);
    var ext = attExt(a.name);
    if (ATT_BLOCKED[ext]) {
      a.status = 'failed';
      a.error = ext + ' files cannot be attached, because that is a program ' +
        'rather than a document.';
      return;
    }
    if (a.size > ATT_MAX) {
      a.status = 'failed';
      a.error = a.name + ' is ' + attSize(a.size) + ', and the limit is ' +
        attSize(ATT_MAX) + ' per file.';
      return;
    }
    readThenSend(a, file);
  }

  function readThenSend(a, file) {
    // Read now, the way the conversation's own files are (`takeInFile`).
    a.reading = true;
    takeInFile(file).then(function (got) {
      a.reading = false;
      if (list.indexOf(a) < 0) return;
      if (got.error) {
        a.status = 'failed';
        a.error = got.error;
        a.retry = function () { readThenSend(a, file); };
        settled(a);
        return;
      }
      a.name = got.file.name;
      a.size = got.file.size;
      if (!a.thumb && ATT_SHOWABLE[got.file.type] && window.URL && URL.createObjectURL) {
        try { a.thumb = URL.createObjectURL(got.file); } catch (e) {}
      }
      send(a, got.file);
      draw();
    });
  }

  function send(a, file) {
    var form = new FormData();
    form.append('file', file, a.name);
    var xhr = new XMLHttpRequest();
    a.xhr = xhr;
    xhr.open('POST', '/attachments/' + encodeURIComponent(session));
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      a.pct = e.total ? e.loaded / e.total : 0;
      if (a.bar) a.bar.style.width = Math.round(a.pct * 100) + '%';
    };
    xhr.onload = function () {
      var body = safeParse(xhr.responseText) || {};
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        a.status = 'ready';
        a.id = body.id;
        a.size = body.size || a.size;
        a.media_type = body.media_type || '';
        a.kind = body.kind || 'file';
        attTookIn(a, body, session);
      } else {
        a.status = 'failed';
        a.error = body.error || ('That upload came back ' + xhr.status + '.');
        a.retry = function () { send(a, file); };
      }
      settled(a);
    };
    xhr.onerror = function () {
      a.status = 'failed';
      a.error = 'The upload did not reach the server.';
      a.retry = function () { send(a, file); };
      settled(a);
    };
    xhr.onabort = function () { settled(a); };
    xhr.send(form);
  }

  function settled(a) {
    a.xhr = null;
    draw();
    if (onSettled && !uploading()) { var f = onSettled; onSettled = null; f(); }
  }

  function uploading() {
    return list.some(function (a) { return a.status === 'uploading'; });
  }

  // What goes with the submission: the session and the id, because a file's
  // address is both of them and the server will not look an id up without
  // the folder it went into.
  function sent() {
    return list.filter(function (a) { return a.status === 'ready' && a.id; })
      .map(function (a) { return { session: session, id: a.id }; });
  }

  function clear() {
    list.forEach(function (a) {
      if (a.xhr) { try { a.xhr.abort(); } catch (e) {} }
      if (a.thumb) { try { URL.revokeObjectURL(a.thumb); } catch (e) {} }
    });
    list = [];
    session = gtNewSession();
    draw();
  }

  return {
    add: add, draw: draw, clear: clear, sent: sent, uploading: uploading,
    count: function () { return list.length; },
    // Press Send while something is still going up and the message goes by
    // itself the moment the last upload settles, which is what the composer
    // does and for the same reason.
    whenSettled: function (fn) { onSettled = fn; }
  };
}

function gtThumb(a) {
  if (a.thumb) {
    var img = document.createElement('img');
    img.className = 'att-thumb';
    img.src = a.thumb;
    img.alt = a.name;
    img.addEventListener('click', function () { openImage(a.thumb, a.name); });
    return img;
  }
  var ext = attExt(a.name);
  var box = el('div', 'att-thumb');
  if (ext) {
    box.className = 'att-thumb att-ext' + (ext.length > 3 ? ' is-long' : '');
    box.textContent = ext.slice(0, 4).toUpperCase();
    box.title = a.name || '';
  }
  return box;
}

//: The drawer's own set of files.
var gtDrawerFiles = gtFiles($('gtFiles'));

/* ---------- the drawer ---------- */

function gtOver() { return GT.open; }

function gtSetOpen(open) {
  GT.open = !!open;
  $('app').setAttribute('data-gt', open ? 'open' : 'shut');
  $('feedbackBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
}

function gtOpen() {
  if (GT.thanks) { clearTimeout(GT.thanks); GT.thanks = 0; }
  gtShowForm();
  gtSetOpen(true);
  // The sidebar is lying over the page on a narrow screen, and the button
  // that opened this is in it. Nothing is readable with both up.
  sidebarDone();
  setTimeout(function () { try { $('gtText').focus(); } catch (e) {} }, 160);
}

function gtClose() {
  if (GT.thanks) { clearTimeout(GT.thanks); GT.thanks = 0; }
  gtSetOpen(false);
  gtSay('');
}

function gtShowForm() {
  $('gtForm').hidden = false;
  $('gtThanks').hidden = true;
  $('gtSend').disabled = false;
  $('gtSend').textContent = 'Send';
}

function gtSay(text, kind) {
  var box = $('gtSay');
  box.className = 'gt-say' + (kind ? ' ' + kind : '');
  box.textContent = text || '';
  box.hidden = !text;
}

function gtSubmit() {
  var text = $('gtText').value.trim();
  if (!text && !gtDrawerFiles.count()) { gtSay('Write something first.'); $('gtText').focus(); return; }
  var send = $('gtSend');
  if (gtDrawerFiles.uploading()) {
    // Not an error and not a refusal: it goes by itself the moment the last
    // file lands.
    gtSay('Waiting for the files to finish going up…');
    send.disabled = true;
    send.textContent = 'Waiting…';
    gtDrawerFiles.whenSettled(gtSubmit);
    return;
  }
  gtSay('');
  send.disabled = true;
  send.textContent = 'Sending…';
  // With no connection it goes into this device's outbox, with when it was written, and is kept
  // once the device is back online (`offline._feedback`). The person is thanked either way.
  var off = window.RouhOffline;
  if (off && !off.online()) {
    off.queue('feedback', { body: text, page: location.pathname + (location.search || '') }, {}).then(function () {
      $('gtText').value = '';
      gtDrawerFiles.clear();
      gtThanked();
    });
    return;
  }
  gtFetch('/api/feedback/send', {
    method: 'POST',
    body: {
      body: text,
      files: gtDrawerFiles.sent(),
      // Where they were when they said it. A person writing "this is wrong"
      // means the screen in front of them.
      page: location.pathname + (location.search || '')
    }
  }).then(function (got) {
    if (GT.onSent) {
      var told = GT.onSent;
      GT.onSent = null;
      try { told(got && got.feedback); } catch (e) {}
    }
    $('gtText').value = '';
    gtDrawerFiles.clear();
    gtThanked();
    if (GT.board) gtLoad();
  }).catch(function (err) {
    gtSay(err.message || 'That did not go. Try again.');
    send.disabled = false;
    send.textContent = 'Send';
  });
}

//: The form goes, Thank you takes its place, and a moment later the panel
//: slides back off to the right by itself. Nothing else is said.
function gtThanked() {
  gtSay('');
  $('gtForm').hidden = true;
  $('gtThanks').hidden = false;
  GT.thanks = setTimeout(function () {
    GT.thanks = 0;
    gtSetOpen(false);
    gtShowForm();
  }, GT_THANKS_MS);
}

/* ---------- a report handed over by a page in the workspace ----------

   A page in the workspace may hold reports written for this drawer, such as
   the bug reports a job writes after using Rouh as a customer would, each
   with its screenshot. The page cannot send one itself: it is a sandboxed
   frame with no sign-in. So it hands the words and the addresses of its own
   screenshots up here (`rouh-page-feedback`, `pages.FEEDBACK_MESSAGE`), and
   they are put in this drawer, the screenshots attached, where the person
   reads them before anything goes.

   The drawer is filled and never sent from here. A page a job built runs
   its own scripts and never speaks for the person (`ownPage`), and a
   feedback is read and built by itself the moment it lands, so the press
   that sends it is the person's own Send. `edit` says which the
   page offered: the words with the cursor in them, or Send ready to press.

   Only the canvas's own frame, only a page of the workspace, and only
   screenshots beside that page, fetched from here with the sign-in. What
   the person had already typed in the drawer is never written over. */

//: The most screenshots one report may bring with it.
var GT_PAGE_SHOTS = 4;
var GT_PAGE_SHOT = /^[A-Za-z0-9_][A-Za-z0-9_.\-\/]*\.(png|jpe?g|webp|gif)$/i;

function gtPageSay(frame, id, said) {
  said.type = 'rouh-frame-feedback';
  said.id = id;
  try { frame.contentWindow.postMessage(said, '*'); } catch (err) {}
}

function gtPageShots(at, shots) {
  var base = new URL(at, location.href), out = [];
  (Array.isArray(shots) ? shots : []).slice(0, GT_PAGE_SHOTS).forEach(function (s) {
    if (typeof s !== 'string' || !GT_PAGE_SHOT.test(s) || s.indexOf('..') >= 0) return;
    var u = new URL(s, base);
    if (u.origin === location.origin && u.pathname.indexOf(WORKSPACE_ROUTE) === 0) out.push(u);
  });
  return out;
}

function gtFromPage(frame, m) {
  var at = String(frame && frame.rouhAt || '');
  if (frame !== tasksFrame() || at.indexOf(WORKSPACE_ROUTE) !== 0) {
    gtPageSay(frame, m.id, { ok: false,
      error: 'Rouh takes a report for Feedback only from a page of your workspace.' });
    return;
  }
  var body = typeof m.body === 'string' ? m.body.trim().slice(0, 20000) : '';
  if (!body) {
    gtPageSay(frame, m.id, { ok: false, error: 'There is nothing in that report to put in Feedback.' });
    return;
  }
  var box = $('gtText'), had = box.value.trim();
  gtOpen();
  if (had && had !== body) {
    gtSay('This box already has words of yours in it. Send them or clear them, then press the '
          + 'button on the page again.');
    gtPageSay(frame, m.id, { ok: false,
      error: 'Rouh\'s Feedback box already has something in it. Send or clear that first.' });
    return;
  }
  var shots = had ? [] : gtPageShots(at, m.shots);
  box.value = body;
  Promise.all(shots.map(function (u) {
    return fetch(u.href, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return null;
      return r.blob().then(function (b) {
        return new File([b], decodeURIComponent(u.pathname.split('/').pop()),
                        { type: b.type || 'image/jpeg' });
      });
    }).catch(function () { return null; });
  })).then(function (files) {
    files = files.filter(Boolean);
    if (files.length) gtDrawerFiles.add(files);
    var missing = shots.length - files.length;
    gtSay(missing ? missing + ' of its screenshots could not be read, so they are not attached.' : '');
    setTimeout(function () {
      try { (m.edit ? box : $('gtSend')).focus(); } catch (e) {}
      if (m.edit) { box.setSelectionRange(0, 0); box.scrollTop = 0; }
    }, 200);
    gtPageSay(frame, m.id, { ok: true, files: files.length });
  });
}

/* ---------- a report handed over by Rouh's own pages ----------

   Trials (`trialspage.js`) hands one problem over as a report, with its
   screenshot, the way Teodora's bug hunt did (30-44): "Send as feedback"
   fills this drawer and sends it, because it is Rouh's own page and the
   person pressed it; "Edit before sending" fills it and puts the cursor in
   the words, and it goes when they press Send. Either way `onSent` is told
   the feedback once it is kept, so the problem can say it was sent.
   What the person had already typed here is never written over. */

function gtHandOver(body, shotUrls, opts) {
  opts = opts || {};
  body = String(body || '').trim().slice(0, 20000);
  var box = $('gtText'), had = box.value.trim();
  gtOpen();
  if (had && had !== body) {
    gtSay('This box already has words of yours in it. Send them or clear them, then press the button again.');
    return Promise.resolve({ ok: false, error: 'The Feedback box already has words in it.' });
  }
  box.value = body;
  GT.onSent = typeof opts.onSent === 'function' ? opts.onSent : null;
  var urls = had ? [] : (Array.isArray(shotUrls) ? shotUrls : []).slice(0, GT_PAGE_SHOTS).filter(function (u) {
    return typeof u === 'string' && u.indexOf('/api/trials/') === 0;
  });
  return Promise.all(urls.map(function (u) {
    return fetch(u, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return null;
      return r.blob().then(function (b) {
        return new File([b], 'trial-' + u.split('/').slice(-3).join('-').replace(/[^\w-]/g, '') + '.jpg',
                        { type: b.type || 'image/jpeg' });
      });
    }).catch(function () { return null; });
  })).then(function (files) {
    files = files.filter(Boolean);
    if (files.length) gtDrawerFiles.add(files);
    if (opts.edit) {
      setTimeout(function () { try { box.focus(); box.setSelectionRange(0, 0); box.scrollTop = 0; } catch (e) {} }, 200);
    } else {
      gtSubmit();
    }
    return { ok: true, files: files.length };
  });
}

window.RouhFeedback = { fill: gtHandOver };
//: The name it had while this was Gene therapy, for a page loaded before.
window.RouhGeneTherapy = window.RouhFeedback;

/* ---------- All feedback ---------- */

function gtBoardOpen() {
  // The same two columns the projects and every canvas layer use. One
  // place at a time, and this is the one being opened.
  showLayer(null);
  projectsClose();
  GT.board = true;
  $('gtBoard').hidden = false;
  $('app').setAttribute('data-board', 'feedback');
  // On a narrow screen the sidebar is lying over the page, and this is
  // under it. Nothing is readable with both up.
  sidebarDone();
  if (location.pathname !== '/feedback/mine') {
    try { history.pushState({ feedback: 'mine' }, '', '/feedback/mine'); } catch (e) {}
  }
  gtRender();
  gtLoad();
}

function gtBoardClose() {
  if (!GT.board) return;
  GT.board = false;
  $('gtBoard').hidden = true;
  $('app').removeAttribute('data-board');
  if (location.pathname === '/feedback/mine') {
    try { history.replaceState({}, '', '/'); } catch (e) {}
  }
}

function gtLoad() {
  // A read asked for while one is going (Send landing just after All feedback opened) is read
  // again once that one is back, so what was just sent is never missing from the list.
  if (GT.loading) return GT.loading.then(function () { return gtLoad(); });
  GT.loading = gtFetch('/api/feedback/mine', { cache: 'no-store' }).then(function (got) {
    GT.data = got;
    GT.loading = null;
    gtRender();
  }).catch(function (err) {
    GT.loading = null;
    GT.data = GT.data || { items: [], count: 0, done: 0, error: err.message };
    GT.data.error = err.message || 'Your feedback could not be read just now.';
    gtRender();
  });
  return GT.loading;
}

function gtWhen(t) {
  try { return whenWords(t); } catch (e) { return ''; }
}

//: The screen a feedback was written on, said as a person would.
function gtPageName(page) {
  var p = String(page || '').split('?')[0];
  if (!p || p === '/') return 'Home';
  if (/^\/chat\//.test(p)) return 'a chat';
  if (/^\/task\//.test(p)) return 'a task';
  if (/^\/evolution\/mutations/.test(p)) return 'Mutations';
  if (/^\/evolution\/incubator/.test(p)) return 'the Incubator';
  var first = p.split('/').filter(Boolean)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ') : 'Home';
}

function gtPill(status) {
  var s = status || '';
  return el('span', 'fb-pill fb-' + (s || 'queued'), GT_STATUS[s] || 'Received');
}

function gtFileChip(f) {
  var showable = /^image\//.test(f.media_type || '');
  var a = el('a', 'fb-file');
  a.href = f.url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (showable) {
    var img = document.createElement('img');
    img.src = f.url;
    img.alt = f.name || 'screenshot';
    img.loading = 'lazy';
    a.appendChild(img);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      openImage(f.url, f.name || '');
    });
  } else {
    a.appendChild(el('span', 'fb-file-ext', (attExt(f.name || '') || 'file').slice(0, 4).toUpperCase()));
  }
  a.appendChild(el('span', 'fb-file-name', f.name || 'file'));
  return a;
}

function gtRow(f) {
  var li = el('li', 'fb-row');
  var b = el('button', 'fb-open');
  b.type = 'button';
  var open = !!GT.opened[f.id];
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  var top = el('span', 'fb-top');
  top.appendChild(gtPill(f.status));
  top.appendChild(el('span', 'fb-meta', gtWhen(f.created_at)));
  b.appendChild(top);
  b.appendChild(el('span', 'fb-words' + (open ? ' is-whole' : ''), f.body || '(files only)'));
  var n = (f.files || []).length;
  b.appendChild(el('span', 'fb-meta', 'Sent from ' + gtPageName(f.page) +
    (n ? ' · ' + n + (n === 1 ? ' file' : ' files') : '')));
  b.addEventListener('click', function () {
    GT.opened[f.id] = !GT.opened[f.id];
    gtRender();
  });
  li.appendChild(b);
  if (open && n) {
    var files = el('div', 'fb-files');
    f.files.forEach(function (x) { files.appendChild(gtFileChip(x)); });
    li.appendChild(files);
  }
  return li;
}

function gtRender() {
  var d = GT.data;
  var list = $('fbList'), sub = $('gtBoardSub'), empty = $('fbEmpty');
  if (!list) return;
  list.textContent = '';
  if (!d) {
    sub.textContent = 'Reading your feedback…';
    empty.hidden = true;
    return;
  }
  var items = d.items || [];
  sub.textContent = d.error ? d.error
    : !items.length ? ''
    : 'You have sent ' + items.length + (items.length === 1 ? ' piece' : ' pieces') + ' of feedback; '
      + d.done + (d.done === 1 ? ' is' : ' are') + ' done.';
  empty.hidden = !!items.length || !!d.error;
  items.forEach(function (f) { list.appendChild(gtRow(f)); });
}

/* ---------- the controls ---------- */

$('feedbackBtn').addEventListener('click', function () {
  accountMenu(false);
  if (GT.open) gtClose(); else gtOpen();
});
$('gtClose').addEventListener('click', gtClose);
$('gtAll').addEventListener('click', function () {
  gtClose();
  gtBoardOpen();
});
$('fbWrite').addEventListener('click', function () {
  gtBoardClose();
  gtOpen();
});
$('gtForm').addEventListener('submit', function (e) {
  e.preventDefault();
  gtSubmit();
});
// Another one, straight away: the panel stays, the timer that would take
// it away is stopped, and the form comes back empty.
$('gtAnother').addEventListener('click', gtOpen);
$('gtAttach').addEventListener('click', function () { $('gtFileInput').click(); });
$('gtFileInput').addEventListener('change', /** @this {HTMLInputElement} */ function () {
  gtDrawerFiles.add(this.files);
  this.value = '';
});
// A screenshot in the clipboard, pasted straight into the box, which is how
// most of these will arrive.
$('gtText').addEventListener('paste', function (e) {
  var items = (e.clipboardData && e.clipboardData.files) || null;
  if (!items || !items.length) return;
  e.preventDefault();
  gtDrawerFiles.add(items);
});
$('gtBoardClose').addEventListener('click', gtBoardClose);
// Back from /feedback/mine closes it.
window.addEventListener('popstate', function () {
  if (GT.board && location.pathname !== '/feedback/mine') gtBoardClose();
});

// Files dragged anywhere over the drawer. The sheet goes by "when did a
// dragover last arrive", the way the conversation's does, rather than by
// counting dragenter against dragleave: a phone does not pair those up, and
// the count left the sheet blue over a drop that had already happened.
// On a phone the drawer is the whole screen, so a drop anywhere while it is
// open is a drop on it (fr_adebbb3c2691: Petar dragged a screenshot's
// thumbnail over it, the screen went blue, and nothing was attached).
(function () {
  var panel = $('gtPanel'), zone = $('gtDrop'), at = 0, timer = null;
  function phoneSheet() {
    return GT.open && window.matchMedia && window.matchMedia('(max-width: 899px)').matches;
  }
  function alive() {
    at = now();
    zone.hidden = false;
    if (timer) return;
    timer = setInterval(function () {
      if (now() - at < 350) return;
      done();
    }, 150);
  }
  function done() {
    at = 0;
    if (timer) { clearInterval(timer); timer = null; }
    zone.hidden = true;
  }
  function over(e) {
    if (!dragHasFiles(e)) return;
    if (!panel.contains(e.target) && !phoneSheet()) return;
    // Ahead of the conversation's own sheet, which would take the drop.
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    alive();
  }
  function drop(e) {
    if (!dragHasFiles(e)) return;
    if (!panel.contains(e.target) && !phoneSheet()) return;
    e.preventDefault();
    e.stopPropagation();
    done();
    var files = droppedFiles(e.dataTransfer);
    if (!files.length) {
      gtSay('That drop brought no file with it, so nothing was attached. Press ' +
        'Attach to pick it instead. (It said it carried: ' + dropTypes(e.dataTransfer) + '.)');
      return;
    }
    gtSay('');
    gtDrawerFiles.add(files);
  }
  // On the window and before anything else, so neither the conversation's
  // drop sheet nor the page's "a stray drop does nothing" can be first.
  window.addEventListener('dragenter', over, true);
  window.addEventListener('dragover', over, true);
  window.addEventListener('drop', drop, true);
  window.addEventListener('dragend', done);
})();

// Escape closes the panel first and then All feedback: one press, one thing.
// Registered after the layer handler above, and it only acts on what that
// one leaves alone, so nothing closes twice.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (GT.open) { e.preventDefault(); gtClose(); return; }
  if (GT.board) { e.preventDefault(); gtBoardClose(); }
});

// The server says a person's feedback moved; All feedback is read again if it is open.
function gtBoardRefresh() {
  if (GT.board) gtLoad();
}


/* ------------------------------------------------------- test surface */

window.__rouh = {
  state: function () { return S.state; },
  // Whether the loading screen is up, and what it is waiting for.
  boot: function () {
    return { up: document.documentElement.classList.contains('booting'),
             waiting: bootWaiting() };
  },
  // The memory rings' colour scale, so a check can ask it for a percentage
  // and get back exactly what would be stroked on the ring at it, without
  // waiting three seconds for a poll to land to find out.
  loadColour: memColour,
  orbPoints: function () {
    if (O3.on) {
      // The 3D orb answers for itself: the same shape of answer, from the
      // lines it drew (app/orb3d.js).
      var p3 = orb3dPoints();
      return { segs: p3.nodes.length, tips: p3.nodes.length, nodes: p3.nodes, core: p3.core,
               card: $('nodeCard') ? !$('nodeCard').hidden : false, mode: '3d' };
    }
    var out = { segs: orbStats.segs, tips: orbStats.marks, nodes: [], core: null,
                card: $('nodeCard') ? !$('nodeCard').hidden : false };
    var r = orb.getBoundingClientRect();
    if (!orbW || !r.width || !r.height) return out;
    var k = r.width / orbW, c = ORB_HIT.core;
    out.core = { x: r.left + c.x * k, y: r.top + c.y * k };
    var pieces = ORDER.map(function (id) { return SCENE[id]; }).concat([SELF]);
    for (var i = 0; i < pieces.length; i++) {
      var n = pieces[i];
      if (!n || !n.parent || n.alpha <= 0.02 || n.drawn !== orbFrameNo || !(n.pn > 1)) continue;
      // x, y: a point on the drawn line where a real pointer gets this piece,
      // so a check points at it the way a person does; bx, by: where the
      // line starts; tx, ty: its tip.
      var at = orbPointAt(n, r, k), b0 = n.sp[0], b1 = n.sp[n.pn - 1];
      // `state` is here so a check can see the one state that matters:
      // waiting, which is a piece of work stopped until a person does
      // something, drawn red and dashed with NEEDS YOU beside it.
      out.nodes.push({ id: n.id, kind: n.kind, label: n.label, parent: n.parent,
                       state: n.state,
                       x: at ? at.x : r.left + b1.x * k, y: at ? at.y : r.top + b1.y * k,
                       reachable: !!at,
                       bx: r.left + b0.x * k, by: r.top + b0.y * k,
                       tx: r.left + b1.x * k, ty: r.top + b1.y * k,
                       alpha: Math.round(n.alpha * 100) / 100, ghost: !!n.fade });
    }
    return out;
  },
  cfg: cfg,
  debug: debug,
  vad: function () { return { floor: A.floor, level: A.level, open: openThreshold(), utterance: A.utterance }; },
  // What this page is holding of the microphone. `stream` is the one that
  // matters: false means there is no MediaStream here at all, which is the
  // only state in which an operating system puts its indicator out.
  mic: function () {
    var tracks = [];
    if (A.stream) {
      try {
        tracks = A.stream.getTracks().map(function (t) { return t.readyState; });
      } catch (e) { tracks = []; }
    }
    return {
      ready: S.micReady,
      muted: S.muted,
      opening: !!MIC.opening,
      stream: !!A.stream,
      track: !!A.track,
      tracks: tracks,
      ctx: A.ctx ? A.ctx.state : 'none'
    };
  },
  audio: function () {
    return {
      chunks: debug.audioChunks,
      dropped: debug.audioDropped,
      blocked: debug.audioBlocked,
      latchReleased: debug.dropLatchReleased,
      buffers: debug.audioBuffers,
      seconds: debug.audioSeconds,
      live: PB.sources.length,
      rate: PB.rate,
      next: PB.next,
      ctx: A.ctx ? A.ctx.state : 'none',
      ctxTime: A.ctx ? A.ctx.currentTime : 0,
      woken: A.woken,
      // Speech that arrived while the browser would not let the speaker
      // start. Held, not thrown away: it plays on the first press.
      queued: PB.pendingBytes,
      // Sound coming out of the speaker this instant, rather than sound that
      // was scheduled and may be going nowhere.
      level: pbLevel(),
      dropTail: PB.dropTailUntil > 0,
      needsPress: !!($('micBtn') && $('micBtn').classList.contains('needs-press')),
      // A press has been taken as permission and the speaker was built
      // inside it, which is what every browser on an iPhone requires.
      unlocked: !!SPK.unlocked,
      // The silent element holding an audio session open, which is what
      // keeps the Ring/Silent switch on an iPhone from silencing the voice.
      // 'none' anywhere that does not need one.
      session: SPK.session ? (SPK.session.paused ? 'paused' : 'playing') : 'none'
    };
  },
  ws: function () { return S.ws ? S.ws.readyState : -1; },
  connText: function () { return $('conn').getAttribute('aria-label'); },
  cards: function () { return document.querySelectorAll('#transcript .card-slot').length; },
  // The stream: every card in the conversation in the order it is read, what
  // of the history the page holds, whether there is more of it to read,
  // which card is out on the canvas, and which layer - a run, a task - is
  // open over it.
  canvas: function () {
    var host = streamEl(), numbers = [];
    var on = host ? host.querySelectorAll('.card-slot[data-card]') : [];
    for (var i = 0; i < on.length; i++) numbers.push(Number(on[i].getAttribute('data-card')));
    var out = $('cards');
    var away = out ? out.querySelector('.card[data-card]') : null;
    return { cards: numbers, oldest: CARDS.oldest, more: CARDS.more,
             loading: CARDS.loading, layer: layerOpen(),
             onCanvas: away ? Number(away.getAttribute('data-card')) : null };
  },
  // What is in the conversation, top to bottom: a message or a card, and its
  // number where it has one. This is the one stream, so this is the order.
  stream: function () {
    var host = streamEl(), out = [];
    // A card drawn in an answer is inside it, after the message it is in.
    var on = host ? host.querySelectorAll(':scope > .turn, :scope > .card-slot, ' +
                                          ':scope > .turn .card-slot') : [];
    for (var i = 0; i < on.length; i++) {
      var node = on[i];
      if (node.classList.contains('turn') && !node.classList.contains('typing')) {
        out.push({ kind: 'message', id: Number(node.getAttribute('data-msg')) || null,
                   who: node.classList.contains('user') ? 'You' : 'Rouh' });
      } else if (node.classList.contains('card-slot')) {
        out.push({ kind: 'card', id: Number(node.getAttribute('data-card')) || null,
                   away: node.classList.contains('is-away'),
                   folded: node.classList.contains('is-folded') });
      }
    }
    return out;
  },
  olderCards: function () { return loadOlderCards(); },
  // The chats as this page has them: which one is active and what they are
  // called.
  chats: function () {
    return { active: CHATS.active,
             titles: CHATS.list.map(function (c) { return c.title; }),
             folders: CHATS.folders.map(function (f) { return f.name; }) };
  },
  tasks: function () {
    var ids = [], k;
    for (k in taskRecs) ids.push(k);
    return {
      known: ids.length,
      cards: document.querySelectorAll('#tasksList .task').length,
      ids: ids
    };
  },
  busy: function () { return { busy: S.busy, sendDisabled: !!$('sendBtn').disabled }; },
  // Everything that decides whether there is a turn to stop, in one place:
  // what the person can see (the button), and what it is drawn from.
  turn: function () {
    var b = $('stopBtn');
    return {
      stop: !!(b && !b.hidden),
      running: turnIsRunning(),
      busy: S.busy,
      state: S.state,
      speaking: stillSpeaking(),
      stopped: S.stopped,
      textDone: S.textDone,
      tools: S.tools,
      number: S.turn,
      quiet: S.turnSign ? now() - S.turnSign : 0
    };
  },
  columns: function () { return { tasks: SB.open, chat: cols.chat }; },
  orb: function () {
    return {
      mode: O3.on ? '3d' : '2d',
      failed3d: O3.failed || '',
      renders3d: O3.renders,
      waiting3d: O3.waiting || 0,
      running: orbRaf !== 0,
      frames: orbStats.frames,
      segs: orbStats.segs,
      marks: orbStats.marks,
      nodes: orbStats.nodes,
      ms: Math.round(orbStats.ms * 100) / 100,
      back: orb.width,
      haveTree: haveTree
    };
  },
  // What the cog wheel is showing and what it has changed, for the checks
  // that drive the panel with a real mouse.
  orbSettings: function () {
    var cfgNow = {}, moved = [], k;
    for (k in ORB_BASE) {
      cfgNow[k] = ORB_CFG[k];
      if (orbMoved(k)) moved.push(k);
    }
    return {
      open: orbPanelOpen(),
      cog: !$('orbCog').hidden,
      rows: Object.keys(ORB_ROWS).length,
      cfg: cfgNow,
      base: ORB_BASE,
      moved: moved,
      saved: load(KEY_ORB),
      // Whether anything written here is still waiting on a socket to go up.
      unsent: !!orbUnsent
    };
  },
  // What the open orb's sound is doing: whether it is on and sounding, the
  // context it plays through, and the notes it has played, newest last.
  orbSound: function () {
    return {
      on: ORB_SOUND.on,
      live: ORB_SOUND.live,
      ctx: A.ctx ? A.ctx.state : 'none',
      time: A.ctx ? A.ctx.currentTime : 0,
      chords: ORB_SOUND.pad.length,
      queued: ORB_SOUND.queue.length,
      played: ORB_SOUND.played.slice(),
      // The Cornfield Chase arrangement, on a Rouh whose switch has it on.
      cornfield: ORB_SOUND.cornfield ? cfState() : null
    };
  },
  fakeTree: applyTree,
  fakeTasks: applyTaskList,
  fakeTask: upsertTask,
  fakeState: setState,
  fakeCard: renderCard
};

export { gtBoardClose, gtBoardOpen, gtBoardRefresh, gtFromPage, gtOpen, gtOver };
