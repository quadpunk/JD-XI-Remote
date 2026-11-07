(()=>{
/* Performance: six own patterns (JD-Xi programs). The next pattern is queued and only switched in at the
   end of the current one, so playback is never cut off.
   Clock modes:
   - app:    this page sends MIDI Start + Clock (JD-Xi Sync Mode = SLAVE). Needed for Start to do anything:
             a slave JD-Xi waits for clock ticks, and a master JD-Xi ignores external Start.
   - follow: the JD-Xi is master; the page counts the JD-Xi's clock to know where the pattern ends. */
const $=id=>document.getElementById(id);
const api=()=>window.JDXiPerformance;
const ls={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v}catch{return d}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}}};
const valid=s=>/^[A-H](0[1-9]|[1-5][0-9]|6[0-4])$/.test(s);
const clamp=(v,a,b,d)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):d;
const status=t=>{$('perfstatus').textContent=t};

/* ---- slots ---- */
/* Stock patterns until the user changes them: A01–A06. Slots saved by an earlier version that still hold the old
   defaults (H02, H04 … H12) were never edited by hand, so they are moved to the new defaults as well. */
const DEF=['A01','A02','A03','A04','A05','A06'],OLD_DEF=['H02','H04','H06','H08','H10','H12'];
let slots=null;
try{const s=JSON.parse(ls.get('jdxi-perf-slots-v2','null'));
 if(Array.isArray(s)&&s.length===6&&s.every(x=>valid(x.code))){const stock=s.every((x,i)=>x.code===OLD_DEF[i]);slots=s.map((x,i)=>({code:stock?DEF[i]:x.code,bars:x.bars}))}}catch{}
if(!slots){let old=[];try{old=JSON.parse(ls.get('jdxi-performance-slots','[]'))}catch{}
 slots=DEF.map((c,i)=>({code:valid(old[i])&&old[i]!==OLD_DEF[i]?old[i]:c,bars:4}))}
const saveSlots=()=>ls.set('jdxi-perf-slots-v2',JSON.stringify(slots));
const bars=i=>i==null?4:clamp(+slots[i].bars,1,16,4);

/* ---- program change (same bank/program mapping as before) ---- */
const LSBS=[64,65,0,1];
let lastProgSentAt=-1e9,lastLsb=null;
function progMsgs(code,ch){
 const b=code.charCodeAt(0)-65,num=+code.slice(1),lsb=[64,64,65,65,0,0,1,1][b],pc=(num-1)+(b%2?64:0);
 lastProgSentAt=performance.now();lastLsb=lsb;
 return [[0xb0|ch,0,85],[0xb0|ch,32,lsb],[0xc0|ch,pc]];
}
const chan=()=>+$('perfchan').value-1;
window.JDXiProgramMessages=code=>progMsgs(code,chan());
function launchNow(code){
 const a=api();if(!a?.connected()){status('Connect MIDI first');return false}
 const m=progMsgs(code,chan());a.send(m[0]);setTimeout(()=>a.send(m[1]),12);setTimeout(()=>a.send(m[2]),24);window.JDXiMixer?.afterProgramChange(450);return true;
}

/* ---- state ---- */
const S={running:false,ext:null,cur:null,next:null,sent:null,k:0,patStart:0,patStartT:0,nextT:0,tickMs:20.8,timer:null,lastTickAt:0};
let clockUntil=0;
window.JDXiClockReadyAt=()=>clockUntil;
const mode=()=>$('perfmode').value;

// Arm only after several separate note attacks from the JD-Xi parts during this run.
let idleHits=0,idleHitAt=-Infinity,ignoreIdleUntil=0;
let attacks=0,lastAttack=-Infinity,lastMusicAt=0;
function resetActivity(){
 idleHits=0;idleHitAt=-Infinity;attacks=0;lastAttack=-Infinity;lastMusicAt=0;
}
function trackActivity(m,st,ch){
 if(mode()!=='app'||!$('perfidle').checked||window.JDXiSteps?.playing()||![0,1,2,9].includes(ch))return;
 const now=performance.now();
 if(!S.running){
  // Infer playback only from repeated incoming drum strikes; single keys cannot start the UI.
  if(!$('perfstandby').checked||now<ignoreIdleUntil||st!==0x90||m[2]===0||ch!==9)return;
  if(now-idleHitAt<45)return;
  idleHits=now-idleHitAt>700?1:idleHits+1;idleHitAt=now;
  if(idleHits<3)return;
  attacks=3;lastMusicAt=now;panelStart(now);
  status('Playback inferred from incoming drums; bar position is approximate.');
 }
 if(st===0x90&&m[2]>0&&now-lastAttack>=40){
  attacks=Math.min(3,attacks+1);lastAttack=now;
 }
 if(st===0x80||st===0x90||st===0xe0||(st===0xb0&&m[1]===1))lastMusicAt=now;
}

