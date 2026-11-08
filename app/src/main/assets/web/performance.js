(()=>{
/* Performance: six own patterns (JD-Xi programs). Patterns can be queued (several in a row, each with its own
   number of bars); the next one is only switched in at the end of the current one, so playback is never cut off.
   The last pattern in the queue keeps looping.
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
 lastProgSentAt=performance.now();progEpoch++;lastLsb=lsb;
 return [[0xb0|ch,0,85],[0xb0|ch,32,lsb],[0xc0|ch,pc]];
}
const chan=()=>+$('perfchan').value-1;
window.JDXiProgramMessages=code=>progMsgs(code,chan());
function launchNow(code){
 const a=api();if(!a?.connected()){status('Connect MIDI first');return false}
 const m=progMsgs(code,chan());a.send(m[0]);setTimeout(()=>a.send(m[1]),12);setTimeout(()=>a.send(m[2]),24);window.JDXiMixer?.afterProgramChange(450);return true;
}

/* ---- state ---- */
const S={running:false,ext:null,cur:null,curBars:null,last:null,sent:null,k:0,patStart:0,patStartT:0,nextT:0,tickMs:20.8,timer:null,lastTickAt:0};
/* queue of patterns that follow the current one: [{i: slot index, bars: how long it plays before the next one}] */
const queue=[];
const nextIdx=()=>queue.length?queue[0].i:null;
const curBars=()=>S.curBars||bars(S.cur);
let progEpoch=0;                       /* changes whenever the JD-Xi switches program (punch-in FX use it) */
window.JDXiPerfEpoch=()=>progEpoch;
let clockUntil=0;
window.JDXiClockReadyAt=()=>clockUntil;
const mode=()=>$('perfmode').value;
/* Start watchdog: after START / ▶ Play from this app, the JD-Xi must send some MIDI (notes, CC...) within 1 s,
   otherwise it is probably in Master sync mode (or not listening) and we stop instead of pretending to play. */
let watchUntil=0;
const WATCH_MS=1000;

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
 if(S.sent!==null){resetActivity();const e=queue[0]&&queue[0].i===S.sent?queue.shift():null;S.cur=S.sent;S.curBars=e?e.bars:bars(S.sent);S.last=S.cur;S.sent=null;
  if($('perfrestart').checked){if(mode()==='app')sendTransport(0xfa,t);}}
 S.ext=null;S.patStart=k;S.patStartT=t;
 render();
}

/* ---- app clock: scheduled with Web MIDI timestamps, so timing does not depend on JS timers ---- */
function appStart(idx,nb){
 const a=api();if(!a?.connected()){status('Connect MIDI first');return}
 stopEngine(false);
 S.cur=idx;S.curBars=nb||bars(idx);S.last=idx;S.ext=null;S.sent=null;
 if(!launchNow(slots[idx].code))return;
 const t0=performance.now()+250;
 S.k=0;S.patStart=0;S.patStartT=t0;S.nextT=t0;S.running=true;
 watchUntil=$('perfidle').checked?t0+WATCH_MS:0;
 sendTransport(0xfa,t0);
 S.timer=setInterval(appPump,20);
 status('Playing from this app’s clock · '+clamp(+$('perfbpm').value,40,240,120)+' BPM');
 render();
}
function appPump(){
 const a=api();
 if(!a?.connected()){stopEngine(false);status('MIDI disconnected');render();return}
 const bpm=clamp(+$('perfbpm').value,40,240,120),tickMs=60000/bpm/24;S.tickMs=tickMs;
 if(watchUntil&&performance.now()>=watchUntil){
  watchUntil=0;stopEngine(true);render();
  status('Stopped: no MIDI came back from the JD-Xi within 1 s. Is it in Master sync mode or not listening? (Set Sync to SLAVE.)');return;
 }
 if(attacks>=3&&performance.now()-lastMusicAt>=Math.max(1000,48*tickMs)){
  stopEngine(true);render();status('Stopped after the incoming pattern went quiet (no MIDI Stop received).');return;
 }
 // Rebase on a delayed callback. Only advance the sequencer for clocks actually sent.
 const now=performance.now();
 if(S.nextT<now){S.patStartT+=now-S.nextT;S.nextT=now}
 while(S.nextT<now+70){
  const k=S.k,t=S.nextT,boundary=S.patStart+curBars()*96;
  const leadMs=clamp(+$('perflead').value,0,500,30),leadTicks=Math.max(1,Math.round(leadMs/tickMs));
  a.sendAt([0xf8],t);
  if(S.sent===null&&nextIdx()!==null&&k>=boundary-leadTicks-4&&k<boundary-1){
   /* the program change lands `leadMs` before the downbeat of the next pattern */
   const target=Math.max(t+(boundary-k)*tickMs-leadMs,performance.now()+30);
   const m=progMsgs(slots[nextIdx()].code,chan());
   a.sendAt(m[0],target-24);a.sendAt(m[1],target-12);a.sendAt(m[2],target);
   window.JDXiMixer?.afterProgramChange(Math.max(0,target-performance.now())+450);
   S.sent=nextIdx();render();
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
 watchUntil=0;
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
 watchUntil=0;
 ignoreIdleUntil=performance.now()+300;
 resetActivity();
 // A timestamped Start already queued at the MIDI output can still fire after a panel Stop.
 if(mode()==='app'&&lastStartAt>performance.now())sendTransport(0xfc,lastStartAt);
 clearInterval(S.timer);S.timer=null;
 S.running=false;S.sent=null;
 try{window.JDXiViz?.transport(false)}catch{}
 status(mode()==='app'?'Stopped on the JD-Xi.':'JD-Xi clock: stopped');render();
}
let inClockAt=0,inTickMs=0;
function realtime(b){
 if(b===0xf8){const t=performance.now();if(inClockAt){const d=t-inClockAt;if(d>0&&d<250)inTickMs=inTickMs?inTickMs*.9+d*.1:d}inClockAt=t}
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
  const boundary=S.patStart+curBars()*96,leadTicks=Math.max(1,Math.round((clamp(+$('perflead').value,0,500,30)+24)/S.tickMs));
  if(S.sent===null&&nextIdx()!==null&&S.k>=boundary-leadTicks&&S.k<boundary){if(launchNow(slots[nextIdx()].code)){S.sent=nextIdx();render()}}
  if(S.k>=boundary)transition(boundary,now);
 }else if(b===0xfa&&mode()==='follow'){S.running=true;S.lastTickAt=now;S.k=0;S.patStart=0;S.patStartT=now;S.sent=null;render()}
 else if(b===0xfb&&mode()==='follow'){S.running=true;S.lastTickAt=now;render()}
 
}
/* ---- pattern changed on the JD-Xi itself (Bank Select 85 + Program Change) ---- */
const inBank={};
function codeFrom(lsb,pc){const i=LSBS.indexOf(lsb);if(i<0||pc<0||pc>127)return null;return String.fromCharCode(65+i*2+(pc>=64?1:0))+String((pc%64)+1).padStart(2,'0')}
function remoteProgram(code){
 const now=performance.now();
 if(now-lastProgSentAt<500)return;
 progEpoch++;                       /* echo of our own program change */
 const idx=slots.findIndex(x=>x.code===code);
 if(idx>=0&&(idx===S.cur||idx===S.sent))return;          /* already what we think is playing / just sent */
 if(idx<0&&S.ext===code&&S.cur==null)return;
 if(idx>=0){S.cur=idx;S.curBars=bars(idx);S.last=idx;S.ext=null;if(S.sent===null&&nextIdx()===idx)queue.shift()}
 else{S.cur=null;S.curBars=null;S.ext=code}
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
 if(watchUntil&&m[0]>=0x80&&m[0]<0xf0)watchUntil=0;   /* the JD-Xi is answering: it is listening */
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
 watchUntil=0;
 ignoreIdleUntil=performance.now()+300;
 resetActivity();
 clearInterval(S.timer);S.timer=null;
 /* clock ticks are queued up to ~120 ms ahead and cannot be recalled, so Stop goes out after the last queued tick */
 if(sendStop&&S.running){sendTransport(0xfc,mode()==='app'?Math.max(performance.now(),S.nextT):0)}
 const was=S.running;
 S.running=false;S.sent=null;
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
 const barsLabel=document.createElement('label');barsLabel.textContent='Bars';
 const bi=document.createElement('input');bi.type='number';bi.min=1;bi.max=16;bi.value=slot.bars;
 bi.onchange=()=>{slot.bars=clamp(Math.round(+bi.value),1,16,4);bi.value=slot.bars;saveSlots()};
 barsLabel.append(bi);
 const mk=(txt,cls,title,fn)=>{const b=document.createElement('button');b.type='button';b.className='perf-mini '+cls;b.textContent=txt;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b};
 const btns=document.createElement('div');btns.className='perf-btns';
 const bPlay=mk('▶ Play','perf-go','Play this pattern now',()=>playNow(i));
 const bLoop=mk('⟲ Loop','perf-loop','Loop this pattern: it plays after the current one and keeps repeating',()=>loopIt(i));
 const bQ=mk('+ Queue','perf-q','Add this pattern to the end of the queue',()=>enqueue(i));
 btns.append(bPlay,bLoop,bQ);
 const top=document.createElement('div');top.className='perf-top';top.append(head,badge);
 const row=document.createElement('div');row.className='perf-row';row.append(code,barsLabel);
 card.append(top,row,btns);perfSlots.append(card);
 cards.push({card,badge,code});
});

function guard(){
 if(window.JDXiTransfer?.busy()){status('Finish the pattern transfer first.');return false}
 if(window.JDXiSteps?.playing()){status('Stop the step sequencer first.');return false}
 return true;
}
/* Play: start this pattern right now (restarts the JD-Xi sequencer on the app clock). The queue is kept. */
function playNow(i){
 if(!guard())return;
 if(mode()==='app'){appStart(i);return}
 if(launchNow(slots[i].code)){
  S.cur=i;S.curBars=bars(i);S.last=i;S.sent=null;
  if(S.running){S.patStart=S.k;S.patStartT=performance.now()}
  status('Loaded '+slots[i].code+'. Press play on the JD-Xi; the page follows its clock.');render();
 }
}
/* Queue: add to the end of the list; each entry plays its bars, then the next one is triggered. */
function enqueue(i){
 if(!guard())return;
 if(queue.length>=16){status('The queue is full (16).');return}
 queue.push({i,bars:bars(i)});
 status(S.running?'Pattern '+(i+1)+' queued as #'+queue.length+'.':'Pattern '+(i+1)+' queued. Press START (the queue is played from the top).');
 render();
}
/* Loop: after the current pattern (and anything already sent) this one plays and keeps looping. */
function loopIt(i){
 if(!guard())return;
 if(!S.running){playNow(i);return}
 const keep=S.sent!==null?1:0;
 queue.length=Math.min(queue.length,keep);
 if(keep&&queue[0].i===i){status('Pattern '+(i+1)+' is already next and will loop.')}
 else if(!keep&&i===S.cur){status('Pattern '+(i+1)+' loops.')}
 else{queue.push({i,bars:bars(i)});status('Pattern '+(i+1)+' loops after the current pattern.')}
 render();
}
function dequeue(n){
 if(n===0&&S.sent!==null){status('Already sent to the JD-Xi: this pattern plays next.');return}
 queue.splice(n,1);render();
}

const qList=$('perfqueue');
let qKey=null;
function renderQueue(){
 const key=queue.map(e=>e.i+':'+e.bars).join(',')+'|'+(S.sent!==null);
 if(key===qKey)return;
 qKey=key;
 qList.replaceChildren();
 queue.forEach((e,n)=>{
  const li=document.createElement('li');li.className='perf-qitem'+(n===0?' first':'');
  const num=document.createElement('span');num.className='pq-n';num.textContent=n+1;
  const name=document.createElement('span');name.className='pq-name';
  const sentNow=n===0&&S.sent!==null;
  name.textContent='Pattern '+(e.i+1)+' · '+slots[e.i].code+(sentNow?' · sent':'');
  const bl=document.createElement('label');bl.className='pq-bars';
  const bi=document.createElement('input');bi.type='number';bi.min=1;bi.max=16;bi.value=e.bars;bi.setAttribute('aria-label','Bars for queue entry '+(n+1));
  bi.onchange=()=>{e.bars=clamp(Math.round(+bi.value),1,16,4);bi.value=e.bars};
  bl.append(bi,' bars');
  const x=document.createElement('button');x.type='button';x.className='perf-mini pq-x';x.textContent='✕';x.title='Remove from queue';x.setAttribute('aria-label','Remove from queue');
  x.disabled=sentNow;x.onclick=()=>dequeue(n);
  li.append(num,name,bl,x);qList.append(li);
 });
 $('perfqempty').hidden=queue.length>0;
 $('perfqclear').hidden=queue.length===0;
 $('perfqloop').hidden=queue.length===0;
 if(queue.length)$('perfqloop').textContent='Then Pattern '+(queue[queue.length-1].i+1)+' keeps looping.';
}
$('perfqclear').onclick=()=>{queue.length=S.sent!==null?Math.min(1,queue.length):0;render();status('Queue cleared.')};

function render(){
 const nIdx=nextIdx();
 cards.forEach((c,i)=>{
  const isCur=S.cur===i&&S.running,isNext=nIdx===i||S.sent===i&&S.cur!==i;
  const pos=[];queue.forEach((e,n)=>{if(e.i===i)pos.push(n+1)});
  c.card.classList.toggle('current',isCur);c.card.classList.toggle('next',!!isNext&&!isCur);
  c.badge.textContent=isCur?'NOW':pos.length?'Q'+pos.join(' Q'):'';
 });
 const f=i=>i==null?(S.ext?S.ext+' · from JD-Xi':'—'):slots[i].code+' · Pattern '+(i+1);
 $('perfnowtxt').textContent=S.running?f(S.cur):'Stopped';
 $('perfnexttxt').textContent=nIdx!=null?f(nIdx)+' · '+queue[0].bars+' bars'+(queue.length>1?' (+'+(queue.length-1)+' more)':''):(S.running?'— (current loops)':(S.last!=null?f(S.last)+' (START)':'—'));
 const follow=mode()==='follow';
 $('perfstart').disabled=follow||S.running;
 $('perfstop').disabled=follow;
 $('perftransport').classList.toggle('running',S.running);
 $('perftransporthint').textContent=follow?'Follow mode: start and stop on the JD-Xi itself.':(S.running?'Playing':'Stopped');
 $('perfstandbywrap').hidden=mode()!=='app';
 $('perfidlewrap').hidden=mode()!=='app';
 $('perfbpmwrap').hidden=mode()!=='app';
 renderQueue();
}
function tickUi(){
 if(mode()==='follow'&&S.running&&performance.now()-S.lastTickAt>700)remoteStop();
 let pos=0;
 if(S.running){pos=mode()==='app'?Math.max(0,(performance.now()-S.patStartT)/S.tickMs/96):Math.max(0,(S.k-S.patStart)/96)}
 const n=curBars();
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
 app:'Set the JD-Xi to Sync Mode = SLAVE (it then waits for clock). Keep clock while stopped lets you try Play on the synth while the app is idle. START (or ▶ Play on a pattern) selects the program, starts the JD-Xi sequencer and sends clock at the tempo above; STOP stops it. + Queue lines patterns up: each plays its bars, then the next is triggered, and the last one keeps looping. Select the matching ClockSource (USB or MIDI) on the synth. Select its MIDI input in this app to receive panel Start/Stop. Look for IN FA / IN FC in the MIDI log. When silence detection is on, repeated incoming notes arm a fallback: two beats of inactivity (at least one second) stop playback. Turn it off for patterns with long rests or sustained notes.',
 follow:'Keep the JD-Xi on Sync Mode = MASTER. Press ▶ Play on a pattern to load it, start and stop playback on the JD-Xi itself; this page counts the JD-Xi’s clock to find the end of each pattern. Needs the JD-Xi’s MIDI input port selected.'
};
const applyMode=()=>{$('perfhelp').textContent=HELP[mode()];render()};
/* Sync readout: the JD-Xi's Sync Mode is not readable/writable over SysEx (see SYSTEM_MIDI_MATRIX.md), so it is read from
   the MIDI clock the synth sends: clock arriving = JD-Xi is MASTER; none = SLAVE (or a stopped master). */
const syncVal=$('perfsyncval');
function syncReadout(){
 const live=inClockAt&&performance.now()-inClockAt<700,input=api()?.hasInput?.();
 let txt,cls='';
 if(live){const bpm=inTickMs?Math.round(60000/(inTickMs*24)):0;txt='MASTER'+(bpm?' · '+bpm+' BPM':'');cls=mode()==='app'?'warn':'on';if(mode()==='app')txt+=' ⚠ set JD-Xi to SLAVE'}
 else if(!input){txt='— (no MIDI input)'}
 else{txt='SLAVE / no clock'}
 if(syncVal.textContent!==txt)syncVal.textContent=txt;
 syncVal.className='perf-syncval'+(cls?' '+cls:'');
}
setInterval(syncReadout,400);syncReadout();
$('perfsyncbtn').onclick=()=>{
 $('perfmode').value=mode()==='app'?'follow':'app';
 $('perfmode').onchange();
 status(mode()==='app'?'Clock: this app sends clock. Set the JD-Xi Sync Mode to SLAVE on the synth.':'Clock: following the JD-Xi. Set the JD-Xi Sync Mode to MASTER on the synth.');
};
$('perfmode').onchange=()=>{stopEngine(false);S.cur=null;ls.set('jdxi-perf-mode',mode());applyMode();status(mode()==='app'?'Press START or ▶ Play on a pattern.':'Press ▶ Play on a pattern to load it.')};
$('perfstart').onclick=()=>{
 if(!guard())return;
 if(mode()!=='app'){status('Follow mode: press play on the JD-Xi itself.');return}
 if(S.running)return;
 let idx=S.last!=null?S.last:0,nb=null;
 if(queue.length){const e=queue.shift();idx=e.i;nb=e.bars}
 appStart(idx,nb);
};
$('perfstop').onclick=()=>{
 const was=S.running;
 stopEngine(true);
 if(!was&&mode()==='app')sendTransport(0xfc,0);   /* always tell the JD-Xi to stop, even if the page thought it was idle */
 S.cur=null;S.ext=null;
 render();status('Stopped.')};
$('perfpanic').onclick=()=>{const a=api();if(!a?.connected()){status('Connect MIDI first');return}
 for(let ch=0;ch<16;ch++){a.send([0xb0|ch,120,0]);a.send([0xb0|ch,123,0])}status('All notes off sent')};
applyMode();
/* read-only view of the engine for the visualizer */
window.JDXiPerfState=()=>{
 const n=curBars(),pos=S.running?(mode()==='app'?Math.max(0,(performance.now()-S.patStartT)/S.tickMs/96):Math.max(0,(S.k-S.patStart)/96)):0;
 return {running:S.running,bpm:mode()==='app'?clamp(+$('perfbpm').value,40,240,120):60000/S.tickMs/24,frac:Math.min(1,pos/n),bar:Math.min(n,Math.floor(pos)+1),bars:n,cur:S.cur,code:S.cur==null?(S.ext||''):slots[S.cur].code};
};
})();
