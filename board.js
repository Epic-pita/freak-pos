/* FREAK board — the frame (b0.2). A pure render: model in, HTML string out. No names, data, addresses or ids live in
 * this file (it will sit in the app's public page files): everything arrives in the model at run time.
 * Rules it keeps (agreed with the app's chat, 16/11/2026):
 *  - doors first: a widget still loading is drawn with its door, so a slow backend never leaves a blank screen;
 *  - a widget's door is a button id; a widget whose door is not among the person's own links is not drawn;
 *  - no inline script and no event attributes in the output; hrefs only https or site-relative;
 *  - everything is a way in (b0.2): the line of figures, each widget's heading and each of its rows are links to
 *    that widget's door; a widget without a door the person has contributes nothing, also not a figure.
 * Works in a browser (window.FreakBoard) and in node (module.exports) for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FreakBoard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'b0.2';
  var MAX_ITEMS = 3;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // "15–20/11" inside Hebrew text is drawn back to front: every number range is isolated left to right
  var RANGE = /\d(?:[\d\/.,:]*\d)?(?:[–-]\d(?:[\d\/.,:]*\d)?)+/g;
  function txt(s) {
    var t = String(s == null ? '' : s), out = '', last = 0, m;
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(t))) {
      out += esc(t.slice(last, m.index)) + '<bdi dir="ltr">' + esc(m[0]) + '</bdi>';
      last = m.index + m[0].length;
    }
    return out + esc(t.slice(last));
  }
  function idOf(s) { return String(s == null ? '' : s).replace(/[^\w\-]/g, ''); }   // ids are plain tokens
  function money(n) {
    return '<bdi dir="ltr">₪' + esc(Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })) + '</bdi>';
  }
  function safeHref(u) {
    var s = String(u == null ? '' : u);
    if (/^https:\/\/[^\s"'<>\\]+$/.test(s)) return s;
    if (/^\.{0,2}\/[\w\-.\/?=&%#]*$/.test(s) && s.indexOf('//') !== 0) return s;
    return '';
  }
  function doorOf(w, links) {
    var l = links && Object.prototype.hasOwnProperty.call(links, w.door) ? links[w.door] : null;
    if (!l) return null;
    var href = safeHref(l.href);
    return href ? { href: href, label: w.doorLabel || l.label || '' } : null;
  }

  /** tone: 'urgent' (a count above zero that the widget calls urgent), 'calm' (nothing urgent), 'blank' (not connected) */
  function toneOf(w) {
    if (w.blank) return 'blank';
    if (w.loading) return 'loading';
    var c = w.count;
    var positive = typeof c === 'number' ? c > 0 : (typeof c === 'string' && /[1-9]/.test(c));
    return positive && w.urgent !== false ? 'urgent' : 'calm';
  }

  function widgetHtml(w, links) {
    var door = doorOf(w, links);
    if (!door) return '';                                   // not this person's system: not drawn
    var tone = toneOf(w), href = esc(door.href);
    var cls = 'fb-card is-' + tone + (w.lead ? ' fb-lead' : '') + (w.stale ? ' is-stale' : '');
    var token = '';
    if (tone === 'urgent' || tone === 'calm') {
      token = '<span class="fb-token"' + (w.countLabel ? ' title="' + esc(w.countLabel) + '"' : '') + '>' +
        '<span class="fb-n">' + esc(w.count == null ? 0 : w.count) + '</span></span>';
    } else if (tone === 'loading') token = '<span class="fb-token fb-token-wait" aria-hidden="true"></span>';
    var body = '';
    if (tone === 'blank') body = '<p class="fb-blank">' + txt(w.blank) + '</p>';
    else if (tone === 'loading') body = '<p class="fb-wait">' + txt(w.loadingText || '') + '</p>';
    else {
      var items = (w.items || []).slice(0, MAX_ITEMS);
      if (items.length) {
        body = '<ol class="fb-items">' + items.map(function (it) {
          return '<li' + (it.late ? ' class="is-late"' : '') + '><a class="fb-row" href="' + href + '"><span class="fb-it">' + txt(it.title) + '</span>' +
            (it.meta ? '<span class="fb-meta">' + txt(it.meta) + '</span>' : '') + '</a></li>';
        }).join('') + '</ol>';
      } else body = '<p class="fb-empty">' + txt(w.empty || '') + '</p>';
      if (w.note) body += '<p class="fb-note">' + txt(w.note) + '</p>';
    }
    var at = w.stale ? (w.staleText || '') : (w.at || '');
    return '<article class="' + cls + '" data-widget="' + idOf(w.id) + '">' +
      '<header class="fb-head"><a class="fb-hl" href="' + href + '"><div class="fb-titles"><h2>' + txt(w.title) + '</h2>' +
      (w.sub ? '<p class="fb-sub">' + txt(w.sub) + '</p>' : '') + '</div>' + token + '</a></header>' +
      (w.countLabel && (tone === 'urgent' || tone === 'calm') ? '<p class="fb-count-label">' + txt(w.countLabel) + '</p>' : '') +
      body +
      '<footer class="fb-foot"><a class="fb-door" href="' + href + '" data-door="' + idOf(w.door) + '">' +
      txt(door.label) + '</a>' + (at ? '<span class="fb-at">' + txt(at) + '</span>' : '') + '</footer></article>';
  }

  /** the line of figures: every widget that has a count, as one link (the big picture first; a tap goes in) */
  function stripHtml(widgets, links) {
    var figs = (widgets || []).map(function (w) {
      var door = doorOf(w, links), tone = toneOf(w);
      if (!door || (tone !== 'urgent' && tone !== 'calm')) return '';
      return '<a class="fb-fig is-' + tone + (w.stale ? ' is-stale' : '') + '" href="' + esc(door.href) + '" data-fig="' + idOf(w.id) + '">' +
        '<span class="fb-fig-n">' + esc(w.count == null ? 0 : w.count) + '</span><span class="fb-fig-l">' + txt(w.title) + '</span></a>';
    }).join('');
    return figs ? '<div class="fb-strip">' + figs + '</div>' : '';
  }

  /** the month band: this month so far against the same days of last month and last year, as one scale */
  function monthHtml(m, links) {
    if (!m) return '';
    var door = doorOf(m, links);
    var rows = (m.rows || []).slice(0, 3);
    var max = Math.max.apply(null, rows.map(function (r) { return r.value || 0; }).concat([m.current || 0, 1]));
    function row(label, value, cls, note) {
      var has = typeof value === 'number';
      return '<div class="fb-mrow ' + cls + '"><span class="fb-mlabel">' + txt(label) + '</span>' +
        '<span class="fb-mtrack"><span class="fb-mfill" style="width:' + (has ? Math.max(2, Math.round(value / max * 100)) : 100) + '%"></span></span>' +
        '<span class="fb-mval">' + (has ? money(value) : txt(note || '')) + '</span></div>';
    }
    return '<section class="fb-month"><header class="fb-mhead">' +
      (door ? '<a class="fb-hl" href="' + esc(door.href) + '"><h2>' + txt(m.title) + '</h2></a>' : '<h2>' + txt(m.title) + '</h2>') +
      (m.sub ? '<p class="fb-sub">' + txt(m.sub) + '</p>' : '') + '</header>' +
      row(m.currentLabel, typeof m.current === 'number' ? m.current : null, 'is-now' + (typeof m.current === 'number' ? '' : ' is-missing'), m.currentMissing) +
      rows.map(function (r) { return row(r.label, r.value, 'is-ref'); }).join('') +
      (m.closed ? '<p class="fb-mclosed">' + txt(m.closed.label) + ' ' + money(m.closed.value) +
        (m.closed.notes || []).map(function (n) { return ' <span class="fb-chip">' + txt(n) + '</span>'; }).join('') + '</p>' : '') +
      '<footer class="fb-foot">' + (door ? '<a class="fb-door" href="' + esc(door.href) + '" data-door="' + idOf(m.door) + '">' + txt(door.label) + '</a>' : '') +
      (m.at ? '<span class="fb-at">' + txt(m.at) + '</span>' : '') + '</footer></section>';
  }

  /** model: { title, date, greeting, month, widgets[], later[], status }, opts: { links, theme } */
  function renderBoard(model, opts) {
    model = model || {}; opts = opts || {};
    var links = opts.links || {};
    var lead = '', rest = '';
    (model.widgets || []).forEach(function (w) { var h = widgetHtml(w, links); if (w && w.lead) lead += h; else rest += h; });
    if (!lead) { lead = rest; rest = ''; }                    // a board with no lead widget: one column
    var month = monthHtml(model.month, links);
    var later = (model.later || []).map(function (w) { return widgetHtml(w, links); }).join('');
    var theme = opts.theme === 'dark' || opts.theme === 'light' ? ' data-theme="' + opts.theme + '"' : '';
    return '<div class="fb-board" dir="rtl" lang="he"' + theme + '>' +
      '<header class="fb-top"><h1>' + txt(model.title || '') + '</h1>' +
      (model.date ? '<p class="fb-date">' + txt(model.date) + '</p>' : '') +
      (model.greeting ? '<p class="fb-greet">' + txt(model.greeting) + '</p>' : '') + '</header>' +
      stripHtml(model.widgets, links) +
      (lead || rest || month ? '<div class="fb-body">' + (lead ? '<div class="fb-main">' + lead + '</div>' : '') +
        (rest || month ? '<div class="fb-side">' + month + rest + '</div>' : '') + '</div>' : '') +
      (later ? '<h2 class="fb-later-title">' + txt(model.laterTitle || '') + '</h2><div class="fb-grid fb-grid-later">' + later + '</div>' : '') +
      (model.status ? '<p class="fb-status' + (model.status.ok ? ' is-ok' : ' is-bad') + '">' + txt(model.status.text) +
        (model.status.at ? ' <span class="fb-at">' + txt(model.status.at) + '</span>' : '') + '</p>' : '') +
      '</div>';
  }

  return { renderBoard: renderBoard, VERSION: VERSION, _txt: txt, _safeHref: safeHref };
});
