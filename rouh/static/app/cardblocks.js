/* The canvas's card blocks: what a card only shows, drawn the same wherever a card is shown.
 *
 * Rouh's page draws every card with these (`renderBlock` in app/cards.js hands them every block that
 * only shows something: text, a table, a list, a number, code, a chart, a picture, markup the model
 * wrote, the sources), and so does the projector's wall (`rouh/static/projector.js`, task 200). Petar,
 * 27 November 2026, after a picture of a mouse reached his Robot chat and not his projector: "shall we
 * have the projector part canvas part the custom stuff?" So the wall has no drawing of its own for a
 * card any more: a card reads on the wall as it reads on the canvas, at the wall's size.
 *
 * They were section 9 of app/cards.js until then, moved here unchanged but for three hooks (`blocksUse`),
 * so that this module needs nothing of the page's but app/helpers.js, which runs nothing that asks
 * anything of anybody: no socket, no settings, no demo mode. The wall loads it on a Raspberry Pi 3.
 *
 *   writeFrame(frame, doc)   how a markup block's frame is given its document (the page: `frameWrite`)
 *   frameDoc(doc)            the document, once more, before it goes in (the page: demo mode's marks)
 *   picture(img, src, gone)  fetch a picture itself instead of the browser (the wall: on its device key)
 *
 * Blocks that do something (a contact to save, an email to write, an inbox, a question with buttons)
 * stay in app/cards.js: they need the socket, and on the wall nothing is ever pressed.
 */
import { clamp, el, esc } from 'app/helpers.js';

/** @type {{writeFrame: (frame: HTMLIFrameElement, doc: string) => void, frameDoc: (doc: string) => string,
 *   picture: null | ((img: HTMLImageElement, src: string, gone: () => void) => void)}} */
var HOOKS = {
  writeFrame: function (frame, doc) { frame.srcdoc = doc; },
  frameDoc: function (doc) { return doc; },
  picture: null
};

/** @param {{writeFrame?: any, frameDoc?: any, picture?: any}} hooks */
function blocksUse(hooks) {
  Object.keys(hooks || {}).forEach(function (k) { if (k in HOOKS) /** @type {any} */ (HOOKS)[k] = /** @type {any} */ (hooks)[k]; });
}

function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

//: One cell of the row of dashes under a table's headings. The colons are
//: the alignment, which this draws all one way, and are taken rather than
//: refused so a table written with them is still a table.
var MD_RULE = /^:?-+:?$/;

function mdCells(row) {
  return String(row).trim().replace(/^\|/, '').replace(/\|$/, '')
    .split('|').map(function (c) { return c.trim(); });
}

/* Whether the line under a row of pipes is what makes it a table.

   Every cell is dashes, and there are as many of them as there are
   headings. The count is the half that matters: without it a paragraph
   reading "yes | no" with a "---" under it becomes a one-column table, and
   that is a line of text and a rule, which is what it looks like. */
function mdIsRule(under, wide) {
  if (under.indexOf('-') < 0) return false;
  var cells = mdCells(under);
  if (cells.length !== wide) return false;
  for (var i = 0; i < cells.length; i++) {
    if (!MD_RULE.test(cells[i])) return false;
  }
  return true;
}

//: A list item: its indent, its bullet or its number, and its words.
var MD_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

function mdLead(line) { return line.length - line.replace(/^\s+/, '').length; }

/* One list from lines[i], pushed onto `out`, and the line after it.

   A list is every item at the first one's indent and of its kind, numbered
   or not, and a blank line between two of them leaves them one list. A
   model leaves one between every item of a long numbered list, and until 5
   October 2026 each blank line closed the list and the next item opened a
   new one, so a list of seven read 1, 1, 1, 1, 1, 1, 1 (Petar: "the list is
   only 1's"). The first item's own number is where the list starts, so the
   second of two lists written 1-3 and 11-17 still counts from 11. Whatever
   is indented under an item - another paragraph, a list inside it, code -
   is drawn inside that item. */
