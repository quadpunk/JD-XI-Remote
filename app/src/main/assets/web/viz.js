(()=>{
/* Performance visualizer, neon "studio display" style. Web MIDI carries no audio, so the picture is driven by the MIDI the
   app sends and receives (notes, velocity, channel, CC74/CC71) and by the pattern clock of the Performance page.
   Optionally the JD-Xi's USB audio can be analysed (getUserMedia; analysed only, never played back) for a real spectrum/scope.
   Views: tape deck, spectrum per part, oscilloscope, mixer, particles, piano roll, step sequencer,
   pattern display, channel activity, a dashboard of six at once, plus orbs and radial. */
const $=id=>document.getElementById(id);
const ls={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v}catch{return d}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}}};
const MODES=[['tape','Tape deck'],['spectrum','Spectrum'],['scope','Oscilloscope'],['mixer','MIDI mixer'],['particles','Particles'],['roll','Piano roll'],['steps','Step sequencer'],['pattern','Pattern display'],['activity','Channel activity'],['dash','Dashboard (6 views)'],['orbs','Part orbs'],['radial','Radial'],['auto','Auto-cycle']];
const CYCLE=['tape','spectrum','scope','mixer','particles','roll','steps','pattern','activity','dash'];
const PN=['D1','D2','AN','DR'],PFULL=['Digital 1','Digital 2','Analog','Drums'];
const PC=['#3d8bff','#d84bff','#25e08a','#ffd23f'];
const partIndex=ch=>ch===0?0:ch===1?1:ch===2?2:ch===9?3:-1;
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return 'rgba('+(n>>16)+','+((n>>8)&255)+','+(n&255)+','+a+')'};
const lerp=(a,b,t)=>a+(b-a)*t,clamp01=v=>Math.max(0,Math.min(1,v));

/* ---------- state fed by MIDI ---------- */
const NBP=16;
const held=new Map(),rollNotes=[],rings=[],partLevel=[0,0,0,0],ccs={74:64,71:64,1:0},ccT={t:0};
const impP=[0,1,2,3].map(()=>new Float32Array(NBP));
const grid=[0,1,2,3].map(()=>Array.from({length:16},()=>({vel:0,t:0})));
const parts=[];                     /* particle pool */
/* -1 = transport stopped: no free-running playhead any more (it used to keep ticking at the BPM clock) */
function stepNow(now){
 const ps=perf();
 if(ps&&ps.running)return Math.floor(ps.frac*ps.bars*16)%16;
 return -1;
}
function noteOn(ch,n,vel){
 const now=performance.now(),k=ch+':'+n,p=partIndex(ch),a=vel/127;
 const r={ch,n,t0:now,t1:null};rollNotes.push(r);if(rollNotes.length>500)rollNotes.shift();
 held.set(k,{ch,n,vel,t0:now,roll:r});
 if(p>=0){
  partLevel[p]=Math.max(partLevel[p],a);rings.push({p,t0:now,v:a});if(rings.length>40)rings.shift();
  const b=p===3?(n<40?[0,3]:n<44?[5,9]:n<50?[8,12]:[12,15]):(()=>{const c=Math.round((n-24)/84*(NBP-1));return [Math.max(0,c-1),Math.min(NBP-1,c+1)]})();
  for(let i=b[0];i<=b[1];i++)impP[p][i]=Math.max(impP[p][i],a);
  const st=Math.max(0,stepNow(now));grid[p][st]={vel:vel,t:now};
  const cnt=Math.round(8+a*26);for(let i=0;i<cnt;i++)spawn(p,n,a);
 }
}
function noteOff(ch,n){const k=ch+':'+n,h=held.get(k);if(h){if(h.roll)h.roll.t1=performance.now();held.delete(k)}}
function allOff(ch){const t=performance.now();for(const [k,h] of held)if(h.ch===ch){if(h.roll)h.roll.t1=t;held.delete(k)}}
window.JDXiViz={
transport(run){ /* called by performance.js on every start/stop, wherever it came from (app or JD-Xi) */
 if(run)return;
 const t=performance.now();for(const h of held.values())if(h.roll)h.roll.t1=t;held.clear();
 rings.length=0;parts.length=0;
 for(const a of impP)a.fill(0);for(let i=0;i<4;i++)partLevel[i]=0;
},
midi(d){
 if(!d||d.length<2)return;const s=d[0]&0xf0,ch=d[0]&15;
 if(s===0x90&&d[2]>0)noteOn(ch,d[1],d[2]);
 else if(s===0x80||(s===0x90&&d[2]===0))noteOff(ch,d[1]);
 else if(s===0xb0){if(d[1]===123||d[1]===120)allOff(ch);else if(d[1] in ccs){ccs[d[1]]=d[2];ccT.t=performance.now()}}
}};
function spawn(p,n,a){
 if(parts.length>800)parts.shift();
 const ang=((n%12)/12+Math.random()*.08)*Math.PI*2-Math.PI/2,sp=40+Math.random()*120*(.4+a);
 parts.push({p,ang,r:0,vr:sp,va:(Math.random()-.5)*.8,life:0,max:900+Math.random()*900,sz:1+Math.random()*2.2});
}

