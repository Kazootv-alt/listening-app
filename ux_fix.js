/* ベータ版 使い勝手の修正（2026-11-17 本人の使用感から）
   1 待ち時間は専用の待ち画面にする（何をしているか・あと何%かを大きく1つだけ）
   2 操作ボタンを画面の下に固定（英文が長くても、スクロールせずに押せる）
   3 画面を消している間も、イヤホンの操作が届き続けるようにする（区切りの合間も無音を流して「再生中」を保つ）
   5 全文読み上げ：作るのが再生に追いつかない時は、途中で止まらないよう「全部できてから一気に」読み上げる */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  /* ---------- 2 ボタンの固定と、英文の枠の高さ ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#lcp footer#ctl{position:sticky;bottom:0;z-index:50;background:var(--bg);border-top:1px solid var(--line)}' +
    '#lcp main#view{max-height:46dvh;overflow:auto;-webkit-overflow-scrolling:touch}' +
    '#remoteHelp{display:none}' +
    '#uxWait{position:fixed;inset:0;z-index:100000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:var(--bg);color:var(--fg);text-align:center;font:16px/1.6 -apple-system,system-ui,sans-serif}' +
    '#uxWait.on{display:flex}#uxWait b{font-size:22px}#uxWait .sub{color:var(--sub);font-size:14px;max-width:30em}' +
    '#uxWait .spin{width:44px;height:44px;border-radius:50%;border:4px solid var(--line);border-top-color:var(--accent);animation:uxs 1s linear infinite}' +
    '@keyframes uxs{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){#uxWait .spin{animation:none}}';
  document.head.appendChild(css);

  /* ---------- 1 待ち画面 ---------- */
  var w = document.createElement('div'); w.id = 'uxWait'; w.setAttribute('role', 'status');
  w.innerHTML = '<div class="spin"></div><b id="uxWaitMain">準備しています…</b><div class="sub" id="uxWaitSub">最初の1回だけ、音声エンジンの取り込みに数分かかります（Wi-Fi推奨）。画面はつけたままにしてください。最初の部分ができると自動で再生します。</div>';
  (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); })).then(function () { document.body.appendChild(w); });
  var waiting = false, src = null;
  function mirror() { if (!waiting) return; var t = ''; ['ondevMsg', 'inMsg', 'pdfMsg2'].forEach(function (id) { var e = $(id); if (!t && e && e.textContent && /取り込み|準備|作って|作成中|区間/.test(e.textContent)) t = e.textContent; }); if (t) $('uxWaitMain').textContent = t.length > 60 ? t.slice(0, 60) + '…' : t; }
  setInterval(mirror, 500);
  function showWait() { waiting = true; w.classList.add('on'); mirror(); }
  function hideWait() { waiting = false; w.classList.remove('on'); }
  function wrapMake() {
    var o = window.__makeAudio; if (!o || o.__ux) return;
    var f = async function () { showWait(); try { return await o.apply(this, arguments); } finally { hideWait(); } };
    f.__ux = 1; window.__makeAudio = f;
  }
  wrapMake(); window.addEventListener('load', wrapMake); setTimeout(wrapMake, 0);
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'ondevStart') showWait(); }, true); /* 学習開始：エンジンの取り込み中から待ち画面 */
  var st = setInterval(function () { var m = $('ondevMsg'); if (waiting && m && /できませんでした|作れませんでした/.test(m.textContent)) hideWait(); }, 1000);

  /* ---------- 3 画面オフ中もイヤホンが届くように：区切りの合間は無音を流し続ける ---------- */
  var core = window.__core, au = core && core.au;
  if (au) {
    var n = 24000, b = new ArrayBuffer(44 + n * 2), d = new DataView(b), ws = function (o, s) { for (var i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 24000, true); d.setUint32(28, 48000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); ws(36, 'data'); d.setUint32(40, n * 2, true);
    var keep = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); keep.loop = true; keep.setAttribute('playsinline', '');
    var unlocked = false;
    document.addEventListener('click', function (e) { /* 画面の操作（Start など）のついでに、無音の再生を許可してもらう */
      if (unlocked || !e.isTrusted) return; unlocked = true;
      var p = keep.play(); if (p && p.then) p.then(function () { keep.pause(); }).catch(function () { unlocked = false; });
    }, true);
    var chunkMode = function () { var b = document.querySelector('#modeSeg button.on'); return !b || b.dataset.v === 'chunk'; };
    au.addEventListener('play', function () { if (!keep.paused) keep.pause(); });
    au.addEventListener('pause', function () { /* 区切りの終わりで止まった時：画面オフなら無音を流して、次のイヤホン操作を待つ */
      if (unlocked && document.hidden && chunkMode()) { var p = keep.play(); if (p && p.catch) p.catch(function () { }); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && unlocked && au.paused && chunkMode() && au.src) { var p = keep.play(); if (p && p.catch) p.catch(function () { }); }
      if (!document.hidden && !keep.paused) keep.pause();
    });
  }

  /* ---------- 5 全文読み上げ：途中で止まらないよう、全部できてから一気に ---------- */
  var pending = false, pendT = null;
  function L() { return window.__long && window.__long(); }
  function onLongPassage() { var l = L(); return l && l.added && $('psel') && $('psel').value === l.pid; }
  function eta(l) { /* 1区間あたりの実測から、残りの時間（分）を出す */
    var R = window.__ondevRes || [], s = 0, k = 0; R.forEach(function (x) { if (x.timing && x.timing.synth_sec) { s += x.timing.synth_sec; k++; } });
    var left = l.N - l.ok.filter(Boolean).length; return k ? Math.max(1, Math.round(s / k * left / 60)) : null;
  }
  function status(t) { var s = $('status'); if (s) { s.className = ''; s.textContent = t; } }
  document.addEventListener('click', function (e) {
    if (!e.target || e.target.id !== 'bPP' || !onLongPassage()) return;
    var l = L(), au2 = window.__core.au, done = l.ok.filter(Boolean).length;
    if (done >= l.N || !au2.paused || au2.currentTime > 0) { pending = false; return; } /* 全部できている・再生中・途中からの再開はそのまま */
    e.stopPropagation(); e.preventDefault();
    if (pending) { pending = false; clearInterval(pendT); status('全文の自動読み上げを取り消しました'); return; }
    pending = true; var m = eta(l);
    status('全文は作成中です（' + done + '/' + l.N + '）。途中で止まらないよう、全部できたら自動で一気に読み上げます' + (m ? '（あと約' + m + '分）' : '') + '。その間は「区切り学習」で聞けます');
    clearInterval(pendT); pendT = setInterval(function () {
      var l2 = L(); if (!pending || !l2) { clearInterval(pendT); return; }
      var d2 = l2.ok.filter(Boolean).length;
      if (l2.fail.some(Boolean) && !l2.running) { pending = false; clearInterval(pendT); status('全文の一部を作れませんでした。「失敗した区間だけ作り直す」を押してください'); return; }
      if (d2 >= l2.N) { pending = false; clearInterval(pendT); var fb = document.querySelector('#modeSeg button[data-v="full"]'); if (fb && !fb.classList.contains('on')) fb.click(); setTimeout(function () { var bp = $('bPP'); if (bp && window.__core.au.paused) bp.click(); }, 300); return; }
      var m2 = eta(l2); status('全文は作成中です（' + d2 + '/' + l2.N + '）。全部できたら自動で一気に読み上げます' + (m2 ? '（あと約' + m2 + '分）' : ''));
    }, 3000);
  }, true);
  /* 本人が自分で「区切り学習」に切り替えたら、全文の自動読み上げは取り消す */
  document.addEventListener('click', function (e) { if (pending && e.isTrusted && e.target && e.target.closest && e.target.closest('#modeSeg button[data-v="chunk"]')) { pending = false; clearInterval(pendT); } }, true);
})();