function mdList(lines, i, out) {
  var first = MD_ITEM.exec(lines[i]);
  var indent = first[1].length, ordered = /\d/.test(first[2]);
  var start = ordered ? parseInt(first[2], 10) : 1;
  var items = [], loose = false;
  while (i < lines.length) {
    var line = lines[i].replace(/\s+$/, ''), m = MD_ITEM.exec(line);
    if (m && m[1].length === indent) {
      if (/\d/.test(m[2]) !== ordered) break;
      items.push({ head: m[3], rest: [] });
      i++;
      continue;
    }
    if (!line) {
      // A blank line ends the list unless what follows it is still in it.
      var next = lines[i + 1] || '';
      if (next.trim() && (mdLead(next) > indent || (MD_ITEM.test(next) && mdLead(next) === indent))) {
        loose = true;
        if (!(MD_ITEM.test(next) && mdLead(next) === indent)) items[items.length - 1].rest.push('');
        i++;
        continue;
      }
      break;
    }
    if (mdLead(line) > indent) { items[items.length - 1].rest.push(line); i++; continue; }
    break;
  }
  var tag = ordered ? 'ol' : 'ul';
  out.push('<' + tag + ' class="md-list' + (loose ? ' md-loose' : '') + '"' +
    (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>' +
    items.map(function (it) {
      var cut = Infinity;
      it.rest.forEach(function (l) { if (l.trim()) cut = Math.min(cut, mdLead(l)); });
      var inner = cut === Infinity ? ''
        : renderMarkdown(it.rest.map(function (l) { return l.slice(cut); }).join('\n'));
      return '<li>' + mdInline(it.head) + inner + '</li>';
    }).join('') + '</' + tag + '>');
  return i;
}

/* A copy button on every block of code. Petar, 28 October 2026
   (fr_034bef30be85): "when you give me commands like that, can you give me a
   copy button? look at claude how they have an icon for copy and when you
   press it it gets a √". So each block carries the message row's own copy
   icon in its top right corner, and a press copies that block's code and
   nothing else, ticks for a moment (`copied` in app/transcript.js) and goes
   back. It is markup here because renderMarkdown hands back markup, and one
   listener on the document answers every block, wherever it was drawn. */
var CODE_COPY = '<button type="button" class="act act-copy code-copy" title="Copy" aria-label="Copy">' +
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"' +
  ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect class="ico-copy" x="9" y="9" width="11" height="11" rx="2"></rect>' +
  '<path class="ico-copy" d="M5 15V5a2 2 0 0 1 2-2h10"></path>' +
  '<path class="ico-copied" d="M5 13l4.5 4.5L19 7"></path></svg></button>';

function renderMarkdown(src) {
  var lines = String(src == null ? '' : src).replace(/\r/g, '').split('\n');
  var out = [], para = [];
  // Somebody who typed three lines meant three lines, so every newline
  // inside a paragraph is written out as the break it was. It has to be a
  // <br>: a newline left in the markup is whitespace, and whitespace is
  // collapsed wherever a bubble or a card sets `white-space: normal`, which
  // is what turned a typed message into one run-on line. A blank line is
  // still what starts a new paragraph.
  function flushPara() {
    if (para.length) { out.push('<p>' + mdInline(para.join('\n')).replace(/\n/g, '<br>') + '</p>'); para = []; }
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); continue; }
    /* Code in a fence, kept exactly as it was written. Until 27 September
       2026 there was no case for one, so a fence came out as two stray
       backticks either side of its code drawn as a line of inline code. */
    var fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      flushPara();
      var code = [];
      for (i++; i < lines.length && lines[i].trim().indexOf(fence[1]) !== 0; i++) code.push(lines[i]);
      out.push('<div class="code-box"><pre class="md-code"><code>' + esc(code.join('\n')) +
        '</code></pre>' + CODE_COPY + '</div>');
      continue;
    }
    var h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); var lvl = Math.min(6, h[1].length + 2); out.push('<h' + lvl + '>' + mdInline(h[2]) + '</h' + lvl + '>'); continue; }
    /* A table, as a model writes one: a header row, a row of dashes under
       it, and the body. There was nowhere for one to go until 23 September
       2026, so a table arrived on screen as four lines of pipes - which is
       what Ask AI's own prompt asks for whenever a table helps, and what it
       got back every time. */
    var head = line.indexOf('|') >= 0 ? mdCells(line) : null;
    if (head && mdIsRule(lines[i + 1] || '', head.length)) {
      flushPara();
      var body = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0; i++) {
        body.push(mdCells(lines[i]));
      }
      i--;
      out.push('<table class="md-table"><thead><tr>' +
        head.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        body.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') +
        '</tbody></table>');
      continue;
    }
    // A bullet, or a number followed by a dot or a bracket. Both are lists
    // on the page rather than a line of text that happens to start with a
    // digit, which is what "1. " used to leave behind.
    if (MD_ITEM.test(line)) { flushPara(); i = mdList(lines, i, out) - 1; continue; }
    para.push(line.trim());
  }
  flushPara();
  return out.join('');
}

/* ---------- where it came from ------------------------------------------

   Petar, 24 September 2026: "After web search and research as a whole,
   every source needs to be listed in a sources section. Ideally different
   items should have footnote numbers so we know specifically which thing
   was found at which url."

   A footnote is written as plain text, "[2]" or "[1, 3]", and the list it
   points at is a "Sources" line over a numbered list of links. Rouh's own
   answers are given both by the server, out of the citations the API hangs
   on what the model wrote (rouh/citing.py), and so is an answer in Ask AI;
   a card has a sources block the model fills in (`sourcesBlock`). This
   finds the list, puts each page's address under its title, and turns every
   number the list has into a small button that brings its entry into view
   and lights it. So a number next to a sentence leads, in one press, to the
   page the sentence came from, and a press on the page's name opens it.

   A number points at the first list after it: an answer's words come before
   its list, including words written above a tool the answer then used. One
   with no list after it is left as it is, and so is a number the list does
   not have - "[2026]" is a year in brackets. Never the list before it: while
   an answer is still being written its own list has not arrived, and the
   one above it belongs to the answer before. */

