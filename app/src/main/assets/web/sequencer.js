(()=>{
'use strict';
const $=id=>document.getElementById('sq-'+id);
const midi=window.JDXiPerformance;
const channels=[0,1,9,2];
const pads='BD1 RIM BD2 CLAP BD3 SD1 CHH SD2 PHH SD3 OHH SD4 TOM1 PRC1 TOM2 PRC2 TOM3 PRC3 CYM1 PRC4 CYM2 PRC5 CYM3 HIT OTH1 OTH2'.split(' ');
const pitches='C C♯ D E♭ E F F♯ G A♭ A B♭ B'.split(' ');
const pitch=k=>pitches[k%12]+(Math.floor(k/12)-1);
const blank=()=>({bpm:120,swing:0,length:16,tracks:channels.map(()=>({mute:false,notes:[]}))});
const prefix='jdxi-steps-v1-';
const status=t=>$('status').textContent=t;
function read(key){
 try{return JSON.parse(localStorage.getItem(key))}catch{return null}
}
function restore(key){
 const p=read(prefix+key);
 if(!p||![16,32,48,64].includes(p.length)||p.tracks?.length!==4)return null;
 return p.tracks.every(t=>t&&Array.isArray(t.notes))?p:null;
}
function legacy(){
 const p=blank(),old=read('jdxi-web-v2')?.pattern;
 if(old&&Array.isArray(old.enabled)&&channels.includes(+old.part)){
  p.bpm=old.bpm||120;
  old.enabled.slice(0,16).forEach((on,step)=>{if(on)p.tracks[channels.indexOf(+old.part)].notes.push({step,key:old.note,velocity:100,length:1})});
 }
 return p;
}
let pattern=restore('current')||legacy();
function save(key='current'){
 try{localStorage.setItem(prefix+key,JSON.stringify(pattern));return true}catch{status('Browser storage unavailable.');return false}
}
const track=()=>+$('track').value;
const drum=()=>track()===2;
let playing=false,timer=null,pulse=0,nextTime=0,clock=false,endPulse=Infinity,solo=-1,lastColumn=null;
const held=new Map(),previews=new Map();
function release(ch,key){midi.send([0x80|ch,key,0])}
function endPreviews(){
 for(const {ch,key,timer} of previews.values()){clearTimeout(timer);release(ch,key)}
 previews.clear();
}
function preview(key,velocity){
 if(!midi.connected()||playing)return;
 const ch=channels[track()],id=ch*128+key;
 if(previews.has(id)){clearTimeout(previews.get(id).timer);release(ch,key)}
 if(!midi.send([0x90|ch,key,velocity]))return;
 const timer=setTimeout(()=>{release(ch,key);previews.delete(id)},130);
 previews.set(id,{ch,key,timer});
}
function paintStep(step){
 lastColumn?.classList.remove('sq-head-now');
 lastColumn=step>=0&&Math.floor(step/16)===+$('bar').value?$('grid').querySelector('[data-column="'+step%16+'"]'):null;
 lastColumn?.classList.add('sq-head-now');
}
function stop(sendStop=true){
 endPreviews();
 if(!playing)return;
 clearTimeout(timer);playing=false;
 for(const n of held.values())release(n.ch,n.key);
 held.clear();if(clock&&sendStop)midi.sendAt([0xfc],Math.max(performance.now(),window.JDXiClockReadyAt?.()||0));
 paintStep(-1);transportUI();status('Stopped');
}
function transportUI(){
 for(const id of ['play','load','clock','record-one','record-all'])$(id).disabled=playing;
 $('stop').disabled=!playing;
}
function pump(){
 if(!playing)return;
 if(!midi.connected()||performance.now()-nextTime>250){stop();status('Playback interrupted. Press Play to restart.');return}
 const pulseMs=60000/pattern.bpm/96;
 // A delayed callback may stretch a step, but must never squeeze missed pulses together.
 const now=performance.now();
 if(now-nextTime>pulseMs)nextTime=now;
 if(nextTime<=now){
  if(pulse>=endPulse){stop();status('Recording pass complete.');return}
  if(clock&&pulse%4===0)midi.sendAt([0xf8],0);
  for(const [id,n] of held)if(n.until<=pulse){release(n.ch,n.key);held.delete(id)}
  const step=Math.floor(pulse/24)%pattern.length;
  if(pulse%24===(step%2?Math.floor(pattern.swing*24/100):0)){
   paintStep(step);
   pattern.tracks.forEach((t,i)=>{
    if(t.mute||(solo>=0&&solo!==i))return;
    const ch=channels[i];
    for(const n of t.notes)if(n.step===step){
     const id=ch*128+n.key;
     if(held.has(id))release(ch,n.key);
     midi.send([0x90|ch,n.key,n.velocity]);
     held.set(id,{ch,key:n.key,until:pulse+Math.round(n.length*24*.9)});
    }
   });
  }
  pulse++;nextTime+=pulseMs;
 }
 timer=setTimeout(pump,Math.max(1,nextTime-performance.now()));
}
function start(bars=0,only=-1){
 if(window.JDXiTransfer?.busy()){status("Finish the pattern transfer first.");return}
 if(playing)return;
 if(!midi.connected()){status('Connect a MIDI output first.');return}
 if(window.JDXiPerfState?.().running){status('Stop Performance playback first.');return}
 endPreviews();clock=bars>0||$('clock').checked;solo=only;
 const startAt=Math.max(performance.now(),window.JDXiClockReadyAt?.()||0);
 if(clock&&!midi.sendAt([0xfa],startAt)){status('MIDI Start failed.');return}
 pulse=0;endPulse=bars?bars*16*24:Infinity;playing=true;nextTime=startAt;
 status(bars?'Sending recording pass…':'Playing');transportUI();pump();
}
function visualState(){
 if(!playing)return null;
 const position=Math.max(0,pulse-1)/24%pattern.length;
 return {running:true,bpm:pattern.bpm,bars:pattern.length/16,bar:1+Math.floor(position/16),frac:position/pattern.length,cur:null,code:'Step sequencer'};
}
window.JDXiSteps={playing:()=>playing,visualState,stop:()=>stop(),incomingStop:()=>{if(clock)stop(false)}};
window.addEventListener('pagehide',()=>stop());
function number(id,min,max,fallback){
 const value=$(id).valueAsNumber;
 return Number.isFinite(value)?Math.max(min,Math.min(max,Math.round(value))):fallback;
}
function grid(){
 const bar=+$('bar').value,base=drum()?36:+$('range').value,rows=drum()?38:24;
 const table=document.createElement('table');table.className='sq-table';
 const head=table.createTHead().insertRow();
 function heading(row,name){const th=document.createElement('th');th.textContent=name;row.append(th);return th}
 heading(head,drum()?'Pad':'Note');
 for(let i=0;i<16;i++)heading(head,String(1+bar*16+i)).dataset.column=i;
 const body=table.createTBody(),t=pattern.tracks[track()];
 const painters=new Map();
 const cover=(key,step)=>t.notes.filter(n=>n.key===key&&n.step<=step&&step<n.step+n.length).sort((a,b)=>b.step-a.step)[0];
 let gesture=null;
 function paint(){for(const fn of painters.values())fn()}
 function erase(key,step){
  const note=cover(key,step);
  if(note)t.notes.splice(t.notes.indexOf(note),1);
 }
 function currentCell(e){
  return document.elementFromPoint(e.clientX,e.clientY)?.closest('button[data-step]');
 }
 function move(e){
  if(!gesture||gesture.id!==e.pointerId)return;
  const cell=currentCell(e);
  if(!cell||!table.contains(cell))return;
  const step=+cell.dataset.step,key=+cell.dataset.key;
  const g=gesture;
  if(key===g.key&&step===g.end)return;
  if(g.erase){
   if(key===g.key){
    for(let at=Math.min(g.end,step);at<=Math.max(g.end,step);at++)erase(key,at);
   }else erase(key,step);
   g.key=key;
  }else if(key!==g.key)return;
  g.end=step;paint();
 }
 function finish(e){
  if(!gesture||gesture.id!==e.pointerId)return;
  const g=gesture;gesture=null;
  if(e.type==='pointercancel'||e.type==='lostpointercapture'){
   if(g.erase)t.notes=g.original;
  }else if(g.erase){save()}
  else{
   const start=Math.min(g.start,g.end),dragged=g.pressed!==g.end;
   if(dragged||!g.note){
    const length=drum()?1:dragged?Math.abs(g.end-g.start)+1:Math.min(+$('gate').value,pattern.length-start);
    const end=drum()&&dragged?Math.max(g.start,g.end)+1:start+length;
    t.notes=t.notes.filter(n=>n.key!==g.key||n.step+n.length<=start||n.step>=end);
    const velocity=g.note?.velocity??number('vel',1,127,100);
    for(let at=start;at<end;at+=length)t.notes.push({key:g.key,step:at,velocity,length});
    preview(g.key,velocity);save();
   }
  }
  paint();
 }
 table.onpointermove=move;
 table.onpointerup=e=>{move(e);finish(e)};
 table.onpointercancel=table.onlostpointercapture=finish;
 for(let row=0;row<rows;row++){
  const key=base+(drum()?row:rows-1-row),name=drum()?(pads[row]||pitch(key)):pitch(key);
  const tr=body.insertRow(),keyCell=heading(tr,name);
  if(!drum()){
   /* vertical piano keyboard: one key per row; tap a key to hear the note */
   const black=[1,3,6,8,10].includes(key%12);
   keyCell.className='sq-key '+(black?'sq-black':'sq-white')+(key%12===0?' sq-c':'');
   keyCell.title=name;
   keyCell.onpointerdown=e=>{e.preventDefault();preview(key,number('vel',1,127,100))};
  }
  for(let i=0;i<16;i++){
   const step=bar*16+i,b=document.createElement('button');
   b.dataset.step=step;b.dataset.key=key;
   const draw=()=>{
    const n=cover(key,step),g=gesture;
    const selected=g&&!g.erase&&g.key===key&&step>=Math.min(g.start,g.end)&&step<=Math.max(g.start,g.end);
    b.setAttribute('aria-pressed',String(!!n||!!selected));
    b.textContent=selected?'━':n?(n.step===step?'●':'━'):'·';
    b.title=name+' · step '+(step+1)+(n?' · velocity '+n.velocity+' · length '+n.length:'');
    b.setAttribute('aria-label',b.title);
   };
   function begin(id){
    const removing=$('erase').checked,note=cover(key,step);
    gesture={id,key,pressed:step,start:note&&!removing&&!drum()?note.step:step,end:step,note,erase:removing,original:removing?t.notes.slice():null};
    if(removing)erase(key,step);
    paint();
   }
   b.onpointerdown=e=>{
    if(gesture||e.button!==0||!e.isPrimary)return;
    e.preventDefault();table.setPointerCapture(e.pointerId);begin(e.pointerId);
   };
   b.onclick=e=>{if(!e||e.detail===0){begin(-1);finish({pointerId:-1})}};
   painters.set(b,draw);draw();tr.insertCell().append(b);
  }
 }
 $('grid').replaceChildren(table);
 $('gate').disabled=drum();$('range').disabled=drum();$('mute').checked=t.mute;
}
function sync(){
 $('bpm').value=pattern.bpm;$('swing').value=pattern.swing;$('length').value=pattern.length;
 const bar=Math.min(+$('bar').value,pattern.length/16-1);
 $('bar').replaceChildren();
 for(let i=0;i<pattern.length/16;i++)$('bar').add(new Option(i+1,i));
 $('bar').value=bar;grid();
}
function slots(){
 const selected=$('slot').value||'1';$('slot').replaceChildren();
 for(let i=1;i<=8;i++)$('slot').add(new Option(i+(restore('slot'+i)?' · saved':' · empty'),i));
 $('slot').value=selected;
}
for(let k=12;k<=84;k+=12)$('range').add(new Option(pitch(k)+' – '+pitch(k+23),k));
$('range').value=48;
$('bpm').onchange=()=>{pattern.bpm=number('bpm',40,240,120);$('bpm').value=pattern.bpm;save()};
$('swing').onchange=()=>{pattern.swing=number('swing',0,66,0);$('swing').value=pattern.swing;save()};
$('length').onchange=()=>{pattern.length=+$('length').value;sync();save()};
for(const id of ['bar','track','range'])$(id).onchange=grid;
$('mute').onchange=()=>{pattern.tracks[track()].mute=$('mute').checked;save()};
$('clear').onclick=()=>{if(confirm('Clear the selected track?')){pattern.tracks[track()].notes=[];grid();save()}};
$('clear-all').onclick=()=>{if(confirm('Clear notes from all four tracks?')){pattern.tracks.forEach(t=>t.notes=[]);grid();save()}};
$('save').onclick=()=>{const k='slot'+$('slot').value;if(restore(k)&&!confirm('Replace this saved pattern?'))return;if(save(k)){slots();status('Slot saved.')}};
$('load').onclick=()=>{const p=restore('slot'+$('slot').value);if(!p){status('This slot is empty.');return}pattern=p;sync();save();status('Slot loaded.')};
$('play').onclick=()=>start();$('stop').onclick=()=>stop();
$('record-one').onclick=()=>start(+$('bars').value,track());$('record-all').onclick=()=>start(+$('bars').value);
slots();sync();transportUI();
})();
