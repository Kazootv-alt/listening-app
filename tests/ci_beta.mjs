// ベータ版の自動テスト（GitHub Actions で毎回動く）。失敗があれば終了コード1。
// 音声の生成（数分かかる）は行わず、同梱の見本の英文と、画面の操作・読み込みだけを確かめる。
// 使い方：node tests/ci_beta.mjs http://127.0.0.1:8901/   （tests/serve_range.py で配信しておく）
const { chromium } = await import(process.env.PW || 'playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ok = [], ng = [];
const check = (name, cond, info) => { (cond ? ok : ng).push(name + (cond ? '' : '  → ' + JSON.stringify(info))); };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + 'app.html'); await p.waitForFunction(() => window.__core && document.getElementById('unit'), null, { timeout: 30000 }); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const c = document.querySelector('#view .cur'), all = [...document.querySelectorAll('#view .ch, #view [data-i]')]; return { mode: document.querySelector('#modeSeg button.on')?.dataset.v, unit: document.getElementById('unit').value, cur: c?.textContent?.slice(0, 50) || '', idx: c ? all.indexOf(c) : -1, status: document.getElementById('status').textContent, t: +window.__core.au.currentTime.toFixed(1), paused: window.__core.au.paused }; });
const no = x => +((x.status.match(/区切り (\d+) \//) || [])[1] || 0);
const setUnit = v => p.evaluate(v => { const u = document.getElementById('unit'); u.value = v; u.dispatchEvent(new Event('change')); }, v);
// 1 操作ボタンが画面の下に固定されている（スクロールせずに押せる）
const f = await p.evaluate(() => { const e = document.getElementById('ctl'), r = e.getBoundingClientRect(); return { pos: getComputedStyle(e).position, bottom: Math.round(r.bottom), vh: innerHeight }; });
check('操作ボタンが下に固定', f.pos === 'sticky' && f.bottom <= f.vh, f);
// 2 区切り学習：次へで進む
await p.evaluate(() => document.querySelector('#modeSeg button[data-v="chunk"]').click()); await setUnit('comma');
await p.tap('#bRep'); await p.waitForTimeout(800);
for (let i = 0; i < 6; i++) { await p.tap('#bNext'); await p.waitForTimeout(250); }
await p.waitForTimeout(600); const a = await st();
check('次へで区切りが進む', no(a) === 7, a);
// 3 設定を変えても最初に戻らず、続きから
await setUnit('1'); await p.waitForTimeout(800); const u1 = await st();
check('単位を変えても続きから（最初に戻らない）', u1.unit === '1' && no(u1) > 1 && a.cur.slice(0, 20).split(' ').some(w => w.length > 3 && u1.cur.includes(w)), { a, u1 });
await p.evaluate(() => document.querySelector('#modeSeg button[data-v="full"]').click()); await p.waitForTimeout(1500); const fu = await st();
check('全文に切り替えても続きの位置から', fu.mode === 'full' && fu.t > 0, fu);
await p.evaluate(() => document.querySelector('#modeSeg button[data-v="chunk"]').click()); await p.waitForTimeout(800); const bc = await st();
check('区切り学習に戻しても続きから', bc.mode === 'chunk' && no(bc) > 1, bc);
// 4 イヤホン：1回タップ（再生/停止の信号）＝今の区切りをもう一度、2回タップ（次の曲）＝次へ
await p.evaluate(() => window.__core.au.pause()); const before = (await st()).cur;
await p.evaluate(() => window.__appRemote('pause')); await p.waitForTimeout(500); const rp = await st();
check('イヤホン1回タップ＝今の区切りをもう一度', rp.cur === before && !rp.paused, { before, rp });
await p.evaluate(() => window.__appRemote('nexttrack')); await p.waitForTimeout(500); const rn = await st();
check('イヤホン2回タップ＝次へ', rn.cur && rn.cur !== before, { before, rn });
// 5 テキスト（UTF-8・BOM付き・Shift_JIS）と PDF の読み込み
const accept = await p.getAttribute('#pdfFile2', 'accept');
check('読み込みで .txt を選べる', /\.txt/.test(accept) && /pdf/.test(accept), accept);
for (const fx of ['utf8', 'bom', 'sjis']) {
  await p.setInputFiles('#pdfFile2', `tests/fixtures/${fx}.txt`); await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ ta: document.getElementById('inTa').value, msg: document.getElementById('pdfMsg2').textContent }));
  check(`テキスト読み込み（${fx}）`, r.ta.length > 10 && !r.ta.includes('�') && !r.ta.startsWith('﻿') && !r.ta.includes('\r'), r);
}
await p.evaluate(() => document.getElementById('pdfSample').click());
await p.waitForFunction(() => /入れました|開けません/.test(document.getElementById('pdfMsg2').textContent), null, { timeout: 60000 }).catch(() => { });
const pm = await p.textContent('#pdfMsg2');
check('見本PDFの読み込み', /入れました/.test(pm), pm);
// 6 待ち画面の部品がある
check('待ち画面の部品あり', await p.evaluate(() => !!document.getElementById('uxWait')), null);
check('画面のエラーなし', errs.length === 0, errs);
await b.close();
console.log('合格 ' + ok.length + '件\n' + ok.map(x => '  ✓ ' + x).join('\n'));
if (ng.length) { console.log('不合格 ' + ng.length + '件\n' + ng.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