//: A run of footnotes, "[2]", "[1][3]" or "[1, 3]", and the space before
//: it, which the numbers take the place of: "the launch [2]" and "the
//: launch[2]" both end up "the launch²".
var CITE_MARK = / ?((?:\[\d{1,3}(?:\s*,\s*\d{1,3})*\])+)/g;

//: What a footnote is never looked for inside: somebody's link, code, the
//: list itself, the controls round a message, and a tool's own line, whose
//: search results are titles somebody else wrote.
var CITE_SKIP = 'a, code, pre, button, sup.cites, .sources-list, .turn-acts, .card-head, .tool';

// The site and the path, short, which is what an entry says under its name.
function sourceWhere(href) {
  var u;
  try { u = new URL(href, location.href); } catch (err) { return ''; }
  if (!/^https?:$/.test(u.protocol)) return '';
  var said = u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  return said.length > 80 ? said.slice(0, 79) + '…' : said;
}

// One entry: its number, its name as the link, and where it is. The name is
// wrapped so the three sit in a grid whatever the entry was written as.
function dressSource(li, n) {
  if (li.getAttribute('data-n')) return;
  li.setAttribute('data-n', String(n));
  var name = el('span', 'src-name');
  while (li.firstChild) name.appendChild(li.firstChild);
  li.appendChild(name);
  var link = name.querySelector('a[href]');
  var at = link ? sourceWhere(link.getAttribute('href')) : '';
  if (at) {
    li.setAttribute('data-where', at);
    li.appendChild(el('span', 'src-where', at));
  }
}

// A card's sources block: every page it was made from, in the order of the
// numbers its items carry. A page with no address keeps its place, so the
// numbers after it still point where the model meant them to.
/** @param {import('./protocol').BlockOf<'sources'>} b */
function sourcesBlock(b) {
  var pages = Array.isArray(b.sources) ? b.sources : [];
  if (!pages.length) return null;
  var node = el('div', 'b-sources');
  node.appendChild(el('p', 'sources-head', 'Sources'));
  var list = el('ol', 'sources-list');
  for (var i = 0; i < pages.length; i++) {
    var page = pages[i] && typeof pages[i] === 'object' ? pages[i] : { url: String(pages[i] || '') };
    var url = String(page.url || page.href || '').trim();
    var li = el('li');
    if (/^https?:\/\//i.test(url)) {
      var a = el('a', null, String(page.title || '').trim() || sourceWhere(url) || url);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    } else {
      li.appendChild(document.createTextNode(String(page.title || url || 'A source with no address')));
    }
    list.appendChild(li);
    dressSource(li, i + 1);
  }
  node.appendChild(list);
  return node;
}

// Every Sources list inside `root`, the ones a card drew and the ones
// written in Markdown: a line saying "Sources" with a numbered list under it.
function sourceLists(root) {
  var heads = root.querySelectorAll('p, h3, h4, h5, h6');
  for (var i = 0; i < heads.length; i++) {
    var list = heads[i].nextElementSibling;
    if (!list || list.tagName !== 'OL' || list.classList.contains('sources-list')) continue;
    if (!/^sources:?$/i.test((heads[i].textContent || '').trim())) continue;
    heads[i].classList.add('sources-head');
    list.classList.add('sources-list');
    var first = Number(list.getAttribute('start')) || 1;
    for (var j = 0, n = 0; j < list.children.length; j++) {
      if (list.children[j].tagName === 'LI') dressSource(list.children[j], first + n++);
    }
  }
  return [].slice.call(root.querySelectorAll('ol.sources-list'));
}

function sourceEntry(list, n) {
  var items = list.children;
  for (var i = 0; i < items.length; i++) {
    if (items[i].getAttribute('data-n') === String(n)) return items[i];
  }
  return null;
}

// Bring one entry into view and light it, and put the keyboard on its link
// so Enter opens the page.
function showSource(li) {
  if (!li) return;
  try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  catch (err) { li.scrollIntoView(false); }
  li.classList.remove('is-lit');
  void li.offsetWidth;
  li.classList.add('is-lit');
  clearTimeout(li.__lit);
  li.__lit = setTimeout(function () { li.classList.remove('is-lit'); }, 2400);
  var a = li.querySelector('a[href]');
  if (a) { try { a.focus({ preventScroll: true }); } catch (err) {} }
}

function citeButton(n, li) {
  var b = el('button', 'cite', String(n));
  b.type = 'button';
  var link = li.querySelector('a[href]');
  var name = ((link || li.querySelector('.src-name') || li).textContent || '').trim();
  var at = li.getAttribute('data-where') || '';
  var said = 'Source ' + n + (name ? ': ' + name : '') + (at && at !== name ? ' (' + at + ')' : '');
  b.title = said;
  b.setAttribute('aria-label', said);
  b.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    showSource(li);
  });
  return b;
}

