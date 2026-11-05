(function () { var M = WebAssembly.Memory, L = self.__wmList = []; WebAssembly.Memory = function (d) { var m = new M(d); L.push(m); return m; }; WebAssembly.Memory.prototype = M.prototype; self.__wm = function () { var t = 0; try { L.forEach(function (m) { t += m.buffer.byteLength; }); } catch (e) { } return Math.round(t / 1048576); }; })();
// サーバーなし版：iPhone（ブラウザ）内で音声を作る Worker。
// tts_server.py の generate() と kokoro_onnx の処理を、同じ手順・同じ数値でJSに移したもの。
import * as ort from './ort.wasm.min.mjs';
import { phonemize as esp } from './phonemizer.js';

const SR = 24000;
let sess = null, vocab = null, voice = null, tokName = 'tokens';

// ---------- 読み上げ補正（reading.py の移植） ----------
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const two = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
function yearWords(y) {
  if (y >= 2000 && y <= 2009) return 'two thousand' + (y > 2000 ? ' ' + ONES[y - 2000] : '');
  const hi = Math.floor(y / 100), lo = y % 100;
  if (lo === 0) return two(hi) + ' hundred';
  if (lo < 10) return two(hi) + ' oh ' + ONES[lo];
  return two(hi) + ' ' + two(lo);
}
const MONTHS = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';
export function normalizeForReading(t) {
  t = t.replace(/([$¥])\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g, (m, sym, num) => {
    num = num.replace(/,/g, '');
    if (sym === '¥') return `${num} yen`;
    if (num.includes('.')) {
      let [d, c] = num.split('.', 2); c = (c + '0').slice(0, 2);
      const di = parseInt(d || '0', 10), ci = parseInt(c, 10), parts = [];
      if (di || !ci) parts.push(`${di} dollar` + (di === 1 ? '' : 's'));
      if (ci) parts.push(`${ci} cent` + (ci === 1 ? '' : 's'));
      return parts.join(' and ');
    }
    return `${num} dollar` + (num === '1' ? '' : 's');
  });
  t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (m, h, mm) => { h = +h; mm = +mm; return mm === 0 ? `${h} o'clock` : mm < 10 ? `${h} oh ${mm}` : `${h} ${two(mm)}`; });
  t = t.replace(/\b([ap])\.\s?m\.(?=\s|$|[,;:!?])/gi, (m, a, off, s) => a.toUpperCase() + 'M' + (off + m.length === s.length ? '.' : ''));
  t = t.replace(new RegExp('(' + MONTHS + '(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?,?\\s+)((?:1[1-9]|20)\\d\\d)\\b', 'g'), (m, a, y) => a + yearWords(+y));
  t = t.replace(/\b(in|since|by|until|from|of)\s+((?:1[1-9]|20)\d\d)\b(?![\d,.]\d)/gi, (m, a, y) => a + ' ' + yearWords(+y));
  t = t.replace(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d+)(?![\d.]\d|\d)/g, (m, a, b) => a + ' point ' + b.split('').join(' ')); // 小数（reading.py と同じ）
  t = t.replace(/\bDr\.(?=\s+[A-Z])/g, 'Doctor');
  t = t.replace(/\bMr\.(?=\s+[A-Z])/g, 'Mister');
  return t;
}

