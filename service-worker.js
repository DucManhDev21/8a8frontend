const CACHE_NAME="portal-8a8-v6";
const APP_SHELL=[
  "./",
  "./index.html",
  "./admin.html",
  "./seasonal-theme-engine.js",
  "./seasonal-theme.css",
  "./manifest.webmanifest"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok){
      const clone=response.clone();
      const cache=await caches.open(CACHE_NAME);
      await cache.put(request,clone);
    }
    return response;
  }catch(error){
    const cached=await caches.match(request);
    if(cached)return cached;
    throw error;
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);

  // Never cache Firebase, Firestore, Google APIs or the Railway backend.
  if(url.pathname.includes("/api/")||url.hostname.includes("firebaseio.com")||url.hostname.includes("googleapis.com"))return;

  // Keep HTML/CSS/JS fresh so fixes are not hidden behind a stale PWA cache.
  if(request.mode==="navigate"){
    event.respondWith(networkFirst(request).catch(()=>caches.match("./index.html")));
    return;
  }

  if(/[.]html(?:$|[?])/i.test(url.pathname)||/[.](?:css|js|webmanifest)$/i.test(url.pathname)){
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)).catch(()=>{});}
      return response;
    }))
  );
});