function transition(k,t){
 if(S.sent!==null){resetActivity();S.cur=S.sent;if(S.next===S.sent)S.next=null;S.sent=null;
  if($('perfrestart').checked){if(mode()==='app')sendTransport(0xfa,t);}}
 S.ext=null;S.patStart=k;S.patStartT=t;
}

/* ---- app clock: scheduled with Web MIDI timestamps, so timing does not depend on JS timers ---- */
function appStart(idx){
 const a=api();if(!a?.connected()){status('Connect MIDI first');return}
 stopEngine(false);
 S.cur=idx;S.ext=null;S.next=null;S.sent=null;
 if(!launchNow(slots[idx].code))return;
 const t0=performance.now()+250;
 S.k=0;S.patStart=0;S.patStartT=t0;S.nextT=t0;S.running=true;
 sendTransport(0xfa,t0);
 S.timer=setInterval(appPump,20);
 status('Playing from this app’s clock · '+clamp(+$('perfbpm').value,40,240,120)+' BPM');
 render();
}
function appPump(){
 const a=api();
 if(!a?.connected()){stopEngine(false);status('MIDI disconnected');render();return}
 const bpm=clamp(+$('perfbpm').value,40,240,120),tickMs=60000/bpm/24;S.tickMs=tickMs;
 if(attacks>=3&&performance.now()-lastMusicAt>=Math.max(1000,48*tickMs)){
  stopEngine(true);render();status('Stopped after the incoming pattern went quiet (no MIDI Stop received).');return;
 }
 // Rebase on a delayed callback. Only advance the sequencer for clocks actually sent.
 const now=performance.now();
 if(S.nextT<now){S.patStartT+=now-S.nextT;S.nextT=now}
 while(S.nextT<now+70){
  const k=S.k,t=S.nextT,boundary=S.patStart+bars(S.cur)*96;
  const leadMs=clamp(+$('perflead').value,0,500,30),leadTicks=Math.max(1,Math.round(leadMs/tickMs));
  a.sendAt([0xf8],t);
  if(S.sent===null&&S.next!==null&&k>=boundary-leadTicks-4&&k<boundary-1){
   /* the program change lands `leadMs` before the downbeat of the next pattern */
   const target=Math.max(t+(boundary-k)*tickMs-leadMs,performance.now()+30);
   const m=progMsgs(slots[S.next].code,chan());
   a.sendAt(m[0],target-24);a.sendAt(m[1],target-12);a.sendAt(m[2],target);
   window.JDXiMixer?.afterProgramChange(Math.max(0,target-performance.now())+450);
   S.sent=S.next;
  }
  if(k===boundary)transition(k,t);
  S.nextT+=tickMs;clockUntil=S.nextT;S.k++;
 }
}