// ---------- 音素化（phonemizer の preserve_punctuation=True 相当） ----------
const PUNCT = /(\s*(?:[;:!?¡¿—…"«»“”(){}\[\]]|(?<![0-9])[,.]|[,.](?![0-9]))+\s*)+/g; // phonemizer と同じく、数字に挟まれた , . は句読点扱いしない（1,250 / 2.0）
export async function phonemize(text) {
  text = text.trim(); const parts = []; let last = 0;
  for (const m of text.matchAll(PUNCT)) { if (m.index > last) parts.push([false, text.slice(last, m.index)]); parts.push([true, m[0]]); last = m.index + m[0].length; }
  if (last < text.length) parts.push([false, text.slice(last)]);
  const out = await Promise.all(parts.map(async ([p, s]) => p ? s : (await esp(s, 'en-us')).join(' ')));
  let ph = out.join('');
  ph = ph.replace(/oːɹ/g, 'ɔːɹ'); // espeak-ngのデータ版の差を補正（サーバー側espeak 1.52は story/four/before 等を ɔːɹ と読む。照合結果: tests/ph_7k_cmp.json）
  ph = [...ph].filter(c => c in vocab).join('');
  return ph.trim();
}

// ---------- 推論と無音処理（kokoro_onnx / tts_server.py と同じ値） ----------
function librosaTrim(a, top = 60, fl = 2048, hop = 512) {
  const n = a.length, nf = 1 + Math.floor(n / hop), half = fl / 2, rms = new Float32Array(nf); let mx = 0;
  for (let i = 0; i < nf; i++) { let s = 0; const st = i * hop - half; for (let k = 0; k < fl; k++) { const j = st + k; if (j >= 0 && j < n) s += a[j] * a[j]; } rms[i] = Math.sqrt(s / fl); if (rms[i] > mx) mx = rms[i]; }
  const ref = 20 * Math.log10(Math.max(1e-5, mx)); let f0 = -1, f1 = -1;
  for (let i = 0; i < nf; i++) if (20 * Math.log10(Math.max(1e-5, rms[i])) - ref > -top) { if (f0 < 0) f0 = i; f1 = i; }
  if (f0 < 0) return a.subarray(0, 0);
  return a.subarray(f0 * hop, Math.min(n, (f1 + 1) * hop));
}
async function infer(tokens) {
  const ids = BigInt64Array.from([0, ...tokens, 0].map(BigInt));
  const row = Math.min(tokens.length, 510) - 1, st = voice.subarray(row * 256, row * 256 + 256);
  const feeds = { [tokName]: new ort.Tensor('int64', ids, [1, ids.length]), style: new ort.Tensor('float32', Float32Array.from(st), [1, 256]), speed: new ort.Tensor('float32', Float32Array.from([1]), [1]) };
  const o = await sess.run(feeds); return o[sess.outputNames[0]].data;
}
// kokoro_onnx の chunker（510音素以内に均等分割）を同じ規則で移植
const BOUNDS = [/(?<=[.!?…])\s+/, /(?<=[,;:])\s+/, /\s+/];
function* atoms(ph, max, level = 0) {
  if (ph.length <= max) { if (ph) yield ph; return; }
  for (let i = level; i < BOUNDS.length; i++) { const pcs = ph.split(BOUNDS[i]); if (pcs.length > 1) { for (const p of pcs) yield* atoms(p.trim(), max, i + 1); return; } }
  for (let st = 0; st < ph.length; st += max) yield ph.slice(st, st + max);
}
function pack(lens, lim) { const r = []; let st = 0, size = 0; lens.forEach((l, i) => { const c = i === st ? l : size + 1 + l; if (c > lim && i > st) { r.push([st, i]); st = i; size = l; } else size = c; }); if (lens.length) r.push([st, lens.length]); return r; }
function splitPh(ph, max = 510) { const a = [...atoms(ph.trim(), max)]; if (!a.length) return []; const L = a.map(x => x.length), few = pack(L, max).length; let lo = Math.max(...L), hi = max; while (lo < hi) { const mid = (lo + hi) >> 1; if (pack(L, mid).length <= few) hi = mid; else lo = mid + 1; } return pack(L, lo).map(([s, e]) => a.slice(s, e).join(' ')); }
async function tts(text) {
  let ph = (await phonemize(text)).split(/\s+/).join(' ');
  const batches = splitPh(ph), outs = [];
  if (!batches.length) throw new Error('no_phonemes'); // サーバー（kokoro_onnx）と同じく、読める音のない文はエラー
  for (let i = 0; i < batches.length; i++) {
    const tok = [...batches[i]].map(c => vocab[c]).filter(x => x !== undefined);
    let a = librosaTrim(await infer(tok)); postMessage({ type: 'progress', stage: 'batch' });
    if (i < batches.length - 1) { const m = batches[i].trimEnd().slice(-1), p = '.!?…'.includes(m) ? 0.25 : ',;:'.includes(m) ? 0.1 : 0; if (p) { const b = new Float32Array(a.length + Math.round(p * SR)); b.set(a); a = b; } }
    outs.push(a);
  }
  return cat(outs);
}
const cat = arr => { const n = arr.reduce((s, x) => s + x.length, 0), r = new Float32Array(n); let o = 0; for (const x of arr) { r.set(x, o); o += x.length; } return r; };
const sil = s => new Float32Array(Math.floor(SR * s));
function trim(a, th = 0.01) { let i0 = -1, i1 = -1; for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > th) { if (i0 < 0) i0 = i; i1 = i; } if (i0 < 0) return a; return a.slice(Math.max(0, i0 - Math.floor(0.03 * SR)), Math.min(a.length, i1 + Math.floor(0.05 * SR))); }
function silences(a, win = 0.01, minLen = 0.06, relDb = -35) {
  const n = Math.floor(win * SR), fr = Math.floor(a.length / n); if (fr < 3) return [];
  const rms = new Float64Array(fr); let mx = 0; for (let f = 0; f < fr; f++) { let s = 0; for (let k = 0; k < n; k++) { const v = a[f * n + k]; s += v * v; } rms[f] = Math.sqrt(s / n + 1e-12); if (rms[f] > mx) mx = rms[f]; }
  const q = Array.from(rms, r => 20 * Math.log10(r / (mx + 1e-12)) < relDb), runs = []; let i = 0;
  while (i < fr) { if (q[i]) { let j = i; while (j < fr && q[j]) j++; if ((j - i) * win >= minLen && i > 0 && j < fr) runs.push([(i * n) / SR, (j * n) / SR]); i = j; } else i++; }
  return runs;
}
function fade(a, ms = 10) { const m = Math.floor(SR * ms / 1000), b = a.slice(); if (b.length > 2 * m) for (let i = 0; i < m; i++) { const w = m > 1 ? i / (m - 1) : 1; b[i] *= w; b[b.length - m + i] *= 1 - w; } return b; }
function wavB64(a, gain) { // サーバーはMP3。端末内ではエンコード不要のWAV（16bit）で渡す
  const n = a.length, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf); const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, SR, true); d.setUint32(28, SR * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, a[i] * gain)); d.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s);
}
async function generate(pid, sentences) {
  const t0 = performance.now(), sentAudio = [], commaAudio = [], reading = {}, fb = [], fbflag = [];
  for (let si = 0; si < sentences.length; si++) {
    const parts = sentences[si].parts;
    let rp = normalizeForReading(parts.join('\u2028')).split('\u2028'); let rs = rp.join(' ');
    if (rp.length !== parts.length) { rp = parts.map(normalizeForReading); rs = rp.join(' '); }
    if (rs !== sentences[si].text) reading[si + 1] = rs;
    const a = trim(await tts(rs)), dur = a.length / SR;
    if (parts.length === 1) { sentAudio.push(a); commaAudio.push([a]); fbflag.push(false); postMessage({ type: 'progress', pid, done: si + 1, total: sentences.length, wm_mb: __wm() }); continue; }
    const lens = []; for (const x of rp) lens.push(Math.max(1, (await phonemize(x)).length));
    const runs = silences(a), tol = Math.max(0.2, 0.15 * dur);
    const match = cum => { const pairs = []; cum.forEach((b, bi) => runs.forEach((r, ri) => pairs.push([Math.abs((r[0] + r[1]) / 2 - b), bi, ri]))); pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]); const acc = {}, used = new Set(); for (const [d, bi, ri] of pairs) { if (d > tol || bi in acc || used.has(ri)) continue; acc[bi] = (runs[ri][0] + runs[ri][1]) / 2; used.add(ri); } let last = -1; for (const bi of Object.keys(acc).map(Number).sort((x, y) => x - y)) { if (acc[bi] <= last) delete acc[bi]; else last = acc[bi]; } return acc; };
    const cumOf = ls => { const tot = ls.reduce((x, y) => x + y, 0); let c = 0; return ls.slice(0, -1).map(l => (c += l) / tot * dur); };
    let acc = match(cumOf(lens)), partAudio = null;
    if (Object.keys(acc).length < parts.length - 1) { partAudio = []; for (const x of rp) partAudio.push(trim(await tts(x))); acc = match(cumOf(partAudio.map(x => x.length / SR))); }
    const keys = Object.keys(acc).map(Number).sort((x, y) => x - y), bounds = [0, ...keys.map(bi => Math.floor(acc[bi] * SR)), a.length];
    const groups = []; let g = [0]; for (let bi = 0; bi < parts.length - 1; bi++) { if (bi in acc) { groups.push(g); g = [bi + 1]; } else g.push(bi + 1); } groups.push(g);
    const chunks = []; groups.forEach((gg, gi) => { if (gg.length === 1) chunks.push(a.slice(bounds[gi], bounds[gi + 1])); else for (const pi of gg) { chunks.push(partAudio[pi]); fb.push({ sentence: si + 1, chunk_in_sentence: pi + 1, text: parts[pi] }); } });
    for (let pi = 0; pi < parts.length; pi++) fbflag.push(fb.some(f => f.sentence === si + 1 && f.chunk_in_sentence === pi + 1));
    sentAudio.push(a); commaAudio.push(chunks);
    postMessage({ type: 'progress', pid, done: si + 1, total: sentences.length, wm_mb: __wm() });
  }
  const tSynth = (performance.now() - t0) / 1000;
  const allw = cat(sentAudio.map(x => cat([x, sil(0.45)])));
  let ss = 0, pk = 0; for (const v of allw) { ss += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
  const rms = Math.sqrt(ss / allw.length) + 1e-9, gain = Math.min(0.112 / rms, 0.89 / (pk + 1e-9));
  const files = {}, durs = {}, pad = i => String(i).padStart(2, '0');
  const put = (x, k) => { postMessage({ type: 'progress', pid, stage: 'encode' }); files[k] = wavB64(x, gain); durs[k] = Math.round(x.length / SR * 1000) / 1000; };
  let n = 0; for (const sl of commaAudio) for (const x of sl) { n++; put(cat([fade(x), sil(0.25)]), `${pid}_c_${pad(n)}`); }
  for (const [unit, size] of [['s1', 1], ['s2', 2], ['s3', 3]]) for (let gi = 0; gi < sentAudio.length; gi += size) put(cat(sentAudio.slice(gi, gi + size).map(x => cat([x, sil(0.45)]))), `${pid}_${unit}_${pad(gi / size + 1)}`);
  put(allw, `${pid}_full`);
  const offs = [0]; for (let i = 0; i < sentAudio.length - 1; i++) offs.push(Math.round((offs.at(-1) + durs[`${pid}_s1_${pad(i + 1)}`]) * 1000) / 1000);
  return { pid, files, durations: durs, fullOffsets: offs, reading, fallback: fb, chunk_fallback: fbflag, mime: 'audio/wav', timing: { total_sec: (performance.now() - t0) / 1000, synth_sec: tSynth, audio_sec: Math.round(allw.length / SR * 100) / 100 } };
}

