(()=>{
/* Debug tools (Info page): System scan. Reads the JD-Xi System (02 00 00 00, 02 00 03 00) and Setup (01 00 00 00) blocks
   with RQ1 and shows every byte. Run it, change one menu setting on the synth (e.g. Sync Mode), run it again: bytes that
   changed are listed. That shows whether a menu setting has a SysEx address at all. Read-only: nothing is written. */
const $=id=>document.getElementById(id);
const api=()=>window.JDXiPerformance;
const hex=(n,w=2)=>n.toString(16).toUpperCase().padStart(w,'0');
const addr=a=>[a>>>24,(a>>>16)&255,(a>>>8)&255,a&255].map(x=>hex(x)).join(' ');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* the JD-Xi only answers RQ1 with the block's exact size, which is not known for every block: try likely sizes */
const PLAN=[
 {name:'System Common',base:0x02000000,sizes:[0x2b,0x2c,0x2a,0x2d,0x30,0x40]},
 {name:'System Controller',base:0x02000300,sizes:[0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x10]},
 {name:'Setup',base:0x01000000,sizes:[0x04,0x05,0x06,0x07,0x08,0x0c,0x10,0x20,0x30]}
];
const KEY='jdxi-debug-scan-v1';
let busy=false,collecting=false,blocks=[],prev=null;
try{prev=JSON.parse(localStorage.getItem(KEY))}catch{}
const out=$('dbg-out'),status=t=>{$('dbg-status').textContent=t};
const rb=()=>api().readback();
function onReply(base,len){
 if(!collecting)return;
 const vals=[];for(let i=0;i<len;i++)vals.push(rb().get(base+i)??0);
 if(!blocks.some(b=>b.base===base&&b.len===len))blocks.push({base,len,vals});
}
if(api()?.onReply)api().onReply(onReply);
function ready(){
 const a=api();
 if(!a?.connected()){status('Connect MIDI first.');return false}
 if(!a.hasSysex()){status('SysEx permission is needed.');return false}
 if(!a.hasInput()){status('Select a MIDI input (the JD-Xi must be able to reply).');return false}
 return true;
}
const flat=bs=>{const m={};for(const b of bs)b.vals.forEach((v,i)=>{m[b.base+i]=v});return m};
const row=(base,vals)=>{
 let s='';
 for(let i=0;i<vals.length;i+=8)s+='  '+addr(base+i)+'  '+vals.slice(i,i+8).map(v=>hex(v)).join(' ')+'\n';
 return s;
};
function render(title,bs,diff){
 let s=title+'\n';
 if(diff)s+=diff+'\n';
 if(!bs.length)s+='\nNo replies. Check MIDI input/output, SysEx permission and the Device ID.\n';
 for(const b of bs.slice().sort((x,y)=>x.base-y.base))s+='\n'+addr(b.base)+' · '+b.len+' bytes\n'+row(b.base,b.vals);
 return s;
}
function diffText(now,before){
 if(!before)return '(no earlier scan to compare with: change a setting on the synth and scan again)';
 const lines=[],keys=new Set([...Object.keys(now),...Object.keys(before)].map(Number));
 for(const k of [...keys].sort((a,b)=>a-b)){
  const a=before[k],b=now[k];
  if(a===b)continue;
  const dec=v=>v===undefined?'—':v;
  lines.push('  '+addr(k)+':  '+(a===undefined?'—':hex(a))+' → '+(b===undefined?'—':hex(b))+'   ('+dec(a)+' → '+dec(b)+')');
 }
 return lines.length?'CHANGED since the previous scan ('+lines.length+'):\n'+lines.join('\n'):'No bytes changed since the previous scan.';
}
async function scan(){
 if(busy||!ready())return;
 busy=true;$('dbg-scan').disabled=true;blocks=[];collecting=true;out.textContent='';
 try{
  for(const p of PLAN){
   for(const size of p.sizes){
    status('Reading '+p.name+' ('+addr(p.base)+', size '+hex(size)+')…');
    api().rq1(p.base,size);
    await sleep(170);
    if(blocks.some(b=>b.base===p.base))break;
   }
  }
  await sleep(400);
 }finally{collecting=false;busy=false;$('dbg-scan').disabled=false}
 const now=flat(blocks),when=new Date().toLocaleTimeString();
 out.textContent=render('System scan '+when,blocks,diffText(now,prev&&prev.map));
 try{localStorage.setItem(KEY,JSON.stringify({map:now,time:when}))}catch{}
 prev={map:now,time:when};
 status(blocks.length?'Scan done: '+blocks.length+' block(s) answered.':'No block answered.');
}
async function custom(){
 if(busy||!ready())return;
 const a=parseInt(String($('dbg-addr').value).replace(/\s+/g,''),16),n=parseInt($('dbg-size').value,16);
 if(!Number.isFinite(a)||!Number.isFinite(n)||n<1||n>0x7f*0x80){status('Enter a hex address (e.g. 02 00 00 00) and a hex size.');return}
 busy=true;collecting=true;blocks=[];
 status('Reading '+addr(a)+', size '+hex(n)+'…');
 api().rq1(a,n);await sleep(700);
 collecting=false;busy=false;
 out.textContent=render('Custom read '+new Date().toLocaleTimeString()+(blocks.length?'':'  (the JD-Xi only answers an exact block start + size)'),blocks)+'\n'+out.textContent;
 status(blocks.length?'Reply received.':'No reply.');
}
$('dbg-scan').onclick=scan;
$('dbg-custom').onclick=custom;
$('dbg-forget').onclick=()=>{prev=null;try{localStorage.removeItem(KEY)}catch{}status('Previous scan forgotten.')};
$('dbg-copy').onclick=async()=>{try{await navigator.clipboard.writeText(out.textContent);status('Copied.')}catch{status('Copy failed: select the text and copy it manually.')}};
})();