// Keep a slave ready for its panel Play button without sending Start or advancing the UI.
function idleClock(){
 if(window.JDXiTransfer?.busy())return;
 if(S.running||mode()!=='app'||!$('perfstandby').checked||window.JDXiSteps?.playing()||!api()?.connected())return;
 const now=performance.now(),tick=60000/clamp(+$('perfbpm').value,40,240,120)/24;
 clockUntil=Math.max(now,clockUntil);
 while(clockUntil<now+45){api().sendAt([0xf8],clockUntil);clockUntil+=tick}
}
setInterval(idleClock,20);
function panelStart(now){
 S.running=true;S.k=0;S.patStart=0;S.patStartT=now;S.nextT=Math.max(now,clockUntil);
 S.timer=setInterval(appPump,20);appPump();render();
}
/* ---- follow the JD-Xi's own clock ---- */
/* Only Start needs echo suppression. Stop is idempotent and must always take effect. */
let lastStartAt=-Infinity;
function sendTransport(byte,t){
 const sent=api()?.sendAt([byte],t);
 if(sent&&byte===0xfa)lastStartAt=Math.max(performance.now(),t);
 return sent;
}
function remoteStop(){
 ignoreIdleUntil=performance.now()+300;
 resetActivity();
 // A timestamped Start already queued at the MIDI output can still fire after a panel Stop.
 if(mode()==='app'&&lastStartAt>performance.now())sendTransport(0xfc,lastStartAt);
 clearInterval(S.timer);S.timer=null;
 S.running=false;S.sent=null;S.next=null;
 try{window.JDXiViz?.transport(false)}catch{}
 status(mode()==='app'?'Stopped on the JD-Xi.':'JD-Xi clock: stopped');render();
}
function realtime(b){
 if(window.JDXiSteps?.playing())return;
 const now=performance.now();
 if(b===0xfc){if(S.running)remoteStop();return}
 if((b===0xfa||b===0xfb)&&mode()==='app'){
  if(b===0xfa&&Math.abs(now-lastStartAt)<80)return;
  if(!S.running){
   panelStart(now);return
  }
  if(b===0xfb)return;
  resetActivity();S.patStart=S.k;S.patStartT=now;S.sent=null;render();return
 }
 if(b===0xf8){
  if(S.lastTickAt){const d=now-S.lastTickAt;if(d>0&&d<250)S.tickMs=S.tickMs*.9+d*.1}
  S.lastTickAt=now;
  if(mode()!=='follow'||!S.running)return;
  S.k++;
  const boundary=S.patStart+bars(S.cur)*96,leadTicks=Math.max(1,Math.round((clamp(+$('perflead').value,0,500,30)+24)/S.tickMs));
  if(S.sent===null&&S.next!==null&&S.k>=boundary-leadTicks&&S.k<boundary){if(launchNow(slots[S.next].code))S.sent=S.next}
  if(S.k>=boundary)transition(boundary,now);
 }else if(b===0xfa&&mode()==='follow'){S.running=true;S.lastTickAt=now;S.k=0;S.patStart=0;S.patStartT=now;S.sent=null;render()}
 else if(b===0xfb&&mode()==='follow'){S.running=true;S.lastTickAt=now;render()}
 
}
/* ---- pattern changed on the JD-Xi itself (Bank Select 85 + Program Change) ---- */
const inBank={};
function codeFrom(lsb,pc){const i=LSBS.indexOf(lsb);if(i<0||pc<0||pc>127)return null;return String.fromCharCode(65+i*2+(pc>=64?1:0))+String((pc%64)+1).padStart(2,'0')}
function remoteProgram(code){
 const now=performance.now();
 if(now-lastProgSentAt<500)return;                       /* echo of our own program change */
 const idx=slots.findIndex(x=>x.code===code);
 if(idx>=0&&(idx===S.cur||idx===S.sent))return;          /* already what we think is playing / just sent */
 if(idx<0&&S.ext===code&&S.cur==null)return;
 if(idx>=0){S.cur=idx;S.ext=null;if(S.next===idx)S.next=null}
 else{S.cur=null;S.ext=code}
 S.sent=null;
 if(S.running){S.patStart=S.k;S.patStartT=mode()==='app'?Math.max(now,S.nextT-S.tickMs*2):now}   /* pattern restarts: count its bars from here */
 status('JD-Xi switched to '+code+(idx>=0?' · Pattern '+(idx+1):' (not one of the six slots)'));
 render();
}
window.JDXiPerformanceReceive=m=>{
 if(window.JDXiTransfer?.busy())return;
 if(!m||!m.length)return;
 if(m.length===1){realtime(m[0]);return}
 const st=m[0]&0xf0,ch=m[0]&15;
 trackActivity(m,st,ch);
 if(st===0xb0){const b=inBank[ch]||(inBank[ch]={});if(m[1]===0)b.msb=m[2];else if(m[1]===32){b.lsb=m[2];lastLsb=m[2]}}
 else if(st===0xc0){
  const b=inBank[ch]||{};
  if(b.msb===85||(b.msb==null&&ch===chan()&&lastLsb!=null)){
   const c=codeFrom(b.lsb!=null?b.lsb:lastLsb,m[1]);if(c)remoteProgram(c)}
  inBank[ch]={}; /* bank select applies to one program change only */
 }
};

