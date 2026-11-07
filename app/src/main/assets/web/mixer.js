(()=>{
/* Simple mixer for the four JD-Xi parts. Writes the Temporary Program "Part Level" (18 00 2x 09, same value as CC#7)
   over SysEx; without SysEx permission it falls back to CC#7 on the part's channel. Faders are initialised by reading the
   part levels back from the JD-Xi. */
const $=id=>document.getElementById(id);
const api=()=>window.JDXiPerformance;
const ls={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v}catch{return d}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}}};
const PARTS=[
 {name:'Synth 1',sub:'Digital 1',addr:0x18002009,ch:0},
 {name:'Synth 2',sub:'Digital 2',addr:0x18002109,ch:1},
 {name:'Analog',sub:'Analog',addr:0x18002209,ch:2},
 {name:'Drums',sub:'Drums',addr:0x18002309,ch:9}
];
const st=PARTS.map(()=>({level:100,touched:false,mute:false,solo:false,sent:null}));
const ui=[];
const status=t=>{$('mixstatus').textContent=t};
const anySolo=()=>st.some(s=>s.solo);
const effective=i=>{const s=st[i];if(s.mute)return 0;if(anySolo()&&!s.solo)return 0;return s.level};
/* a part is "managed" (we keep re-sending it) once the user touched it or mute/solo affects it */
const managed=i=>st[i].touched||st[i].mute||anySolo();

function write(i,force){
 const a=api();if(!a?.connected()){status('Connect MIDI first.');return false}
 const v=effective(i);if(!force&&st[i].sent===v)return true;
 const ok=a.hasSysex()?a.dt1(PARTS[i].addr,[v]):a.send([0xb0|PARTS[i].ch,7,v]);
 if(ok)st[i].sent=v;return ok;
}
function paint(){
 ui.forEach((u,i)=>{
  const s=st[i];u.fader.value=s.level;u.out.textContent=s.mute?'MUTE':String(s.level);
  u.mute.classList.toggle('on',s.mute);u.solo.classList.toggle('on',s.solo);
  u.strip.classList.toggle('silent',effective(i)===0);
 });
}
function applyAll(){for(let i=0;i<PARTS.length;i++)write(i)}

function build(){
 const box=$('mixer-strips');box.replaceChildren();
 PARTS.forEach((p,i)=>{
  const strip=document.createElement('div');strip.className='mixstrip';
  const head=document.createElement('div');head.className='mixhead';
  const nm=document.createElement('strong');nm.textContent=p.name;
  const out=document.createElement('output');
  head.append(nm,out);
  const fader=document.createElement('input');fader.type='range';fader.min=0;fader.max=127;fader.value=100;fader.setAttribute('aria-label',p.name+' level');
  const btns=document.createElement('div');btns.className='mixbtns';
  const mute=document.createElement('button');mute.type='button';mute.className='mixbtn mute';mute.textContent='M';mute.title='Mute '+p.sub;mute.setAttribute('aria-label','Mute '+p.name);
  const solo=document.createElement('button');solo.type='button';solo.className='mixbtn solo';solo.textContent='S';solo.title='Solo '+p.sub;solo.setAttribute('aria-label','Solo '+p.name);
  btns.append(mute,solo);
  let last=0;
  fader.oninput=()=>{const s=st[i];s.level=+fader.value;s.touched=true;if(s.mute)s.mute=false;paint();const t=performance.now();if(t-last>40){last=t;applyAll()}};
  fader.onchange=()=>applyAll();
  mute.onclick=()=>{st[i].mute=!st[i].mute;st[i].touched=true;paint();applyAll()};
  solo.onclick=()=>{st[i].solo=!st[i].solo;paint();applyAll()};
  strip.append(head,fader,btns);box.append(strip);ui.push({strip,fader,out,mute,solo});
 });
 paint();
}

/* ---- read levels back ---- */
function readAll(){
 const a=api();
 if(!a?.connected()){status('Connect MIDI first.');return}
 if(!a.hasSysex()||!a.hasInput()){status('Reading levels needs SysEx permission and a MIDI input; the faders still send CC#7.');return}
 status('Reading part levels…');
 PARTS.forEach((p,i)=>setTimeout(()=>a.rq1(p.addr,1),i*70));
 setTimeout(()=>{const got=PARTS.filter(p=>a.readback().has(p.addr)).length;status(got===PARTS.length?'Levels read from the JD-Xi.':'Read '+got+' of '+PARTS.length+' part levels.')},PARTS.length*70+500);
}
function onReply(base,len){
 PARTS.forEach((p,i)=>{
  if(p.addr<base||p.addr>=base+len)return;
  const v=api().readback().get(p.addr);if(v===undefined)return;
  if(managed(i)){return}                    /* the user's mix wins over what the synth reports */
  st[i].level=v;st[i].sent=v;paint();
 });
}
$('mixread').onclick=()=>{st.forEach(s=>{s.touched=false;s.mute=false;s.solo=false;s.sent=null});paint();for(const p of PARTS)api()?.readback().delete(p.addr);readAll()};
$('mixkeep').checked=ls.get('jdxi-mixer-keep','true')==='true';
$('mixkeep').onchange=()=>ls.set('jdxi-mixer-keep',$('mixkeep').checked);

/* called by the Performance page whenever it sends a program change (the synth then loads that program's own levels) */
window.JDXiMixer={levels:()=>PARTS.map((p,i)=>({name:p.name,level:st[i].level,eff:effective(i),mute:st[i].mute,solo:st[i].solo})),afterProgramChange(delayMs){
 setTimeout(()=>{
  const a=api();if(!a?.connected())return;
  const keep=$('mixkeep').checked;
  if(!keep)st.forEach(x=>{x.touched=false;x.mute=false;x.solo=false});
  PARTS.forEach((p,i)=>{
   st[i].sent=null;                          /* the program change reset the synth's level */
   if(keep&&managed(i))write(i,true);
   else{if(a.hasSysex()&&a.hasInput()){a.readback().delete(p.addr);setTimeout(()=>a.rq1(p.addr,1),i*70)}}
  });
  paint();
 },Math.max(0,delayMs||0));
}};

/* open/closed state */
const mix=$('mixer');
if(ls.get('jdxi-mixer-open','true')==='false')mix.open=false;
mix.addEventListener('toggle',()=>ls.set('jdxi-mixer-open',mix.open));

build();
api()?.onReply(onReply);
window.addEventListener('jdxi-connected',()=>{PARTS.forEach(p=>api().readback().delete(p.addr));st.forEach(s=>{s.sent=null});setTimeout(readAll,1800)});
})();
