/* Minimal service worker: makes the page installable and lets it open offline.
   Network first (so updates arrive immediately), cache as fallback. */
const CACHE='jdxi-remote-v12';
const SHELL=['./','index.html','style.css','data.js','dx7.js','pattern-midi.js','app.js','mypatches.js','mixer.js','viz.js','stepper.js','performance.js','sequencer.js','fx.js','transfer.js','collapse.js','install.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
 const key=new URL(req.url);key.search='';
 e.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(key.href,copy))}return res})
  .catch(()=>caches.match(key.href).then(r=>r||caches.match('index.html'))));
});
