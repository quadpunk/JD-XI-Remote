(()=>{
'use strict';
const $=id=>document.getElementById(id);
let access=null,output=null,input=null,sysexAllowed=false,sysexBuf=null,replyTimer=null;
const hexs=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(' ');
// Coalesce dense controller streams into one DOM update per batch.
const clockFormat=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hour12:false});
let pendingLog=[],logTimer=null;
function log(s){
 pendingLog.push(clockFormat.format(Date.now())+' '+s+'\n');
 if(pendingLog.length>500)pendingLog.splice(0,250);
 if(logTimer!==null)return;
 logTimer=setTimeout(()=>{
  const batch=pendingLog.reverse().join('');pendingLog=[];logTimer=null;
  for(const id of ['monitor','midi-log']){
   const el=$(id);if(el)el.textContent=(batch+el.textContent).slice(0,6000);
  }
 },50);
}
const status=s=>{$('status').textContent=s};
function logMidi(dir,bytes){if(bytes[0]===0xfe||bytes[0]===0xf8)return;log(dir+' '+hexs(bytes))}

/* ---------- sending ---------- */
function send(bytes){
 if(!output||output.state!=='connected'){log('MIDI output not connected');return false}
 if(bytes[0]===0xf0&&!sysexAllowed){log('SysEx blocked: the browser did not grant SysEx permission. Allow MIDI for this site, reload and reconnect.');return false}
 try{output.send(bytes);logMidi('OUT',bytes);try{window.JDXiViz?.midi(bytes)}catch{}return true}
 catch(e){log('Send failed on "'+output.name+'": '+e.message);return false}
}
function sendSeq(msgs,gap=12){return new Promise(res=>{let i=0;const next=()=>{if(i>=msgs.length)return res(true);if(!send(msgs[i++]))return res(false);setTimeout(next,gap)};next()})}
function note(ch,n,on,velocity=100){send([on?0x90|ch:0x80|ch,n,on?velocity:0])}
function stop(){try{pianoReleaseAll()}catch{}stopMidiFile();window.JDXiSteps?.stop();for(let ch of [0,1,2,9])send([0xb0|ch,123,0])}

/* ---------- diagnostics ---------- */
function setDiag(message,isError){const el=$('midi-diagnostics');el.textContent=message;el.classList.toggle('error',!!isError)}
function midiDiagnostics(message,isError){setDiag(message,isError);log(message);if(isError){const d=$('midi-conn');if(d)d.open=true}}
async function envReport(){
 const parts=[location.protocol+'//'+(location.host||'(local file)'),'secure context: '+(window.isSecureContext?'yes':'NO'),'Web MIDI API: '+(navigator.requestMIDIAccess?'yes':'NO')];
 if(location.protocol==='file:')parts.push('opened from a file: use HTTPS or http://localhost for reliable MIDI permission');
 try{const p=await navigator.permissions.query({name:'midi',sysex:true});parts.push('SysEx permission: '+p.state);p.onchange=envReport}catch{parts.push('SysEx permission: unknown (not queryable here)')}
 parts.push(navigator.userAgent);
 const el=$('midi-env');if(el)el.textContent=parts.join(' · ');
}

/* ---------- ports ---------- */
const isJd=p=>/JD.?-?Xi|Roland/i.test(p?.name||'');
const isThrough=p=>/through/i.test(p?.name||'');
function pickPort(ports,wantedId){return ports.find(x=>wantedId&&x.id===wantedId)||ports.find(x=>isJd(x)&&!isThrough(x))||ports.find(x=>!isThrough(x))||ports[0]}
function populateMidiPorts(){
 const outputs=[...access.outputs.values()],inputs=[...access.inputs.values()];
 for(const [id,ports] of [['midi-output',outputs],['midi-input',inputs]]){
  const select=$(id),previous=select.value;select.replaceChildren();
  const auto=document.createElement('option');auto.value='';auto.textContent='Auto-detect';select.append(auto);
  ports.forEach(port=>{const option=document.createElement('option');option.value=port.id;option.textContent=(port.name||port.id)+(port.state==='connected'?'':' (disconnected)');select.append(option)});
  if(ports.some(port=>port.id===previous))select.value=previous;
 }
 const names=ports=>ports.length?ports.map(p=>'"'+(p.name||p.id)+'"').join(', '):'none';
 setDiag('Found '+inputs.length+' input(s): '+names(inputs)+' · '+outputs.length+' output(s): '+names(outputs)+'. Press Connect.',!outputs.length);
}
function permissionError(e){return Error('MIDI permission was refused or blocked ('+(e&&e.name||'error')+'). Click the lock/settings icon in the address bar, set "MIDI devices" (and SysEx) to Allow for this site, reload the page and press Connect again.')}
async function getMidiAccess(){
 if(access){populateMidiPorts();return access}
 if(!navigator.requestMIDIAccess)throw Error('Web MIDI is not available in this browser. Use Chrome, Edge or Brave (not Safari / iOS / Firefox without its MIDI add-on), over HTTPS or http://localhost.');
 let granted;
 try{granted=await navigator.requestMIDIAccess({sysex:true});sysexAllowed=true}
 catch(e){
  if(e.name!=='SecurityError'&&e.name!=='NotAllowedError')throw e;
  try{granted=await navigator.requestMIDIAccess({sysex:false});sysexAllowed=false;log('SysEx permission was refused: notes, CC and patch changes still work, but tone editing and readback do not.')}
  catch(e2){throw permissionError(e2)}
 }
 access=granted;
 access.onstatechange=ev=>{const p=ev.port;populateMidiPorts();if((p===output||p===input)&&p.state==='disconnected'){window.JDXiTransfer?.cancel('MIDI port disconnected. Reconnect and retry.');midiDiagnostics('MIDI device disconnected: reconnect the JD-Xi and press Connect.',true)}};
 populateMidiPorts();envReport();return access;
}
async function closePorts(){
 window.JDXiTransfer?.cancel();window.JDXiSteps?.stop();window.JDXiFx?.reset();
 sysexBuf=null;
 if(input){input.onmidimessage=null;try{await input.close()}catch{}input=null}
 if(output){try{await output.close()}catch{}output=null}
}
async function disconnect(){stop();await closePorts();status('MIDI released');midiDiagnostics('MIDI released.')}