/* ---------- optional audio ---------- */
let actx=null,an=null,stream=null,freq=null,wave=null,audioLevel=0;
async function fillDevices(){
 try{
  const devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
  const sel=$('viz-dev');const cur=sel.value;sel.replaceChildren();
  devs.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Input '+(i+1));sel.append(o)});
  const jd=devs.find(d=>/JD.?-?Xi|Roland/i.test(d.label));
  sel.value=cur&&devs.some(d=>d.deviceId===cur)?cur:(jd?jd.deviceId:(devs[0]?.deviceId||''));
  sel.hidden=devs.length<2;
 }catch{}
}
async function startAudio(){
 const st=$('viz-status');
 if(!navigator.mediaDevices?.getUserMedia){st.textContent='Audio capture is not available here (needs https or localhost).';return}
 try{
  stopAudio();
  const dev=$('viz-dev').value;
  stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:dev?{exact:dev}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const src=actx.createMediaStreamSource(stream);an=actx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=.65;src.connect(an);
  freq=new Uint8Array(an.frequencyBinCount);wave=new Float32Array(an.fftSize);
  await fillDevices();
  st.textContent='Audio: '+(stream.getAudioTracks()[0]?.label||'audio input')+' (analysed only, not played)';$('viz-audio').textContent='Stop audio';
 }catch(e){st.textContent='Audio not available: '+(e.name==='NotAllowedError'?'permission refused':e.message);stopAudio()}
}
function stopAudio(){
 try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{actx?.close()}catch{}
 stream=actx=an=freq=wave=null;audioLevel=0;$('viz-audio').textContent='Use JD-Xi audio';
}
$('viz-audio').onclick=()=>{if(an){stopAudio();$('viz-status').textContent='MIDI-driven visuals.'}else startAudio()};

/* ---------- derived signals each frame ---------- */
const NB=48,bars=new Float32Array(NB),peaks=new Float32Array(NB);
const barsP=[0,1,2,3].map(()=>new Float32Array(NBP)),peaksP=[0,1,2,3].map(()=>new Float32Array(NBP));
const HL=260,hist=[0,1,2,3].map(()=>new Float32Array(HL));let histT=0,level=0;
function perf(){try{return window.JDXiSteps?.visualState()||window.JDXiPerfState?.()||null}catch{return null}}
function signals(dt,now){
 const k=Math.pow(.84,dt/16.7);
 /* per part spectra (MIDI driven) */
 const tp=[0,1,2,3].map(()=>new Float32Array(NBP));
 for(const h of held.values()){
  const p=partIndex(h.ch);if(p<0||p===3)continue;
  const a=h.vel/127*(.6+.2*Math.sin(now/90+h.n));
  for(const [off,mul] of [[0,1],[12,.5],[19,.35],[24,.22]]){const c=Math.round((h.n+off-24)/84*(NBP-1));for(let j=-1;j<=1;j++){const i=c+j;if(i>=0&&i<NBP)tp[p][i]=Math.max(tp[p][i],a*mul*(j===0?1:.55))}}
 }
 for(let p=0;p<4;p++)for(let i=0;i<NBP;i++){
  impP[p][i]*=Math.pow(.9,dt/16.7);const t=Math.max(tp[p][i],impP[p][i]),b=barsP[p][i];
  barsP[p][i]=t>b?b+(t-b)*.7:b*k+t*(1-k);peaksP[p][i]=Math.max(barsP[p][i],peaksP[p][i]-dt*.0006);
 }
 /* combined spectrum (audio or folded MIDI) */
 let tot=0;
 for(let i=0;i<NB;i++){
  let t=0;
  if(an&&i===0){an.getByteFrequencyData(freq);an.getFloatTimeDomainData(wave);let s=0;for(let j=0;j<wave.length;j++)s+=wave[j]*wave[j];audioLevel=Math.min(1,Math.sqrt(s/wave.length)*3.2)}
  if(an){const sr=actx.sampleRate,bin=f=>Math.min(freq.length-1,Math.round(f*an.fftSize/sr)),f0=40*Math.pow(400,i/NB),f1=40*Math.pow(400,(i+1)/NB);let m=0;for(let b=bin(f0);b<=Math.max(bin(f0),bin(f1));b++)m=Math.max(m,freq[b]);t=Math.pow(m/255,1.4)*(.75+.5*i/NB)}
  else{const q=i/NB*NBP,i0=Math.min(NBP-1,Math.floor(q));for(let p=0;p<4;p++)t=Math.max(t,barsP[p][i0])}
  bars[i]=t>bars[i]?bars[i]+(t-bars[i])*.7:bars[i]*k+t*(1-k);tot+=bars[i];peaks[i]=Math.max(bars[i],peaks[i]-dt*.0006);
 }
 const lv=an?audioLevel:Math.min(1,tot/NB*3.4);level+=(lv-level)*.35;
 for(let p=0;p<4;p++)partLevel[p]*=Math.pow(.92,dt/16.7);
 for(const h of held.values()){const p=partIndex(h.ch);if(p>=0)partLevel[p]=Math.max(partLevel[p],h.vel/127*.55)}
 histT+=dt;while(histT>=40){histT-=40;for(let p=0;p<4;p++){hist[p].copyWithin(0,1);hist[p][HL-1]=partLevel[p]}}
}

