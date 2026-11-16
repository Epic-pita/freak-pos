/* FREAK board — the page around the frame (bp0.1). It asks the home screen's backend for the board with the personal
 * code this browser already holds (saved once by home.html), draws it with the frame (board.js) and refreshes it.
 * It holds no data and keeps none: nothing of the board is stored on the device. It never asks without a code and
 * never erases the saved code (the home screen owns it). ?api=test reads the TEST copy. */
(function () {
  'use strict';
  var LIVE_API = 'https://script.google.com/macros/s/AKfycbxUnoCfolEzKVkRRD2X3iBxc1BKUc29vn-f_rfxCN3M0POOv_tY34iJFrXAHjLwFAWiuQ/exec';
  var TEST_API = 'https://script.google.com/macros/s/AKfycbz1aUaR698bq3Y2y2WhX1ng77i9BYrTBIP1ahDpNezYXqYPGJect3T64HOgB85FXytW/exec';
  var MODE = /[?&]api=test(&|$)/.test(location.search) ? 'test' : 'live';
  var API = MODE === 'test' ? TEST_API : LIVE_API;
  var KEY_NAME = MODE === 'live' ? 'l1_key' : 'l1_key_test';
  var REFRESH_MS = 5 * 60000, TIMEOUT_MS = 90000;

  var host = document.getElementById('board'), msg = document.getElementById('msg'), tools = document.getElementById('tools');
  var last = null, loading = false, theme = '';
  try { theme = localStorage.getItem('fb_theme') || ''; } catch (e) { theme = ''; }
  if (theme !== 'light' && theme !== 'dark') theme = '';

  function savedKey() { try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; } }
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
    var model = last.model || {};
    model.date = today();
    // the frame escapes every text it writes and allows only https or site-relative doors (board/test in the L1 folder)
    host.innerHTML = window.FreakBoard.renderBoard(model, { links: last.links || {}, theme: theme || undefined });
  }
  tools.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-theme]') : null;
    if (!b) return;
    theme = b.getAttribute('data-theme') || '';
    try { if (theme) localStorage.setItem('fb_theme', theme); else localStorage.removeItem('fb_theme'); } catch (x) { /* the choice lasts for this visit */ }
    paintTheme(); draw();
  });

  function post(body) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (js) { if (timer) clearTimeout(timer); return js; }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }
  function load(tries) {
    var k = savedKey();
    if (!k) { say('בדפדפן הזה אין קוד שמור. נכנסים פעם אחת דרך מסך הבית, ואז חוזרים לכאן.', true); return; }
    if (loading) return;
    loading = true;
    if (!last) say('טוען את הלוח…');
    post({ k: k, action: 'board', build: 'bp0.1' }).then(function (js) {
      if (js && js.error === 'GET_NOT_POST' && (tries || 0) < 3) { loading = false; load((tries || 0) + 1); return; }
      try {
        if (js && js.ok && js.board) { last = js.board; say(js.err ? 'הבנייה האחרונה של הלוח נכשלה. מוצג המצב הקודם.' : ''); draw(); }
        else if (js && js.ok) say('הלוח עוד לא נבנה. לנסות שוב בעוד דקה.');
        else if (js && js.error === 'BAD_KEY') say('הקוד השמור בדפדפן הזה לא התקבל. נכנסים מחדש דרך מסך הבית.', true);
        else say(last ? 'אין תשובה מהשרת. מוצג המצב האחרון.' : 'אין תשובה מהשרת. לנסות שוב בעוד דקה.');
      } catch (e) { say('הלוח הגיע אבל לא הצליח להצטייר. לרענן את הדף.'); }   // review: a failed draw must not leave the page stuck
      finally { loading = false; }
    }, function () {
      say(last ? 'אין חיבור. מוצג המצב האחרון.' : 'אין חיבור לשרת. לנסות שוב בעוד דקה.');
      loading = false;
    });
  }

  paintTheme();
  load(0);
  setInterval(function () { if (!document.hidden) load(0); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(0); });
})();
