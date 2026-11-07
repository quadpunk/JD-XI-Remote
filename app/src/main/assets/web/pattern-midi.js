(()=>{
'use strict';
const PPQ=480,channels=[0,1,2,9];
const names=['Digital 1','Digital 2','Analog','Drums'];
function musical(data){
 const [s,cc]=data,kind=s>>4;
 return channels.includes(s&15)&&[8,9,11,14].includes(kind)&&
  (kind!==11||(cc!==0&&cc!==32&&cc<120));
}
function decode(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 let pos=0,limit=bytes.length;
 function take(n){if(n>limit-pos)throw Error('Truncated MIDI chunk');const start=pos;pos+=n;return start}
 const byte=()=>bytes[take(1)],word=()=>view.getUint16(take(2)),long=()=>view.getUint32(take(4));
 function tag(expected){const at=take(4);if(String.fromCharCode(...bytes.subarray(at,at+4))!==expected)throw Error('Invalid MIDI '+expected+' header')}
 function variable(){let v=0;for(let i=0;i<4;i++){const b=byte();v=v*128+(b&127);if(b<128)return v}throw Error('Invalid MIDI delta time')}
 tag('MThd');const size=long();if(size<6||size>limit-pos)throw Error('Invalid MIDI header size');
 const format=word(),count=word(),division=word();
 if(format>1||!count||!division||(division&0x8000))throw Error('Use a format 0 or 1 MIDI file with PPQ timing.');
 pos=8+size;
 const timeline=[];let endTick=0;
 for(let i=0;i<count;i++){
  tag('MTrk');const n=long();if(n>limit-pos)throw Error('Truncated MIDI track');limit=pos+n;
  let tick=0,running=0;
  while(pos<limit){
   tick+=variable();let s=byte();
   if(s<128){if(!running)throw Error('Invalid running status');pos--;s=running}
   running=s<240?s:0;
   if(s===255){
    const type=byte(),len=variable(),at=take(len);
    if(type===81&&len===3)timeline.push({tick,tempo:bytes[at]*65536+bytes[at+1]*256+bytes[at+2]});
    if(type===47)break;
   }else if(s===240||s===247){take(variable())}
   else if(s<240){
    const data=[s,byte()];if((s>>4)!==12&&(s>>4)!==13)data.push(byte());
    if(data.slice(1).some(v=>v>127))throw Error('Invalid MIDI channel message');
    timeline.push({tick,data});
   }else throw Error('Unsupported status in MIDI track');
  }
  endTick=Math.max(endTick,tick);pos=limit;limit=bytes.length;
 }
 timeline.sort((a,b)=>a.tick-b.tick);
 let tempo=500000,last=0,ms=0,firstTempo=tempo;
 const events=[];
 for(const e of timeline){
  ms+=(e.tick-last)*tempo/division/1000;last=e.tick;
  if(e.data)events.push({...e,ms});else if(e.tempo){tempo=e.tempo;if(!e.tick)firstTempo=tempo}
 }
 return {events,division,endTick,bpm:60000000/firstTempo};
}
function variable(n){const out=[n&127];while((n=Math.floor(n/128)))out.unshift((n&127)|128);return out}
function encode(events,bpm,bars){
 const end=bars*4*PPQ,tempo=Math.round(60000000/bpm);
 const chunks=[new Uint8Array([77,84,104,100,0,0,0,6,0,1,0,5,1,224])];
 function track(body){const n=body.length;chunks.push(new Uint8Array([77,84,114,107,n>>>24,n>>>16,n>>>8,n]),Uint8Array.from(body))}
 track([0,255,81,3,tempo>>16,(tempo>>8)&255,tempo&255,0,255,88,4,4,2,24,8,...variable(end),255,47,0]);
 for(const [i,ch] of channels.entries()){
  const title=Array.from(names[i],c=>c.charCodeAt(0)),body=[0,255,3,title.length,...title],held=new Set();
  let last=0;
  for(const e of events){
   if((e.data[0]&15)!==ch)continue;
   const tick=Math.max(last,Math.min(end,e.tick));
   body.push(...variable(tick-last),...e.data);last=tick;
   if(e.data[0]>>4===9&&e.data[2])held.add(e.data[1]);
   else if([8,9].includes(e.data[0]>>4))held.delete(e.data[1]);
  }
  for(const key of held){body.push(...variable(end-last),128|ch,key,0);last=end}
  body.push(...variable(end-last),255,47,0);track(body);
 }
 return new Blob(chunks,{type:'audio/midi'});
}
window.JDXiPatternMidi={decode,encode,musical,channels,names,PPQ};
})();