function stopEngine(sendStop){
 ignoreIdleUntil=performance.now()+300;
 resetActivity();
 clearInterval(S.timer);S.timer=null;
 /* clock ticks are queued up to ~120 ms ahead and cannot be recalled, so Stop goes out after the last queued tick */
 if(sendStop&&S.running){sendTransport(0xfc,mode()==='app'?Math.max(performance.now(),S.nextT):0)}
 const was=S.running;
 S.running=false;S.sent=null;S.next=null;
 if(was){try{window.JDXiViz?.transport(false)}catch{}}
}

/* ---- UI ---- */
const cards=[];
const perfSlots=$('perfslots');
slots.forEach((slot,i)=>{
 const card=document.createElement('div');card.className='perf-slot';
 const head=document.createElement('strong');head.textContent='Pattern '+(i+1);
 const badge=document.createElement('span');badge.className='perf-badge';
 const code=document.createElement('input');code.value=slot.code;code.maxLength=3;code.setAttribute('aria-label','Program A01–H64, pattern '+(i+1));
 code.onchange=()=>{const v=code.value.trim().toUpperCase();if(!valid(v)){code.value=slot.code;status('Use A01–H64');return}slot.code=v;code.value=v;saveSlots();render()};
 const barsLabel=document.createElement('label');barsLabel.textContent='Length (bars)';
 const bi=document.createElement('input');bi.type='number';bi.min=1;bi.max=16;bi.value=slot.bars;
 bi.onchange=()=>{slot.bars=clamp(Math.round(+bi.value),1,16,4);bi.value=slot.bars;saveSlots()};
 barsLabel.append(bi);
 const btn=document.createElement('button');btn.type='button';btn.className='perf-go';btn.onclick=()=>tap(i);
 const top=document.createElement('div');top.className='perf-top';top.append(head,badge);
 card.append(top,code,barsLabel,btn);perfSlots.append(card);
 cards.push({card,badge,btn,code});
});

function tap(i){
 if(window.JDXiTransfer?.busy()){status("Finish the pattern transfer first.");return}
 if(window.JDXiSteps?.playing()){status("Stop the step sequencer first.");return}
 if(!S.running){
  if(mode()==='app')appStart(i);
  else if(launchNow(slots[i].code)){S.cur=i;S.next=null;status('Loaded '+slots[i].code+'. Press play on the JD-Xi; the page follows its clock.');render()}
  return;
 }
 if(i===S.cur){S.next=null;render();return}
 if(i===S.sent){status('Already sent: this pattern plays next.');return}
 S.next=S.next===i?null:i;render();
}

function render(){
 cards.forEach((c,i)=>{
  const isCur=S.cur===i&&S.running,isNext=S.next===i||S.sent===i&&S.cur!==i;
  c.card.classList.toggle('current',isCur);c.card.classList.toggle('next',!!isNext&&!isCur);
  c.badge.textContent=isCur?'NOW':isNext?'NEXT':'';
  c.btn.textContent=!S.running?(mode()==='app'?'▶ Play':'Load'):isCur?'Playing (loops)':isNext?'Next · tap to cancel':'Play next';
 });
 const f=i=>i==null?(S.ext?S.ext+' · from JD-Xi':'—'):slots[i].code+' · Pattern '+(i+1);
 $('perfnowtxt').textContent=S.running?f(S.cur):'Stopped';
 $('perfnexttxt').textContent=S.next!=null?f(S.next):(S.running?'— (current loops)':'—');
 $('perfstop').disabled=mode()==='follow';
 $('perfstandbywrap').hidden=mode()!=='app';
 $('perfidlewrap').hidden=mode()!=='app';
 $('perfbpmwrap').hidden=mode()!=='app';
}
function tickUi(){
 if(mode()==='follow'&&S.running&&performance.now()-S.lastTickAt>700)remoteStop();
 let pos=0;
 if(S.running){pos=mode()==='app'?Math.max(0,(performance.now()-S.patStartT)/S.tickMs/96):Math.max(0,(S.k-S.patStart)/96)}
 const n=bars(S.cur);
 $('perfbarfill').style.width=(S.running?Math.min(100,pos/n*100):0)+'%';
 if(S.running){
  const bar=Math.min(n,Math.floor(pos)+1),beat=Math.floor((pos%1)*4)+1;
  $('perfnowtxt').textContent=(S.cur==null?(S.ext?S.ext+' · from JD-Xi':'?'):slots[S.cur].code+' · Pattern '+(S.cur+1))+' — bar '+bar+'/'+n+' · beat '+Math.min(4,beat);
 }
 if(mode()==='follow'){
  const alive=performance.now()-S.lastTickAt<600;
  status(alive?'JD-Xi clock: '+(60000/S.tickMs/24).toFixed(1)+' BPM · '+(S.running?'running':'stopped'):'No clock from the JD-Xi yet. Check input port, and that it is playing / Sync Mode is MASTER.');
 }
}
setInterval(tickUi,80);

