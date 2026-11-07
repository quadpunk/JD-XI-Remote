(function(root){
'use strict';
/* DX7 voice parsing + conversion to a JD-Xi Digital Synth tone (pure functions, no DOM, no MIDI).

   The JD-Xi is subtractive (3 partials: oscillator -> filter -> amp), the DX7 is 6-operator FM, so this is an
   approximation, not a conversion. What we do:
   - carriers (the operators you hear, per the DX7 algorithm chart) become JD-Xi partials: pitch = frequency ratio,
     amp envelope = carrier EG, level = carrier output level
   - modulators (the rest) decide brightness: waveform, filter cutoff, filter envelope (their EG shapes the "FM bite")
   - LFO, pitch EG, velocity sensitivity and the voice name are carried over
   Parameter addresses/ranges follow the Roland JD-Xi MIDI Implementation (SuperNATURAL Synth Tone Common/Partial). */

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));
const ascii=a=>Array.from(a,x=>x>=32&&x<127?String.fromCharCode(x):' ').join('').trim();
const checksum=b=>(128-b.reduce((s,v)=>s+v,0)%128)%128;

/* Carrier operators for DX7 algorithms 1..32 (bottom row of the algorithm chart). */
const CARRIERS=[null,
 [1,3],[1,3],[1,4],[1,4],[1,3,5],[1,3,5],[1,3],[1,3],[1,3],[1,4],[1,4],[1,3],[1,3],[1,3],[1,3],
 [1],[1],[1],[1,4,5],[1,2,4],[1,2,4,5],[1,3,4,5],[1,2,4,5],[1,2,3,4,5],[1,2,3,4,5],[1,2,4],[1,2,4],
 [1,3,6],[1,2,3,5],[1,2,3,6],[1,2,3,4,5],[1,2,3,4,5,6]];

/* ---------------- parsing ---------------- */
function unpackSingle(p){ /* 155-byte voice, operators stored OP6 first */
 const ops=[];
 for(let b=0;b<6;b++){const o=b*21;
  ops[5-b]={rates:p.slice(o,o+4),levels:p.slice(o+4,o+8),rateScale:p[o+13],ams:p[o+14]&3,velSens:p[o+15]&7,level:p[o+16],mode:p[o+17]&1,coarse:p[o+18],fine:p[o+19],detune:p[o+20]-7};
 }
 return {name:ascii(p.slice(145,155)),algorithm:(p[134]&31)+1,feedback:p[135]&7,
  lfo:{speed:p[137],delay:p[138],pmd:p[139],amd:p[140],sync:p[141]&1,wave:p[142],pms:p[143]&7},
  pitchEg:{rates:p.slice(126,130),levels:p.slice(130,134)},transpose:p[144]-24,ops};
}
function unpackPacked(b){ /* 128-byte voice inside a 32-voice bank, 17 bytes per operator */
 const ops=[];
 for(let k=0;k<6;k++){const o=k*17;
  ops[5-k]={rates:b.slice(o,o+4),levels:b.slice(o+4,o+8),rateScale:b[o+12]&7,ams:b[o+13]&3,velSens:(b[o+13]>>2)&7,level:b[o+14],mode:b[o+15]&1,coarse:(b[o+15]>>1)&31,fine:b[o+16],detune:((b[o+12]>>3)&15)-7};
 }
 return {name:ascii(b.slice(118,128)),algorithm:(b[110]&31)+1,feedback:b[111]&7,
  lfo:{speed:b[112],delay:b[113],pmd:b[114],amd:b[115],sync:b[116]&1,wave:(b[116]>>1)&7,pms:(b[116]>>4)&7},
  pitchEg:{rates:b.slice(102,106),levels:b.slice(106,110)},transpose:b[117]-24,ops};
}
function parse(bytes){
 const voices=[];let pos=0;
 while(pos<bytes.length){
  if(bytes[pos++]!==0xf0)continue;
  const start=pos-1,end=bytes.indexOf(0xf7,pos);if(end<0)throw Error('Incomplete SysEx message');
  const msg=bytes.slice(start,end+1);pos=end+1;
  if(msg[1]!==0x43)continue;
  const format=msg[3],size=msg[4]*128+msg[5];
  if(!((format===0&&size===155)||(format===9&&size===4096)))continue;
  if(msg.length!==size+8)throw Error('DX7 message length mismatch');
  const payload=msg.slice(6,6+size);
  if(payload.some(v=>v>127)||checksum(payload)!==msg[6+size])throw Error('DX7 checksum or data invalid');
  if(format===0)voices.push(unpackSingle(payload));
  else for(let i=0;i<32;i++)voices.push(unpackPacked(payload.slice(i*128,(i+1)*128)));
 }
 if(!voices.length)throw Error('No supported DX7 single voice or 32-voice bank found');
 return voices;
}