/* ---------- canvas helpers ---------- */
const cv=$('viz-canvas'),g=cv.getContext('2d');
let W=0,H=0,dpr=1,full=false;
function resize(){
 dpr=Math.min(2,window.devicePixelRatio||1);const r=cv.getBoundingClientRect();W=Math.max(200,r.width);H=Math.max(100,r.height);
 cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);g.setTransform(dpr,0,0,dpr,0,0);
}
function rr(x,y,w,h,r){g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,r);else g.rect(x,y,w,h)}
function glow(c,b){g.shadowColor=c;g.shadowBlur=b}
function noGlow(){g.shadowBlur=0;g.shadowColor='transparent'}
function title(txt,x=10,y=16){g.fillStyle='rgba(170,215,255,.75)';g.font='600 '+Math.max(10,Math.round(Math.min(W,H*1.6)/46))+'px system-ui,sans-serif';g.textAlign='left';g.fillText(txt.toUpperCase(),x,y)}
function grid2(x,y,w,h,nx,ny,a=.08){g.strokeStyle='rgba(120,190,255,'+a+')';g.lineWidth=1;g.beginPath();for(let i=0;i<=nx;i++){const xx=x+w*i/nx;g.moveTo(xx,y);g.lineTo(xx,y+h)}for(let i=0;i<=ny;i++){const yy=y+h*i/ny;g.moveTo(x,yy);g.lineTo(x+w,yy)}g.stroke()}
function legend(x,y,gap=44){g.font='600 11px system-ui,sans-serif';g.textAlign='left';for(let p=0;p<4;p++){g.fillStyle=PC[p];g.fillRect(x+p*gap,y-8,9,9);g.fillStyle='rgba(220,235,255,.85)';g.fillText(PN[p],x+p*gap+13,y)}}
function inRect(x,y,w,h,fn){const sw=W,sh=H;g.save();g.translate(x,y);rr(0,0,w,h,10);g.clip();W=w;H=h;try{fn()}finally{W=sw;H=sh;g.restore()}}
function frameRect(x,y,w,h){g.save();glow('rgba(70,140,255,.5)',8);g.strokeStyle='rgba(90,160,255,.45)';g.lineWidth=1.2;rr(x+.5,y+.5,w-1,h-1,10);g.stroke();g.restore();noGlow();g.fillStyle='rgba(6,12,26,.55)';rr(x+.5,y+.5,w-1,h-1,10);g.fill()}
function ledColumn(x,y,w,h,v,n=12,grey=false){const gap=2,sh=(h-gap*(n-1))/n;for(let i=0;i<n;i++){const f=i/n,on=v>f+.001;const c=grey?(f>.8?'#ffffff':f>.58?'#d2d4d9':'#a3a6ae'):(f>.8?'#ff4d4d':f>.58?'#ffc23a':'#37e07a');g.fillStyle=on?c:'rgba(255,255,255,.07)';if(on){glow(c,6)}g.fillRect(x,y+h-(i+1)*sh-i*gap,w,sh);noGlow()}}

/* ---------- 1. tape deck (endless loop, greyscale) ---------- */
/* The tape is an endless loop: it never ends, it just keeps circulating from reel to reel (and round the guide posts)
   whenever the synth plays. The reel radii stay constant, a pattern of tick marks on the tape travels along the loop. */
