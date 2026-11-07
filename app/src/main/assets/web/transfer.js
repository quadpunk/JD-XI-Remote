(()=>{
'use strict';
const $=s=>document.getElementById('pt-'+s),api=window.JDXiPerformance;
const {channels,names,PPQ,encode,decode,musical}=window.JDXiPatternMidi;
const status=s=>$('status').textContent=s;
let active=null,file=null,url=null,loadVersion=0;
function paint(){
 for(const id of ['export','prepare','slot','bars','bpm','file'])$(id).disabled=!!active;
 $('cancel').disabled=!active;$('send').disabled=active?.phase!=='armed';
}
function release(s,msg){
 if(active!==s)return;
 clearInterval(s.timer);clearTimeout(s.wait);active=null;paint();status(msg);
}
function cancel(msg='Transfer cancelled.'){
 const s=active;if(!s||s.phase==='closing')return;
 clearInterval(s.timer);clearTimeout(s.wait);
 if(!s.started){release(s,msg);return}
 s.phase='closing';paint();
 // Anything in the short Web MIDI output queue may still fire. Stop after it.
 const now=performance.now(),at=Math.max(now,s.lastSent)+1;
 api.sendAt([0xfc],at);
 if(s.importing)api.sendAt([0xb0|s.parts[s.part],123,0],at);
 s.wait=setTimeout(()=>release(s,msg),at-now+25);
}
function receive(data,time){
 const s=active;
 if(s?.phase!=='capture'||!musical(data)||data.length!==3)return;
 const at=Number.isFinite(time)?time:performance.now();
 if(at<s.start||at>=s.end)return;
 s.events.push({tick:Math.round((at-s.start)*PPQ/s.beat),data});
}
function panelStop(at){
 const s=active;
 if(s?.started&&at>=s.start&&at<s.end-5)cancel('JD-Xi stopped before the end. Transfer cancelled.');
}
window.JDXiTransfer={busy:()=>!!active,cancel,receive,panelStop};
window.addEventListener('pagehide',()=>cancel());
$('cancel').onclick=()=>cancel();
function send(s,data,time){
 if(!api.sendAt(data,time))throw Error('MIDI output disconnected.');
 s.lastSent=Math.max(s.lastSent,time);
}
function promptPart(s){
 const ch=s.parts[s.part],name=names[channels.indexOf(ch)];
 s.phase='armed';paint();
 status('Check '+s.slot+' on the JD-Xi. Set Pattern Length to '+s.bars+' bar(s), select '+name+' and arm Real Time Rec, then press Send armed part ('+(s.part+1)+'/'+s.parts.length+').');
}
function complete(s){
 clearInterval(s.timer);s.started=false;
 if(s.importing){
  if(++s.part<s.parts.length){promptPart(s);return}
  release(s,'All parts sent. Audition the pattern, then use Write on the JD-Xi to save to '+s.slot+'.');return;
 }
 if(!s.events.length){release(s,'No pattern events received. Check the input port, program, length and Sync Mode, then capture again.');return}
 if(url)URL.revokeObjectURL(url);
 url=URL.createObjectURL(encode(s.events,s.bpm,s.bars));
 const link=$('download');link.href=url;link.download=s.slot+'.mid';link.textContent='Download '+link.download;link.hidden=false;
 release(s,'Captured '+s.events.length+' events from '+s.slot+'.');link.click();
}
function run(s){
 s.phase=s.importing?'send':'capture';s.beat=60000/s.bpm;
 s.start=performance.now()+60;s.end=s.start+s.beat*s.bars*4;
 s.lastSent=performance.now();s.started=true;paint();
 const ch=s.parts?.[s.part],events=s.importing?file.events.filter(e=>(e.data[0]&15)===ch):[];
 let pulse=0,index=0,startQueued=false,stopQueued=false;
 const timeOf=e=>s.start+e.tick*s.beat/file.division;
 function pump(){
  try{
   const now=performance.now(),ahead=now+45;
   if(!api.connected()||(!s.importing&&!api.hasInput()))throw Error('MIDI port disconnected.');
   if(!stopQueued&&s.start+pulse*s.beat/24<now-8)throw Error('Timing interrupted. Keep this tab active and retry.');
   if(!startQueued&&ahead>=s.start){send(s,[0xfa],s.start);startQueued=true}
   while(pulse<s.bars*96&&s.start+pulse*s.beat/24<=ahead){
    send(s,[0xf8],s.start+pulse*s.beat/24);pulse++;
   }
   while(index<events.length&&timeOf(events[index])<=ahead){
    const e=events[index++];send(s,e.data,timeOf(e));
   }
   if(!stopQueued&&ahead>=s.end){
    send(s,[0xfc],s.end);if(s.importing)send(s,[0xb0|ch,123,0],s.end+1);stopQueued=true;
   }
   if(stopQueued&&now>=s.end+35)complete(s);
  }catch(e){cancel(e.message)}
 }
 status((s.importing?'Sending part to ':'Capturing ')+s.slot+' · '+s.bars+' bar(s) at '+s.bpm+' BPM…');
 s.timer=setInterval(pump,10);pump();
}
function begin(importing){
 if(active)return;
 const slot=$('slot').value.trim().toUpperCase();$('slot').value=slot;
 if(!/^[A-H](0[1-9]|[1-5][0-9]|6[0-4])$/.test(slot)){status('Enter a program from A01 to H64.');return}
 if(importing&&slot[0]<'E'){status('A–D are factory banks. Choose an import destination from E01 to H64.');return}
 if(!api.connected()||(!importing&&!api.hasInput())){status('Connect the JD-Xi MIDI output and, for capture, its input.');return}
 if(window.JDXiPerfState?.().running||window.JDXiSteps?.playing()||api.filePlaying()){status('Stop Performance, Step sequencer and MIDI file playback first.');return}
 const bpm=+$('bpm').value,bars=+$('bars').value;
 if(!Number.isFinite(bpm)||bpm<40||bpm>240){status('Enter a tempo from 40 to 240 BPM.');return}
 if(importing&&(!file||file.endTick>bars*4*file.division)){status('Choose a compatible file and enough bars for the whole pattern.');return}
 const s={slot,bpm,bars,importing,phase:'select',events:[],parts:importing?channels.filter(ch=>file.events.some(e=>(e.data[0]&15)===ch)):null,part:0,lastSent:0,started:false};
 active=s;paint();status('Selecting '+slot+'…');
 try{
  const now=Math.max(performance.now(),window.JDXiClockReadyAt?.()||0);
  send(s,[0xfc],now);
  window.JDXiProgramMessages(slot).forEach((m,i)=>send(s,m,now+8+i*12));
  s.wait=setTimeout(()=>{if(importing)promptPart(s);else run(s)},now-performance.now()+350);
 }catch(e){release(s,e.message)}
}
$('prepare').onclick=()=>begin(true);$('export').onclick=()=>begin(false);
$('send').onclick=()=>{if(active?.phase==='armed')run(active)};
$('file').onchange=async()=>{
 const version=++loadVersion;file=null;
 const selected=$('file').files[0];if(!selected)return;
 try{
  if(selected.size>4*1024*1024)throw Error('Choose a pattern file smaller than 4 MB.');
  const parsed=decode(await selected.arrayBuffer());if(version!==loadVersion||active)return;
  const events=parsed.events.filter(e=>musical(e.data));
  if(!events.length)throw Error('No compatible events on channels 1, 2, 3 or 10.');
  const bars=Math.max(1,Math.ceil(parsed.endTick/(4*parsed.division)));
  if(bars>4)throw Error('File exceeds four 4/4 bars. Trim it to one JD-Xi pattern first.');
  file={...parsed,events};$('bars').value=String(bars);
  $('bpm').value=String(Math.max(40,Math.min(240,Math.round(parsed.bpm))));
  status(selected.name+' · '+bars+' bar(s), '+events.length+' supported events. Choose a user destination E01–H64.');
 }catch(e){if(version===loadVersion)status(e.message)}
};
paint();
})();