/* ---------------- DX7 scales -> physical-ish values ---------------- */
const levelAmp=l=>l<=0?0:Math.pow(10,-(99-Math.min(99,l))*0.75/20);          /* ~0.75 dB per output-level step */
const rateTime=(rate,dist)=>Math.max(0.002,40*Math.pow(2,-rate/8)*Math.min(1,dist/99)); /* seconds for a level move */
const timeParam=t=>clamp(127*Math.log(Math.max(t,0.001)/0.001)/Math.log(10000),0,127);    /* 1 ms..10 s -> 0..127 */
const DET_CENTS=1.5;                                                          /* DX7 detune step, rough */

function envelope(o){
 const [r1,r2,r3,r4]=o.rates,[l1,l2,l3,l4]=o.levels,pk=Math.max(l1,l2,l3);
 return {
  a:timeParam(rateTime(r1,Math.abs(l1-l4))),
  d:timeParam(rateTime(r2,Math.abs(l2-l1))+rateTime(r3,Math.abs(l3-l2))),
  s:l3<=0?0:clamp(127*Math.pow(10,-(pk-l3)*0.75/20),0,127),
  r:timeParam(rateTime(r4,Math.abs(l3-l4))),
  decays:l3<pk-4
 };
}
const peakAmp=o=>levelAmp(o.level-(99-Math.max(o.levels[0],o.levels[1],o.levels[2])));
const susAmp=o=>levelAmp(o.level-(99-o.levels[2]));

const WAVES=['SAW','SQUARE','PW-SQUARE','TRIANGLE','SINE','NOISE','SUPER-SAW','PCM'];
const LFO_SHAPES=['TRI','SIN','SAW','SQR','S&H','RND'];
const DX_LFO_TO_JDXI=[0,2,2,3,1,4];            /* tri, saw down, saw up, square, sine, S&H */
const signed=v=>(v-64>0?'+':'')+(v-64);