let ready = null;
async function init(cfg) {
  self.__test = !!cfg.test;
  try { await caches.delete('ondev-model-v1'); } catch (e) { }
  ort.env.wasm.numThreads = cfg.threads || Math.min(4, navigator.hardwareConcurrency || 1);
  ort.env.wasm.wasmPaths = cfg.base || './';
  const t0 = performance.now();
  const [m, v, vb] = await Promise.all([
    getModel(cfg.model),
    fetch(cfg.base + 'vocab.json').then(r => r.json()),
    fetch(cfg.base + 'af_heart.f32').then(r => r.arrayBuffer())]);
  vocab = v; voice = new Float32Array(vb);
  postMessage({ type: 'progress', stage: 'session', wm_mb: __wm() });
  sess = await ort.InferenceSession.create(m, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  tokName = sess.inputNames.includes('input_ids') ? 'input_ids' : 'tokens';
  return { load_sec: (performance.now() - t0) / 1000, threads: ort.env.wasm.numThreads, model: modelInfo, coi: self.crossOriginIsolated === true };
}
// モデルは初回だけダウンロードし、Cache Storage に保存（2回目以降は通信なし）。
// model.json（分割配信）なら、部品ごとに長さを確かめて保存し、全体の大きさの領域へ直接詰める（325MBを二重に持たない）
let modelInfo = {};
async function getModel(url) {
  if (/\.json(\?|$)/.test(url)) return getModelParts(url);  // model.json（fp32）／model.json?m=int8（軽い版）
  let c = null; try { c = await caches.open('ondev-model-v2'); const hit = await c.match(url); if (hit) { modelInfo = { source: 'cache' }; return new Uint8Array(await hit.arrayBuffer()); } } catch (e) { }
  const r = await fetch(url); if (!r.ok) throw new Error('model_http_' + r.status);
  const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), chunks = []; let got = 0, lastPost = 0;
  for (; ;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; if (performance.now() - lastPost > 300) { lastPost = performance.now(); postMessage({ type: 'download', got, total }); } }
  const buf = new Uint8Array(got); let o = 0; for (const x of chunks) { buf.set(x, o); o += x.length; }
  if (total && !r.headers.get('content-encoding') && got !== total) throw new Error('model_incomplete'); // 途中で切れたモデルは保存しない
  if (c) try { await c.put(url, new Response(buf)); } catch (e) { postMessage({ type: 'warn', msg: 'cache_put_failed' }); }
  modelInfo = { source: 'network' };
  return buf;
}
async function getModelParts(url) {
  const base = url.split('?')[0].replace(/[^/]*$/, ''), kind = (/model_([a-z0-9]+)\.json/.exec(url) || [0, 'fp32'])[1];
  // 部品の一覧：取れなければ前回保存した一覧を使う（電波がなくても2回目以降は起動できる）
  let info = null, meta = null;
  try { meta = await caches.open('ondev-meta'); } catch (e) { }
  try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('model_info_http_' + r.status); info = await r.json(); } catch (e) {
    if (meta) try { const hit = await meta.match('model-info-' + kind); if (hit) info = await hit.json(); } catch (e2) { }
    if (!info) throw e;
  }
  const name = 'ondev-model-' + info.ver; let c = null;
  try { c = await caches.open(name); } catch (e) { }
  const buf = new Uint8Array(info.size); let got = 0, net = 0, lastPost = 0; const t0 = performance.now();
  for (let i = 0; i < info.n; i++) {
    const len = Math.min(info.part, info.size - i * info.part), pu = base + 'model/' + kind + '/' + i + '?v=' + info.ver;
    let ab = null;
    if (c) try { const hit = await c.match(pu); if (hit) { ab = new Uint8Array(await hit.arrayBuffer()); if (ab.length !== len) ab = null; } } catch (e) { ab = null; }
    if (!ab) {
      let err = null;
      for (let t = 0; t < 3 && !ab; t++) {   // 部品ごとに3回まで取り直す（一時的な切断で最初からやり直さない）
        try {
          const r = await fetch(pu); if (!r.ok) throw new Error('model_http_' + r.status);
          const rd = r.body.getReader(), cs = []; let g = 0;
          for (; ;) { const { done, value } = await rd.read(); if (done) break; cs.push(value); g += value.length; if (performance.now() - lastPost > 300) { lastPost = performance.now(); postMessage({ type: 'download', got: got + g, total: info.size }); } }
          if (g !== len) throw new Error('model_incomplete');
          ab = new Uint8Array(len); let o = 0; for (const x of cs) { ab.set(x, o); o += x.length; }
          net += len;
          if (c) try { await c.put(pu, new Response(ab)); } catch (e) { postMessage({ type: 'warn', msg: 'cache_put_failed' }); }
        } catch (e) { err = e; ab = null; }
      }
      if (!ab) throw err || new Error('model_failed');
    }
    buf.set(ab, i * info.part); got += len;
    postMessage({ type: 'download', got, total: info.size });
  }
  // 全部そろってから：一覧を保存し、古い版のモデルを消す（途中で失敗しても手元のモデルを失わない）
  if (meta) try { await meta.put('model-info-' + kind, new Response(JSON.stringify(info))); } catch (e) { }
  try { for (const k of await caches.keys()) if (k.startsWith('ondev-model-') && k !== name) await caches.delete(k); } catch (e) { }
  modelInfo = { kind, source: net ? (net === info.size ? 'network' : 'partial') : 'cache', net_bytes: net, sec: (performance.now() - t0) / 1000, ver: info.ver };
  return buf;
}
onmessage = async e => {
  const { id, type } = e.data;
  try {
    if (type === 'init') { ready = ready || init(e.data.cfg).catch(err => { ready = null; throw err; }); postMessage({ id, ok: true, res: await ready }); }
    else if (type === 'generate') { await ready; postMessage({ id, ok: true, res: await generate(e.data.pid, e.data.sentences) }); }
    else if (type === 'normph') { await ready; const n = normalizeForReading(e.data.text); postMessage({ id, ok: true, res: { norm: n, ph: (await phonemize(n)).split(/\s+/).join(' ') } }); }
    else if (type === '__testhang' && self.__test) { const t = Date.now(); while (Date.now() - t < 600000) { } } // 試験用：Workerの停止（強制終了で無反応になった状態）を再現
    else if (type === 'phonemize') { await ready; postMessage({ id, ok: true, res: await phonemize(e.data.text) }); }
  } catch (err) { postMessage({ id, ok: false, error: String(err && err.message || err) }); }
};
