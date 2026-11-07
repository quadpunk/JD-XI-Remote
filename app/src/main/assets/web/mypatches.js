(()=>{
/* "My patches": save the sound that is active on the JD-Xi (every parameter of the temporary tone, read over SysEx),
   favourite / rename / delete it, load it back later, and export/import patches as JSON or as a .syx file.
   Stored in this browser (localStorage); export is the backup. Digital 1/2: Common + 3 Partials + Modify block,
   Analog: one block (Roland JD-Xi MIDI Implementation: 19 01 00 00 / 19 21 00 00 / 19 42 00 00). */
const $=id=>document.getElementById(id);
const api=()=>window.JDXiPerformance;
const KEY='jdxi-user-patches-v1';
const PARTS={digital1:'Digital 1',digital2:'Digital 2',analog:'Analog'};
const BLOCKS=part=>part==='analog'?[[0,0x40]]:[[0,0x40],[0x2000,0x3d],[0x2100,0x3d],[0x2200,0x3d],[0x5000,0x25]];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const status=(t,err)=>{const el=$('upstatus');el.textContent=t;el.classList.toggle('error',!!err)};
let busy=false;

/* ---- storage ---- */
let patches=[];
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');patches=Array.isArray(v)?v.filter(valid):[]}catch{patches=[]}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(patches));return true}catch{status('Could not save in this browser (storage full or blocked). Use Export to keep your patches.',true);return false}}
function valid(p){
 if(!p||typeof p.name!=='string'||!PARTS[p.part]||!Array.isArray(p.blocks))return false;
 const want=BLOCKS(p.part);
 return want.every(([off,len])=>{const b=p.blocks.find(x=>x.off===off);return b&&Array.isArray(b.bytes)&&b.bytes.length===len&&b.bytes.every(v=>Number.isInteger(v)&&v>=0&&v<=127)});
}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const toneName=bytes=>bytes.slice(0,12).map(v=>v>=32&&v<127?String.fromCharCode(v):' ').join('').trim();

/* ---- reading / writing a whole tone ---- */
async function readTone(part){
 const a=api(),base=a.bases[part],blocks=BLOCKS(part);
 for(const [off,len] of blocks)for(let i=0;i<len;i++)a.readback().delete(base+off+i);
 for(const [off,len] of blocks){if(!a.rq1(base+off,len))throw Error('MIDI send failed');await wait(90)}
 await wait(500);
 const out=[];let got=0,total=0;
 for(const [off,len] of blocks){const bytes=[];for(let i=0;i<len;i++){const v=a.readback().get(base+off+i);total++;if(v!==undefined){got++;bytes.push(v)}else bytes.push(null)}out.push({off,bytes})}
 if(got!==total)throw Error('The JD-Xi answered only '+got+' of '+total+' bytes. Try again (is the right MIDI input selected?).');
 return out;
}
async function writeTone(p,target){
 const a=api(),base=a.bases[target];
 for(const b of p.blocks){
  for(let i=0;i<b.bytes.length;i+=0x40){
   if(!a.dt1(base+b.off+i,b.bytes.slice(i,i+0x40)))throw Error('MIDI send failed (is the output still connected?)');
   await wait(30);
  }
 }
}
function need(){
 const a=api();
 if(!a?.connected()){status('Connect MIDI first.',true);return false}
 if(!a.hasSysex()){status('SysEx permission was not granted: allow MIDI + SysEx for this site, reload and reconnect.',true);return false}
 return true;
}

/* ---- actions ---- */
async function saveCurrent(){
 if(busy||!need())return;
 if(!api().hasInput()){status('Saving needs a MIDI input to read the sound back: select the JD-Xi input and connect again.',true);return}
 const part=$('uppart').value;busy=true;$('upsave').disabled=true;
 try{
  status('Reading the active sound of '+PARTS[part]+'…');
  const blocks=await readTone(part);
  const typed=$('upname').value.trim(),name=(typed||toneName(blocks[0].bytes)||'Untitled').slice(0,40);
  const lp=api().lastPatch(part);
  const p={id:uid(),name,part,fav:false,created:Date.now(),base:lp?{num:lp.num,name:lp.name}:null,blocks};
  patches.unshift(p);if(persist()){$('upname').value='';status('Saved "'+name+'" ('+PARTS[part]+', '+blocks.reduce((s,b)=>s+b.bytes.length,0)+' parameter bytes).')}else patches.shift();
  render();
 }catch(e){status('Save failed: '+e.message,true)}
 finally{busy=false;$('upsave').disabled=false}
}
async function loadPatch(p){
 if(busy||!need())return;
 const sel=$('uptarget').value,target=p.part==='analog'?'analog':(sel==='same'?p.part:sel);
 busy=true;
 try{
  status('Loading "'+p.name+'" into '+PARTS[target]+'…');
  await writeTone(p,target);
  let msg='Loaded "'+p.name+'" into '+PARTS[target]+'.';
  if(api().hasInput()){
   await wait(150);
   const base=api().bases[target],a=api();
   for(const b of p.blocks)for(let i=0;i<b.bytes.length;i++)a.readback().delete(base+b.off+i);
   for(const b of p.blocks){a.rq1(base+b.off,b.bytes.length);await wait(90)}
   await wait(450);
   let ok=0,got=0;for(const b of p.blocks)b.bytes.forEach((v,i)=>{const r=a.readback().get(base+b.off+i);if(r!==undefined){got++;if(r===v)ok++}});
   msg+=got?' JD-Xi confirms '+ok+' of '+got+' values read back.':' (no read-back received)';
  }
  api().clearLastPatch(target);api().refreshOverview(target);
  status(msg);
 }catch(e){status('Load failed: '+e.message,true)}
 finally{busy=false}
}
function rename(p){const n=prompt('Patch name',p.name);if(n==null)return;const t=n.trim().slice(0,40);if(!t)return;p.name=t;persist();render()}
function remove(p){if(!confirm('Delete "'+p.name+'"? Export it first if you want a backup.'))return;patches=patches.filter(x=>x!==p);persist();render()}
function toggleFav(p){p.fav=!p.fav;persist();render()}

/* ---- export / import ---- */
function download(name,data,type){
 const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
const safe=s=>s.replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'')||'patch';
function exportJson(list,label){
 if(!list.length){status('Nothing to export.',true);return}
 download('jdxi-patches-'+label+'.json',JSON.stringify({format:'jdxi-web-patches',version:1,exported:new Date().toISOString(),patches:list},null,1),'application/json');
 status('Exported '+list.length+' patch'+(list.length>1?'es':'')+' as JSON.');
}
function exportSyx(p){
 const id=api().deviceId(),base=api().bases[p.part],bytes=[];
 for(const b of p.blocks)for(let i=0;i<b.bytes.length;i+=0x40){
  const addr=base+b.off+i,a=[(addr>>>24)&127,(addr>>>16)&127,(addr>>>8)&127,addr&127],data=b.bytes.slice(i,i+0x40);
  const cs=(128-([...a,...data].reduce((x,y)=>x+y,0)%128))%128;
  bytes.push(0xf0,0x41,id,0,0,0,0x0e,0x12,...a,...data,cs,0xf7);
 }
 download(safe(p.name)+'-'+p.part+'.syx',new Uint8Array(bytes),'application/octet-stream');
 status('Exported "'+p.name+'" as .syx (DT1 messages for the temporary tone of '+PARTS[p.part]+').');
}
async function importJson(file){
 try{
  if(file.size>4*1024*1024)throw Error('File too large');
  const d=JSON.parse(await file.text());
  if(!d||d.format!=='jdxi-web-patches'||!Array.isArray(d.patches))throw Error('Not a patch export from this app');
  let n=0,bad=0;
  for(const q of d.patches){
   const p={id:uid(),name:String(q.name||'Imported').trim().slice(0,40)||'Imported',part:q.part,fav:!!q.fav,created:Number(q.created)||Date.now(),
    base:q.base&&typeof q.base.name==='string'?{num:+q.base.num||0,name:q.base.name.slice(0,40)}:null,blocks:q.blocks};
   if(valid(p)){patches.push(p);n++}else bad++;
  }
  persist();render();status('Imported '+n+' patch'+(n===1?'':'es')+(bad?' ('+bad+' invalid skipped)':'')+'.',n===0);
 }catch(e){status('Import failed: '+e.message,true)}
}

/* ---- list ---- */
function render(){
 const box=$('uplist');box.replaceChildren();
 const q=$('upsearch').value.trim().toLowerCase(),pf=$('upfilter').value,fo=$('upfavs').checked;
 const list=patches.filter(p=>(pf==='all'||p.part===pf)&&(!fo||p.fav)&&(!q||(p.name+' '+(p.base?.name||'')+' '+PARTS[p.part]).toLowerCase().includes(q)))
  .sort((a,b)=>(b.fav-a.fav)||(b.created-a.created));
 $('upcount').textContent=patches.length?list.length+' of '+patches.length+' patches':'';
 if(!list.length){const e=document.createElement('p');e.textContent=patches.length?'No patches match the filter.':'No saved patches yet. Shape a sound on the JD-Xi or in the editor above, then press "Save current sound".';box.append(e);return}
 for(const p of list){
  const row=document.createElement('div');row.className='paramcard upitem';
  const star=document.createElement('button');star.type='button';star.className='upstar'+(p.fav?' on':'');star.textContent=p.fav?'★':'☆';star.title=p.fav?'Remove from favourites':'Add to favourites';star.setAttribute('aria-pressed',String(!!p.fav));star.onclick=()=>toggleFav(p);
  const main=document.createElement('div');main.className='upmain';
  const nm=document.createElement('strong');nm.textContent=p.name;
  const sub=document.createElement('small');sub.textContent=PARTS[p.part]+(p.base?' · from preset '+(p.base.num?String(p.base.num).padStart(3,'0')+' ':'')+p.base.name:'')+' · '+new Date(p.created).toLocaleDateString();
  main.append(nm,sub);
  const acts=document.createElement('div');acts.className='upacts';
  const mk=(t,fn,title)=>{const b=document.createElement('button');b.type='button';b.textContent=t;if(title)b.title=title;b.onclick=fn;return b};
  acts.append(mk('Load',()=>loadPatch(p),'Send this sound to the JD-Xi'),mk('Rename',()=>rename(p)),mk('.syx',()=>exportSyx(p),'Export as a SysEx file'),mk('JSON',()=>exportJson([p],safe(p.name)),'Export this patch as JSON'),mk('Delete',()=>remove(p)));
  row.append(star,main,acts);box.append(row);
 }
}

/* ---- wiring ---- */
$('upsave').onclick=saveCurrent;
$('upexportall').onclick=()=>exportJson(patches,'all');
$('upexportfav').onclick=()=>exportJson(patches.filter(p=>p.fav),'favourites');
$('upimport').onchange=async e=>{const f=e.target.files?.[0];if(f)await importJson(f);e.target.value=''};
for(const id of ['upsearch','upfilter','upfavs'])$(id).addEventListener(id==='upsearch'?'input':'change',render);
$('uppart').value=$('ovpart').value;$('ovpart').addEventListener('change',()=>{$('uppart').value=$('ovpart').value});
load();render();
})();
