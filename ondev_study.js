/* iPhone内生成版：学習兼用の確認導線。
   操作は「学習開始」を1回押すだけ。内蔵の英文で音声を作り、できた所から再生する。
   生成の開始時間・速度・エラー・メモリ情報（取れる範囲）・進捗・画面OFF前後の様子を、自動でPCへ記録する（本人の入力なし）。 */
(function(){
  var TEXT = [
    "Every city has a story, and the best way to learn it is to walk.",
    "Last spring, a small group of language students joined a free walking tour in an old part of Tokyo.",
    "Their guide was a retired teacher who had lived in the neighborhood for more than forty years.",
    "She met them in front of a quiet temple at nine in the morning, and she asked a simple question.",
    "\"What do you notice first?\"",
    "Some students talked about the wooden gate, and others pointed to a cat sleeping on the stone steps.",
    "The guide smiled and said that every answer was correct, because noticing is the first step of learning.",
    "As they walked, she stopped every few minutes to tell a short story.",
    "In one narrow street, she showed them a shop that had sold paper fans for four generations.",
    "The owner explained that a good fan must be light, strong, and easy to repair.",
    "Later, they visited a small market where people still bargained in a friendly way.",
    "One student tried to buy two rice crackers, but he said the price incorrectly, and everyone laughed, including the seller.",
    "He tried again, more slowly, and this time the seller gave him a third cracker for free.",
    "Before lunch, the guide shared a surprising fact.",
    "The street they were standing on was about 3.5 kilometers long, but most visitors walked only the first few hundred meters.",
    "\"If you go a little further than other people,\" she said, \"you will find stories that nobody else hears.\"",
    "In the afternoon, the group sat by the river and talked about what they had learned.",
    "Many of them agreed that they had understood more English and Japanese than they expected, because the words were connected to real places.",
    "A sign, a smell, or a sound helped them remember each expression.",
    "One student said that listening to the same short story several times was much easier than reading a long chapter once.",
    "At the end of the tour, the guide gave each student a small card.",
    "On the card, she had written one sentence: \"Walk slowly, listen carefully, and ask one more question.\"",
    "It was simple advice, but it worked for travel, for language, and perhaps for life."
  ].join(' ');
  var P = new URLSearchParams(location.search);
  var RUN = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), T0 = Date.now();
  var sent = 0, KIND = 'fp32', crashFlag = false;
  function ring(ev) { /* 端末内にも直近150件を保持（PCへ届かなかった場合の控え） */ try { var a = JSON.parse(localStorage.getItem('ondevLog') || '[]'); a.push(ev); if (a.length > 150) a = a.slice(-150); localStorage.setItem('ondevLog', JSON.stringify(a)); } catch (e) { } }
  function send(type, data) { /* PCへ1件記録。画面が消える直前でも届くよう sendBeacon を優先 */
    if (type === 'engine_crash') crashFlag = true;
    if (sent >= 400) return; sent++;
    var ev = Object.assign({ run: RUN, type: type, kind: KIND, sec: Math.round((Date.now() - T0) / 100) / 10 }, data || {});
    ring(ev);
    var body = JSON.stringify(ev);
  }
  window.__ondevSend = send;
  function mem() { var m = {}; try { if (performance.memory) m.js_heap_mb = Math.round(performance.memory.usedJSHeapSize / 1e6); } catch (e) { } try { if (navigator.deviceMemory) m.device_gb = navigator.deviceMemory; } catch (e) { } try { var L = window.__ondevLog || []; for (var i = L.length - 1; i >= 0; i--) if (L[i].wm_mb != null) { m.wasm_mb = L[i].wm_mb; break; } } catch (e) { } if (!Object.keys(m).length) m.note = '取得不能'; return m; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k || 'ondevRun') || 'null'); } catch (e) { return null; } }
  function lsSet(v, k) { try { v ? localStorage.setItem(k || 'ondevRun', JSON.stringify(v)) : localStorage.removeItem(k || 'ondevRun'); } catch (e) { } }
  function lsMerge(o) { var v = lsGet() || {}; for (var k in o) v[k] = o[k]; lsSet(v); }

  /* 使うモデル：既定は fp32（B方式）。前回 fp32 で強制終了の印が残っていれば、次から自動で軽い版 int8 */
  KIND = P.get('model') || lsGet('ondevModelKind') || 'fp32';
  var nav = ''; try { nav = (performance.getEntriesByType('navigation')[0] || {}).type || ''; } catch (e) { }
  var prev = lsGet();
  if (prev && prev.run && !prev.done && !prev.reported) {
    var likely = prev.closed ? 'closed_by_user_or_switch' : (prev.hiddenOff ? 'ended_while_screen_off' : 'killed');
    send('prev_run_unfinished', Object.assign({ nav: nav, likely: likely, since_alive_sec: prev.alive ? Math.round((Date.now() - prev.alive) / 1000) : null }, prev));
    prev.reported = true; lsSet(prev);
    if (likely === 'killed' && (prev.kind || 'fp32') === 'fp32' && !P.get('model')) { KIND = 'int8'; lsSet('int8', 'ondevModelKind'); send('auto_fallback', { to: 'int8', reason: 'prev_killed' }); }
  }
  window.__ondevUseModel && window.__ondevUseModel(KIND);
  send('open', { nav: nav, ua: navigator.userAgent, cores: navigator.hardwareConcurrency || null, coi: window.crossOriginIsolated === true, standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)), w: screen.width, h: screen.height, mem: mem() });
  try { navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then(function (e) { send('storage', { usage_mb: Math.round(e.usage / 1e6), quota_mb: Math.round(e.quota / 1e6) }); }); } catch (e) { }
  window.addEventListener('error', function (e) { send('error', { msg: String(e.message || e.error || '').slice(0, 300) }); });
  window.addEventListener('unhandledrejection', function (e) { send('error', { msg: String(e.reason && e.reason.message || e.reason || '').slice(0, 300) }); });

  /* 画面：上部に「学習開始」を1つだけ。表示は1行（取り込み中 n%／作成中 n/N／聞けます） */
  var css = document.createElement('style'); css.textContent = 'main[hidden]{display:none!important}'; document.head.appendChild(css);
  var box = document.createElement('div');
  box.id = 'ondevBox';
  box.style.cssText = 'position:sticky;top:0;z-index:99998;background:#fffbe6;border-bottom:1px solid #e5d9a6;padding:10px 12px;font:15px/1.5 -apple-system,sans-serif;color:#222';
  var SIZE = KIND === 'int8' ? '約90MB' : '約330MB';
  box.innerHTML = '<button id="ondevStart" type="button" style="width:100%;font-size:20px;padding:14px;border-radius:12px;border:0;background:#1f6feb;color:#fff;font-weight:700">学習開始</button>' +
    '<div id="ondevMsg" style="margin-top:6px">初回は' + SIZE + 'を取り込みます（Wi-Fi推奨）。</div>' +
    '';
  function mount() { document.body.insertBefore(box, document.body.firstChild); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  function say(t) { var m = document.getElementById('ondevMsg'); if (m) m.textContent = t; }

  window.__ondevOnDownload = function (got, total) { if (started && !initDone) say('取り込み中 ' + Math.round(got / Math.max(1, total) * 100) + '%（初回だけ・' + Math.round(total / 1e6) + 'MB）'); };
  var firstDone = false, started = false, initDone = false, tStart = 0, lastOk = 0, hiddenAt = null, done = false, hiddenMs = 0, hiddenSince = null, lastSeg = Date.now(), lock = null, aliveIv = null, fallbackUsed = false;
  function state() { var L = window.__long && window.__long(); var au = window.__core && window.__core.au; return { ok: L ? L.ok.filter(Boolean).length : (window.__ondevShort ? 1 : 0), N: L ? L.N : 1, fail: L ? L.fail.filter(Boolean).length : 0, running: L ? !!L.running : false, playing: !!(au && !au.paused), at: au ? Math.round(au.currentTime) : 0 }; }
  document.addEventListener('visibilitychange', function () {
    if (!started) return;
    var s = state();
    if (document.hidden) { hiddenSince = Date.now(); hiddenAt = { t: Date.now(), ok: s.ok, at: s.at }; lsMerge({ hiddenOff: true, alive: Date.now() }); send('hidden', s); }
    else {
      if (hiddenSince) { hiddenMs += Date.now() - hiddenSince; hiddenSince = null; } lsMerge({ hiddenOff: false, closed: false, alive: Date.now() });
      var d = hiddenAt ? { off_sec: Math.round((Date.now() - hiddenAt.t) / 1000), made_while_off: s.ok - hiddenAt.ok, played_while_off: s.at - hiddenAt.at } : {}; hiddenAt = null; send('visible', Object.assign(s, d));
      if (!done && started) keepOn(); /* 画面が戻ったら、作成中は再び画面をつけたままにする（iOSは画面OFFで解除するため） */
    }
  });
  window.addEventListener('pagehide', function () { if (started) { lsMerge({ closed: true, alive: Date.now() }); send('pagehide', state()); } });

  /* 再生の記録（最初の1回ずつ）：始まったか、拒否されたか */
  var playedOnce = false, errOnce = false;
  function hookAudio() {
    var au = window.__core && window.__core.au; if (!au || au.__ondevHooked) return; au.__ondevHooked = true;
    au.addEventListener('playing', function () { if (!playedOnce && initDone) { playedOnce = true; send('first_playing', { sec_from_start: Math.round((Date.now() - tStart) / 100) / 10, hidden: document.hidden }); } });
    au.addEventListener('error', function () { if (!errOnce && initDone) { errOnce = true; send('audio_error', { code: au.error ? au.error.code : null }); } });
    var orig = au.play; au.play = function () { var p = orig.apply(au, arguments); if (p && p.catch && initDone) p.catch(function (e) { send('play_rejected', { name: e && e.name, hidden: document.hidden }); }); return p; };
  }

  function silentWav() { var n = 2400, b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = function (o, s) { for (var i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); }; w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 24000, true); d.setUint32(28, 48000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true); return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); }
  /* 作成中は画面をつけたままにする（iPhoneでは画面OFF中に作成が止まる可能性があるため。全部できたら解除） */
  async function keepOn() { if (!navigator.wakeLock) return 'unsupported'; if (lock) return 'ok'; var req = navigator.wakeLock.request('screen').then(function (l) { if (done) { try { l.release(); } catch (e) { } return 'late'; } lock = l; l.addEventListener && l.addEventListener('release', function () { if (lock === l) lock = null; }); return 'ok'; }, function (e) { return 'denied:' + (e && e.name); }); return Promise.race([req, new Promise(function (r) { setTimeout(function () { r('pending'); }, 1500); })]); }
  function release() { try { lock && lock.release(); } catch (e) { } lock = null; }

  function setBtn(text, enabled) { var b = document.getElementById('ondevStart'); if (!b) return; b.textContent = text; b.disabled = !enabled; b.style.background = enabled ? '#1f6feb' : '#8aa'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var MEMERR = /memory|RangeError|abort|allocation|OOM|engine_crashed|no_response/i;
  function switchToInt8(reason) { /* 同じページのまま軽い版へ。以後この端末は軽い版を使う */
    if (KIND === 'int8' || fallbackUsed) return false; fallbackUsed = true; KIND = 'int8'; lsSet('int8', 'ondevModelKind'); lsMerge({ kind: 'int8' });
    send('auto_fallback', { to: 'int8', reason: reason }); window.__ondevUseModel('int8'); crashFlag = false; return true;
  }
  async function initEngine() { /* 失敗しても2回までは自動でやり直す。メモリ不足らしい時は軽い版へ切り替える */
    for (var t = 0; t < 3; t++) {
      try { var tInit = Date.now(); await window.__ondevReadyP(); send('init_done', Object.assign({ init_sec: Math.round((Date.now() - tInit) / 100) / 10, mem: mem() }, window.__ondevInit || {})); return true; }
      catch (e) {
        var msg = String(e && e.message || e); send('init_failed', { msg: msg.slice(0, 200), attempt: t + 1 });
        if (MEMERR.test(msg) && switchToInt8('init_' + msg.slice(0, 40))) { say('軽い版に切り替えています…'); continue; }
        if (t < 2) { say('通信をやり直しています…'); await sleep(t ? 15000 : 5000); }
      }
    }
    return false;
  }
  async function start() {
    if (started) return; started = true; done = false; tStart = Date.now();
    setBtn('学習開始', false);
    /* iPhoneは「押した瞬間」にしか音を出す許可が出ないため、無音を一瞬だけ再生して許可を得ておく */
    hookAudio();
    try { var au = window.__core.au; au.src = silentWav(); var pr = au.play(); if (pr && pr.then) pr.then(function () { au.pause(); }).catch(function () { }); } catch (e) { }
    var wl = await keepOn();
    lsSet({ run: RUN, kind: KIND, started: new Date().toISOString(), done: false, alive: Date.now() });
    clearInterval(aliveIv); aliveIv = setInterval(function () { if (!document.hidden) lsMerge({ alive: Date.now() }); }, 3000);
    send('start', { chars: TEXT.length, wake_lock: wl, mem: mem() });
    say('準備中…');
    if (!await initEngine()) {
      release(); clearInterval(aliveIv); started = false;
      say('準備できませんでした。もう一度押すと続きから取り込みます（電波のよい所でお試しください）');
      setBtn('もう一度（続きから）', true); return;
    }
    initDone = true;
    say('作成中 0/…（最初の部分ができると自動で再生します）');
    var __t1 = Date.now(), __iv1 = setInterval(function () { if (firstDone || done) { clearInterval(__iv1); return; } say('最初の部分を作っています… ' + Math.round((Date.now() - __t1) / 1000) + '秒（初回は1分前後かかります。画面はつけたままにします）'); }, 1000);
    document.getElementById('inBtn') && document.getElementById('inBtn').click();
    var ta = document.getElementById('inTa'); ta.value = TEXT;
    var ti = document.getElementById('inTitle'); if (ti) ti.value = '街歩きと英語（内蔵英文）';
    lastSeg = Date.now();
    var r = await window.__makeAudio();
    if ((!r || !r.ok) && (crashFlag || MEMERR.test(JSON.stringify(r || {}))) && switchToInt8('first_segment_crash')) {
      say('軽い版に切り替えて作り直しています…');
      if (await initEngine()) { document.getElementById('inBtn') && document.getElementById('inBtn').click(); ta.value = TEXT; lastSeg = Date.now(); r = await window.__makeAudio(); }
    }
    var first = Math.round((Date.now() - tStart) / 100) / 10;
    firstDone = true;
    if (!r || !r.ok) { send('first_failed', { r: r, mem: mem() }); say('音声を作れませんでした。もう一度「学習開始」を押してください'); fin(false); return; }
    if (!r.long) window.__ondevShort = true;
    send('first_ready', { first_sec: first, gen_first_sec: r.firstSec || r.sec, N: r.N || 1, seg: segTiming(), mem: mem() });
    try { document.getElementById('bRep').click(); } catch (e) { }
    setTimeout(function () {
      var s = state(); send('play_check', Object.assign({ played: playedOnce }, s));
      if (!(s.at > 0 || s.playing || playedOnce)) { say('聞けます：画面いちばん下の ▶ Start（Back と Next の間）を押してください'); try { document.getElementById('ctl').scrollIntoView({ block: 'end' }); } catch (e) { } }
      else progressLine(s);
    }, 4000);
    watch();
  }
  function progressLine(s) { if (!done) say('作成中 ' + s.ok + '/' + s.N + '（全部できるまで画面はついたままにします）。Repeat／Next で聞けます'); }
  function segTiming() { /* 直前にできた区間の、生成にかかった時間と音声の長さ（iPhoneでの速度の判定用） */
    var R = window.__ondevRes || [], x = R[R.length - 1];
    var hid = hiddenMs + (hiddenSince ? Date.now() - hiddenSince : 0); hiddenMs = 0; if (hiddenSince) hiddenSince = Date.now();
    var o = { wall_sec: Math.round((Date.now() - lastSeg) / 100) / 10, hidden_sec: Math.round(hid / 100) / 10 }; lastSeg = Date.now();
    if (x && x.timing) { o.synth_sec = Math.round(x.timing.synth_sec * 10) / 10; o.audio_sec = x.timing.audio_sec; o.rtf = x.timing.audio_sec ? Math.round(x.timing.synth_sec / x.timing.audio_sec * 100) / 100 : null; }
    return o;
  }
  function watch() {
    var iv = setInterval(function () {
      var s = state();
      if (s.ok !== lastOk) { lastOk = s.ok; if (s.ok > 1) send('progress', Object.assign({ seg: segTiming(), mem: mem(), hidden: document.hidden }, s)); lsMerge({ ok: s.ok, N: s.N, alive: Date.now() }); if (playedOnce) progressLine(s); }
      if (!s.running && s.fail && crashFlag && switchToInt8('segment_crash')) { /* 途中で落ちた：軽い版で残りを自動で作り直す（ボタンは本人に押させない） */
        say('軽い版に切り替えて、続きを作っています…'); setTimeout(function () { var b = document.getElementById('genRetry'); if (b) b.click(); else send('error', { msg: 'genRetry_missing' }); }, 1500); return;
      }
      if (!s.running && (s.ok === s.N || s.fail)) { clearInterval(iv); fin(s.ok === s.N && !s.fail); }
    }, 3000);
  }
  function fin(ok) {
    if (done) return; done = true; clearInterval(aliveIv); release();
    var s = state(), audio = 0, synth = 0; try { var L = window.__long && window.__long(); if (L) audio = L.fullDur.reduce(function (a, b) { return a + (b || 0); }, 0); } catch (e) { }
    (window.__ondevRes || []).forEach(function (x) { if (x.timing) synth += x.timing.synth_sec; });
    var gen = (Date.now() - tStart) / 1000;
    send('finish', Object.assign({ ok: ok, total_sec: Math.round(gen), audio_sec: Math.round(audio), synth_sec: Math.round(synth), rtf_synth: audio ? Math.round(synth / audio * 100) / 100 : null, rtf_incl_setup: audio ? Math.round(gen / audio * 100) / 100 : null, fallback: fallbackUsed, mem: mem(), log: (window.__ondevLog || []).filter(function (x) { return x.type === 'warn'; }).slice(0, 5) }, s));
    lsSet({ run: RUN, kind: KIND, done: true });
    if (ok) say('聞けます：全部できました。画面を消して、歩きながら聞いて大丈夫です');
    else if (s.ok > 0) say('続きを作れませんでした。できた所までで学習を続けられます');
  }
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'ondevStart') start(); });
  window.__ondevStudyStart = start; window.__ondevText = TEXT;
})();
