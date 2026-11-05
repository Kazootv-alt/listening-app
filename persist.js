/* A3：永続保存の要求と、消えた時の自動再取得（ユーザー操作なし）。 */
(function(){
  function log(t,d){try{(window.__ondevSend||function(){})(t,d||{})}catch(e){}try{var a=JSON.parse(localStorage.getItem('ondevHeal')||'[]');a.push(Object.assign({t:Date.now(),type:t},d||{}));localStorage.setItem('ondevHeal',JSON.stringify(a.slice(-30)))}catch(e){}}
  async function persist(){
    var o={supported:!!(navigator.storage&&navigator.storage.persist)};
    try{if(o.supported){o.was=await navigator.storage.persisted();o.granted=o.was||await navigator.storage.persist()}}catch(e){o.err=String(e).slice(0,80)}
    try{var e=await navigator.storage.estimate();o.usage_mb=Math.round(e.usage/1e6);o.quota_mb=Math.round(e.quota/1e6)}catch(e2){}
    log('persist',o);return o;
  }
  async function heal(){
    if(!self.caches||navigator.onLine===false)return;
    await healKind('int8');await healKind('fp32');
  }
  async function healKind(kind){
    var out={kind:kind,fixed:0,missing:0};
    try{
      var meta=await caches.open('ondev-meta'),hit=await meta.match('model-info-'+kind);
      if(!hit){return}                                    // 一度も取り込んでいない：何もしない（取り込みは「学習開始」）
      var info=await hit.json(),c=await caches.open('ondev-model-'+info.ver);
      for(var i=0;i<info.n;i++){
        var u='model/'+kind+'/'+i+'?v='+info.ver,len=Math.min(info.part,info.size-i*info.part),ok=false;
        var m=await c.match(u);if(m){var b=await m.arrayBuffer();ok=b.byteLength===len}
        if(ok)continue;out.missing++;
        var r=await fetch(u);if(!r.ok)throw new Error('http_'+r.status);var ab=await r.arrayBuffer();
        if(ab.byteLength!==len)throw new Error('incomplete');
        await c.put(u,new Response(ab));out.fixed++;
      }
    }catch(e){out.err=String(e&&e.message||e).slice(0,80)}
    if(out.missing||out.err)log('heal',out);
  }
  window.addEventListener('load',function(){setTimeout(function(){persist().then(function(){return heal()})},1500)});
  window.__ondevHeal=heal;
})();