let tapeT=0,tapePos=0,wasRunning=false,tapeSpd=0;
function drawTape(dt){
 const ps=perf(),running=!!ps?.running,bpm=ps?.bpm||120;
 if(running&&!wasRunning)tapeT=0;wasRunning=running;if(running)tapeT+=dt/1000;
 tapeSpd=running?tapeSpd+(1-tapeSpd)*clamp01(dt/180):0;
 // Previous tape speed was 63 canvas units/s at 120 BPM.
 tapePos+=dt/1000*tapeSpd*(bpm/120)*50.4;
 const s=Math.min(W/640,H/260),ox=(W-640*s)/2,oy=(H-260*s)/2;
 g.save();g.translate(ox,oy);g.scale(s,s);
 /* body */
 const bg=g.createLinearGradient(0,10,0,250);bg.addColorStop(0,'#5a5d64');bg.addColorStop(1,'#34363c');
 g.fillStyle=bg;rr(10,10,440,240,16);g.fill();g.strokeStyle='#14151a';g.lineWidth=2;g.stroke();
 g.fillStyle='#d4d6da';rr(34,24,392,58,6);g.fill();g.strokeStyle='#8c8f96';g.lineWidth=1;g.stroke();
 g.fillStyle='#1c1d22';g.font='700 24px system-ui,sans-serif';g.textAlign='left';g.fillText('JD-Xi',48,62);
 g.textAlign='center';g.fillText(ps?.code||'—',230,62);g.textAlign='right';g.fillText(bpm.toFixed(1)+' BPM',414,62);
 /* window */
 g.fillStyle='#0d0e12';rr(64,94,332,92,10);g.fill();g.strokeStyle='#000';g.lineWidth=3;g.stroke();
 const cy=140,lx=140,rx=320,R=30;
 const tapeAng=tapePos/R;
 /* tape pack on both reels (constant: it is an endless loop) */
 for(const x of [lx,rx]){g.fillStyle='#26272c';g.beginPath();g.arc(x,cy,R,0,7);g.fill();
  g.strokeStyle='#3d3e45';g.lineWidth=1;for(let i=1;i<4;i++){g.beginPath();g.arc(x,cy,R-i*(R-16)/4,0,7);g.stroke()}}
 /* loop path: out from the bottom of the right reel, round the guide posts, back up from the top of the left reel */
 const pa=[[lx,cy+R],[lx+26,170],[rx-26,170],[rx,cy+R]];         /* lower run between the reels, passing the head */
 const pb=[[rx,cy-R],[rx-30,104],[lx+30,104],[lx,cy-R]];         /* upper run, returns the tape to the start */
 g.strokeStyle='#8e9098';g.lineWidth=3;g.lineJoin='round';
 g.beginPath();g.moveTo(...pa[0]);for(let i=1;i<pa.length;i++)g.lineTo(...pa[i]);g.stroke();
 g.beginPath();g.moveTo(...pb[0]);for(let i=1;i<pb.length;i++)g.lineTo(...pb[i]);g.stroke();
 /* moving tick marks along the tape so the motion is visible, they wrap round forever */
 const run=(pts,dir)=>{
  let len=0;const seg=[];for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);seg.push(l);len+=l}
  const gap=14,off=((tapePos*dir)%gap+gap)%gap;
  g.fillStyle='#e6e7ea';
  for(let d=off;d<len;d+=gap){let q=d,i=0;while(i<seg.length-1&&q>seg[i]){q-=seg[i];i++}
   const u=q/seg[i],x=pts[i][0]+(pts[i+1][0]-pts[i][0])*u,y=pts[i][1]+(pts[i+1][1]-pts[i][1])*u;g.fillRect(x-1,y-2.5,2,5)}
 };
 run(pa,-1);run(pb,-1);
 /* guide posts */
 g.fillStyle='#b9bbc2';for(const [x,y] of [[lx+26,170],[rx-26,170],[lx+30,104],[rx-30,104]]){g.beginPath();g.arc(x,y,4,0,7);g.fill()}
 const hub=x=>{g.save();g.translate(x,cy);g.rotate(tapeAng);g.fillStyle='#d0d1d6';g.beginPath();g.arc(0,0,16,0,7);g.fill();g.fillStyle='#0d0e12';g.beginPath();g.arc(0,0,10.5,0,7);g.fill();g.fillStyle='#d0d1d6';for(let i=0;i<6;i++){g.rotate(Math.PI/3);g.fillRect(8,-2.4,5.5,4.8)}g.restore()};
 hub(lx);hub(rx);
 /* head + counter */
 g.fillStyle='#7d8088';rr(212,170,56,14,3);g.fill();g.fillStyle='#e8e9ec';g.globalAlpha=.3+level*.7;g.fillRect(232,172,16,4);g.globalAlpha=1;
 const m=Math.floor(tapeT/60),sec=Math.floor(tapeT%60),t=Math.floor(tapeT*10%10);
 g.fillStyle='#1c1d22';g.font='600 13px ui-monospace,Consolas,monospace';g.textAlign='left';g.fillText(String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')+'.'+t,76,176);
 /* transport */
 const btn=(x,on,draw)=>{g.fillStyle=on?'#e6e7ea':'#2b2c32';rr(x,198,56,34,6);g.fill();g.strokeStyle='#0d0e12';g.lineWidth=2;g.stroke();g.fillStyle=on?'#1c1d22':'#b4b6bd';draw(x+28,215)};
 btn(150,running,(x,y)=>{g.beginPath();g.moveTo(x-6,y-8);g.lineTo(x+8,y);g.lineTo(x-6,y+8);g.closePath();g.fill()});
 btn(214,false,(x,y)=>{g.fillRect(x-7,y-8,5,16);g.fillRect(x+2,y-8,5,16)});
 btn(278,!running,(x,y)=>{g.fillRect(x-7,y-7,14,14)});
 /* VU panel */
 g.fillStyle='#0d0e12';rr(466,10,164,240,12);g.fill();g.strokeStyle='rgba(200,204,212,.35)';g.lineWidth=1.5;g.stroke();
 const L=clamp01(level*1.15),Rr=clamp01(level*(.88+.12*Math.sin(performance.now()/230)));
 g.fillStyle='#c9ccd3';g.font='700 14px system-ui,sans-serif';g.textAlign='center';
 g.fillText('IL',520,34);g.fillText('IR',578,34);
 ledColumn(508,46,24,172,L,14,true);ledColumn(566,46,24,172,Rr,14,true);
 g.fillStyle='rgba(200,204,212,.5)';g.font='600 10px system-ui,sans-serif';g.fillText('VU',548,238);
 g.restore();
}

/* ---------- 2. spectrum per part ---------- */
function drawSpectrum(){
 const top=Math.max(26,H*.16),bot=H-10,rows=16,rh=(bot-top)/rows,pad=14;
 title('Spectrum'+(an?' · audio':' · per part'));legend(W-190,16);
 const groups=4,gw=(W-pad*2-(groups-1)*14)/groups;
 for(let p=0;p<4;p++){
  const gx=pad+p*(gw+14),n=NBP,bw=(gw-(n-1)*2)/n;
  for(let i=0;i<n;i++){
   let v;
   if(an){let m=0;for(let j=0;j<3;j++)m=Math.max(m,bars[Math.min(NB-1,Math.floor((p*n+i)*NB/(n*4))+j)]);v=m}else v=barsP[p][i];
   v=clamp01(v);const lit=Math.round(v*rows),x=gx+i*(bw+2);
   for(let r=0;r<rows;r++){const on=r<lit;g.fillStyle=on?rgba(PC[p],.35+.65*(r/rows)):rgba(PC[p],.07);if(on&&r>=lit-2)glow(PC[p],7);g.fillRect(x,bot-(r+1)*rh+1,bw,rh-2);noGlow()}
   const pk=Math.min(rows-1,Math.round(clamp01(an?v:peaksP[p][i])*rows));if(pk>1){g.fillStyle='rgba(235,245,255,.85)';g.fillRect(x,bot-(pk+1)*rh+1,bw,2)}
  }
 }
}