/* ---------- receiving (with SysEx reassembly: some browsers split long SysEx over several events) ---------- */
function msgLength(b){if(b===0xf1||b===0xf3)return 2;if(b===0xf2)return 3;if(b>=0xf0)return 1;const t=b&0xf0;return t===0xc0||t===0xd0?2:3}
function handleMidiEvent(e){
 const d=e.data;let i=0;
 while(i<d.length){
  const b=d[i];
  if(b>=0xf8){if(b===0xfc)window.JDXiTransfer?.panelStop(e.timeStamp);if(b===0xfc)window.JDXiSteps?.incomingStop();if(b===0xfa||b===0xfb||b===0xfc)logMidi('IN',[b]);try{window.JDXiPerformanceReceive?.([b])}catch{}i++;continue}
  if(sysexBuf){
   if(b===0xf7){sysexBuf.push(b);const m=sysexBuf;sysexBuf=null;i++;onMidiMessage(m);continue}
   if(b&0x80){sysexBuf=null;continue}
   sysexBuf.push(b);i++;continue;
  }
  if(b===0xf0){sysexBuf=[b];i++;continue}
  if(b===0xf7){i++;continue}
  if(b&0x80){const len=msgLength(b);onMidiMessage(Array.from(d.slice(i,i+len)),e.timeStamp);i+=len;continue}
  i++;
 }
}
function onMidiMessage(data,time){
 window.JDXiTransfer?.receive(data,time);
 logMidi('IN',data);
 try{window.JDXiViz?.midi(data)}catch{}
 for(const fn of [applyEditorReply,m=>window.JDXiPerformanceReceive?.(m)]){try{fn(data)}catch(err){log('Handler error: '+err.message)}}
 if(data[0]===0xf0&&data[1]===0x41){clearTimeout(replyTimer);replyTimer=null;setDiag('JD-Xi SysEx reply received on "'+(input?.name||'input')+'": two-way communication works.')}
}
function autoRead(){if(output&&input&&sysexAllowed){try{$('readblock').click();setTimeout(()=>{try{$('arpread').click()}catch(e){log(e.message)}},150)}catch(e){log(e.message)}}}

