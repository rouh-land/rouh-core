/* A live space's own page as Rouh's page holds it, under Live's head (`liveOpen` in app/runs.js,
   task 189). Since 22 November 2026 a space is opened inside Rouh's frame rather than as a page of
   its own; this is the little the page needs to be at home there:
   - opened by itself in a tab, it goes to the space's address in Rouh, so the frame is never lost;
   - a link inside it to one of Rouh's own addresses (Back to Live, a money proposal) is followed
     by Rouh's page, not inside the frame;
   - its title is handed up for Live's head and the tab;
   - `linkHome()` is where Leave goes: Live. */
(function () {
  'use strict';
  var body = document.body;
  var sid = body ? body.getAttribute('data-space') || '' : '';
  var host = null;
  try { host = window.parent !== window && window.parent.RouhLiveHost ? window.parent.RouhLiveHost : null; } catch (e) { host = null; }
  if (window.top === window) {
    location.replace('/link/space/' + encodeURIComponent(sid));
    return;
  }
  function go(href) {
    if (host && host.go) host.go(href);
    else window.top.location.href = href;
  }
  window.linkHome = function () { go('/live'); };
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || a.target === '_blank') return;
    var to;
    try { to = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
    if (to.origin !== location.origin || (to.pathname === location.pathname && to.hash)) return;
    ev.preventDefault();
    go(to.pathname + to.search + to.hash);
  });
  // Its title, once its script has drawn it, for Live's head and the tab.
  var t = document.getElementById('title');
  function tell() {
    var words = t ? (t.textContent || '').trim() : '';
    if (words && words !== 'Loading…' && host && host.titled) host.titled(words);
  }
  if (t && window.MutationObserver) new MutationObserver(tell).observe(t, { childList: true, characterData: true, subtree: true });
})();