/* ---------- 3. oscilloscope ---------- */
function partWave(p,x,t,hs){
 let v=0;
 for(const h of hs){const f=2+(h.n-24)/84*6,ph=x*Math.PI*2*f+t*3+h.n,a=h.vel/127/Math.max(1,hs.length)*.95;
  if(p===0)for(let k=1;k<=4;k++)v+=Math.sin(ph*k)/k*a*.6;
  else if(p===1)for(let k=1;k<=7;k+=2)v+=Math.sin(ph*k)/k*a*.75;
  else v+=(((ph/(Math.PI*2))%1)*2-1)*a*.8}
 return v;
}
function drawScope(now){
 title('Oscilloscope'+(an?' · audio':' · MIDI'));legend(W-190,16);
 const x0=10,y0=26,w=W-20,h=H-36,mid=y0+h/2,amp=h*.42,t=now/1000;
 grid2(x0,y0,w,h,10,6,.09);
 g.strokeStyle='rgba(120,190,255,.2)';g.beginPath();g.moveTo(x0,mid);g.lineTo(x0+w,mid);g.stroke();
 g.lineWidth=2.2;g.lineJoin='round';
 const trace=(col,fn)=>{g.strokeStyle=col;glow(col,14);g.beginPath();for(let i=0;i<=w;i+=2){const y=mid-fn(i/w)*amp;i?g.lineTo(x0+i,y):g.moveTo(x0+i,y)}g.stroke();noGlow()};
 if(an){let s=0;for(let i=1;i<wave.length/2;i++)if(wave[i-1]<0&&wave[i]>=0){s=i;break}trace('#38e8ff',u=>(wave[s+Math.floor(u*wave.length/2)]||0)*2.2)}
 else{
  let any=false;
  for(let p=0;p<4;p++){
   const hs=[...held.values()].filter(h=>partIndex(h.ch)===p).slice(-3);
   if(p===3){const e=Math.max(...impP[3]);if(e>.05){any=true;trace(PC[3],u=>(Math.random()-.5)*e*1.4*Math.exp(-u*3))}continue}
   if(hs.length){any=true;trace(PC[p],u=>partWave(p,u,t,hs))}
  }
  if(!any)trace('rgba(56,232,255,.55)',u=>Math.sin(u*Math.PI*6+t*2)*.08+Math.sin(u*Math.PI*14-t*3)*.03);
 }
}

/* ---------- 4. MIDI mixer ---------- */
function drawMixer(now){
 title('MIDI mixer');legend(W-190,16);
 const lv=window.JDXiMixer?.levels?.()||PN.map(()=>({level:100,eff:100,mute:false,solo:false})),top=Math.max(46,H*.2),bot=H-26,cw=(W-20)/4;
 for(let p=0;p<4;p++){
  const cx=10+cw*(p+.5),L=lv[p],v=(L.eff??L.level)/127,tk=bot-top;
  g.fillStyle=PC[p];g.fillRect(cx-cw*.36,top-17,9,9);g.fillStyle='rgba(225,238,255,.9)';g.font='700 12px system-ui,sans-serif';g.textAlign='left';g.fillText(PN[p],cx-cw*.36+14,top-8);
  g.fillStyle='rgba(255,255,255,.1)';rr(cx+8,top,5,tk,3);g.fill();
  g.fillStyle=rgba(PC[p],.55);rr(cx+8,bot-tk*v,5,tk*v,3);g.fill();
  const ky=bot-tk*v;g.fillStyle='#e9f1ff';glow(PC[p],10);rr(cx-2,ky-8,24,16,4);g.fill();noGlow();g.fillStyle='#0b1220';g.fillRect(cx+1,ky-1,18,2);
  const act=clamp01(partLevel[p]*(L.mute?0:1));ledColumn(cx-cw*.3,top,Math.min(14,cw*.12),tk,act*v+.0,10);
  g.fillStyle=L.mute?'#ff6b6b':L.solo?'#ffc23a':'rgba(200,222,255,.8)';g.font='700 11px ui-monospace,Consolas,monospace';g.textAlign='center';g.fillText(L.mute?'MUTE':L.solo?'SOLO':String(L.level),cx+10,H-8);
 }
}