/* ---------- buttons ---------- */
$('midi-refresh').onclick=async()=>{try{await getMidiAccess()}catch(e){midiDiagnostics(e.message,true)}};
$('connect').onclick=async()=>{
 try{
  status('Connecting…');
  await getMidiAccess();
  await closePorts();
  const outputs=[...access.outputs.values()],inputs=[...access.inputs.values()];
  if(!outputs.length)throw Error('No MIDI output found. Connect the JD-Xi by USB, switch it on, close other programs that may hold it (DAW, JDXi_Manager, other browser tabs), press "Refresh devices" and try again.');
  const out=pickPort(outputs,$('midi-output').value),inp=pickPort(inputs,$('midi-input').value);
  try{await out.open()}catch(e){throw Error('Could not open MIDI output "'+out.name+'" ('+(e.name||'error')+'). Another program or browser tab is probably using the JD-Xi: close it and try again.')}
  output=out;$('midi-output').value=out.id;
  if(inp){
   try{await inp.open();inp.onmidimessage=handleMidiEvent;input=inp;$('midi-input').value=inp.id}
   catch(e){midiDiagnostics('Input "'+inp.name+'" could not be opened ('+(e.name||'error')+'): sending works, readback does not.',true)}
  }
  status('Connected: '+output.name);
  midiDiagnostics('Connected. Output: "'+output.name+'" · input: '+(input?'"'+input.name+'"':'NONE')+' · SysEx: '+(sysexAllowed?'allowed':'NOT allowed')+'. Try "Send test note" or "Test JD-Xi reply".',!sysexAllowed||!input);
  setTimeout(()=>{autoRead();setTimeout(()=>ovRead(true),600)},300);
  window.dispatchEvent(new Event('jdxi-connected'));
 }catch(e){status('Connection failed');midiDiagnostics(e.message,true)}
};
$('midi-note').onclick=()=>{
 if(!output){midiDiagnostics('Connect MIDI first.',true);return}
 const ch=+$('part').value;
 if(send([0x90|ch,60,100])){midiDiagnostics('Sent test note C4 on channel '+(ch+1)+' to "'+output.name+'". If silent: check the JD-Xi part is on/unmuted and receives on that channel.');setTimeout(()=>send([0x80|ch,60,0]),400)}
};
$('midi-test').onclick=()=>{
 if(!output){midiDiagnostics('Connect MIDI first.',true);return}
 if(!input){midiDiagnostics('No MIDI input is open: select the JD-Xi input and press Connect again.',true);return}
 if(!sysexAllowed){midiDiagnostics('SysEx permission was not granted, so the JD-Xi cannot answer. Allow MIDI + SysEx for this site (lock icon in the address bar), reload and reconnect.',true);return}
 midiDiagnostics('Requesting JD-Xi System Master Level; waiting for SysEx reply…');
 clearTimeout(replyTimer);
 replyTimer=setTimeout(()=>midiDiagnostics('No SysEx reply within 2 s. Check: correct JD-Xi input selected, Device ID = 10, and no other program is using the JD-Xi.',true),2000);
 sendEditor(17,0x02000005,[0,0,0,1]);
};
$('disconnect-top').onclick=()=>disconnect();
envReport();

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,.page').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.page).classList.add('active')});
/* ---------- Virtual piano: drag across keys, multi-touch, octave shift, velocity, computer keyboard ---------- */
const PIANO_BLACK=[1,3,6,8,10],PIANO_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
let pianoBase=48,pianoOcts=0;const pianoHeld=new Map();
const pianoOctaveCount=()=>window.innerWidth<700?2:3;
function pianoLabel(){const hi=pianoBase+pianoOcts*12-1;$('octlabel').textContent='C'+(Math.floor(pianoBase/12)-1)+' – B'+(Math.floor(hi/12)-1)}
function pianoBuild(){
 pianoReleaseAll();
 pianoOcts=pianoOctaveCount();pianoBase=Math.max(0,Math.min(pianoBase,127-pianoOcts*12));
 const box=$('keyboard');box.replaceChildren();
 const total=pianoOcts*12,notes=Array.from({length:total+1},(_,i)=>pianoBase+i).filter(n=>n<=127);
 const whites=notes.filter(n=>!PIANO_BLACK.includes(n%12)),W=whites.length;
 for(const n of whites){const k=document.createElement('div');k.className='wkey';k.dataset.note=n;if(n%12===0)k.textContent='C'+(n/12-1);box.append(k)}
 const bw=0.62/W*100;
 for(const n of notes){if(!PIANO_BLACK.includes(n%12))continue;const wi=whites.filter(w=>w<n).length-1;const k=document.createElement('div');k.className='bkey';k.dataset.note=n;k.style.left=((wi+1)/W*100-bw/2)+'%';k.style.width=bw+'%';box.append(k)}
 pianoLabel();
}
const pianoKeyAt=(x,y)=>{const el=document.elementFromPoint(x,y);return el&&el.closest?el.closest('#keyboard [data-note]'):null};
function pianoPress(id,el){const n=+el.dataset.note,ch=+$('part').value;note(ch,n,true,+$('pianovel').value);el.classList.add('pressed');pianoHeld.set(id,{n,ch,el})}
function pianoRelease(id){const h=pianoHeld.get(id);if(!h)return;note(h.ch,h.n,false);h.el.classList.remove('pressed');pianoHeld.delete(id)}
function pianoReleaseAll(){for(const id of [...pianoHeld.keys()])pianoRelease(id)}
{
 const box=$('keyboard');
 box.addEventListener('pointerdown',e=>{const el=pianoKeyAt(e.clientX,e.clientY);if(!el)return;e.preventDefault();try{box.setPointerCapture(e.pointerId)}catch{}pianoRelease('p'+e.pointerId);pianoPress('p'+e.pointerId,el)});
 box.addEventListener('pointermove',e=>{const id='p'+e.pointerId,h=pianoHeld.get(id);if(!h)return;const el=pianoKeyAt(e.clientX,e.clientY);if(el&&el!==h.el){pianoRelease(id);pianoPress(id,el)}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])box.addEventListener(type,e=>pianoRelease('p'+e.pointerId));
 box.addEventListener('contextmenu',e=>e.preventDefault());
 const shift=d=>{pianoReleaseAll();pianoBase=Math.max(0,Math.min(pianoBase+d,127-pianoOcts*12));pianoBuild()};
 $('oct-down').onclick=()=>shift(-12);$('oct-up').onclick=()=>shift(12);
 $('pianovel').oninput=()=>{$('pianovelout').textContent=$('pianovel').value};
 let lastOcts=0;window.addEventListener('resize',()=>{if(pianoOctaveCount()!==pianoOcts)pianoBuild()});
 const QWERTY={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14};
 const typing=t=>t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);
 window.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||typing(e.target)||!$('synth').classList.contains('active'))return;const o=QWERTY[e.key.toLowerCase()];if(o===undefined)return;const el=$('keyboard').querySelector('[data-note="'+(pianoBase+12+o)+'"]');if(el){e.preventDefault();pianoRelease('k'+e.key.toLowerCase());pianoPress('k'+e.key.toLowerCase(),el)}});
 window.addEventListener('keyup',e=>pianoRelease('k'+e.key.toLowerCase()));
 window.addEventListener('blur',pianoReleaseAll);
 pianoBuild();
}
$('panic').onclick=stop;
function patch(n){
 const ch=+$('patchpart').value,msb=ch===9?86:ch===2?94:95,lsb=msb===95&&n>128?65:64;
 const part=['digital1','digital2','analog'][ch],key=ch===9?'drums':ch===2?'analog':'digital';
 const expected=patchCatalog?.[key]?.find(x=>x.num===n)?.name||'';
 log('Patch '+n+' on channel '+(ch+1));
 sendSeq([[0xb0|ch,0,msb],[0xb0|ch,32,lsb],[0xc0|ch,(n-1)%128]],12).then(ok=>{
  if(!ok){$('patchstatus').textContent='Patch not sent: MIDI output is not connected.';return}
  if(!part){$('patchstatus').textContent='Drum kit '+n+' sent on channel 10.';return}
  lastPatch[part]={num:n,name:expected};
  setTimeout(()=>{if(part===$('ovpart').value)ovRead(true);verifyPatch(part,expected)},400);
 });
}
function verifyPatch(part,expected){
 const el=$('patchstatus'),base=editorBases[part];
 if(!input||!sysexAllowed){el.textContent='Patch sent on channel '+(['digital1','digital2','analog'].indexOf(part)+1)+' (no SysEx readback available to confirm).';return}
 for(let i=0;i<12;i++)editorReadback.delete(base+i);
 try{sendEditor(17,base,[0,0,0,12])}catch(e){log(e.message);return}
 setTimeout(()=>{
  let name='';for(let i=0;i<12;i++){const v=editorReadback.get(base+i);if(v===undefined){name=null;break}name+=v>=32&&v<127?String.fromCharCode(v):' '}
  if(name===null){el.textContent='Patch sent, but the JD-Xi gave no readback for '+part+'.';return}
  name=name.trim();const norm=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
  el.textContent=part+' on the JD-Xi is now "'+name+'"'+(expected?(norm(name)===norm(expected)?' ✓':' (catalog entry: "'+expected+'")'):'');
 },500);
}
let patchCatalog=null;
const lastPatch={};
function loadData(name){if(window.JDXI_DATA&&window.JDXI_DATA[name])return Promise.resolve(window.JDXI_DATA[name]);return fetch('./'+name+'.json').then(r=>{if(!r.ok)throw Error(name+'.json unavailable (HTTP '+r.status+')');return r.json()})}
loadData('patches').then(data=>{patchCatalog=data;renderPatches()}).catch(e=>log(e.message));
function renderPatches(){const ch=+$('patchpart').value,key=ch===9?'drums':ch===2?'analog':'digital',max=ch===9?33:ch===2?64:256,q=$('patchsearch').value.trim().toLowerCase();$('patchnum').max=max;$('patchlist').replaceChildren();const entries=patchCatalog?.[key]||Array.from({length:max},(_,i)=>({num:i+1,name:'Patch '+String(i+1).padStart(3,'0'),category:''}));for(const p of entries){if(q&&!([p.name,p.category,String(p.num)].join(' ').toLowerCase().includes(q)))continue;const b=document.createElement('button');b.textContent=String(p.num).padStart(3,'0')+' · '+p.name+(p.category?' — '+p.category:'');b.onclick=()=>{patch(p.num);$('patchnum').value=p.num};$('patchlist').append(b)}}
$('patchpart').onchange=renderPatches;$('patchsearch').oninput=renderPatches;renderPatches();$('loadpatch').onclick=()=>{const n=+$('patchnum').value;if(n>=1&&n<=+$('patchnum').max)patch(n)};
function hex(s,count){const a=s.trim().split(/[\s,]+/).map(x=>/^[0-9a-f]{1,2}$/i.test(x)?parseInt(x,16):NaN);if(a.length!==count||a.some(x=>!Number.isInteger(x)||x<0||x>127))throw Error('Expected '+count+' valid 7-bit hex bytes');return a}
window.addEventListener('pagehide',stop);
let midiEvents=[],midiTimers=[],midiFileDuration=0,midiPlaying=false;
function stopMidiFile(){midiPlaying=false;for(const t of midiTimers)clearTimeout(t);midiTimers=[];if($('midstatus')&&midiEvents.length)$('midstatus').textContent='Stopped';}
$('midfile').onchange=async e=>{stopMidiFile();try{const f=e.target.files[0];if(!f)return;midiEvents=window.JDXiPatternMidi.decode(await f.arrayBuffer()).events;midiFileDuration=midiEvents.at(-1)?.ms||0;$('midstatus').textContent=f.name+' · '+midiEvents.length+' events · '+Math.ceil(midiFileDuration/1000)+' seconds'}catch(err){midiEvents=[];$('midstatus').textContent=err.message}};
$('midplay').onclick=()=>{if(window.JDXiTransfer?.busy()){ $('midstatus').textContent='Finish the pattern transfer first.';return}stopMidiFile();if(!output||!midiEvents.length){$('midstatus').textContent='Connect MIDI and load a valid file first';return}midiPlaying=true;const start=performance.now()+60;for(const e of midiEvents){midiTimers.push(setTimeout(()=>send(e.data),Math.max(0,start-performance.now()+e.ms)))}midiTimers.push(setTimeout(()=>{if(!midiPlaying)return;midiTimers=[];if($('midloop').checked)$('midplay').click();else{$('midstatus').textContent='Playback complete';midiPlaying=false}},midiFileDuration+100));$('midstatus').textContent='Playing'};
$('midstop').onclick=()=>{stopMidiFile();for(let ch=0;ch<16;ch++)send([0xb0|ch,123,0])};

