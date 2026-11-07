/* Web MIDI for the Android WebView: implements navigator.requestMIDIAccess on top of the native bridge
   (window.AndroidMidi, provided by MainActivity). Only active inside the Android app. */
(()=>{
const B=window.AndroidMidi;if(!B)return;
const hex=a=>{let s='';for(let i=0;i<a.length;i++){const v=a[i]&255;s+=(v<16?'0':'')+v.toString(16)}return s};
const unhex=h=>{const n=h.length>>1,a=new Uint8Array(n);for(let i=0;i<n;i++)a[i]=parseInt(h.substr(i*2,2),16);return a};
const inputs=new Map(),outputs=new Map();
let access=null;
class Port{
 constructor(i,type){this.id=i.id;this.name=i.name;this.manufacturer=i.manufacturer||'';this.version='';this.type=type;
  this.state='connected';this.connection='closed';this.onstatechange=null;this._l=[]}
 async open(){if(this.connection!=='open'){if(!B.open(this.id))throw new DOMException('Port busy','InvalidStateError');this.connection='open';this._fire()}return this}
 async close(){if(this.connection==='open'){B.close(this.id);this.connection='closed';this._fire()}return this}
 addEventListener(t,f){if(t==='statechange')this._l.push(f)}removeEventListener(t,f){this._l=this._l.filter(x=>x!==f)}
 _fire(){const ev={port:this,target:this,type:'statechange'};try{this.onstatechange?.(ev)}catch{}this._l.forEach(f=>{try{f(ev)}catch{}})}
}
class Output extends Port{
 constructor(i){super(i,'output')}
 send(data,ts){
  if(this.state!=='connected')throw new DOMException('Disconnected','InvalidStateError');
  const a=data instanceof Uint8Array?data:Uint8Array.from(data);
  const delay=ts&&ts>performance.now()?Math.min(ts-performance.now(),5000):0;
  B.send(this.id,hex(a),delay);
 }
 clear(){}
}
class Input extends Port{
 constructor(i){super(i,'input');this._h=null}
 get onmidimessage(){return this._h}
 set onmidimessage(f){this._h=f;if(f&&this.connection!=='open')this.open().catch(()=>{})}
}
function fire(p){const ev={port:p,target:access,type:'statechange'};try{access?.onstatechange?.(ev)}catch{}p._fire()}
function sync(){
 let list=[];try{list=JSON.parse(B.ports())}catch{}
 const seen=new Set();
 for(const i of list){
  seen.add(i.id);const map=i.type==='input'?inputs:outputs;let p=map.get(i.id);
  if(!p){p=i.type==='input'?new Input(i):new Output(i);map.set(i.id,p);if(access)fire(p)}
  else if(p.state!=='connected'){p.state='connected';fire(p)}
 }
 for(const map of [inputs,outputs])for(const p of map.values())if(!seen.has(p.id)&&p.state==='connected'){p.state='disconnected';p.connection='closed';fire(p)}
}
/* called by native code */
window.__jdxiMidiIn=(id,h)=>{
 const p=inputs.get(id);if(!p||!p._h)return;
 try{p._h({data:unhex(h),target:p,timeStamp:performance.now(),type:'midimessage'})}catch(e){console.error(e)}
};
window.__jdxiMidiPorts=()=>sync();
navigator.requestMIDIAccess=async opts=>{
 sync();
 access={inputs,outputs,sysexEnabled:true,onstatechange:null,addEventListener(){},removeEventListener(){}};
 return access;
};
/* assets ship inside the APK, so no service worker/cache is needed (and it would only risk stale files after updates) */
try{ServiceWorkerContainer.prototype.register=()=>Promise.reject(new Error('disabled in the Android app'))}catch{}
try{const q=navigator.permissions?.query?.bind(navigator.permissions);
 if(q)navigator.permissions.query=d=>d&&d.name==='midi'?Promise.resolve({state:'granted',onchange:null}):q(d)}catch{}
/* <a download> + blob: URLs do nothing in a WebView: read the blob and let the app save it to Downloads */
document.addEventListener('click',e=>{
 const a=e.target&&e.target.closest?e.target.closest('a[download]'):null;
 if(!a||!a.href)return;
 e.preventDefault();e.stopPropagation();
 const name=a.download||a.getAttribute('download')||'file';
 fetch(a.href).then(r=>r.blob()).then(b=>new Promise(res=>{const fr=new FileReader();fr.onload=()=>res([String(fr.result).split(',')[1]||'',b.type]);fr.readAsDataURL(b)}))
  .then(([b64,type])=>{if(!B.saveFile(name,b64,type||'application/octet-stream'))alert('Could not save '+name)})
  .catch(err=>alert('Could not save '+name+': '+err.message));
},true);

/* The "Step sequencer" tab is replaced by the native sequencer: when it is chosen the page collapses to header + tab strip
   and tells the app how tall that is; the app then shows its own sequencer underneath. */
(()=>{
const st=document.createElement('style');
st.textContent='body.native-seq main,body.native-seq footer,body.native-seq #mixer,body.native-seq #viz:not(.full){display:none!important}body.native-seq{min-height:0!important;overflow:hidden}#install-btn,#install-tip{display:none!important}';
document.documentElement.appendChild(st);
function report(page){
 const body=document.body;
 if(page!=='sequencer'){body.classList.remove('native-seq');B.pageChanged(page,0);return}
 body.classList.add('native-seq');window.scrollTo(0,0);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const nav=document.getElementById('nav');
  B.pageChanged('sequencer',Math.ceil(nav.getBoundingClientRect().bottom)+2);
 }));
}
document.addEventListener('click',e=>{
 const b=e.target&&e.target.closest?e.target.closest('#nav button[data-page]'):null;
 if(b)report(b.dataset.page);
},true);
/* the top area was hidden/shown while the native sequencer is open: re-measure the strip */
window.addEventListener('jdxi-layout',()=>{if(document.body.classList.contains('native-seq'))report('sequencer')});
/* used by the native back button */
window.__jdxiShowPage=page=>{const b=document.querySelector('#nav button[data-page="'+page+'"]');if(b)b.click()};
})();

/* tell the app which Appearance theme is active so the native sequencer uses the same colours */
(()=>{
const send=()=>{try{B.setTheme(document.documentElement.dataset.theme||'droid')}catch{}};
send();
new MutationObserver(send).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
document.addEventListener('DOMContentLoaded',send);
})();
})();