function citeText(node, list) {
  var text = node.nodeValue, count = list.querySelectorAll(':scope > li[data-n]').length;
  var parts = document.createDocumentFragment(), last = 0, any = false, m;
  CITE_MARK.lastIndex = 0;
  while ((m = CITE_MARK.exec(text))) {
    var numbers = (m[1].match(/\d+/g) || []).map(Number);
    var entries = numbers.map(function (x) { return x >= 1 && x <= count ? sourceEntry(list, x) : null; });
    if (entries.some(function (li) { return !li; })) continue;
    // The numbers go with the word they follow, so a line never breaks
    // between the two and never starts with a number on its own.
    var before = text.slice(last, m.index), word = before.search(/\S+$/);
    if (word < 0) word = before.length;
    parts.appendChild(document.createTextNode(before.slice(0, word)));
    var glue = el('span', 'cite-glue', before.slice(word) || null);
    var sup = el('sup', 'cites');
    for (var i = 0; i < numbers.length; i++) sup.appendChild(citeButton(numbers[i], entries[i]));
    glue.appendChild(sup);
    parts.appendChild(glue);
    last = m.index + m[0].length;
    any = true;
  }
  if (!any) return;
  parts.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(parts, node);
}

function footnotes(root) {
  if (!root || !root.querySelectorAll) return;
  var lists = sourceLists(root);
  if (!lists.length) return;
  var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var found = [], node;
  while ((node = walk.nextNode())) {
    if (node.nodeValue.indexOf('[') < 0) continue;
    if (node.parentElement && node.parentElement.closest(CITE_SKIP)) continue;
    found.push(node);
  }
  for (var i = 0; i < found.length; i++) {
    var list = null;
    for (var j = 0; j < lists.length && !list; j++) {
      if (found[i].compareDocumentPosition(lists[j]) & Node.DOCUMENT_POSITION_FOLLOWING) list = lists[j];
    }
    if (list) citeText(found[i], list);
  }
}

// A card's blocks in the order they are drawn: its sources at the end,
// wherever they were written, and as one list, because every number on the
// card counts through one list.
function sourcesLast(blocks) {
  var rest = [], pages = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b && b.block === 'sources') pages = pages.concat(Array.isArray(b.sources) ? b.sources : []);
    else rest.push(b);
  }
  if (pages.length) rest.push({ block: 'sources', sources: pages });
  return rest;
}

function svgEl(name, attrs) {
  var n = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function niceMax(v) {
  // A round number at or just above the largest value. The ladder is fine on
  // purpose: with only 1, 2, 5 and 10 to choose from, a maximum of 51,000
  // rounds up to 100,000 and every bar is drawn in the bottom half of the
  // chart. 6 gives 60,000 and the picture is readable.
  if (!(v > 0)) return 1;
  var exp = Math.pow(10, Math.floor(Math.log10(v)));
  var f = v / exp;
  var ladder = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (var i = 0; i < ladder.length; i++) {
    if (f <= ladder[i] + 1e-9) return ladder[i] * exp;
  }
  return 10 * exp;
}

/** @param {import('./protocol').BlockOf<'chart'>} b */
function chartBlock(b) {
  var labels = Array.isArray(b.labels) ? b.labels.map(String) : [];
  var values = (Array.isArray(b.values) ? b.values : []).map(function (v) { return Number(v) || 0; });
  var n = Math.max(labels.length, values.length);
  if (!n) return null;
  while (labels.length < n) labels.push('');
  while (values.length < n) values.push(0);

  var kind = b.kind === 'line' ? 'line' : 'bar';
  var W = 640, H = 230, padL = 46, padR = 14, padT = 16, padB = 34;
  var pw = W - padL - padR, ph = H - padT - padB;
  var lo = Math.min(0, Math.min.apply(null, values));
  var hi = niceMax(Math.max.apply(null, values));
  if (hi === lo) hi = lo + 1;
  var y = function (v) { return padT + ph - ((v - lo) / (hi - lo)) * ph; };

  var wrap = el('div', 'b-chart');
  if (b.title) wrap.appendChild(el('div', 'card-title', b.title));
  var scroll = el('div', 'chart-scroll');
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': (b.title || 'chart') + ', ' + kind });
  svg.style.minWidth = Math.max(300, Math.min(640, n * 46)) + 'px';

  // gridlines
  for (var g = 0; g <= 4; g++) {
    var gv = lo + ((hi - lo) * g) / 4;
    var gy = y(gv);
    svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, class: 'ch-grid' }));
    var lt = svgEl('text', { x: padL - 8, y: gy + 4, class: 'ch-lbl', 'text-anchor': 'end' });
    lt.textContent = String(Math.round(gv * 100) / 100);
    svg.appendChild(lt);
  }
  svg.appendChild(svgEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + ph, class: 'ch-axis' }));
  svg.appendChild(svgEl('line', { x1: padL, y1: y(Math.max(lo, 0)), x2: W - padR, y2: y(Math.max(lo, 0)), class: 'ch-axis' }));

  var slot = pw / n;
  var i, cx, txt;

  if (kind === 'bar') {
    var bw = Math.min(52, slot * 0.6);
    for (i = 0; i < n; i++) {
      cx = padL + slot * (i + 0.5);
      var zero = y(Math.max(lo, 0));
      var yTop = Math.min(y(values[i]), zero);
      var hgt = Math.abs(y(values[i]) - zero);
      svg.appendChild(svgEl('rect', {
        x: cx - bw / 2, y: yTop, width: bw, height: Math.max(1, hgt), rx: 3, class: 'ch-bar'
      }));
      if (n <= 14) {
        txt = svgEl('text', { x: cx, y: yTop - 6, class: 'ch-val', 'text-anchor': 'middle' });
        txt.textContent = String(values[i]);
        svg.appendChild(txt);
      }
    }
  } else {
    var pts = [];
    for (i = 0; i < n; i++) pts.push((padL + slot * (i + 0.5)) + ',' + y(values[i]));
    var zeroY = y(Math.max(lo, 0));
    svg.appendChild(svgEl('path', {
      d: 'M' + (padL + slot * 0.5) + ',' + zeroY + ' L' + pts.join(' L') + ' L' + (padL + slot * (n - 0.5)) + ',' + zeroY + ' Z',
      class: 'ch-area'
    }));
    svg.appendChild(svgEl('polyline', { points: pts.join(' '), class: 'ch-line' }));
    for (i = 0; i < n; i++) {
      svg.appendChild(svgEl('circle', { cx: padL + slot * (i + 0.5), cy: y(values[i]), r: 3.2, class: 'ch-dot' }));
    }
  }

  var every = n > 12 ? Math.ceil(n / 12) : 1;
  for (i = 0; i < n; i++) {
    if (i % every) continue;
    txt = svgEl('text', { x: padL + slot * (i + 0.5), y: H - 12, class: 'ch-lbl', 'text-anchor': 'middle' });
    txt.textContent = labels[i];
    svg.appendChild(txt);
  }

  scroll.appendChild(svg);
  wrap.appendChild(scroll);
  return wrap;
}