const editorBases={digital1:0x19010000,digital2:0x19210000,analog:0x19420000,arp:0x18004000};
let parameterCatalog={};
function sendEditor(cmd,addr,payload){const a=[(addr>>>24)&127,(addr>>>16)&127,(addr>>>8)&127,addr&127],id=hex($('deviceid').value,1)[0],checksum=(128-([...a,...payload].reduce((x,y)=>x+y,0)%128))%128;return send([240,65,id,0,0,0,14,cmd,...a,...payload,checksum,247])}
/* One parameter editor per panel: the Advanced tone editor (Digital 1/2, Analog) and the separate Arpeggio editor.
   c = {part:()=>name, partial:<select|null>, block:<select>, grid:<div>, force:<checkbox>, read:<button>} */
function makeEditor(c){
 const type=()=>c.part().startsWith('digital')?'digital':c.part();
 const params=()=>parameterCatalog[type()]?.[c.block.value]||[];
 function address(offset){const part=c.part(),group=c.block.value;return editorBases[part]+(part.startsWith('digital')&&group!=='commonMain'&&group!=='commonPlay'?0x2000+0x100*(+c.partial.value):0)+offset}
 function groups(){
  const g=parameterCatalog[type()]||{};c.block.replaceChildren();
  for(const name of Object.keys(g)){const option=document.createElement('option');option.value=name;option.textContent=name;c.block.append(option)}
  render();
 }
 function render(){
  const list=params();
  c.grid.replaceChildren();
  const force=!!c.force?.checked;
  for(const p of list){
  const card=document.createElement('div');card.className='paramcard';
  const label=document.createElement('label');label.textContent=p.label;
  const addr=address(p.off), known=editorReadback.has(addr);
  const value=known?editorReadback.get(addr):p.min;
  let ctrl,out;
  if(p.options){
   ctrl=document.createElement('select');
   p.options.forEach((t,i)=>{const o=document.createElement('option');o.value=p.min+i;o.textContent=t;ctrl.append(o)});
   ctrl.value=value;
  }else if(p.toggle){
   ctrl=document.createElement('input');ctrl.type='checkbox';ctrl.checked=value>p.min;ctrl.className='editor-toggle';
  }else if(p.bytes===4){
   ctrl=document.createElement('input');ctrl.type='number';ctrl.min=p.min;ctrl.max=p.max;ctrl.step=1;ctrl.value=value;
  }else{
   ctrl=document.createElement('input');ctrl.type='range';ctrl.min=p.min;ctrl.max=p.max;ctrl.value=value;
  }
  ctrl.disabled=!known&&!force;
  out=document.createElement('output');out.textContent=p.toggle?(value>p.min?'On':'Off'):p.options?(p.options[value-p.min]||value):String(value);
  const controls=document.createElement('div');controls.className='editor-control';
  controls.append(ctrl,out);
  let lastValue=null;
  const push=()=>{
   const v=p.toggle?(ctrl.checked?p.max:p.min):Math.max(p.min,Math.min(p.max,Math.round(+ctrl.value)));
   if(p.toggle)out.textContent=v>p.min?'On':'Off';else{ctrl.value=v;out.textContent=p.options?(p.options[v-p.min]||v):String(v)}
   if(v===lastValue)return;
   try{
    const payload=p.bytes===4?[(v>>12)&15,(v>>8)&15,(v>>4)&15,v&15]:[v];
    if(sendEditor(18,addr,payload)){lastValue=v;editorReadback.set(addr,v)}
   }catch(e){log(e.message)}
  };
  if(ctrl.type==='range'){
   ctrl.oninput=()=>{out.textContent=String(ctrl.value);const t=performance.now();if(!ctrl._lastT||t-ctrl._lastT>40){ctrl._lastT=t;push()}};
   ctrl.onchange=push;
  }else ctrl.onchange=push;
  card.append(label,controls);c.grid.append(card);
  }
 }
 function read(){const list=params();if(list.length){const length=Math.max(...list.map(p=>p.off))+1;try{sendEditor(17,address(0),[0,0,(length>>7)&127,length&127])}catch(e){log(e.message)}}}
 /* a SysEx reply arrived: refresh the visible cards from editorReadback */
 function sync(){
  const list=params();
  c.grid.querySelectorAll('.paramcard').forEach((card,i)=>{const p=list[i];if(!p)return;const value=editorReadback.get(address(p.off));if(value===undefined)return;const control=card.querySelector('input,select');if(control){if(control.type==='checkbox')control.checked=value>p.min;else control.value=value;control.disabled=false}const out=card.querySelector('output');if(out)out.textContent=p.toggle?(value>p.min?'On':'Off'):value});
 }
 c.block.onchange=()=>{render();autoRead()};
 if(c.partial)c.partial.onchange=()=>{render();autoRead()};
 if(c.force)c.force.onchange=render;
 c.read.onclick=read;
 return {groups,render,read,sync};
}
const editors=[
 /* Advanced: full parameter editor for the three tone parts */
 makeEditor({part:()=>$('editpart').value,partial:$('editpartial'),block:$('editblock'),grid:$('paramgrid'),force:$('forceedit'),read:$('readblock')}),
 /* Arpeggio: its own category on the Synth page (a single "main" block at 18 00 40 xx) */
 makeEditor({part:()=>'arp',partial:null,block:$('arpblock'),grid:$('arpgrid'),force:$('arpforce'),read:$('arpread')}),
];
$('editpart').onchange=()=>{editors[0].groups();autoRead()};
loadData('parameters').then(data=>{parameterCatalog=data;editors.forEach(e=>e.groups());autoRead();ovBuild();ovRead(true)}).catch(e=>{log(e.message);$('overview').textContent='Could not build the overview: '+e.message});