/* ---------- 6. particles ---------- */
function drawParticles(dt,now){
 title('Particles');
 const cx=W/2,cy=H/2+4,R=Math.min(H*.32,W*.22),pulse=1+level*.16,t=now/1000;
 g.save();g.globalCompositeOperation='lighter';
 const grad=g.createConicGradient?g.createConicGradient(t*.4,cx,cy):null;
 if(grad){PC.forEach((c,i)=>grad.addColorStop(i/4,c));grad.addColorStop(1,PC[0])}
 g.lineWidth=3+level*5;g.strokeStyle=grad||'#6f7bff';glow('#7a6bff',22);g.beginPath();g.arc(cx,cy,R*pulse,0,7);g.stroke();noGlow();
 g.lineWidth=1;g.globalAlpha=.4;g.beginPath();g.arc(cx,cy,R*pulse*1.08,0,7);g.stroke();g.globalAlpha=1;
 /* ambient dots on the ring */
 for(let i=0;i<110;i++){const a=i/110*Math.PI*2+t*.2,rr2=R*pulse+Math.sin(i*3.1+t*2)*6*(1+level*3),c=PC[i%4];g.fillStyle=rgba(c,.5);g.fillRect(cx+Math.cos(a)*rr2-1,cy+Math.sin(a)*rr2-1,2,2)}
 for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.life+=dt;if(q.life>q.max){parts.splice(i,1);continue}
  q.r+=q.vr*dt/1000;q.vr*=Math.pow(.985,dt/16.7);q.ang+=q.va*dt/1000;const f=1-q.life/q.max,rad=R*pulse+(q.r*(i%2?1:-.5));
  g.fillStyle=rgba(PC[q.p],f*.9);g.beginPath();g.arc(cx+Math.cos(q.ang)*rad,cy+Math.sin(q.ang)*rad,q.sz*(.6+f),0,7);g.fill()}
 g.restore();
}

/* ---------- 7. piano roll (vertical waterfall) ---------- */
/* Keyboard along the top; every note is born on its key and then flows downwards, like a waterfall of history.
   A held note is a bar that grows downwards from the key, a released note keeps falling. */
const BLACK=[1,3,6,8,10];
function drawRoll(now){
 const win=6000,lo=36,hi=96,nn=hi-lo,kh=Math.min(64,H*.16),kt=26,fy=kt+kh,kw=W/nn,span=H-fy;
 title('Piano roll',10,16);
 for(let n=lo;n<hi;n++){const x=(n-lo)*kw,bl=BLACK.includes(n%12);g.fillStyle=bl?'rgba(255,255,255,.025)':'rgba(255,255,255,.05)';g.fillRect(x,fy,kw,span);
  if(n%12===0){g.fillStyle='rgba(120,190,255,.25)';g.fillRect(x,fy,1,span)}}
 for(const r of rollNotes){
  const p=partIndex(r.ch);if(p<0)continue;const col=PC[p];
  const yTop=fy+(r.t1==null?0:(now-r.t1)/win*span),yBot=fy+(now-r.t0)/win*span;
  if(yTop>H)continue;
  if(r.ch===9){const x=((r.n%12)/12)*(W-12)+6;g.fillStyle=col;glow(col,8);g.beginPath();g.arc(x,Math.min(H,yBot),3.5,0,7);g.fill();noGlow();continue}
  const x=(Math.max(lo,Math.min(hi-1,r.n))-lo)*kw,yb=Math.min(H,yBot);
  g.fillStyle=col;glow(col,9);rr(x+1,yTop,Math.max(2,kw-2),Math.max(4,yb-yTop),2);g.fill();noGlow();
 }
 const heldN=new Set([...held.values()].filter(h=>h.ch!==9).map(h=>h.n));
 for(let n=lo;n<hi;n++){if(BLACK.includes(n%12))continue;const x=(n-lo)*kw,on=heldN.has(n);g.fillStyle=on?'#38e8ff':'#dfe6f2';if(on)glow('#38e8ff',10);g.fillRect(x+.5,kt,kw-1,kh);noGlow()}
 for(let n=lo;n<hi;n++){if(!BLACK.includes(n%12))continue;const x=(n-lo)*kw,on=heldN.has(n);g.fillStyle=on?'#38e8ff':'#10131c';if(on)glow('#38e8ff',10);g.fillRect(x,kt,kw,kh*.62);noGlow()}
 g.fillStyle='#bfeaff';glow('#38e8ff',12);g.fillRect(0,fy,W,2);noGlow();
}

/* ---------- 8. step sequencer ---------- */
function drawSteps(now){
 title('Step sequencer');legend(W-190,16);
 const ps=perf(),bpm=ps?.bpm||120,barMs=4*60000/bpm,cur=stepNow(now);
 const lx=34,x0=lx+8,y0=30,gw=W-x0-12,gh=H-y0-12,cw=gw/16,ch=gh/4;
 for(let p=0;p<4;p++){
  g.fillStyle=PC[p];g.font='700 12px system-ui,sans-serif';g.textAlign='left';g.fillText(PN[p],8,y0+ch*(p+.5)+4);
  for(let s=0;s<16;s++){
   const c=grid[p][s],age=now-c.t,lit=c.vel>0?clamp01(1-age/(barMs*1.6)):0,x=x0+s*cw,y=y0+p*ch;
   g.fillStyle=(s%4===0)?'rgba(120,170,255,.12)':'rgba(120,170,255,.06)';rr(x+2,y+2,cw-4,ch-4,4);g.fill();
   if(lit>.02){g.fillStyle=rgba(PC[p],.25+.75*lit);glow(PC[p],10*lit);rr(x+2,y+2,cw-4,ch-4,4);g.fill();noGlow()}
  }
 }
 if(cur>=0){g.fillStyle='rgba(150,220,255,.22)';glow('#38e8ff',14);rr(x0+cur*cw,y0-3,cw,gh+6,5);g.fill();noGlow();
 g.strokeStyle='rgba(190,240,255,.9)';g.lineWidth=1.5;rr(x0+cur*cw+.5,y0-3,cw-1,gh+6,5);g.stroke()}
}

