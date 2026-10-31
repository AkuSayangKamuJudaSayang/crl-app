import { deletionStatement, statementBytes, certificateClaims, matchingDeletionStatement } from './deletionStatement.mjs';
import { cachedLoginLock, recordOfflinePasswordResult, rememberLoginLock, clearLoginLock } from './offlineLoginSecurity.js';
import { getOfflineTeacherSession, getOfflineOutbox, getOfflineTeacherSnapshot, updatePendingDeletionProofs } from './teacherOfflineDb.js';

const storageKey=id=>`crl-deletion-key-v1:${Number(id)}`;
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const keyFromPassword=async(password,salt)=>{
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
};
const read=id=>{try{return JSON.parse(localStorage.getItem(storageKey(id))||'null');}catch{return null;}};

export async function createDeletionKeyPair() {
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  return {pair,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};
}
export async function storePreparedDeletionKey(password,user,pair,certificate) {
  const claims=certificateClaims(certificate),pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  if(claims.userId!==Number(user.id)||claims.publicKey.x!==pub.x||claims.publicKey.y!==pub.y)throw Error('Account confirmation did not match.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await keyFromPassword(password,salt);
  const privateKey=await crypto.subtle.exportKey('jwk',pair.privateKey);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(certificate)},key,new TextEncoder().encode(JSON.stringify(privateKey)));
  localStorage.setItem(storageKey(user.id),JSON.stringify({certificate,salt:encode(salt),iv:encode(iv),encrypted:encode(encrypted)}));
}

export async function unlockDeletionKey(password,user,learnerIds=[]) {
  if(!password || typeof password!=='string' || password.length>1024)throw Error('Enter your account password.');
  if(!user?.id || !user.username)throw Error('Sign in again to confirm your account password.');
  let unavailable=navigator.onLine===false;
  if(!unavailable){
    const {pair,publicKey}=await createDeletionKeyPair();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try {
      const session=await getOfflineTeacherSession().catch(()=>null);
      const response=await fetch('/api/auth/deletion-confirmation',{method:'POST',credentials:'include',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...(session?.offlineToken?{Authorization:`Bearer ${session.offlineToken}`}:{})},body:JSON.stringify({password,publicKey,learner_ids:learnerIds})});
      let data;
      try { data=await response.json(); } catch {
        if (![502,503,504].includes(response.status)) throw Object.assign(Error('Password confirmation returned an invalid response. Sign in again.'),{authoritative:true});
        data={};
      }
      if(!response.ok){
        if([502,503,504].includes(response.status)){unavailable=true;}else{
          if(data.code==='ACCOUNT_LOCKED')rememberLoginLock(user.username,data);
          throw Object.assign(Error(data.error||'Unable to verify your account password.'),{authoritative:true});
        }
      }else{
        const claims=certificateClaims(data.certificate);
        if(claims.userId!==Number(user.id)||claims.publicKey.x!==publicKey.x||claims.publicKey.y!==publicKey.y)throw Object.assign(Error('Account confirmation did not match. Sign in again.'),{authoritative:true});
        await storePreparedDeletionKey(password,user,pair,data.certificate);
        clearLoginLock(user.username);
        return {certificate:data.certificate,key:pair.privateKey,targets:data.targets||[]};
      }
    }catch(error){if(error.authoritative)throw error;unavailable=true;}finally{clearTimeout(timer);}
  }
  const stored=read(user.id),lock=cachedLoginLock(user.username);
  if(lock?.until>Date.now())throw Error('This account is temporarily locked. Wait for the lock to end or connect to check your account.');
  if(!stored)throw Error('Prepare password confirmation online once before deleting learners offline. Sign in online after updating this app.');
  const claims=certificateClaims(stored.certificate);
  if(claims.userId!==Number(user.id)||claims.exp*1000<=Date.now())throw Error('Offline password confirmation has expired. Connect and confirm your password again.');
  try {
    const key=await keyFromPassword(password,decode(stored.salt));
    const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(stored.iv),additionalData:new TextEncoder().encode(stored.certificate)},key,decode(stored.encrypted));
    const privateKey=await crypto.subtle.importKey('jwk',JSON.parse(new TextDecoder().decode(decrypted)),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    recordOfflinePasswordResult(user.username,true,user.role==='admin'?5:30);
    return {certificate:stored.certificate,key:privateKey};
  }catch{
    const failed=recordOfflinePasswordResult(user.username,false,user.role==='admin'?5:30);
    throw Error(failed?.locked?'Too many incorrect passwords. This account is temporarily locked.':'Incorrect account password.');
  }
}

export async function signLearnerDeletion(action,body,targets,unlocked) {
  const {confirmation,password,confirmation_password,...safe}=body;
  const next={...safe,deletion_nonce:body.deletion_nonce||crypto.randomUUID()};
  const statement=deletionStatement(action,next,targets);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},unlocked.key,statementBytes(statement));
  return {...next,deletion_authorization:{certificate:unlocked.certificate,statement,signature:encode(signature)}};
}

export async function reauthorizePendingDeletions(password) {
  const session=await getOfflineTeacherSession();
  if(!session?.user||session.signedOut)throw Error('Sign in to the account that saved these deletions.');
  const entries=(await getOfflineOutbox()).filter(entry=>Number(entry.userId)===Number(session.user.id)&&['delete_learner','delete_learners'].includes(entry.kind));
  if(!entries.length)return;
  const requestedIds=entries.flatMap(entry=>entry.kind==='delete_learners'?entry.body.learner_ids:[entry.body.learner_id??entry.body.learnerId??entry.body.id]).map(Number).filter(id=>id>0);
  const unlocked=await unlockDeletionKey(password,session.user,requestedIds),snapshot=await getOfflineTeacherSnapshot(session.user.id);
  const identities=[...(snapshot?.learners||[]),...(snapshot?.learnerTombstones||[])];
  const replacements=[];
  for(const entry of entries){
    const ids=entry.kind==='delete_learners'?entry.body.learner_ids:[entry.body.learner_id??entry.body.learnerId??entry.body.id];
    const targets=ids.map(id=>({id:Number(id),lrn:unlocked.targets?.find(row=>Number(row.id)===Number(id))?.lrn || identities.find(row=>Number(row.id)===Number(id))?.lrn || entry.body.deletion_authorization?.statement?.targets?.find(row=>Number(row.id)===Number(id))?.lrn || (entry.kind==='delete_learner'?entry.body.lrn:null)}));
    const body=await signLearnerDeletion(entry.kind,entry.body,targets,unlocked);
    replacements.push({id:entry.id,body});
  }
  const updated=await updatePendingDeletionProofs(session.user.id,replacements);
  if(updated.updated!==entries.length)throw Error('Pending changes were updated in another tab. Review the sync status and try again.');
  window.dispatchEvent(new CustomEvent('crl-offline-sync-retry'));
}

export async function verifyLocalDeletionAuthorization(userId,action,body,learners) {
  try{
    const proof=body.deletion_authorization,stored=read(userId);
    if(!stored || proof?.certificate!==stored.certificate)throw Error();
    const claims=certificateClaims(proof.certificate);
    if(claims.userId!==Number(userId)||claims.exp*1000<=Date.now()||!matchingDeletionStatement(proof.statement,action,body,learners))throw Error();
    const key=await crypto.subtle.importKey('jwk',claims.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(proof.signature),statementBytes(proof.statement)))throw Error();
  }catch{throw Error('Enter your account password to confirm this deletion.');}
}
