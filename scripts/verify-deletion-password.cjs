const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
(async()=>{
  const protocol=await import('../lib/deletionStatement.mjs');
  const security=await import('../lib/offlineLoginSecurity.js');
  const swc=require('next/dist/build/swc');
  const compile=async(file,deps,globals={})=>{
    const result=await swc.transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true}},module:{type:'commonjs'}});
    const context={module:{exports:{}},require:name=>name in deps?deps[name]:require(name),console,TextEncoder,TextDecoder,Uint8Array,atob,btoa,Buffer,AbortController,Response,setTimeout,clearTimeout,...globals};context.exports=context.module.exports;
    vm.runInNewContext(result.code,context);return context.module.exports;
  };
  const processStub={env:{JWT_SECRET:'synthetic-deletion-verification-key'}};
  const login=await compile('lib/loginSecurity.js',{}, {process:processStub});
  const server=await compile('lib/deletionAuthorization.js',{'./loginSecurity':login,'./deletionStatement.mjs':protocol},{process:processStub});
  const password='Synthetic-Only-Password!';
  let user={id:901,username:'synthetic',role:'teacher',passwordHash:await bcrypt.hash(password,4),failedLoginAttempts:0,loginLockedUntil:null};
  const db={$queryRaw:async()=>[],user:{findUnique:async()=>({...user}),update:async({data})=>(Object.assign(user,data),{...user})},$transaction:async fn=>fn(db)};
  const storage=new Map();global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  let online=true,fetches=0,deny=false;
  const navigator={get onLine(){return online;}};
  const globals={crypto:crypto.webcrypto,navigator,localStorage,window:{dispatchEvent(){}},CustomEvent:class{},fetch:async(url,init)=>{
    fetches++;const body=JSON.parse(init.body);
    try{
      if(deny)throw Object.assign(Error('Authoritative rejection'),{status:403});
      const account=await server.requireDeletionPassword(db,901,body.password);
      return Response.json({certificate:server.createDeletionCertificate(account,body.publicKey),userId:901});
    }catch(error){return Response.json({error:error.message,...error.payload},{status:error.status||500});}
  }};
  const client=await compile('lib/deletionPasswordClient.mjs',{
    './deletionStatement.mjs':protocol,'./offlineLoginSecurity.js':security,
    './teacherOfflineDb.js':{getOfflineTeacherSession:async()=>({user:{id:901,username:'synthetic',role:'teacher'}})},
  },globals);
  const account={id:901,username:'synthetic',role:'teacher'};
  const unlocked=await client.unlockDeletionKey(password,account);
  const lrns=['000000000001','000000000002'],learners=lrns.map((lrn,id)=>({id:id+1,lrn}));
  const body=await client.signLearnerDeletion('delete_learners',{confirmation:'OLD PHRASE',deletion_reason:'Synthetic duplicate enrollment',roster_version:3},learners,unlocked);
  assert.equal(Object.hasOwn(body,'confirmation'),false);
  assert.equal(JSON.stringify(body).includes(password),false);
  const prepared=JSON.parse(storage.get('crl-deletion-key-v1:901'));
  assert.ok(prepared.encrypted);assert.equal(JSON.stringify(prepared).includes(password),false);
  assert.equal(protocol.certificateClaims(prepared.certificate).publicKey.d,undefined);
  assert.throws(()=>jwt.verify(prepared.certificate,processStub.env.JWT_SECRET),/signature/,'Deletion certificates cannot become login tokens');
  await server.verifyDeletionAuthorization(db,901,'delete_learners',body,learners);
  await client.verifyLocalDeletionAuthorization(901,'delete_learners',body,learners);
  // A deleted LRN can later be enrolled again. Old proof must never authorize
  // that new record, including when an offline provisional ID is reassigned.
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learners',{...body,learner_ids:[500,501]},learners.map((row,i)=>({...row,id:500+i}))),/account password/);
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,902,'delete_learners',body,learners),/account password/);
  for(const altered of [
    {...body,deletion_reason:'Another deletion reason'},
    {...body,roster_version:4},
    {...body,deletion_nonce:crypto.randomUUID()},
    {...body,deletion_authorization:{...body.deletion_authorization,signature:'invalid'}},
  ])await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learners',altered,learners),/account password/);
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learner',body,learners),/account password/);
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learners',body,[{lrn:'000000000003'}]),/account password/);
  const expired=jwt.sign({...protocol.certificateClaims(body.deletion_authorization.certificate),exp:Math.floor(Date.now()/1000)-1},crypto.createHmac('sha256',processStub.env.JWT_SECRET).update('crl-deletion-certificate-v1').digest(),{algorithm:'HS256'});
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learners',{...body,deletion_authorization:{...body.deletion_authorization,certificate:expired}},learners),/account password/);
  const hash=user.passwordHash;user.passwordHash=await bcrypt.hash('Changed-Synthetic-Password!',4);
  await assert.rejects(()=>server.verifyDeletionAuthorization(db,901,'delete_learners',body,learners),/account password/);
  user.passwordHash=hash;
  online=false;const before=fetches;
  const offline=await client.unlockDeletionKey(password,account);
  assert.equal(fetches,before);
  const offlineBody=await client.signLearnerDeletion('delete_learner',{deletion_reason:'Synthetic offline removal'},[learners[0]],offline);
  await server.verifyDeletionAuthorization(db,901,'delete_learner',offlineBody,[learners[0]]);
  await client.verifyLocalDeletionAuthorization(901,'delete_learner',offlineBody,[learners[0]]);
  for(let i=0;i<7;i++)await assert.rejects(()=>client.unlockDeletionKey('wrong',account),/password|locked/);
  await assert.rejects(()=>client.unlockDeletionKey(password,account),/locked/);
  storage.delete('crla-login-lock-v1:synthetic');
  online=true;deny=true;
  await assert.rejects(()=>client.unlockDeletionKey(password,account),/Authoritative rejection/,'A reachable rejection must not fall back to a cached password');
  deny=false;
  for(let i=0;i<7;i++)await assert.rejects(()=>server.requireDeletionPassword(db,901,'wrong'),/password|locked/);
  assert.equal(user.failedLoginAttempts,7);assert.ok(user.loginLockedUntil>Date.now());
  await assert.rejects(()=>server.requireDeletionPassword(db,901,password),/locked/);
  console.log('PASS real password checks, seven-attempt lockouts, encrypted offline key preparation and scoped signatures; no password/private key in replay, reused LRNs and changed IDs require fresh confirmation, tampering/foreign users/password changes/reachable rejection fail closed');
})().catch(error=>{console.error(error);process.exitCode=1;});
