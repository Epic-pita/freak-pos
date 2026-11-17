/* FREAK board — the first names of who is on shift, joined in Chris's own browser (n0.1, 17/11/2026).
 * His answer on card L1-SHIFT-NAMES-1: first names on the "today" card of his own board only, never stored, in no file,
 * log or public page. The board's server sends no name: for his key, the shift row carries
 * p = { at: the schedule tab's stamp, t: title parts, m: meta parts }, where a part is a piece of the text or
 * { n: [running numbers] } right after a count. The page asks the schedule's web app for today's first names by those
 * numbers (the team-tasks chat's action, 17/11 12:20: { success: true, at, day, published, same: true, names: { "1": "..." } },
 * where same = the tab still matches the published grid now) and this file puts them in, in memory.
 * Pure: no storage, no network, no console. Works in a browser (window.FreakBoardNames) and in node (the tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FreakBoardNames = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'n0.1';
  // a plain first name: letters (Hebrew or Latin), a geresh, a hyphen; at most two words, 20 characters
  var FIRST = /^[א-תA-Za-z][א-תA-Za-z'׳״"\-]*( [א-תA-Za-z'׳״"\-]+)?$/;

  /** the schedule's answer + the stamp the board read → { number: first name }, or null when it cannot be used: not a
   *  success, the tab no longer the same as the grid (same is not true), of another tab stamp (another numbering), or
   *  any value that is not a plain first name. All or nothing. */
  function namesOf(reply, at) {
    if (!reply || reply.success !== true || reply.same !== true || typeof at !== 'string' || !at || reply.at !== at) return null;
    var n = reply.names;
    if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
    var out = Object.create(null), any = false;
    for (var k in n) {
      if (!Object.prototype.hasOwnProperty.call(n, k)) continue;
      if (!/^[1-9]\d?$/.test(k)) return null;
      var v = n[k];
      if (typeof v !== 'string') return null;
      v = v.trim();
      if (v === '') continue;                                  // somebody the staff list does not resolve: counted, not named
      if (v.length > 20 || !FIRST.test(v)) return null;
      out[k] = v; any = true;
    }
    return any ? out : null;
  }

  /** parts → text; with names, " (X, Y ועוד 1)" after each count whose people are known */
  function textOf(parts, names) {
    var s = '';
    (parts || []).forEach(function (p) {
      if (typeof p === 'string') { s += p; return; }
      if (!names || !p || !Array.isArray(p.n)) return;
      var known = [], rest = 0;
      p.n.forEach(function (x) { var nm = names[String(x)]; if (nm) known.push(nm); else rest++; });
      if (known.length) s += ' (' + known.join(', ') + (rest ? ' ועוד ' + rest : '') + ')';
    });
    return s;
  }

  function rows(model, fn) {
    ((model && model.widgets) || []).forEach(function (w) {
      (w && Array.isArray(w.items) ? w.items : []).forEach(function (it) { if (it && it.p) fn(it); });
    });
    return model;
  }

  /** the tab stamp the model's shift row belongs to, or '' */
  function stampOf(model) {
    var at = '';
    rows(model, function (it) { if (!at && it.p && typeof it.p.at === 'string') at = it.p.at; });
    return at;
  }

  /** the model with the names put into each shift row whose stamp matches the answer, and every p removed. A model the
   *  page draws: never the one it keeps. Without usable names the rows keep the server's own text (counts). */
  function apply(model, reply) {
    return rows(model, function (it) {
      var names = namesOf(reply, it.p.at);
      if (names) {
        it.title = textOf(it.p.t, names);
        if (Array.isArray(it.p.m) && it.p.m.length) it.meta = textOf(it.p.m, names);
      }
      delete it.p;
    });
  }

  /** the model with every p removed (counts only) */
  function strip(model) { return rows(model, function (it) { delete it.p; }); }

  return { VERSION: VERSION, namesOf: namesOf, textOf: textOf, stampOf: stampOf, apply: apply, strip: strip };
});
