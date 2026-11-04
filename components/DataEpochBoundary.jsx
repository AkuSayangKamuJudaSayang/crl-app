'use client';
import {useEffect,useState} from 'react';
import AppLoadingScreen from '../app/components/AppLoadingScreen';
import OfflineRuntime from '../app/components/OfflineRuntime';
// This cutover deliberately invalidates operational records on older devices.
// Only CRL-owned journals/auth are removed; browser settings/other sites are untouched.
const CLIENT_BASELINE='school-roles-2026-11-04';
const KEY='crl-data-epoch-v1';
function clearDatabase(name){return new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);const timer=setTimeout(()=>reject(Error('Close other CRL-App tabs, then reload to finish updating.')),8000);request.onsuccess=()=>{clearTimeout(timer);resolve();};request.onerror=()=>{clearTimeout(timer);reject(Error('Allow site storage, then reload to finish updating.'));};request.onblocked=()=>{};});}
async function clearOperationalData(){
 for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(/^(crla[-_:]|crl[-_:])/.test(key)&&!/(consent|privacy|policy|theme|install|data-epoch)/i.test(key))storage.removeItem(key);
 if(typeof indexedDB!=='undefined')await Promise.all(['crl-app-teacher-offline-db','crl-app-assessment-db','crl-local-first'].map(clearDatabase));
}
export default function DataEpochBoundary({children}){
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);(async()=>{
  let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
  let epoch=null;try{const r=await fetch('/api/access?action=epoch',{signal:controller.signal,cache:'no-store'});if(r.ok)epoch=(await r.json()).epoch;}catch{}finally{clearTimeout(timer);}
  if(!saved||saved.baseline!==CLIENT_BASELINE||epoch&&saved.epoch!==epoch){await clearOperationalData();localStorage.setItem(KEY,JSON.stringify({baseline:CLIENT_BASELINE,epoch:epoch||null}));}
  if(active)setReady(true);
 })().catch(e=>{if(active)setError(e.message);});return()=>{active=false;controller.abort();clearTimeout(timer);};},[]);
 if(error)return <main style={{padding:32,maxWidth:620,margin:'60px auto',fontFamily:'system-ui'}}><h1>Finish updating CRL-App</h1><p role="alert">{error}</p><button onClick={()=>location.reload()}>Reload</button></main>;
 if(!ready)return <AppLoadingScreen message="Opening your workspace…"/>;
 return <><OfflineRuntime/>{children}</>;
}