/* ---------- 9. pattern display ---------- */
function drawPattern(now){
 title('Pattern display');
 const ps=perf(),bpm=ps?.bpm||120,cur=stepNow(now),run=!!ps?.running;
 const fs=Math.min(H*.36,W*.12),y=H*.45;
 g.textAlign='left';g.fillStyle='#d6f6ff';glow('#38e8ff',16);g.font='700 '+fs+'px system-ui,sans-serif';g.fillText(ps?.code||'—',W*.06,y);noGlow();
 g.fillStyle='rgba(190,225,255,.85)';g.font='600 '+fs*.5+'px system-ui,sans-serif';g.fillText(bpm.toFixed(1)+' BPM',W*.06+fs*2.1,y);
 g.textAlign='right';g.fillStyle='#d6f6ff';glow('#38e8ff',16);g.font='700 '+fs*.9+'px system-ui,sans-serif';g.fillText((cur<0?'–':cur+1)+' / 16',W*.94,y);noGlow();
 g.fillStyle='rgba(150,190,230,.7)';g.font='600 '+Math.max(11,fs*.2)+'px system-ui,sans-serif';g.fillText(run?'BAR '+ps.bar+' OF '+ps.bars:'STOPPED',W*.94,y+fs*.34);
 const lw=(W*.88-15*6)/16,ly=H*.62,lh=H*.22;
 for(let i=0;i<16;i++){const on=i<=cur,x=W*.06+i*(lw+6);g.fillStyle=on?(i===cur?'#bff6ff':'#38e8ff'):'rgba(56,232,255,.1)';if(on)glow('#38e8ff',i===cur?18:8);rr(x,ly,lw,lh,5);g.fill();noGlow()}
 if(ps&&ps.running){const bw=W*.88,seg=bw/ps.bars;for(let b=0;b<ps.bars;b++){g.fillStyle=b+1<ps.bar?'#38e8ff':b+1===ps.bar?'#ffc23a':'rgba(255,255,255,.1)';g.fillRect(W*.06+b*seg+2,ly+lh+12,seg-4,5)}}
}

/* ---------- 10. channel activity ---------- */
function drawActivity(){
 title('Channel activity');
 const x0=40,rowH=(H-26)/4,w=W-x0-10;
 for(let p=0;p<4;p++){
  const y0=26+p*rowH,base=y0+rowH-6,hh=rowH-10;
  g.fillStyle=PC[p];g.font='700 12px system-ui,sans-serif';g.textAlign='left';g.fillText(PN[p],10,y0+rowH/2+4);
  g.fillStyle='rgba(120,170,255,.05)';rr(x0,y0,w,rowH-4,6);g.fill();
  const n=Math.min(HL,Math.floor(w/3)),st=HL-n;
  if(p===0||p===3){const bw=w/n;for(let i=0;i<n;i++){const v=hist[p][st+i];if(v<.01)continue;g.fillStyle=rgba(PC[p],.4+.6*v);g.fillRect(x0+i*bw,base-v*hh,Math.max(1.5,bw-1),v*hh)}}
  else{g.beginPath();for(let i=0;i<n;i++){const v=hist[p][st+i],x=x0+i*w/(n-1),y=base-(v*.85+.05*Math.sin(i*.4+p))*hh;i?g.lineTo(x,y):g.moveTo(x,y)}
   if(p===1){g.lineTo(x0+w,base);g.lineTo(x0,base);g.closePath();g.fillStyle=rgba(PC[p],.25);g.fill();g.strokeStyle=PC[p]}else{g.strokeStyle=PC[p]}
   g.lineWidth=2;glow(PC[p],8);g.stroke();noGlow()}
 }
}

/* ---------- bonus: orbs + radial ---------- */
function drawOrbs(now){
 const r0=Math.min(H*.2,W*.09);title('Part orbs');
 for(let p=0;p<4;p++){const x=W*(p+.5)/4,v=partLevel[p],y=H*.5+Math.sin(now/700+p*1.7)*3-v*8,r=r0+v*r0*.7;
  const gr=g.createRadialGradient(x,y,r*.1,x,y,r);gr.addColorStop(0,PC[p]);gr.addColorStop(1,rgba(PC[p],.15));
  g.globalAlpha=.4+v*.6;g.fillStyle=gr;glow(PC[p],16*v);g.beginPath();g.arc(x,y,r,0,7);g.fill();noGlow();g.globalAlpha=1;
  g.fillStyle='rgba(200,222,255,.85)';g.font='600 11px system-ui,sans-serif';g.textAlign='center';g.fillText(PFULL[p].toUpperCase(),x,H-8)}
 for(let i=rings.length-1;i>=0;i--){const q=rings[i],age=(now-q.t0)/700;if(age>1){rings.splice(i,1);continue}
  g.strokeStyle=PC[q.p];g.globalAlpha=(1-age)*.8;g.lineWidth=2;g.beginPath();g.arc(W*(q.p+.5)/4,H*.5,r0*(1+age*1.6)+q.v*6,0,7);g.stroke()}
 g.globalAlpha=1;
}
function drawRadial(now){
 title('Radial');
 const cx=W/2,cy=H/2,r0=Math.min(H*.2,W*.1),rm=Math.min(H*.46,W*.4),rot=now/6000;g.lineWidth=Math.max(2,W/NB/6);g.lineCap='round';
 for(let i=0;i<NB;i++){const a=rot+i/NB*Math.PI*2,v=clamp01(bars[i]),r1=r0+4,r2=r0+4+v*(rm-r0),c=PC[i%4];
  g.strokeStyle=rgba(c,.4+v*.6);glow(c,6*v);g.beginPath();g.moveTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);g.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2);g.stroke()}
 noGlow();g.lineCap='butt';g.fillStyle='rgba(56,232,255,'+(.2+level*.5)+')';g.beginPath();g.arc(cx,cy,r0*(.8+level*.5),0,7);g.fill();
}

