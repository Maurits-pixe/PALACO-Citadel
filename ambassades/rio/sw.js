'use strict';
const CACHE='palaco-rio-start-v0.1-1';
const PREFIX='palaco-rio-start-';
const ASSETS=['/rio/','/rio/manifest.webmanifest','/rio/icon-192.png','/rio/icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    try{
      for(const path of ASSETS){
        const response=await fetch(new Request(path,{cache:'reload',credentials:'omit'}));
        if(!response.ok||response.type!=='basic')throw new Error('CACHE_INSTALL_FAILED');
        await cache.put(path,response);
      }
    }catch(error){await caches.delete(CACHE);throw error;}
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Exact public app assets only. Never cache login, ambassador pages, private APIs or download responses.
  const appNavigation=event.request.mode==='navigate'&&['/rio/','/rio/index.html'].includes(url.pathname);
  if(!appNavigation&&(!ASSETS.includes(url.pathname)||url.search))return;
  event.respondWith((async()=>{
    const key=appNavigation?'/rio/':url.pathname,cache=await caches.open(CACHE);
    if(!appNavigation){const cached=await cache.match(key);if(cached)return cached;}
    try{
      const response=await fetch(event.request);
      if(response.ok&&response.type==='basic')await cache.put(key,response.clone());
      return response;
    }catch(error){const cached=await cache.match(key);if(cached)return cached;throw error;}
  })());
});