/* ---------- a picture on a card ----------

   Asked for a picture of a whale, Rouh used to offer a link to one,
   because a link was the nearest thing on the list of blocks it had. Now
   there is a picture block and the picture is drawn.

   It is loaded straight from wherever it is, which is what a browser is
   for: one round trip, cached where caches are, nothing through this
   machine. `referrerpolicy="no-referrer"` is what makes that work most of
   the time - a host that refuses to be hotlinked is reading the referrer,
   and there is not one to read. For the rest, a picture that fails to load
   is asked for a second time through Rouh, which fetches it on its own
   connection and hands the bytes over (picture.py). Only then, and only if
   that fails too, does the card say so in words. */

var IMAGE_PROXY = '/api/canvas/image?src=';

// Where a picture may come from: the open web, this Rouh, or the bytes
// themselves. Anything else - javascript:, file:, a data: URL that is not a
// picture - is not drawn at all.
function pictureSrc(raw) {
  if (typeof raw !== 'string') return null;
  var said = raw.trim();
  if (!said) return null;
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(said)) return said;
  var u;
  try { u = new URL(said, location.href); } catch (err) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.href;
}

// Whether Rouh fetching this instead would be any different. It would not
// for this machine's own addresses, and there is nothing to fetch for bytes
// that are already here.
function worthProxying(src) {
  if (src.indexOf('data:') === 0) return false;
  try { return new URL(src, location.href).origin !== location.origin; }
  catch (err) { return false; }
}

/** @param {import('./protocol').BlockOf<'image'>} b */
function imageBlock(b) {
  var src = pictureSrc(b.src);
  if (!src) return null;
  var fig = el('figure', 'b-image');
  var img = document.createElement('img');
  img.alt = b.alt == null ? '' : String(b.alt);
  img.setAttribute('referrerpolicy', 'no-referrer');
  img.setAttribute('decoding', 'async');
  // The size the model already knows, so the card is the right height before
  // the bytes arrive and nothing under it jumps. The stylesheet still scales
  // the picture to the card's width; these are only the proportions.
  if (b.width > 0) img.setAttribute('width', String(Math.round(b.width)));
  if (b.height > 0) img.setAttribute('height', String(Math.round(b.height)));
  var tried = '';
  img.addEventListener('error', function () {
    if (tried === '' && worthProxying(src)) {
      tried = 'rouh';
      img.src = IMAGE_PROXY + encodeURIComponent(src);
      return;
    }
    if (tried === 'gone') return;
    tried = 'gone';
    img.remove();
    var gone = el('div', 'img-gone', 'That picture could not be loaded. ');
    var a = el('a', null, src.slice(0, 120));
    a.href = src;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    gone.appendChild(a);
    fig.insertBefore(gone, fig.firstChild);
  });
  // A page that fetches its pictures its own way (the projector's wall, on its device key) does so;
  // a picture it cannot get is gone the same way.
  if (HOOKS.picture) HOOKS.picture(img, src, function () { tried = 'rouh'; img.dispatchEvent(new Event('error')); });
  else img.src = src;
  fig.appendChild(img);
  if (b.caption) fig.appendChild(el('figcaption', null, b.caption));
  return fig;
}

