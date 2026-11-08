/* JD-Xi Performance — momentary modulation (CC1) and pitch bend wheels.
   Pointer capture + window blur / page hide release protect against stuck bends. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const part=$('perfwheelpart');
if(!part||!$('perfmodwheel')||!$('perfpitchwheel'))return;
const send=bytes=>{try{return !!window.JDXiPerformance?.send(bytes)}catch{return false}};
const channel=()=>{const n=Number(part.value);return [0,1,2,9].includes(n)?n:0};
const wheels=[];
function create(id,kind){
 const el=$(id),thumb=el.querySelector('.ko-wheel-thumb'),readout=$(kind==='mod'?'perfmodvalue':'perfpitchvalue');
 const neutral=kind==='mod'?0:8192;
 let active=null,activeCh=null,current=neutral;
 function draw(value){
  const pos=kind==='mod'?value/127:value/16383;
  el.style.setProperty('--wheel-position',String(pos));
  if(kind==='mod'){
   readout.textContent=String(value).padStart(3,'0');el.setAttribute('aria-valuenow',String(value));
  }else{
   readout.textContent=value===8192?'CTR':`${value>8192?'+':'−'}${Math.round(Math.abs(value-8192)/8192*100)}%`;
   el.setAttribute('aria-valuenow',String(Math.round((value-8192)/8192*100)));
  }
 }
 function output(value,ch,force=false){
  value=Math.round(value);
  if(!force&&value===current)return;
  current=value;
  draw(value);
  if(kind==='mod'){
   send([0xb0|ch,1,value]);
  }else{
   send([0xe0|ch,value&0x7f,(value>>7)&0x7f]);
  }
 }
 function position(e){
  const r=el.getBoundingClientRect();
  const fraction=Math.max(0,Math.min(1,(r.bottom-e.clientY)/r.height));
  return kind==='mod'?Math.round(fraction*127):Math.round(fraction*16383);
 }
 function start(e){
  if(active!==null||e.isPrimary===false||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();active=e.pointerId;activeCh=channel();el.classList.add('dragging');
  try{el.setPointerCapture(e.pointerId)}catch{}
  output(position(e),activeCh,true);
 }
 function move(e){if(e.pointerId!==active)return;e.preventDefault();output(position(e),activeCh)}
 function release(){if(active===null)return;const pointer=active,ch=activeCh;active=null;activeCh=null;el.classList.remove('dragging');output(neutral,ch,true);try{if(el.hasPointerCapture(pointer))el.releasePointerCapture(pointer)}catch{}}
 el.addEventListener('pointerdown',start);
 el.addEventListener('pointermove',move);
 el.addEventListener('pointerup',e=>{if(e.pointerId===active)release()});
 el.addEventListener('pointercancel',e=>{if(e.pointerId===active)release()});
 el.addEventListener('lostpointercapture',e=>{if(e.pointerId===active)release()});
 el.addEventListener('keydown',e=>{
  if(!['ArrowUp','ArrowDown','Home','End',' '].includes(e.key))return;
  e.preventDefault();if(e.repeat)return;
  const ch=channel(),step=kind==='mod'?16:2048;
  const v=e.key==='Home'?0:e.key==='End'?(kind==='mod'?127:16383):e.key===' '?neutral:Math.max(0,Math.min(kind==='mod'?127:16383,current+(e.key==='ArrowUp'?step:-step)));
  output(v,ch,true);
 });
 el.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown','Home','End',' '].includes(e.key))output(neutral,channel(),true)});
 el.addEventListener('blur',()=>{release();if(current!==neutral)output(neutral,channel(),true)});
 draw(neutral); // Set the physical position at startup without sending MIDI.
 wheels.push(release);
 }
 create('perfmodwheel','mod');create('perfpitchwheel','pitch');
 const releaseAll=()=>wheels.forEach(fn=>fn());
 window.addEventListener('blur',releaseAll);
 window.addEventListener('pagehide',releaseAll);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll()});
 part.addEventListener('change',releaseAll);
})();
