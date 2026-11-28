/* A watch list shared with this person (`rouh/templates/rouh/watch_shared.html`, step 202-03): what
   `watchlistpage.js` is handed on a page of its own, rather than inside Rouh: its routes under this
   person's share, and a title's address as ?t=<number> on the same page. */
(function () {
  'use strict';
  function read(id) {
    var n = document.getElementById(id);
    try { return n ? JSON.parse(n.textContent) : ''; } catch (e) { return ''; }
  }
  var api = read('watchApi'), base = read('watchBase');
  window.RouhWatchHost = {
    guest: true,
    api: api,
    href: function (n) { return base + '?t=' + n; },
    focus: function (n) {
      try { history.replaceState(null, '', n ? base + '?t=' + n : base); } catch (e) { /* an old browser */ }
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var t = new URLSearchParams(location.search).get('t') || '';
    if (window.RouhWatch) { window.RouhWatch.shown(t); }
  });
})();