/* ---------- markup the model wrote, in a frame of its own ----------

   The blocks above are a fixed list, and a fixed list is a menu: asked for a
   timeline, a diagram, two things side by side or a gallery, the best that
   could be done was the nearest item on it. So the model can write the
   markup itself and it is drawn as it is.

   It is not drawn on this page. It goes in a frame whose sandbox is
   `allow-scripts` and nothing besides - the same one word a workspace page
   gets, and for the same reason. Without the flag that would hand it this
   page's own origin, the browser gives it one that matches nothing: it
   cannot read this page, this page's cookies or this page's storage, cannot
   navigate this page, cannot open a window and cannot submit a form. Inside
   the markup there is a second lock, a Content-Security-Policy that leaves
   it its own style, its own script and pictures, and takes away fetch,
   sockets, forms and frames of its own.

   Every one of those flags is a single word away, so `test_workspace_pages.py`
   refuses to let any of them appear anywhere in this file, in code or in a
   sentence about it. That is why this paragraph names none of them.

   Two things the frame needs that a frame does not have. Colours: it cannot
   see this page's stylesheet, so Rouh's own variables go in with it. And a
   height: a frame has none of its own,
   so the page inside measures itself and says how tall it is, which is
   `rouh-html-size` below. Without that every one of these would be a fixed
   box with a scrollbar in it, which is not a card. */

//: Taller than this and the frame stops growing and scrolls what is in it
//: instead, rather than becoming a card nobody can get past.
var HTML_FRAME_MAX = 4000;

//: What a snippet is drawn in. Rouh's own colours, so
//: `var(--accent)` in something the model wrote is the same blue as the rest
//: of the screen; Rouh's fonts and its type sizes; and the card's own look
//: for the few elements a snippet is most likely to reach for. No background:
//: the card behind it is the background.
var HTML_FRAME_CSS = [
  ':root{color-scheme:dark;--bg:#0a0c10;--bg-2:#0e1116;--panel:#12161c;',
  '--panel-2:#171c24;--line:#232a34;--line-soft:#1b2129;--text:#e7ecf3;',
  '--dim:#8d9aac;--dimmer:#64707f;--accent:#5ec2ff;--accent-ink:#04121c;',
  '--accent-soft:rgba(94,194,255,.14);--good:#57d9a3;--warn:#f2b45e;--bad:#ff7a70;',
  '--radius:14px;--radius-s:9px;',
  '--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;',
  '--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,',
  '"Apple Color Emoji",sans-serif}',
  '*{box-sizing:border-box}',
  'html,body{margin:0;padding:0;background:transparent}',
  /* The one box everything the model wrote is inside, and the box the page
     measures. `flow-root` is the whole of why it is here: without it the
     last child's bottom margin collapses out through the body and out
     through the document element, so the body measures ten pixels shorter
     than the document it is in and the two disagree for ever. See
     HTML_FRAME_SCRIPT. */
  '#rouh-fit{display:flow-root}',
  'body{font-family:var(--sans);font-size:13.5px;line-height:1.55;color:var(--text)}',
  'h1,h2,h3,h4{margin:0 0 8px;font-weight:600;line-height:1.3}',
  'h1{font-size:18px}h2{font-size:16px}h3{font-size:14px}h4{font-size:13px}',
  'p{margin:0 0 8px}p:last-child{margin-bottom:0}',
  'a{color:var(--accent)}',
  'img,svg,canvas,video{max-width:100%}img,video{height:auto}',
  'table{border-collapse:collapse;font-size:13px}',
  'th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line-soft);',
  'vertical-align:top}',
  'th{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);',
  'font-weight:600}',
  'code,kbd,pre{font-family:var(--mono);font-size:12px}',
  'pre{background:var(--bg);border:1px solid var(--line-soft);border-radius:9px;',
  'padding:11px 12px;overflow-x:auto}',
  'hr{border:0;border-top:1px solid var(--line-soft);margin:12px 0}'
].join('');

//: Scripts and style of its own, and pictures. No connect-src, so nothing in
//: here can call anything; no form-action, so nothing can post anywhere; no
//: frame-src, so it cannot open a frame to get around either. The frame's own
//: sandbox attribute is the lock that matters and this is the second one.
var HTML_FRAME_CSP = "default-src 'none'; img-src https: http: data: blob:; "
  + "media-src https: http: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
  + "font-src data:; base-uri 'none'; form-action 'none'";