// Do not allow editing uninitialized parameters: request a verified JD-Xi DT1 reply first.
const editorReadback=new Map();
const replyListeners=[];
function applyEditorReply(data){if(data.length<15||data[0]!==240||data[1]!==65||data[7]!==18||data[data.length-1]!==247)return;const body=Array.from(data.slice(8,-2)),sum=body.reduce((a,b)=>a+b,0),cs=(128-(sum%128))%128;if(cs!==data[data.length-2])return;const base=(body[0]<<24)|(body[1]<<16)|(body[2]<<8)|body[3];for(let i=4;i<body.length;i++)editorReadback.set(base+i-4,body[i]);
 const waveAddr=base+0x35, rel=waveAddr-base+4;
 if(body.length>=rel+4){const n=((body[rel]<<12)|(body[rel+1]<<8)|(body[rel+2]<<4)|body[rel+3]);editorReadback.set(waveAddr,n)}for(const fn of replyListeners){try{fn(base,body.length-4)}catch{}}ovRefresh();editors.forEach(e=>e.sync())}

const storageKey='jdxi-web-v2';
function getSaved(){try{return JSON.parse(localStorage.getItem(storageKey))||{}}catch{return {}}}
function saveSetting(key,value){const state=getSaved();state[key]=value;localStorage.setItem(storageKey,JSON.stringify(state))}
function renderFavorites(){const box=$('favorites');box.replaceChildren();const saved=getSaved().favorites||[];for(const p of saved){const b=document.createElement('button');b.textContent=p.name+' · '+p.part+' / '+p.num;b.onclick=()=>{$('patchpart').value=p.part;renderPatches();$('patchnum').value=p.num;patch(p.num)};const del=document.createElement('button');del.textContent='Remove';del.onclick=()=>{saveSetting('favorites',saved.filter(x=>x.part!==p.part||x.num!==p.num));renderFavorites()};const row=document.createElement('div');row.className='favorite-row';row.append(b,del);box.append(row)}}
$('favorite').onclick=()=>{const part=$('patchpart').value,num=+$('patchnum').value,key=+part===9?'drums':+part===2?'analog':'digital',p=patchCatalog?.[key]?.find(x=>x.num===num);const favorites=getSaved().favorites||[];if(!favorites.some(x=>x.part===part&&x.num===num)){favorites.push({part,num,name:p?.name||'Patch '+num});saveSetting('favorites',favorites)}renderFavorites()};
renderFavorites();
const themes=Array.from($('theme').options,option=>option.value);$('theme').value=(getSaved().themeV===3&&themes.includes(getSaved().theme))?getSaved().theme:'droid';document.documentElement.dataset.theme=$('theme').value;$('theme').onchange=()=>{document.documentElement.dataset.theme=$('theme').value;saveSetting('theme',$('theme').value);saveSetting('themeV',3)};