/* ---------------- planning ---------------- */
function plan(v){
 const items=[],warnings=[],analysis=[];
 const carriers=CARRIERS[v.algorithm]||[1];
 const ops=v.ops.map((o,i)=>({...o,n:i+1}));
 const add=(block,off,val,group,label,text)=>items.push({block,off,val,group,label,text:text==null?String(val):text});

 /* --- carriers -> partials --- */
 let cars=ops.filter(o=>carriers.includes(o.n)).map(o=>({o,amp:peakAmp(o)})).filter(c=>c.amp>0.005).sort((a,b)=>b.amp-a.amp);
 if(!cars.length){warnings.push('No audible carrier operators (all carrier levels are 0); using operator 1.');cars=[{o:ops[0],amp:1}]}
 const parts=[];
 for(const c of cars){
  const o=c.o;let ratio=o.mode===1?1:(o.coarse===0?0.5:o.coarse)*(1+o.fine/100);
  if(o.mode===1)warnings.push('Operator '+o.n+' uses a fixed frequency; it is treated as ratio 1:1.');
  const total=1200*Math.log2(ratio)+o.detune*DET_CENTS+v.transpose*100;
  let st=Math.round(total/100);const cents=Math.round(total-st*100);
  let folded=false;while(st>24){st-=12;folded=true}while(st<-24){st+=12;folded=true}
  const ex=parts.find(p=>p.st===st&&Math.abs(p.cents-cents)<=3);
  if(ex){ex.amp+=c.amp;ex.ops.push(o.n);continue}
  parts.push({st,cents,folded,amp:c.amp,o,ops:[o.n],ratio});
 }
 if(parts.length>3){warnings.push('The voice has '+parts.length+' distinct carriers; the 3 strongest are used (JD-Xi has 3 partials).');parts.length=3}
 const top=parts[0].amp;

 /* --- modulators -> brightness --- */
 const mods=ops.filter(o=>!carriers.includes(o.n)&&o.level>0&&Math.max(...o.levels)>0);
 const fbIdx=v.feedback/7*0.8;
 const iPk=mods.reduce((s,o)=>s+peakAmp(o)*2,0)+fbIdx,iSu=mods.reduce((s,o)=>s+susAmp(o)*2,0)+fbIdx;
 const bright=i=>1-Math.exp(-1.2*i);
 const cutSu=clamp(30+bright(iSu)*97,0,127),cutPk=clamp(30+bright(iPk)*97,0,127);
 const wave=(v.feedback>=5||iPk>=1.2)?0:iPk>=0.5?1:iPk>=0.15?3:4;
 const lead=mods.slice().sort((a,b)=>peakAmp(b)-peakAmp(a))[0];
 const filtEnv=lead?envelope(lead):null;
 const sweep=cutPk-cutSu>=4&&filtEnv;
 const modVel=mods.length?mods.reduce((s,o)=>s+o.velSens,0)/mods.length:0;
 const carVel=parts.reduce((s,p)=>s+p.o.velSens,0)/parts.length;
 const inharmonic=mods.some(o=>o.mode===0&&o.coarse>0&&Math.abs(o.fine)>5);
 const lfoV=v.lfo;

 /* --- Tone common --- */
 const name=(v.name||'DX7 Import').slice(0,12).padEnd(12,' ');
 for(let i=0;i<12;i++)add('common',i,name.charCodeAt(i),'Name','Tone name',i===0?'"'+name.trim()+'"':'');
 add('common',0x14,0,'Partials','Voice','POLY');
 for(let i=0;i<3;i++){const on=i<parts.length?1:0;
  add('common',0x19+i*2,on,'Partials','Partial '+(i+1)+' switch',on?'ON':'OFF');
  add('common',0x1a+i*2,on,'Partials','Partial '+(i+1)+' select',on?'ON':'OFF')}
 add('common',0x1f,0,'Partials','Ring switch','OFF');
 add('common',0x2e,0,'Partials','Unison','OFF');

 /* --- per partial --- */
 parts.forEach((p,i)=>{
  const P='Partial '+(i+1)+' · ',env=envelope(p.o);
  const w=(p.st>=24&&parts.length>1)?4:wave;
  add(i,0x00,w,'Oscillator',P+'Waveform',WAVES[w]);
  add(i,0x03,64+p.st,'Oscillator',P+'Pitch',(p.st>0?'+':'')+p.st+' st');
  add(i,0x04,64+clamp(p.cents,-50,50),'Oscillator',P+'Detune',(p.cents>0?'+':'')+p.cents+' ct');
  /* pitch envelope */
  const pe=v.pitchEg,[pl1,,pl3,pl4]=pe.levels,peDepth=pl1-pl3;
  if(Math.abs(peDepth)>=2||pl4!==pl3){
   add(i,0x07,timeParam(rateTime(pe.rates[0],Math.abs(pl1-pl4))),'Pitch envelope',P+'Pitch env attack');
   add(i,0x08,timeParam(rateTime(pe.rates[1],Math.abs(pe.levels[1]-pl1))+rateTime(pe.rates[2],Math.abs(pl3-pe.levels[1]))),'Pitch envelope',P+'Pitch env decay');
   add(i,0x09,clamp(64+63*peDepth/49,1,127),'Pitch envelope',P+'Pitch env depth',signed(clamp(64+63*peDepth/49,1,127)));
  }else add(i,0x09,64,'Pitch envelope',P+'Pitch env depth','0 (flat)');
  /* filter */
  add(i,0x0a,1,'Filter',P+'Filter type','LPF');
  add(i,0x0b,1,'Filter',P+'Filter slope','-24 dB');
  add(i,0x0c,cutSu,'Filter',P+'Cutoff');
  add(i,0x0d,74,'Filter',P+'Cutoff key follow','+100');
  add(i,0x0e,clamp(64+modVel/7*30,1,127),'Filter',P+'Filter env velocity',signed(clamp(64+modVel/7*30,1,127)));
  add(i,0x0f,v.feedback>=5?clamp(20+(v.feedback-5)*10,0,127):0,'Filter',P+'Resonance');
  add(i,0x10,sweep?filtEnv.a:0,'Filter',P+'Filter env attack');
  add(i,0x11,sweep?filtEnv.d:64,'Filter',P+'Filter env decay');
  add(i,0x12,0,'Filter',P+'Filter env sustain');
  add(i,0x13,sweep?filtEnv.r:40,'Filter',P+'Filter env release');
  const fd=sweep?clamp(64+(cutPk-cutSu)*63/127,1,127):64;
  add(i,0x14,fd,'Filter',P+'Filter env depth',signed(fd));
  /* amp */
  const lvl=i===0?110:clamp(110*Math.pow(p.amp/top,0.7),10,127);
  add(i,0x15,lvl,'Amp',P+'Level');
  add(i,0x16,clamp(64+p.o.velSens/7*40,1,127),'Amp',P+'Velocity sensitivity',signed(clamp(64+p.o.velSens/7*40,1,127)));
  add(i,0x17,env.a,'Amp',P+'Amp env attack');
  add(i,0x18,env.d,'Amp',P+'Amp env decay');
  add(i,0x19,env.s,'Amp',P+'Amp env sustain');
  add(i,0x1a,env.r,'Amp',P+'Amp env release');
  /* LFO */
  const pmsF=lfoV.pms>0?Math.pow(lfoV.pms/7,1.5):0,pitchD=clamp(64+(lfoV.pmd/99)*pmsF*40,1,127);
  const maxAms=Math.max(...parts.map(q=>q.o.ams)),ampD=clamp(64+(lfoV.amd/99)*(maxAms/3)*40,1,127);
  add(i,0x1c,DX_LFO_TO_JDXI[lfoV.wave]??0,'LFO',P+'LFO shape',LFO_SHAPES[DX_LFO_TO_JDXI[lfoV.wave]??0]);
  add(i,0x1d,clamp(lfoV.speed*1.28,0,127),'LFO',P+'LFO rate');
  add(i,0x1e,0,'LFO',P+'LFO tempo sync','OFF');
  add(i,0x1f,0,'LFO',P+'LFO sync note','—');
  add(i,0x20,clamp(lfoV.delay*1.28,0,127),'LFO',P+'LFO fade');
  add(i,0x21,lfoV.sync?1:0,'LFO',P+'LFO key trigger',lfoV.sync?'ON':'OFF');
  add(i,0x22,pitchD,'LFO',P+'LFO pitch depth',signed(pitchD));
  add(i,0x23,64,'LFO',P+'LFO filter depth','0');
  add(i,0x24,ampD,'LFO',P+'LFO amp depth',signed(ampD));
  add(i,0x25,64,'LFO',P+'LFO pan depth','0');
 });

 /* --- analysis (what the voice is and how it was read) --- */
 analysis.push({title:'Algorithm',text:'Algorithm '+v.algorithm+'/32 · carriers: OP'+carriers.join(', OP')+' · feedback '+v.feedback+'/7'});
 analysis.push({title:'Partials used',text:parts.map((p,i)=>(i+1)+': OP'+p.ops.join('+OP')+' · ratio '+p.ratio.toFixed(2)+' → '+(p.st>0?'+':'')+p.st+' st '+(p.cents>0?'+':'')+p.cents+' ct'+(p.folded?' (folded into ±2 octaves)':'')).join('  |  ')});
 analysis.push({title:'FM brightness',text:mods.length?'Modulators OP'+mods.map(o=>o.n).join(', OP')+' → '+WAVES[wave]+' wave, cutoff '+cutSu+(sweep?' with a filter envelope sweeping to '+cutPk:'')+'.':'No modulators: a plain additive/sine voice → '+WAVES[wave]+' wave.'});
 analysis.push({title:'Envelope',text:'Amp envelope from carrier OP'+parts[0].ops[0]+(sweep?'; filter envelope from modulator OP'+lead.n:'')+'. Rate-to-time conversion is an estimate.'});
 analysis.push({title:'LFO / pitch EG',text:'LFO speed '+lfoV.speed+', delay '+lfoV.delay+', pitch depth '+lfoV.pmd+' (sens '+lfoV.pms+'), amp depth '+lfoV.amd+'. Pitch EG '+(v.pitchEg.levels.every(l=>l===50)?'is flat.':'is used.')});
 if(inharmonic)warnings.push('Modulators use inharmonic frequencies (bell/metal character); a subtractive voice cannot reproduce this.');
 if(parts.some(p=>p.folded))warnings.push('Some partials were folded by octaves to fit the JD-Xi oscillator pitch range (±24 semitones).');
 warnings.push('Keyboard scaling, rate scaling and operator-level scaling are ignored.');
 return {items,analysis,warnings,partials:parts.length};
}

/* ---------------- helpers for sending ---------------- */
function absolute(items,base){ /* -> [{addr,val,...item}] */
 return items.map(it=>({...it,addr:base+(it.block==='common'?0:0x2000+0x100*it.block)+it.off}));
}
function toRuns(pairs,maxLen=0x40){ /* [{addr,val}] -> [{addr,bytes}] merging consecutive addresses */
 const s=[...pairs].sort((a,b)=>a.addr-b.addr),runs=[];
 for(const p of s){
  const r=runs[runs.length-1];
  if(r&&r.addr+r.bytes.length===p.addr&&r.bytes.length<maxLen)r.bytes.push(p.val);
  else if(r&&r.addr+r.bytes.length-1===p.addr)r.bytes[r.bytes.length-1]=p.val;
  else runs.push({addr:p.addr,bytes:[p.val]});
 }
 return runs;
}

const api={parse,plan,absolute,toRuns,checksum,CARRIERS,unpackSingle,unpackPacked};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.JDXiDX7=api;
})(typeof window!=='undefined'?window:globalThis);