//: The page inside measuring itself and saying so. Written as one string
//: because it goes into `srcdoc` rather than being fetched: there is no file
//: for a frame with no origin to ask for.
//: It measures on load, whenever anything inside it changes shape or content,
//: as each picture arrives, and a few times shortly after opening, which is
//: when a web font or a late picture moves everything down.
//:
//: **What it measures may never depend on how tall the frame already is.**
//: That is the whole rule, and breaking it is the jumping card Petar
//: reported on 22 September 2026: card 532 grew and shrank by ten pixels,
//: several times a second, for as long as it was on the screen.
//:
//: How that happened is worth keeping. It measured the body, and the
//: document element as well but only when the document element had really
//: overflowed - `past > innerHeight` - because a document element's
//: `scrollHeight` is never less than the window it is in and taking the
//: larger of the two unguarded would have meant a card could only ever grow.
//: The guard was sound. What was not is that the two heights disagreed at
//: rest: the last thing in card 532 carries a ten pixel bottom margin, that
//: margin collapses out through the body and out through the document
//: element, so the body measured 1135 and the document element 1145 with
//: nothing moving. At 1135 the guard was true and the page said 1145; the
//: frame became 1145, the guard was false, and the page said 1135. For ever.
//:
//: So the content goes in a box of its own that makes a block formatting
//: context (`#rouh-fit`, `display:flow-root` in HTML_FRAME_CSS). No margin
//: can escape it, its height is the whole of what the model drew, and that
//: height is a function of the frame's **width** alone. `innerHeight` is not
//: asked about at all any more, which is what makes the measurement settle.
//:
//: The one term that is still read off the window is the height a horizontal
//: scrollbar takes when the layout is wider than the frame - `innerHeight`
//: less the document element's `clientHeight` - and it is safe for the same
//: reason the rest is: it answers a question about width, not about height.
var HTML_FRAME_SCRIPT = [
  '(function(){var last=-1;',
  'function tall(){var d=document,b=d.body,e=d.documentElement;',
  'var box=d.getElementById("rouh-fit");',
  'var h=box?box.getBoundingClientRect().height:0;',
  'h=Math.max(h,b?b.scrollHeight:0);',
  'var bar=innerHeight-e.clientHeight;',
  'if(bar>0)h+=bar;',
  'return Math.ceil(h);}',
  'function say(){var h=tall();if(h===last)return;last=h;',
  'try{parent.postMessage({type:"rouh-html-size",height:h},"*");}catch(err){}}',
  'addEventListener("load",say);addEventListener("resize",say);',
  'if(window.ResizeObserver){var o=new ResizeObserver(say);',
  'o.observe(document.documentElement);if(document.body)o.observe(document.body);',
  'var fit=document.getElementById("rouh-fit");if(fit)o.observe(fit);}',
  'if(window.MutationObserver){new MutationObserver(say).observe(document.documentElement,',
  '{subtree:true,childList:true,attributes:true,characterData:true});}',
  'var pics=document.images;for(var i=0;i<pics.length;i++){',
  'pics[i].addEventListener("load",say);pics[i].addEventListener("error",say);}',
  'var when=[0,60,250,800,2000,5000];',
  'for(var j=0;j<when.length;j++)setTimeout(say,when[j]);',
  '})();'
].join('');

/* Giving a frame the height the page inside it asked for, and the latch that
   stops a card jumping for ever.

   Sizing a box from what is inside it, when what is inside it is laid out
   against that box, is a loop looking for somewhere to happen. The
   measurement above no longer gives it one, and it is not the only way in:
   a vertical scrollbar appearing takes fifteen pixels of width from markup
   nobody here wrote, which can reflow a line away and make the content
   shorter, which takes the scrollbar off again. That one is between the
   browser and a card's own CSS, and no measuring is careful enough to talk
   it out of it.

   So a frame remembers the last two heights it was given. A third that is
   the same as the one before it, and within a line's height of the one after
   it, is not a card that changed: it is a card flapping between two layouts.
   The taller of the two is kept - a card with ten pixels of room to spare
   reads exactly like a card, and one ten pixels short has a line cut off -
   and nothing that frame says afterwards moves it, until it says something
   outside that pair, which is a real change and starts the watch again.

   A real change is never an exact A-B-A inside a line's height, so nothing
   that ought to move is held still by this. */
var HTML_FRAME_JITTER = 24;

function htmlFrameHeight(frame, want) {
  var seen = frame.__rouhSeen || (frame.__rouhSeen = []);
  var stuck = frame.__rouhStuck || 0;
  // Latched, and this is the flapping it was latched against: ignored.
  if (stuck && Math.abs(want - stuck) < HTML_FRAME_JITTER) return;
  if (stuck) { frame.__rouhStuck = 0; seen.length = 0; }
  seen.push(want);
  if (seen.length > 3) seen.shift();
  if (seen.length === 3 && seen[0] === seen[2] && seen[0] !== seen[1]
      && Math.abs(seen[1] - seen[0]) < HTML_FRAME_JITTER) {
    frame.__rouhStuck = Math.max(seen[0], seen[1]);
    frame.style.height = frame.__rouhStuck + 'px';
    seen.length = 0;
    return;
  }
  frame.style.height = want + 'px';
}

// The whole document a snippet is put into. `srcdoc` rather than an address,
// so there is nothing for anybody to fetch and nothing of this to reach
// except through the frame's edge.
function htmlFrameDoc(markup) {
  return HOOKS.frameDoc('<!doctype html><html>'
    + '<head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="' + HTML_FRAME_CSP + '">'
    + '<style>' + HTML_FRAME_CSS + '</style></head><body>'
    // Everything the model wrote, in the one box the page measures. It is a
    // block formatting context, so the height it reports is the height it
    // really is and no margin can collapse out of it into the document
    // around it (HTML_FRAME_SCRIPT says what that cost).
    + '<div id="rouh-fit">' + markup + '</div>'
    + '<script>' + HTML_FRAME_SCRIPT + '<\/script>'
    + '</body></html>');
}