/* ---------- dashboard: six panels at once ---------- */
function drawDash(dt,now){
 const wide=W>=820,cols=wide?3:2,rows=wide?2:3,gap=8,tw=(W-gap*(cols+1))/cols,th=(H-gap*(rows+1))/rows;
 const tiles=[()=>drawTape(dt),drawSpectrum,()=>drawMixer(now),()=>drawSteps(now),drawActivity,()=>drawPattern(now)];
 tiles.forEach((fn,i)=>{const x=gap+(i%cols)*(tw+gap),y=gap+Math.floor(i/cols)*(th+gap);frameRect(x,y,tw,th);inRect(x,y,tw,th,fn)});
}

/* ---------- loop ---------- */
let on=false,raf=0,last=0,mode=ls.get('jdxi-viz-mode','tape'),autoIdx=0,autoT=0;
if(!MODES.some(m=>m[0]===mode))mode='tape'; /* a saved 'xy' mode falls back to the tape deck */
function background(){const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#08101f');gr.addColorStop(1,'#04070f');g.fillStyle=gr;g.fillRect(0,0,W,H)}
function frame(now){
 raf=requestAnimationFrame(frame);
 const dt=Math.min(60,last?now-last:16);last=now;
 background();signals(dt,now);
 let m=mode;if(m==='auto'){autoT+=dt;if(autoT>12000){autoT=0;autoIdx=(autoIdx+1)%CYCLE.length}m=CYCLE[autoIdx]}
 cv.classList.toggle('tall',m==='dash'&&!full);
 ({tape:()=>drawTape(dt),spectrum:drawSpectrum,scope:()=>drawScope(now),mixer:()=>drawMixer(now),particles:()=>drawParticles(dt,now),roll:()=>drawRoll(now),steps:()=>drawSteps(now),pattern:()=>drawPattern(now),activity:drawActivity,dash:()=>drawDash(dt,now),orbs:()=>drawOrbs(now),radial:()=>drawRadial(now)})[m]();
}
function start(){if(raf)return;resize();last=0;raf=requestAnimationFrame(frame)}
function stop(){cancelAnimationFrame(raf);raf=0}

/* ---------- fullscreen (Fullscreen API where available, otherwise a full-window overlay) ---------- */
const box=$('viz');let wl=null,idleT=0;
function showBar(){box.classList.remove('idle');clearTimeout(idleT);if(full)idleT=setTimeout(()=>box.classList.add('idle'),3000)}
async function setFull(v){
 if(v===full)return;full=v;box.classList.toggle('full',v);document.documentElement.classList.toggle('viz-full',v);
 $('viz-full').textContent=v?'Exit full screen':'Full screen';
 if(v){try{await box.requestFullscreen?.()}catch{}try{wl=await navigator.wakeLock?.request('screen')}catch{}showBar()}
 else{clearTimeout(idleT);box.classList.remove('idle');if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}}try{wl?.release()}catch{}wl=null}
 resize();
}
const sel=$('viz-mode');MODES.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o)});sel.value=mode;
function nextMode(d){const i=MODES.findIndex(m=>m[0]===mode);mode=MODES[(i+d+MODES.length)%MODES.length][0];sel.value=mode;ls.set('jdxi-viz-mode',mode);autoT=0}
sel.onchange=()=>{mode=sel.value;ls.set('jdxi-viz-mode',mode)};
$('viz-full').onclick=()=>setFull(!full);
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&full)setFull(false)});
for(const ev of ['pointermove','pointerdown','touchstart'])box.addEventListener(ev,()=>{if(full)showBar()},{passive:true});
cv.addEventListener('click',()=>{if(full){nextMode(1);showBar()}});
window.addEventListener('keydown',e=>{
 if(!on||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(e.key==='Escape'&&full)setFull(false);
 else if(e.key==='f'||e.key==='F'){if(!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();setFull(!full)}}
 else if(full&&(e.key==='ArrowRight'||e.key===' ')){e.preventDefault();nextMode(1);showBar()}
 else if(full&&e.key==='ArrowLeft'){e.preventDefault();nextMode(-1);showBar()}
});
function setOn(v){
 on=v;$('viz-on').checked=on;cv.hidden=!on;$('viz-controls').hidden=!on;
 if(on){start()}else{if(full)setFull(false);stop();stopAudio()}
}
$('viz-on').onchange=()=>{setOn($('viz-on').checked);ls.set('jdxi-viz-enabled',on)};
new ResizeObserver(()=>{if(on)resize()}).observe(cv);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(on)start()});
$('viz-status').textContent='MIDI-driven visuals. Optional: analyse the JD-Xi USB audio for a real spectrum.';
setOn(ls.get('jdxi-viz-enabled','true')==='true');
})();
