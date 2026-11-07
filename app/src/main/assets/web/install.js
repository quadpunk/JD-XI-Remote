(()=>{
/* "Install app" button: Android/desktop Chrome show the native install prompt; iOS has no prompt, so we explain Share > Add to Home Screen. */
const btn=document.getElementById('install-btn'),tip=document.getElementById('install-tip');
if(!btn)return;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(standalone()){btn.hidden=true;return}
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
 navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
let deferred=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});
window.addEventListener('appinstalled',()=>{btn.hidden=true;tip.hidden=true;deferred=null});
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const show=html=>{tip.innerHTML=html;tip.hidden=false};
btn.addEventListener('click',async()=>{
 if(!tip.hidden){tip.hidden=true;return}
 if(deferred){deferred.prompt();try{await deferred.userChoice}catch{}deferred=null;return}
 if(ios){
  show('<b>iPhone / iPad:</b> open this page in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.<br><small>Note: iOS browsers do not support Web MIDI, so the app will open but cannot talk to the JD-Xi.</small>');
 }else if(location.protocol==='file:'){
  show('Installing needs the page to be served over <b>https</b> (or localhost), not opened as a local file.');
 }else{
  show('<b>Android:</b> open the browser menu (⋮) and choose <b>Install app</b> / <b>Add to Home screen</b>. If the option is missing, reload the page once and try again.');
 }
});
document.addEventListener('click',e=>{if(!tip.hidden&&!tip.contains(e.target)&&e.target!==btn)tip.hidden=true});
})();