window.JDXiPerformance={send,stop,filePlaying:()=>midiPlaying,connected:()=>!!output,deviceId:()=>hex($('deviceid').value,1)[0],
 dt1:(addr,bytes)=>{try{return sendEditor(18,addr,bytes)}catch(e){log(e.message);return false}},
 rq1:(addr,len)=>{try{return sendEditor(17,addr,[0,0,(len>>7)&127,len&127])}catch(e){log(e.message);return false}},
 bases:editorBases,lastPatch:part=>lastPatch[part]||null,clearLastPatch:part=>{delete lastPatch[part]},refreshOverview:part=>{if($('ovpart').value===part)ovRead(true)},
 hasSysex:()=>sysexAllowed,hasInput:()=>!!input,readback:()=>editorReadback,onReply:fn=>{replyListeners.push(fn)},
 sendAt:(bytes,ts)=>{if(!output||output.state!=='connected')return false;try{output.send(bytes,ts);if(bytes[0]!==0xf8)logMidi('OUT',bytes);return true}catch(e){log('Send failed: '+e.message);return false}}};


/* ---------- DX7 import: parse -> plan (dx7.js) -> send as DT1 to the active temporary tone of Digital 1/2 ---------- */
const dxVoices=[],dxOff=new Set(),dxWait=ms=>new Promise(r=>setTimeout(r,ms));
let dxPlan=null,dxUndo=null,dxBusy=false;
const dxStatus=(t,err)=>{const el=$('dxstatus');el.textContent=t;el.classList.toggle('error',!!err)};
const DX_GROUPS=['Name','Partials','Oscillator','Pitch envelope','Filter','Amp','LFO'];
function dxCard(title,lines){const c=document.createElement('article');c.className='paramcard';const h=document.createElement('strong');h.textContent=title;c.append(h);for(const l of lines){const p=document.createElement('p');p.textContent=l;c.append(p)}return c}
function dxSelected(){return dxPlan?dxPlan.items.filter(i=>!dxOff.has(i.group)):[]}
function dxRender(){
 const v=dxVoices[+$('dxvoice').value];if(!v){return}
 dxPlan=JDXiDX7.plan(v);
 $('dxsummary').textContent=v.name+' · DX7 algorithm '+v.algorithm+'/32 · feedback '+v.feedback+'/7 · LFO speed '+v.lfo.speed+'/99 · transpose '+v.transpose+' semitones';
 const an=$('dxanalysis');an.replaceChildren();
 for(const a of dxPlan.analysis)an.append(dxCard(a.title,[a.text]));
 if(dxPlan.warnings.length)an.append(dxCard('Limitations',dxPlan.warnings));
 const gb=$('dxgroups');gb.replaceChildren();
 for(const g of DX_GROUPS){const l=document.createElement('label');l.className='inline';const c=document.createElement('input');c.type='checkbox';c.checked=!dxOff.has(g);c.onchange=()=>{if(c.checked)dxOff.delete(g);else dxOff.add(g);dxRender()};l.append(c,' '+g);gb.append(l)}
 const plan=$('dxplan');plan.replaceChildren();
 for(const g of DX_GROUPS){
  const rows=dxPlan.items.filter(i=>i.group===g&&i.text!=='');if(!rows.length)continue;
  const card=dxCard(g+(dxOff.has(g)?' (skipped)':''),rows.map(i=>i.label+': '+i.text));
  card.classList.toggle('skipped',dxOff.has(g));plan.append(card);
 }
 dxStatus(dxSelected().length+' parameters ready for '+$('dxtarget').selectedOptions[0].textContent+'. Nothing is sent until you press "Send to JD-Xi".');
 $('dxsend').disabled=false;
}
/* read the common block and all three partials of a tone (fresh values, replies land in editorReadback) */
async function dxReadTone(base,dropAddrs){
 for(const a of dropAddrs)editorReadback.delete(a);
 const jobs=[[base,0x40],[base+0x2000,0x3d],[base+0x2100,0x3d],[base+0x2200,0x3d]];
 for(const [a,len] of jobs){sendEditor(17,a,[0,0,(len>>7)&127,len&127]);await dxWait(90)}
 await dxWait(450);
}
async function dxWriteRuns(pairs){
 for(const r of JDXiDX7.toRuns(pairs)){if(!sendEditor(18,r.addr,r.bytes))throw Error('MIDI send failed (is the output still connected?)');await dxWait(25)}
}
async function dxApply(){
 if(dxBusy)return;
 if(!dxPlan){dxStatus('Load a DX7 file first.',true);return}
 if(!output){dxStatus('Connect MIDI first.',true);return}
 if(!sysexAllowed){dxStatus('SysEx permission was not granted: allow MIDI + SysEx for this site, reload and reconnect.',true);return}
 const part=$('dxtarget').value,base=editorBases[part],sel=JDXiDX7.absolute(dxSelected(),base);
 if(!sel.length){dxStatus('All groups are switched off: nothing to send.',true);return}
 dxBusy=true;$('dxsend').disabled=true;$('dxundo').disabled=true;
 try{
  const canRead=!!input;
  let snap=null;
  if(canRead){dxStatus('Reading the current tone so it can be restored…');await dxReadTone(base,sel.map(s=>s.addr));
   const s=sel.map(x=>({addr:x.addr,val:editorReadback.get(x.addr)}));if(s.every(x=>x.val!==undefined))snap=s}
  dxStatus('Sending '+sel.length+' parameters to '+$('dxtarget').selectedOptions[0].textContent+'…');
  await dxWriteRuns(sel);
  dxUndo=snap?{part,items:snap}:null;delete lastPatch[part];
  let msg='Sent '+sel.length+' parameters.';
  if(canRead){
   await dxWait(150);await dxReadTone(base,sel.map(s=>s.addr));
   const ok=sel.filter(s=>editorReadback.get(s.addr)===s.val).length,got=sel.filter(s=>editorReadback.has(s.addr)).length;
   msg=got===0?'Sent '+sel.length+' parameters, but the JD-Xi did not answer the verification read.':'Sent '+sel.length+' parameters · JD-Xi confirms '+ok+' of '+got+' read back'+(ok<got?' (the rest were limited or changed by the synth).':'.');
  }else msg+=' No MIDI input is open, so the result could not be verified and there is nothing to undo.';
  if(dxUndo)msg+=' "Undo import" restores the previous sound.';
  if($('ovpart').value===part)ovRead(true);
  dxStatus(msg);
 }catch(e){dxStatus('Import failed: '+e.message,true)}
 finally{dxBusy=false;$('dxsend').disabled=!dxPlan;$('dxundo').disabled=!dxUndo}
}
async function dxRestore(){
 if(dxBusy||!dxUndo)return;
 dxBusy=true;$('dxsend').disabled=true;$('dxundo').disabled=true;
 try{
  dxStatus('Restoring the previous sound…');
  await dxWriteRuns(dxUndo.items);
  const part=dxUndo.part;dxUndo=null;
  if($('ovpart').value===part)ovRead(true);
  dxStatus('Previous sound restored on '+({digital1:'Digital 1',digital2:'Digital 2'}[part])+'.');
 }catch(e){dxStatus('Undo failed: '+e.message,true)}
 finally{dxBusy=false;$('dxsend').disabled=!dxPlan;$('dxundo').disabled=!dxUndo}
}
$('dxsend').onclick=dxApply;$('dxundo').onclick=dxRestore;
$('dxplay').onclick=()=>{const ch=$('dxtarget').value==='digital2'?1:0;if(!output){dxStatus('Connect MIDI first.',true);return}note(ch,60,true,100);setTimeout(()=>note(ch,60,false),700)};
$('dxtarget').onchange=()=>{if(dxPlan)dxRender()};
$('dxfile').onchange=async e=>{
 try{
  const f=e.target.files?.[0];if(!f)return;if(f.size>1024*1024)throw Error('File too large (1 MB max)');
  const voices=JDXiDX7.parse(Array.from(new Uint8Array(await f.arrayBuffer())));
  dxVoices.splice(0,dxVoices.length,...voices);dxUndo=null;$('dxundo').disabled=true;
  $('dxvoice').replaceChildren();voices.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+(v.name||'Unnamed');$('dxvoice').append(o)});
  dxRender();
 }catch(err){dxVoices.length=0;dxPlan=null;$('dxvoice').replaceChildren();$('dxplan').replaceChildren();$('dxanalysis').replaceChildren();$('dxgroups').replaceChildren();$('dxsend').disabled=true;$('dxsummary').textContent='Import failed: '+err.message}
};
$('dxvoice').onchange=dxRender;


