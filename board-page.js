/* FREAK board — the page around the frame (bp0.3). It asks the home screen's backend for the board with the personal
 * code this browser already holds (saved once by home.html), draws it with the frame (board.js) and refreshes it.
 * It holds no data and keeps none: nothing of the board is stored on the device. It never asks without a code and
 * never erases the saved code (the home screen owns it). ?api=test reads the TEST copy.
 * bp0.2: the first names of who is on shift (Chris, card L1-SHIFT-NAMES-1). When the board's answer carries the running
 * numbers behind the shift counts (it does so for his own key only), the page asks the schedule's web app for today's
 * first names with the personal key this browser already keeps for the schedule app (same site; read, never written or
 * removed: the schedule app owns it), and board-names.js joins them in memory. The names and that key go nowhere else:
 * not into storage, a URL or the console. No schedule key in this browser: the counts, and nothing is said about it.
 * bp0.3: a board for staff (card L1-SUP-2ND-1). A personal link to this page (#k=...) saves its code once, as the home
 * page does, and the address bar drops it at once; the board's server answers a staff code with its own cards, or with
 * no board and a sentence (no row in the who-sees-what table), which the page says, and then it shows no old board.
 * bp0.4: the board opens through FREAK צוות (card L1-OPEN-APP-1). With no saved code (or a saved code the board refuses),
 * the page takes the app's session id from this browser (same site; read once per load, never written, removed, stored,
 * logged or put in an address), sends it only to the app's service of its own copy (live or TEST) and gets a fresh 5-minute
 * pass, which goes to the board only in the body of a POST and is then forgotten. Not signed in to the app: a sentence and
 * a link to it. The first request of each page load says `open: true` (the board's opening counter); refreshes do not. */
