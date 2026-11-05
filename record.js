/* A4：PC無しの記録回収。端末内の記録（ondevLog 直近150件・ondevHeal・ondevRun）を1つの短い文字列にして、「共有」または「コピー」で出す。
   AI側は decode_log.py で復元して読む。英文の本文は含まない。歩いた後に1回だけ押す。 */
(function(){
  function g(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}
  async function pack(){
    var p={v:1,at:new Date().toISOString(),ua:navigator.userAgent,standalone:!!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)),coi:self.crossOriginIsolated===true,log:g('ondevLog')||[],heal:g('ondevHeal')||[],run:g('ondevRun'),kind:g('ondevModelKind')};
    var raw=new TextEncoder().encode(JSON.stringify(p)),b;
    if(window.CompressionStream){var cs=new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));b=new Uint8Array(await new Response(cs).arrayBuffer())}else b=raw;
    var s='';for(var i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));
    return (window.CompressionStream?'ONDEVLOG1G:':'ONDEVLOG1R:')+btoa(s);
  }
  window.__ondevExport=pack;
  async function share(btn){
    var t=await pack(),done='';
    try{if(navigator.share){await navigator.share({title:'Listening 記録',text:t});done='共有しました'}}catch(e){if(e&&e.name==='AbortError')return}
    if(!done){try{await navigator.clipboard.writeText(t);done='コピーしました（そのまま貼り付けて渡せます）'}catch(e){}}
    var ta=document.getElementById('ondevRecTa');if(!ta){ta=document.createElement('textarea');ta.id='ondevRecTa';ta.readOnly=true;ta.style.cssText='width:100%;height:60px;margin-top:6px;font-size:11px';btn.parentNode.appendChild(ta)}
    ta.value=t;btn.textContent='記録を共有（'+(done||'下の文字列をコピーしてください')+'）';
  }
  function mount(){var box=document.getElementById('ondevBox');if(!box||document.getElementById('ondevRec'))return !!box&&!!document.getElementById('ondevRec');
    var b=document.createElement('button');b.id='ondevRec';b.type='button';b.textContent='記録を共有（歩いた後に1回）';b.style.cssText='margin-top:8px;width:100%;font-size:14px;padding:8px;border-radius:10px;border:1px solid #bbb;background:#fff';b.addEventListener('click',function(){share(b)});box.appendChild(b);return true}
  var n=0,iv=setInterval(function(){if(mount()||++n>40)clearInterval(iv)},500);
})();
