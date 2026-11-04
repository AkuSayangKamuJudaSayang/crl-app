// Public app files only. This cannot inspect Android's package installer or launcher.
const names = {teacher:'Teacher',learner:'Learner'};
export async function checkPwaReadiness(app='learner') {
  const role = Object.hasOwn(names,app)?app:'learner';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  const result={manifest:false,icons:false,offline:false};
  try {
    const response=await fetch(`/${role}-manifest.webmanifest`,{cache:'reload',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw Error('Unavailable manifest');
    const manifest=await response.json();
    const base=window.location.origin;
    const start=new URL(manifest.start_url,base),scope=new URL(manifest.scope,base),id=new URL(manifest.id,base);
    if(start.origin!==base||scope.origin!==base||id.origin!==base||id.pathname!==`/${role}`||start.pathname!==`/${role}`||!start.href.startsWith(scope.href)||manifest.display!=='standalone')throw Error('Invalid manifest');
    result.manifest=true;
    const icons=[192,512].map(size=>({size,icon:manifest.icons?.find(icon=>icon.sizes===`${size}x${size}`&&(!icon.purpose||icon.purpose.split(' ').includes('any')))}));
    icons.push({size:512,icon:manifest.icons?.find(icon=>icon.purpose?.split(' ').includes('maskable'))});
    await Promise.all(icons.map(async({icon,size})=>{
      if(!icon)throw Error('Missing icon');
      const url=new URL(icon.src,base);
      if(url.origin!==base||!url.pathname.startsWith('/icons/'))throw Error('Unexpected icon');
      const asset=await fetch(url.href,{cache:'reload',credentials:'omit',signal:controller.signal});
      if(!asset.ok||!asset.headers.get('content-type')?.includes('image/png'))throw Error('Unavailable icon');
      const bytes=new Uint8Array(await asset.arrayBuffer());
      if(bytes.length<24||bytes.length>2*1024*1024||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))throw Error('Invalid icon');
      const dimensions=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(dimensions.getUint32(16)!==size||dimensions.getUint32(20)!==size)throw Error('Invalid icon size');
    }));
    result.icons=true;
  } catch {
    // Keep a useful partial result; no raw server responses or private data in UI.
  } finally {clearTimeout(timer);controller.abort();}
  let timerCleanup;
  try {
    if('serviceWorker' in navigator){
      const registration=await Promise.race([
        navigator.serviceWorker.getRegistration(`/${role}`),
        new Promise(resolve=>{const id=setTimeout(()=>resolve(null),1500);timerCleanup=()=>clearTimeout(id);})
      ]);
      result.offline=registration?.active?.state==='activated'&&new URL(registration.active.scriptURL).pathname===(role==='learner'?'/learner-pwa-sw.js':'/sw.js');
    }
  } catch {} finally {timerCleanup?.();}
  return result;
}
