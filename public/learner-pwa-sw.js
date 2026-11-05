const CACHE_NAME = "crl-app-learner-offline-v34";
const SHELL_URL = "/learner";
const ICON_URLS = ["/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/crl-app-logo.png","/fonts/OpenDyslexic-Regular.woff2","/fonts/OpenDyslexic-Bold.woff2"];
function learnerPath(url){return url.pathname==="/learner"||url.pathname.startsWith("/learner/");}
async function putIfOk(cache,request,response){
  if(response?.ok){try{await cache.put(request,response.clone());}catch{}}
  return response;
}
async function fetchWithTimeout(request,timeoutMs=8000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(request,{cache:"no-store",signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function readCached(request){
  try{
    const keys=await caches.keys();
    for(const name of [CACHE_NAME,...keys.filter(key=>key.startsWith("crl-app-learner-")&&key!==CACHE_NAME)]){
      const response=await(await caches.open(name)).match(request);
      if(response)return response;
    }
  }catch{}
}
let shellWarmup=null;
function warmShell(){
  if(!shellWarmup)shellWarmup=(async()=>{
    const cache=await caches.open(CACHE_NAME);
    const response=await fetchWithTimeout(SHELL_URL);
    if(!response.ok)return;
    const html=await response.clone().text(),assets=new Set(ICON_URLS);
    for(const match of html.matchAll(/(?:src|href)=["'](\/_next\/[^"']+)["']/g))assets.add(match[1]);
    const results=await Promise.allSettled([...assets].map(async asset=>{
      const result=await fetchWithTimeout(asset);
      if(!result.ok)throw Error('Shell asset unavailable');
      await cache.put(asset,result.clone());
    }));
    // Never replace the working offline document with one whose chunks failed.
    if(results.some(result=>result.status==='rejected'))return;
    await cache.put(SHELL_URL,response.clone());
    for(const name of(await caches.keys()).filter(key=>key.startsWith("crl-app-learner-")&&key!==CACHE_NAME)){
      const previous=await caches.open(name);
      for(const request of await previous.keys()){
        if(!new URL(request.url).pathname.startsWith('/_next/static/')||await cache.match(request))continue;
        await putIfOk(cache,request,await previous.match(request));
      }
      await caches.delete(name);
    }
  })().catch(()=>{}).finally(()=>{shellWarmup=null;});
  return shellWarmup;
}
self.addEventListener("install",event=>{
  // Worker activation and Android's separate package installer are different.
  // Neither network nor cache storage is allowed to hold this install open.
  event.waitUntil(Promise.resolve(self.skipWaiting()));
});
self.addEventListener("message",event=>{
  if(event.data?.type==="WARM_LEARNER_SHELL")event.waitUntil(warmShell());
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});
self.addEventListener("activate",event=>{
  // Keep the previous working shell until the replacement is complete.
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  const documentRequest=request.mode==="navigate"&&learnerPath(url);
  const staticAsset=url.pathname.startsWith("/_next/static/")||url.pathname.startsWith("/icons/")||url.pathname.startsWith("/fonts/")||url.pathname==="/crl-app-logo.png";
  if(!documentRequest&&!(staticAsset&&learnerPath(new URL(request.referrer||self.location.origin))))return;
  event.respondWith((async()=>{
    if(documentRequest){
      try{
        const response=await fetchWithTimeout(request);
        // Warming is independent of navigation, and preserves the old copy on failure.
        if(response.ok)event.waitUntil(warmShell());
        return response;
      }catch{
        return(await readCached(SHELL_URL))||new Response("CRL-App Learner is offline. Open it online once before using it offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    }
    // An available cached chunk must not wait for a black-holed mobile network.
    const cached=await readCached(request);if(cached)return cached;
    try{
      const response=await fetchWithTimeout(request);
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>putIfOk(cache,request,copy)).catch(()=>{}));
      return response;
    }catch{return Response.error();}
  })());
});