/* settings */
for(let n=1;n<=16;n++){const o=document.createElement('option');o.value=n;o.textContent='Channel '+n;$('perfchan').append(o)}
$('perfchan').value=ls.get('jdxi-performance-channel','1');$('perfchan').onchange=()=>ls.set('jdxi-performance-channel',$('perfchan').value);
$('perfbpm').value=ls.get('jdxi-perf-bpm','120');$('perfbpm').onchange=()=>{$('perfbpm').value=clamp(Math.round(+$('perfbpm').value),40,240,120);ls.set('jdxi-perf-bpm',$('perfbpm').value)};
$('perflead').value=ls.get('jdxi-perf-lead','30');$('perflead').onchange=()=>ls.set('jdxi-perf-lead',$('perflead').value);
$('perfrestart').checked=ls.get('jdxi-perf-restart','true')==='true';$('perfrestart').onchange=()=>ls.set('jdxi-perf-restart',$('perfrestart').checked);
$('perfmode').value=ls.get('jdxi-perf-mode','app');
$('perfidle').checked=ls.get('jdxi-perf-idle-stop','true')==='true';
$('perfidle').onchange=()=>{resetActivity();ls.set('jdxi-perf-idle-stop',$('perfidle').checked)};
$('perfstandby').checked=ls.get('jdxi-perf-standby','true')==='true';
$('perfstandby').onchange=()=>{resetActivity();ls.set('jdxi-perf-standby',$('perfstandby').checked)};
const HELP={
 app:'Set the JD-Xi to Sync Mode = SLAVE (it then waits for clock). Keep clock while stopped lets you try Play on the synth while the app is idle. Tapping a pattern selects its program, starts the JD-Xi sequencer and sends clock at the tempo above. Select the matching ClockSource (USB or MIDI) on the synth. Select its MIDI input in this app to receive panel Start/Stop. Look for IN FA / IN FC in the MIDI log. When silence detection is on, repeated incoming notes arm a fallback: two beats of inactivity (at least one second) stop playback. Turn it off for patterns with long rests or sustained notes.',
 follow:'Keep the JD-Xi on Sync Mode = MASTER. Tap a pattern to load it, start and stop playback on the JD-Xi itself; this page counts the JD-Xi’s clock to find the end of each pattern. Needs the JD-Xi’s MIDI input port selected.'
};
const applyMode=()=>{$('perfhelp').textContent=HELP[mode()];render()};
$('perfmode').onchange=()=>{stopEngine(false);S.cur=null;ls.set('jdxi-perf-mode',mode());applyMode();status(mode()==='app'?'Tap a pattern to start.':'Tap a pattern to load it.')};
$('perfstop').onclick=()=>{
 stopEngine(true);S.cur=null;S.ext=null;
 render();status('Stopped.')};
$('perfpanic').onclick=()=>{const a=api();if(!a?.connected()){status('Connect MIDI first');return}
 for(let ch=0;ch<16;ch++){a.send([0xb0|ch,120,0]);a.send([0xb0|ch,123,0])}status('All notes off sent')};
applyMode();
/* read-only view of the engine for the visualizer */
window.JDXiPerfState=()=>{
 const n=bars(S.cur),pos=S.running?(mode()==='app'?Math.max(0,(performance.now()-S.patStartT)/S.tickMs/96):Math.max(0,(S.k-S.patStart)/96)):0;
 return {running:S.running,bpm:mode()==='app'?clamp(+$('perfbpm').value,40,240,120):60000/S.tickMs/24,frac:Math.min(1,pos/n),bar:Math.min(n,Math.floor(pos)+1),bars:n,cur:S.cur,code:S.cur==null?(S.ext||''):slots[S.cur].code};
};
})();
