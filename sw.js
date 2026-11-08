/* Listening PWA：アプリ殻をCache Storageに保存（オフライン起動）＋ COOP/COEP を付与（ヘッダを付けられない静的配信用）。
   SHELL の名前は build_site.py が殻ファイルの内容から自動で決める（殻が変わると名前が変わり、新しい殻が入って古い殻は消える）。 */
const SHELL='shell-0403646257d4';
const FILES=['./','app.html','persist.js','record.js','firstrun.js','manifest.webmanifest','icon-180.png','icon-512.png','ondev_study.js','ondev_worker.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort.wasm.min.mjs','phonemizer.js','vocab.json','af_heart.f32'];
const fresh=()=>FILES.map(f=>new Request(f,{cache:'reload'}));   // 殻の取得は、ブラウザのHTTPキャッシュを使わず常に最新を取る
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(SHELL).then(c=>c.addAll(fresh())))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('shell-')&&k!==SHELL)await caches.delete(k);await self.clients.claim()})())});
function iso(r){if(!r||r.status===0||r.type==='opaque'||r.type==='opaqueredirect')return r;const h=new Headers(r.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Resource-Policy','same-origin');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith((async()=>{
  const shell=await caches.open(SHELL);
  if(e.request.mode==='navigate'&&navigator.onLine!==false)e.waitUntil((async()=>{const have=(await shell.keys()).length;if(have<FILES.length)await shell.addAll(fresh()).catch(()=>{})})()); // 殻がブラウザに消されていたら、ページを開いた時に自動で全部入れ直す
  const hit=await shell.match(e.request,{ignoreSearch:true});
  if(hit)return iso(hit);                       // アプリ殻：キャッシュ優先（ネット不要）
  try{return iso(await fetch(e.request))}catch(err){const c=await caches.match(e.request,{ignoreSearch:u.pathname.includes('/model/')?false:true});if(c)return iso(c);throw err}
 })())});