/* ---------- Active patch overview: all key parameters of the active tone on one screen ---------- */
const OV_ONOFF=['OFF','ON'],OV_LFO=['TRI','SIN','SAW','SQR','S&H','RND'];
const ovSemi=v=>(v-64>0?'+':'')+(v-64),ovPan=v=>v===64?'C':v<64?'L'+(64-v):'R'+(v-64);
const OV_OVERRIDE={
 'digital.osc.0':{options:['SAW','SQUARE','PW-SQUARE','TRIANGLE','SINE','NOISE','SUPER-SAW','PCM']},
 'digital.osc.3':{display:ovSemi},'digital.osc.4':{display:ovSemi},
 'digital.filterMain.10':{options:['BYPASS','LPF','HPF','BPF','PKG','LPF2','LPF3','LPF4']},
 'digital.filterMain.11':{options:['-12 dB','-24 dB']},
 'digital.filterMain.20':{display:ovSemi},
 'digital.pitchEnv.9':{display:ovSemi},
 'digital.ampMain.27':{display:ovPan},
 'digital.lfo.28':{options:OV_LFO},'digital.lfo.30':{options:OV_ONOFF},'digital.lfo.33':{options:OV_ONOFF},
 'digital.lfo.34':{display:ovSemi},'digital.lfo.35':{display:ovSemi},'digital.lfo.36':{display:ovSemi},'digital.lfo.37':{display:ovSemi},
 'digital.commonMain.20':{options:['MONO','POLY']},
 'analog.osc.22':{options:['SAW','TRIANGLE','SQUARE']},'analog.osc.31':{options:['OFF','-1 OCT','-2 OCT']},
 'analog.osc.23':{display:ovSemi},'analog.osc.24':{display:ovSemi},
 'analog.filter.32':{options:['BYPASS','LPF']},'analog.filter.41':{display:ovSemi},
 'analog.pitchEnv.30':{display:ovSemi},
 'analog.lfo.13':{options:OV_LFO},'analog.lfo.16':{options:OV_ONOFF},'analog.lfo.21':{options:OV_ONOFF},
 'analog.lfo.18':{display:ovSemi},'analog.lfo.19':{display:ovSemi},'analog.lfo.20':{display:ovSemi}
};
const OV_EXTRA={'digital.osc':[{off:0,label:'Waveform',min:0,max:7}]};
const OV_GROUPS={
 digital:[['Oscillator','osc'],['Filter','filterMain'],['Filter envelope (ADSR)','filterEnv'],['Amp','ampMain'],['Amp envelope (ADSR)','ampEnv'],['Pitch envelope','pitchEnv'],['LFO','lfo'],['Tone common','commonMain']],
 analog:[['Oscillator','osc'],['Filter','filter'],['Filter envelope (ADSR)','filterEnv'],['Amp','amp'],['Amp envelope (ADSR)','ampEnv'],['Pitch envelope','pitchEnv'],['LFO','lfo']]
};
const ovWidgets=new Map();let ovToken=0;
function ovKind(){return $('ovpart').value}
function ovType(){return ovKind()==='analog'?'analog':'digital'}
function ovBase(){return editorBases[ovKind()]}
function ovAddr(group,off){return ovBase()+(ovType()==='digital'&&group!=='commonMain'?0x2000+0x100*(+$('ovpartial').value):0)+off}
const OV_ESS={
 digital:{osc:[0,3,4],filterMain:[10,11,12,15,20],filterEnv:'all',ampMain:[21,27],ampEnv:'all',lfo:[28,29,34,35,36],commonMain:[12,20]},
 analog:{osc:[22,31,23,24],filter:[32,33,35,41],filterEnv:'all',amp:[42],ampEnv:'all',lfo:[13,14,18,19,20]}
};
function ovParams(group){
 const type=ovType();let list=[...(OV_EXTRA[type+'.'+group]||[]),...(parameterCatalog[type]?.[group]||[])];
 if($('ovsimple')?.checked){const e=OV_ESS[type][group];if(!e)return [];if(e!=='all')list=list.filter(p=>e.includes(p.off))}
 return list;
}
function envDraw(card){
 const c=card._env;if(!c)return;const [a,d,s,r]=c.map(x=>+x.value),k=25/127;
 const x1=a*k,x2=x1+d*k,x3=x2+20,x4=x3+r*k,y=v=>38-(v/127)*36;
 card.querySelector('polyline').setAttribute('points',['0,38',x1+',2',x2+','+y(s),x3+','+y(s),x4+',38'].join(' '));
}
function ovBuild(){
 const type=ovType();$('ovpartial').closest('label').style.display=type==='digital'?'':'none';$('ovlink').closest('label').style.display=type==='digital'?'':'none';
 const box=$('overview');box.replaceChildren();ovWidgets.clear();
 for(const [title,group] of OV_GROUPS[type]){
  const params=ovParams(group);if(!params.length)continue;
  const card=document.createElement('div');card.className='paramcard ovcard';
  const h=document.createElement('strong');h.textContent=title;card.append(h);
  const isEnv=/Env.*ADSR|ADSR/.test(title);
  if(isEnv){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 40');svg.setAttribute('class','envsvg');svg.append(document.createElementNS('http://www.w3.org/2000/svg','polyline'));card.append(svg);card._env=[]}
  for(const p of params){
   const addr=ovAddr(group,p.off),ov=OV_OVERRIDE[type+'.'+group+'.'+p.off]||{};
   const row=document.createElement('div');row.className='ovrow';
   const name=document.createElement('span');name.textContent=p.label;
   const out=document.createElement('output');
   let ctrl;
   const show=()=>{const v=+ctrl.value;out.textContent=ov.options?'':(ov.display?ov.display(v):String(v))};
   if(ov.options){ctrl=document.createElement('select');ov.options.forEach((t,i)=>{const o=document.createElement('option');o.value=p.min+i;o.textContent=t;ctrl.append(o)});ctrl.value=p.min}
   else{ctrl=document.createElement('input');ctrl.type='range';ctrl.min=p.min;ctrl.max=p.max;ctrl.value=p.min}
   ctrl.disabled=true;
   let last=null,lastT=0;
   const push=()=>{
    const v=+ctrl.value;if(v===last)return;
    const linked=$('ovlink').checked&&type==='digital'&&group!=='commonMain';
    const addrs=linked?[0,1,2].map(i=>ovBase()+0x2000+0x100*i+p.off):[addr];
    try{
     if(!sendEditor(18,addrs[0],[v]))return;
     last=v;editorReadback.set(addrs[0],v);
     addrs.slice(1).forEach((a,i)=>setTimeout(()=>{try{if(sendEditor(18,a,[v]))editorReadback.set(a,v)}catch(e){log(e.message)}},10*(i+1)));
    }catch(e){log(e.message)}
   };
   ctrl.oninput=()=>{show();if(card._env)envDraw(card);const t=performance.now();if(ctrl.type==='range'&&t-lastT>40){lastT=t;push()}};
   ctrl.onchange=push;
   row.append(name,ctrl,out);card.append(row);
   ovWidgets.set(addr,{ctrl,show,card,set(v){last=v;ctrl.value=v}});
   if(card._env&&card._env.length<4)card._env.push(ctrl);
   if(!ovWidgets.has(addr))ovWidgets.set(addr,{ctrl,show,card,set(v){last=v;ctrl.value=v}});
  }
  box.append(card);
 }
 ovRefresh();
}
function ovRefresh(){
 const force=!!$('ovforce')?.checked,cards=new Set();
 for(const [addr,w] of ovWidgets){
  if(editorReadback.has(addr)){w.set(editorReadback.get(addr));w.ctrl.disabled=false;w.syncButtons?.()}
  else {w.ctrl.disabled=!force;w.syncButtons?.()}
  w.show();cards.add(w.card);
 }
 cards.forEach(envDraw);
 let name='';for(let i=0;i<12;i++){const v=editorReadback.get(ovBase()+i);if(v===undefined){name='';break}name+=v>=32&&v<127?String.fromCharCode(v):' '}
 $('ovname').textContent=name.trim()?'Tone: '+name.trim():'';
}
function ovRead(silent){
 if(!output||!input||!sysexAllowed){if(!silent)$('ovstatus').textContent='Connect MIDI with SysEx permission and an input first.';return}
 const token=++ovToken,jobs=[[ovBase(),12]];
 for(const [,group] of OV_GROUPS[ovType()]){const params=ovParams(group);if(params.length)jobs.push([ovAddr(group,0),Math.max(...params.map(p=>p.off))+1])}
 $('ovstatus').textContent='Reading active patch…';
 jobs.forEach(([addr,len],i)=>setTimeout(()=>{
  if(token!==ovToken||!output)return;
  try{sendEditor(17,addr,[0,0,(len>>7)&127,len&127])}catch(e){log(e.message)}
  if(i===jobs.length-1)setTimeout(()=>{if(token===ovToken){const known=[...ovWidgets.keys()].filter(a=>editorReadback.has(a)).length;$('ovstatus').textContent=known===ovWidgets.size?'Read complete.':'Read '+known+' of '+ovWidgets.size+' parameters; press Read again or enable "Edit without readback".'}},700);
 },i*90));
}
$('ovread').onclick=()=>ovRead(false);
$('ovforce').onchange=ovRefresh;
$('ovsimple').onchange=()=>{ovBuild();ovRead(true)};
$('ovpart').onchange=()=>{ovBuild();ovRead(true)};
$('ovpartial').onchange=()=>{ovBuild();ovRead(true)};

window.__jdxiBooted=true;
})();
