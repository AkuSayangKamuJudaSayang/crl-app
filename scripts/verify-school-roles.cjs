const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{transform}=require('next/dist/build/swc');
(async()=>{
 const jose=await import('jose'),jwt=require('jsonwebtoken');
 const secret='synthetic-school-role-test-key';let user={id:901,username:'teacher_test',role:'teacher',schoolId:'123456',isActive:true,adminSessionVersion:2},schoolActive=true;
 const prisma={user:{findUnique:async({where})=>where.id===user?.id?user:null},school:{findFirst:async({where})=>schoolActive&&where.id===user?.schoolId?{id:where.id,isActive:true}:null}};
 async function load(path,dependencies){const module={exports:{}},code=(await transform(fs.readFileSync(path,'utf8'),{filename:path,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code;vm.runInNewContext(code,{module,exports:module.exports,require:n=>dependencies[n]||require(n),process:{env:{JWT_SECRET:secret}},TextEncoder,console});return module.exports;}
 const auth=await load('lib/auth.js',{'./prisma':{prisma},'next/headers':{cookies:async()=>({get(){}})},jose});
 const request=token=>({cookies:{get:name=>['crla_token','crla_admin_token','crl_coordinator_token'].includes(name)?{value:token}:undefined},headers:new Headers()});
 const token=await auth.createAuthToken(user);assert.equal((await auth.getAuthenticatedUser(request(token))).id,901);
 for(const bad of [{...user,isActive:false},{...user,adminSessionVersion:3},{...user,role:'reading_coordinator'},null]){const saved=user;user=bad;assert.equal(await auth.getAuthenticatedUser(request(token)),null);user=saved;}
 schoolActive=false;assert.equal(await auth.getAuthenticatedUser(request(token)),null);schoolActive=true;
 const legacy=jwt.sign({id:901,role:'teacher'},secret);assert.equal(await auth.getAuthenticatedUser(request(legacy)),null);
 const portal=await load('lib/portalAuth.js',{'./prisma':{prisma},'next/headers':{cookies:async()=>({get(){}})},jose});
 user={...user,role:'reading_coordinator'};const coordinatorToken=await portal.signPortalToken(user);assert.equal((await portal.getPortalUser(request(coordinatorToken))).id,901);assert.equal(await portal.getPortalUser(request(coordinatorToken),'admin'),null);assert.equal(await auth.getAuthenticatedUser(request(coordinatorToken)),null);assert.equal(await portal.getPortalUser(request(token)),null);
 user={...user,role:'admin',schoolId:'123456'};const adminToken=await portal.signPortalToken(user);assert.equal((await portal.getPortalUser(request(adminToken),'admin')).id,901);assert.equal(await portal.getPortalUser(request(adminToken)),null);
 const oldAdmin=jwt.sign({id:901,role:'admin',scope:'admin',session_version:2},secret);assert.equal(await portal.getPortalUser(request(oldAdmin),'admin'),null);
 const scope=await load('lib/schoolContext.js',{});let calls=[];const fake={assessmentLibraryHead:{findUnique:async options=>(calls.push(options),options),create:async options=>(calls.push(options),options)},globalSchoolYear:{upsert:async options=>(calls.push(options),options)}};
 const client=scope.scopedClient(fake,'123456');await client.assessmentLibraryHead.findUnique({where:{period:'BoSY'}});assert.equal(calls[0].where.schoolId_period.schoolId,'123456');await client.globalSchoolYear.upsert({where:{startYear:2026},create:{startYear:2026},update:{deletedAt:null}});assert.equal(calls[1].where.schoolId_startYear.schoolId,'123456');assert.equal(calls[1].create.schoolId,'123456');await client.assessmentLibraryHead.create({data:{schoolId:'234567',period:'BoSY'}});assert.equal(calls[2].data.schoolId,'123456');
 const seen=await Promise.all(['123456','234567'].map(schoolId=>scope.schoolContext.run({schoolId},async()=>{await new Promise(r=>setTimeout(r,schoolId==='123456'?3:1));return scope.schoolScope();})));assert.deepEqual(seen,['123456','234567']);assert.equal(scope.schoolScope(),null);
 user={...user,role:'teacher',schoolId:'123456',isActive:true};
 const offline=await load('app/api/auth/offline/route.js',{'../../../../lib/auth':auth,'../../../../lib/prisma':{prisma},'../../../../lib/security':{logSecureError(){}}});
 const prepared=await offline.GET(request(await auth.createAuthToken(user)));assert.equal(prepared.status,200);const body=await prepared.json();const claim=jwt.verify(body.offlineToken,secret);assert.equal(claim.scope,'app');assert.equal(claim.session_version,user.adminSessionVersion);assert.equal(claim.type,'teacher_offline_session');
 const bearer={cookies:{get(){}},headers:new Headers({authorization:'Bearer '+body.offlineToken})};assert.equal((await auth.getAuthenticatedUser(bearer)).id,901);
 user={...user,isActive:false};assert.equal((await offline.GET(request(token))).status,401);
 assert.ok(!fs.readFileSync('app/layout.jsx','utf8').includes('DataEpochBoundary'),'Preserving rollout must not erase existing device journals');
 const preserving=fs.readFileSync('docs/migrations/school_scope_preserving.sql','utf8');assert.ok(!/\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(preserving));assert.ok(preserving.includes('Preservation check failed'));
 console.log('PASS versioned offline bootstrap authenticates current teacher, remains valid for bearer sync, rejects disabled accounts, and preserving rollout contains no operational reset.');
 console.log('PASS current-account and session-version checks reject deleted, disabled, stale, legacy and wrong-role sessions; portal audience/cookies separate roles; school key injection and concurrent request context stay isolated.');
})().catch(e=>{console.error(e);process.exitCode=1});