/* Markup the model wrote, in a frame of its own.

   Every other block reflows: a table scrolls sideways inside its own box, a
   chart shrinks with the column, a list wraps. This one cannot, because its
   widths are whatever the model wrote them as. At a desk that is no matter,
   because every card is read on the canvas there (`openOnCanvas`). On a
   phone there is no second column, so it is drawn as what it is - an
   ordinary page - and allowed to scroll sideways inside the stream rather
   than being squashed or cut off.

   It carried the button that opens its card on the canvas until 24
   September 2026, when it was the only card that went there. Every card
   does now, so the button is on every card's head (`renderCard`). */
/** @param {import('./protocol').BlockOf<'html'>} b */
function htmlBlock(b) {
  var markup = typeof b.html === 'string' ? b.html
    : (typeof b.text === 'string' ? b.text : '');
  if (!markup.trim()) return null;
  var wrap = el('div', 'b-html');
  if (b.title) {
    var head = el('div', 'b-html-head');
    head.appendChild(el('div', 'card-title', b.title));
    wrap.appendChild(head);
  }
  // The page keeps its own width and is allowed to run past the column it is
  // read in, which is what a phone needs: squashed to 360 pixels a layout
  // written for 700 is not the thing the model drew.
  var scroll = el('div', 'html-scroll');
  var frame = document.createElement('iframe');
  frame.className = 'html-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = b.title || 'Something Rouh drew';
  // A height to open at, so a card does not start as a sliver and jump. The
  // page inside says what it really is as soon as it has loaded.
  frame.style.height = clamp(b.height > 0 ? Number(b.height) : 180, 40, HTML_FRAME_MAX) + 'px';
  HOOKS.writeFrame(frame, htmlFrameDoc(markup));
  scroll.appendChild(frame);
  wrap.appendChild(scroll);
  return wrap;
}

/* A table or a list under the heading the model gave it.

   `label` is one field of the schema shared by every block, and the model
   writes one on a list as often as not: "Also worth knowing", "The other
   findings that matter". Only a stat drew it until 24 September 2026, so
   every such list read as though it carried on from the table above it,
   and a link given a label and no text showed its bare address instead. */
function labelled(b, node) {
  if (b.label == null || String(b.label).trim() === '') return node;
  var wrap = el('div', 'b-labelled');
  wrap.appendChild(el('div', 'b-label', String(b.label)));
  wrap.appendChild(node);
  return wrap;
}

/* One block that only shows something, drawn; null for one it does not draw (`renderBlock` draws
   the rest). */
/** @param {import('./protocol').Block} b */
function drawBlock(b) {
  if (!b || typeof b !== 'object') return null;
  var node, i;
  switch (b.block) {
    case 'stat':
      node = el('div', 'b-stat');
      if (b.label != null) node.appendChild(el('span', 'lbl', b.label));
      node.appendChild(el('span', 'num', b.value == null ? '-' : b.value));
      if (b.hint) node.appendChild(el('span', 'hint', b.hint));
      return node;

    case 'table':
      node = el('div', 'b-table');
      var table = el('table');
      var cols = Array.isArray(b.columns) ? b.columns : [];
      if (cols.length) {
        var thead = el('thead'), htr = el('tr');
        for (i = 0; i < cols.length; i++) htr.appendChild(el('th', null, cols[i]));
        thead.appendChild(htr);
        table.appendChild(thead);
      }
      var tbody = el('tbody');
      var rows = Array.isArray(b.rows) ? b.rows : [];
      for (i = 0; i < rows.length; i++) {
        var tr = el('tr');
        var cells = Array.isArray(rows[i]) ? rows[i] : [rows[i]];
        for (var c = 0; c < cells.length; c++) tr.appendChild(el('td', null, cells[c]));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      node.appendChild(table);
      return labelled(b, node);

    case 'list':
      var items = Array.isArray(b.items) ? b.items : [];
      if (!items.length) return null;
      node = el('ul', 'b-list');
      for (i = 0; i < items.length; i++) node.appendChild(el('li', null, items[i]));
      return labelled(b, node);

    case 'text':
      node = el('div', 'b-text');
      node.innerHTML = renderMarkdown(b.text);
      return labelled(b, node);

    case 'code':
      node = el('div', 'b-code');
      if (b.language) node.appendChild(el('span', 'lang', b.language));
      var pre = el('pre');
      pre.appendChild(el('code', null, b.text == null ? '' : b.text));
      node.appendChild(pre);
      node.insertAdjacentHTML('beforeend', CODE_COPY);
      return node;

    case 'chart':
      return chartBlock(b);

    case 'image':
      return imageBlock(b);

    case 'html':
      return htmlBlock(b);

    case 'sources':
      return sourcesBlock(b);

    default:
      return null;
  }
}

export { blocksUse, chartBlock, CODE_COPY, drawBlock, footnotes, HTML_FRAME_MAX, htmlBlock, htmlFrameDoc,
  htmlFrameHeight, IMAGE_PROXY, imageBlock, labelled, mdCells, mdInline, mdIsRule, pictureSrc, renderMarkdown, sourcesBlock,
  sourcesLast, svgEl, worthProxying };