(function () {
  'use strict';
  var LIVE_API = 'https://script.google.com/macros/s/AKfycbxUnoCfolEzKVkRRD2X3iBxc1BKUc29vn-f_rfxCN3M0POOv_tY34iJFrXAHjLwFAWiuQ/exec';
  var TEST_API = 'https://script.google.com/macros/s/AKfycbz1aUaR698bq3Y2y2WhX1ng77i9BYrTBIP1ahDpNezYXqYPGJect3T64HOgB85FXytW/exec';
  var SCHED_API = 'https://script.google.com/macros/s/AKfycbyBpSBlk-Z8R3cU4g9ADhW1JxRz0RG1c6CqEiOBTVD0_Ud27UWEE3s9tEoDpmeFMJznuw/exec';
  var SCHED_KEY = 'freak_schedule_key', NAMES_ACTION = 'mgrTodayNames', NAMES_MS = 20000;
  var MODE = /[?&]api=test(&|$)/.test(location.search) ? 'test' : 'live';
  var API = MODE === 'test' ? TEST_API : LIVE_API;
  var KEY_NAME = MODE === 'live' ? 'l1_key' : 'l1_key_test';
  var REFRESH_MS = 5 * 60000, TIMEOUT_MS = 90000, BUILD = 'bp0.4';
  // bp0.4: the app FREAK צוות (its pages' public config.js): its service per copy, its session slot, the page to sign in on
  var APP_API = MODE === 'test' ? 'https://script.google.com/macros/s/AKfycbxs0ebx-l1Z-kjWriJb8itLkUvTz1cbmhiqkxdEKMUe9cOTls_RAe-veNmB0QtWINl-Dw/exec' : 'https://script.google.com/macros/s/AKfycbyFl51NOb7BCmngZGamwe4Hn7xkoJjQBn9dvkBPswMOZa3yrPazmSYye3BDLEV5Xa7icA/exec';
  var APP_PAGE = MODE === 'test' ? 'https://epic-pita.github.io/freak-app/t1/' : 'https://epic-pita.github.io/freak-app/';
  var APP_SID = 'freak_app_session', APP_MS = 30000;
  var keyRefused = false, opened = false;            // in memory only: a saved code the board refused on this visit; an opening counted
  // bp0.3: a personal link (#k=...): the code is saved once (kept in memory too, if storage is refused) and the address
  // bar drops it, so it stays neither in the address nor in the history
  var linkKey = '';
  (function () {
    var m = /[#&]k=([\w\-]{24,100})/.exec(location.hash || '');
    if (!m) return;
    linkKey = m[1];
    try { localStorage.setItem(KEY_NAME, linkKey); } catch (e) { /* this visit only */ }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e2) { /* nothing more to do */ }
  })();

  var host = document.getElementById('board'), msg = document.getElementById('msg'), tools = document.getElementById('tools');
  var last = null, loading = false, theme = '';
  var names = null, namesFor = '';                  // in memory only: the schedule's answer and the tab stamp it was asked for
  try { theme = localStorage.getItem('fb_theme') || ''; } catch (e) { theme = ''; }
  if (theme !== 'light' && theme !== 'dark') theme = '';

  function savedKey() { try { return localStorage.getItem(KEY_NAME) || linkKey; } catch (e) { return linkKey; } }
  function schedKey() { try { return localStorage.getItem(SCHED_KEY) || ''; } catch (e) { return ''; } }
  function say(text, withHome) {
    msg.textContent = text || '';
    if (text && withHome) {
      msg.appendChild(document.createTextNode(' '));
      var a = document.createElement('a'); a.href = './home.html' + (MODE === 'test' ? '?api=test' : ''); a.textContent = 'למסך הבית'; msg.appendChild(a);
    }
    msg.hidden = !text;
  }
  function today() {
    try { return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); }
    catch (e) { return ''; }
  }
  function paintTheme() {
    document.body.className = theme === 'dark' ? 'is-dark' : theme === 'light' ? 'is-light' : '';
    tools.textContent = '';
    [['', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']].forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-theme', t[0]);
      b.setAttribute('aria-pressed', String(theme === t[0])); b.textContent = t[1]; tools.appendChild(b);
    });
    if (MODE !== 'live') { var s = document.createElement('span'); s.textContent = 'עותק ניסיון'; tools.appendChild(s); }
  }
  function draw() {
    if (!last) return;
    // a copy is drawn, so the names joined into it never stay in what the page keeps between answers
    var model = JSON.parse(JSON.stringify(last.model || {})), NB = window.FreakBoardNames;
    model.date = today();
    if (NB) { if (names && names.at === NB.stampOf(model)) NB.apply(model, names.reply); else NB.strip(model); }
    // the frame escapes every text it writes and allows only https or site-relative doors (board/test in the L1 folder)
    host.innerHTML = window.FreakBoard.renderBoard(model, { links: last.links || {}, theme: theme || undefined });
  }
  /** today's first names from the schedule's web app, once per tab stamp; any failure: the counts stay, said nowhere */
  function askNames() {
    var NB = window.FreakBoardNames, at = NB && last ? NB.stampOf(last.model) : '';
    if (!at || namesFor === at) return;
    var k = schedKey();
    if (!k) return;
    namesFor = at;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, NAMES_MS) : null;
    fetch(SCHED_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: NAMES_ACTION, k: k }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (js) {
        if (timer) clearTimeout(timer);
        // the schedule's own words: success, and same = its tab still matches the published grid (else it gives no names)
        if (js && js.success === true && js.same === true && js.at === at) { names = { at: at, reply: js }; try { draw(); } catch (e) { /* the counts stay */ } }
      }, function () { if (timer) clearTimeout(timer); if (namesFor === at) namesFor = ''; });   // no answer: asked again at the next refresh
  }
  tools.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-theme]') : null;
    if (!b) return;
    theme = b.getAttribute('data-theme') || '';
    try { if (theme) localStorage.setItem('fb_theme', theme); else localStorage.removeItem('fb_theme'); } catch (x) { /* the choice lasts for this visit */ }
    paintTheme(); draw();
  });

  function send(url, body, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (js) { if (timer) clearTimeout(timer); return js; }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }
  /** Google sometimes hands a POST over as a bare GET (the server then never saw the body): the same POST again, a few times */
  function again(js) { return !!js && (js.error === 'GET_NOT_POST' || js.code === 'GET_NOT_POST'); }
  function post(body, tries) {
    return send(API, body, TIMEOUT_MS).then(function (js) { return again(js) && (tries || 0) < 3 ? post(body, (tries || 0) + 1) : js; });
  }
  /** bp0.4: a fresh pass from the app's service (null when it does not answer); the session id goes nowhere else */
  function askPass(sid, tries) {
    return send(APP_API, { a: 'pass', sid: sid, aud: 'freak-board' }, APP_MS)
      .then(function (js) { return again(js) && (tries || 0) < 2 ? askPass(sid, (tries || 0) + 1) : js; }, function () { return null; });
  }
  /** bp0.4: the app's session id in this browser, as the app keeps it (a JSON string), or '' */
  function appSid() {
    try { var s = JSON.parse(localStorage.getItem(APP_SID) || 'null'); return typeof s === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(s) ? s : ''; }
    catch (e) { return ''; }
  }
  /** bp0.4: not signed in to the app: no board stays on the screen, a sentence and the way to the app */
  function signIn() {
    last = null; names = null; namesFor = ''; host.innerHTML = '';
    msg.textContent = 'כדי לראות את הלוח נכנסים פעם אחת ל-FREAK צוות עם חשבון הגוגל, ואז חוזרים לכאן. ';
    var a = document.createElement('a'); a.href = APP_PAGE; a.textContent = 'ל-FREAK צוות'; msg.appendChild(a);
    msg.hidden = false;
  }
  function answer(js) {
    try {
      if (js && js.ok) opened = true;                // the board counted this page load's opening
      if (js && js.ok && js.board) { last = js.board; say(js.err ? 'הבנייה האחרונה של הלוח נכשלה. מוצג המצב הקודם.' : ''); draw(); askNames(); }
      // bp0.3: the server's own sentence (a staff code with no board): no old board stays on the screen
      else if (js && js.ok && typeof js.why === 'string' && js.why) { last = null; names = null; namesFor = ''; host.innerHTML = ''; say(js.why); }
      else if (js && js.ok) say('הלוח עוד לא נבנה. לנסות שוב בעוד דקה.');
      else if (js && js.error === 'BAD_PASS') say(last ? 'הכניסה דרך FREAK צוות לא התקבלה הפעם. מוצג המצב האחרון.' : 'הכניסה דרך FREAK צוות לא התקבלה הפעם. לנסות שוב בעוד דקה.');
      else if (js && js.error === 'BAD_KEY') say('הקוד השמור בדפדפן הזה לא התקבל. נכנסים מחדש דרך מסך הבית.', true);
      else say(last ? 'אין תשובה מהשרת. מוצג המצב האחרון.' : 'אין תשובה מהשרת. לנסות שוב בעוד דקה.');
    } catch (e) { say('הלוח הגיע אבל לא הצליח להצטייר. לרענן את הדף.'); }   // review: a failed draw must not leave the page stuck
  }
  function load() {
    if (loading) return;
    var k = keyRefused ? '' : savedKey(), sid = k ? '' : appSid();
    if (!k && !sid) { if (keyRefused) say('הקוד השמור בדפדפן הזה לא התקבל. נכנסים מחדש דרך מסך הבית.', true); else signIn(); return; }
    loading = true;
    if (!last) say('טוען את הלוח…');
    var open = !opened;
    var lost = function () { say(last ? 'אין חיבור. מוצג המצב האחרון.' : 'אין חיבור לשרת. לנסות שוב בעוד דקה.'); loading = false; };
    if (k) {
      post({ k: k, action: 'board', build: BUILD, open: open }).then(function (js) {
        loading = false;
        // bp0.4: a saved code the board refuses does not end the visit when the app is signed in here (the code is kept)
        if (js && js.error === 'BAD_KEY' && appSid()) { keyRefused = true; load(); return; }
        answer(js);
      }, lost);
      return;
    }
    askPass(sid).then(function (ans) {
      if (!ans || ans.ok !== true || typeof ans.pass !== 'string') {
        loading = false;
        if (ans && (ans.code === 'signed_out' || ans.code === 'not_active')) { signIn(); return; }
        // the app's own refusal of a code it does not hand passes for (L15's answers, 17/11): no board, a sentence
        if (ans && ans.code === 'not_allowed') { last = null; names = null; namesFor = ''; host.innerHTML = ''; say('הלוח עוד לא פתוח לך.'); return; }
        say(last ? 'אין תשובה מ-FREAK צוות. מוצג המצב האחרון.' : 'אין תשובה מ-FREAK צוות. לנסות שוב בעוד דקה.');
        return;
      }
      // review: a board that does not know passes (rolled back to b0.15) answers BAD_KEY; this person has no saved code,
      // so it is said as a refused pass, never as "the saved code in this browser"
      return post({ p: ans.pass, action: 'board', build: BUILD, open: open }).then(function (js) { loading = false; answer(js && js.error === 'BAD_KEY' ? { ok: false, error: 'BAD_PASS' } : js); });
    }).then(null, lost);
  }

  paintTheme();
  load(0);
  setInterval(function () { if (!document.hidden) load(0); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(0); });
})();
