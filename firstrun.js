/* A5：初回はint8（約92MB）で先に始める。ondev_study.js が読む前に、保存値が無ければ int8 を既定にする。
   高音質版(fp32・約326MB)への切替は、聞き比べで決めた後に window.__ondevSetQuality('fp32') で行う（自動では切り替えない）。URLの ?model= は常に優先。 */
(function(){
  try{
    if(localStorage.getItem('ondevModelKind')===null){localStorage.setItem('ondevModelKind',JSON.stringify('int8'));localStorage.setItem('ondevFirstPolicy','int8-first')}
  }catch(e){}
  window.__ondevSetQuality=function(k){if(k!=='int8'&&k!=='fp32')return false;try{localStorage.setItem('ondevModelKind',JSON.stringify(k));localStorage.setItem('ondevFirstPolicy','chosen:'+k);return true}catch(e){return false}};
})();
