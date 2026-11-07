(()=>{
'use strict';
const api=window.JDXiPerformance;
const status=t=>document.getElementById('fx-status').textContent=t;
const routes=['Effect 1','Effect 2','Delay','Reverb','Direct'];
const partFields=[[0x2d,'Output',routes],[0x2b,'Delay send'],[0x2c,'Reverb send']];
const sends=[[1,'Level'],[2,'Delay send'],[3,'Reverb send']];
const groups=[
 ...[0x18002000,0x18002100,0x18002200,0x18002300].map(base=>({base,size:0x4c,fields:partFields})),
 {base:0x18000200,size:145,fields:[[0,'Type',['Thru','Distortion','Fuzz','Compressor','Bit Crusher']],...sends,[4,'Output',['Direct','Effect 2']]]},
 {base:0x18000400,size:145,fields:[[0,'Type',['Thru',null,null,null,null,'Flanger','Phaser','Ring Mod','Slicer']],...sends]},
 {base:0x18000600,size:100,fields:[[1,'Delay level'],[3,'Reverb send']]},
 {base:0x18000800,size:99,fields:[[1,'Reverb level']]}
];
const controls=new Map();
let generation=0;
groups.forEach(({base,fields},i)=>{
 const host=document.getElementById('fx-'+i);
 for(const [offset,name,options] of fields){
  const address=base+offset,label=document.createElement('label');
  label.append(name);
  const input=document.createElement(options?'select':'input'),out=document.createElement('output');
  if(options){
   input.add(new Option('—',''));
   options.forEach((v,n)=>{if(v)input.add(new Option(v,n))});
   if(i===3){const kit=new Option('Kit (individual drum sounds)',5);kit.disabled=true;input.add(kit)}
  }else{input.type='range';input.min=0;input.max=127;input.setAttribute('aria-label',name);label.append(out)}
  input.disabled=true;label.append(input);host.append(label);
  function show(value){
   input.disabled=value==null;
   if(options)input.value=value==null?'':String(value);
   else{input.value=value??0;out.textContent=value??'—'}
  }
  show(null);
  controls.set(address,{show,input});
  input.oninput=()=>{if(!options)out.textContent=input.value};
  input.onchange=()=>{
   if(input.value==='')return;
   const value=Number(input.value);
   if(api.connected()&&api.hasSysex()&&api.dt1(address,[value])){
    api.readback().set(address,value);status(name+' sent to JD-Xi.');
   }else{reset();status('Write failed. Reconnect with SysEx permission and read FX again.')}
  };
 }
});
function reset(){
 generation++;
 for(const c of controls.values())c.show(null);
 status('Read the current program from the JD-Xi.');
}
api.onReply((address,length)=>{
 for(const [addr,c] of controls)if(addr>=address&&addr<address+length)c.show(api.readback().get(addr));
});
function read(){
 reset();
 if(!api.connected()||!api.hasInput()||!api.hasSysex()){status('Select a MIDI input and output and allow SysEx, then press Read FX.');return}
 const token=generation;status('Reading program effects…');
 groups.forEach(({base,size},i)=>setTimeout(()=>{if(token===generation)api.rq1(base,size)},i*85));
 setTimeout(()=>{
  if(token!==generation)return;
  const count=[...controls.values()].filter(c=>!c.input.disabled).length;
  status(count===controls.size?'Current program effects loaded.':count+' of '+controls.size+' settings received. Check the ports and device ID, then read again.');
 },1500);
}
document.getElementById('fx-read').onclick=read;
document.querySelector('[data-page="fx"]').addEventListener('click',read);
window.JDXiFx={reset};
})();
