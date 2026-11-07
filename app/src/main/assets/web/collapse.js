(()=>{
/* Collapsible sections: every page title (h1) and sub-heading (h2) toggles the content beneath it.
   The choice is remembered in this browser. */
const KEY='jdxi-collapsed';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};

function makeToggle(head,body,id){
 head.classList.add('fold-head');head.tabIndex=0;head.setAttribute('role','button');
 const set=collapsed=>{body.hidden=collapsed;head.classList.toggle('collapsed',collapsed);head.setAttribute('aria-expanded',String(!collapsed))};
 set(!!saved[id]);
 const toggle=()=>{const c=!body.hidden;set(c);if(c)saved[id]=1;else delete saved[id];persist()};
 head.addEventListener('click',toggle);
 head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
}

function group(container,level,prefix){
 /* wrap everything after each heading of this level (up to the next heading of the same or higher level) */
 const stop=level==='h1'?'H1':'H1,H2';
 const kids=[...container.children];let n=0;
 for(let i=0;i<kids.length;i++){
  const el=kids[i];
  if(el.tagName!==level.toUpperCase())continue;
  const body=document.createElement('div');body.className='fold-body';
  let j=i+1;const moved=[];
  while(j<kids.length&&!stop.split(',').includes(kids[j].tagName)){moved.push(kids[j]);j++}
  el.after(body);body.append(...moved);
  const title=el.firstChild?el.firstChild.textContent.trim():level+n;
  makeToggle(el,body,prefix+'|'+level+'|'+(title||n));n++;
  i=j-1;
 }
}

document.querySelectorAll('main > section.page').forEach(page=>{
 /* 1) h1 sections wrap everything below the title; 2) h2 sections inside it */
 group(page,'h1',page.id);
 const h1body=page.querySelector(':scope > .fold-body');
 if(h1body)group(h1body,'h2',page.id);
});

/* "Advanced" details block: same look, remembers its state too */
document.querySelectorAll('details.advanced').forEach((d,i)=>{
 const id='advanced|'+i;if(saved[id]===0)d.open=false;
 d.addEventListener('toggle',()=>{if(d.open)delete saved[id];else saved[id]=1;persist()});
});

/* MIDI connection panel is closed by default; remember if the user opened it */
const conn=document.getElementById('midi-conn');
if(conn){
 conn.open=saved['midi-conn']===2;
 conn.addEventListener('toggle',()=>{if(conn.open)saved['midi-conn']=2;else delete saved['midi-conn'];persist()});
}
})();
