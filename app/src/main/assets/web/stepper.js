(()=>{
/* Optional −/+ buttons next to every slider. One shared switch (remembered in this browser) that is offered in every
   menu that has sliders. Sliders are wrapped once; the buttons only show while the switch is on. Holding a button repeats. */
const KEY='jdxi-steppers';
const ls={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v}catch{return d}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}}};
let on=ls.get(KEY,'false')==='true';
const toggles=[];

function nudge(r,d){
 if(r.disabled)return false;
 const min=+r.min,max=+r.max,v=Math.max(min,Math.min(max,(+r.value)+d));
 if(v===+r.value)return false;
 r.value=v;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));return true;
}
function makeBtn(r,d){
 const b=document.createElement('button');b.type='button';b.className='stepbtn';b.textContent=d<0?'−':'+';b.setAttribute('aria-label',(d<0?'Decrease ':'Increase ')+(r.getAttribute('aria-label')||'value'));
 let t=null,iv=null,held=false;
 const stop=()=>{clearTimeout(t);clearInterval(iv);t=iv=null};
 b.addEventListener('pointerdown',e=>{e.preventDefault();held=true;nudge(r,d);t=setTimeout(()=>{iv=setInterval(()=>{if(!nudge(r,d))stop()},70)},380)});
 for(const ev of ['pointerup','pointerleave','pointercancel'])b.addEventListener(ev,stop);
 b.addEventListener('click',e=>{if(held){held=false;e.preventDefault();return}nudge(r,d)});   /* keyboard / assistive click */
 b.addEventListener('contextmenu',e=>e.preventDefault());
 return b;
}
function wrap(r){
 if(r.dataset.stepped)return;r.dataset.stepped='1';
 const w=document.createElement('span');w.className='stepwrap';
 r.before(w);w.append(makeBtn(r,-1),r,makeBtn(r,1));
}
function scan(root){(root.querySelectorAll?root.querySelectorAll('input[type=range]'):[]).forEach(wrap);if(root.matches&&root.matches('input[type=range]'))wrap(root)}
function apply(){document.documentElement.classList.toggle('steppers-on',on);toggles.forEach(t=>t.checked=on)}
function addToggle(host,where){
 if(!host)return;
 const l=document.createElement('label');l.className='inline stepper-toggle';l.title='Show a −/+ button beside every slider';
 const c=document.createElement('input');c.type='checkbox';c.checked=on;
 c.onchange=()=>{on=c.checked;ls.set(KEY,on);apply()};
 l.append(c,' −/+ buttons on sliders');toggles.push(c);
 if(where==='after')host.after(l);else host.append(l);
}

scan(document.body);
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)scan(n)}).observe(document.body,{childList:true,subtree:true});

/* offer the switch in every menu that has sliders */
addToggle(document.querySelector('.mixer-foot'));
addToggle(document.querySelector('#ovsimple')?.closest('.performance-toolbar'));
addToggle(document.querySelector('#forceedit')?.closest('label'),'after');
addToggle(document.querySelector('#arpforce')?.closest('label'),'after');
addToggle(document.querySelector('#synth .performance-toolbar:has(#part)'));
apply();
})();
