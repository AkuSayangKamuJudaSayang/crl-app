import {registrationPolicyError,REGISTRATION_POLICY_VERSION} from '../lib/registrationPolicy.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getRegistrationPasswordChecks, getRegistrationPasswordError } from "../lib/registrationPassword.mjs";

import { getRegistrationName } from "../lib/registrationName.mjs";

const accepted = "Teacher2026!Pass";
const rejected = ["Teacher12!", "teacher2026!pass", "TeacherOnly!Pass", "Teacher2026Pass", "Teacher2026 Pass", "Teacher2026éPass"];
for (const password of rejected) assert.ok(getRegistrationPasswordError(password, password), "Each required password property must be enforced");
assert.equal(getRegistrationPasswordError(accepted, accepted), "");
assert.match(getRegistrationPasswordError("A1!" + "x".repeat(80), "A1!" + "x".repeat(80)), /72 bytes/);
assert.match(getRegistrationPasswordError(accepted, ""), /confirm/);
assert.match(getRegistrationPasswordError(accepted, accepted + " "), /do not match/);
assert.match(getRegistrationPasswordError(accepted, undefined), /confirm/);
assert.equal(getRegistrationPasswordChecks("A1!😀😀😀😀😀")[0].met, false, "Surrogate pairs must not inflate character counts");
assert.equal(getRegistrationPasswordError("École2026!Long", "École2026!Long"), "");

const body={policy_accepted:true,policy_version:REGISTRATION_POLICY_VERSION,first_name:'Ana',last_name:'Cruz',middle_name:'Maria Clara',suffix:'III',invite_code:'TESTONLY',school_id:'123456',username:'teacher_test',email:'teacher@example.test',password:accepted,confirm_password:accepted};
let logged;let queries=0,written,consumed=false,issuer={id:1,role:'reading_coordinator',schoolId:'123456',isActive:true},invite={id:1,code:'TESTONLY',inviteRole:'teacher',schoolId:'123456',generatedBy:1,isUsed:false},claimCount=1;
const tx={adminAuditEvent:{create:async({data})=>{logged=data;}},$queryRaw:async()=>{queries++;},inviteCode:{findUnique:async()=>invite,updateMany:async()=>{consumed=true;return {count:claimCount};}},user:{findUnique:async()=>issuer,create:async({data})=>{written=data;return {id:7,...data};}},school:{findFirst:async()=>({id:'123456',name:'Registered School'})}};
const context=vm.createContext({sealPrivateData:JSON.stringify,registrationPolicyError,REGISTRATION_POLICY_VERSION,getRegistrationPasswordError,getRegistrationName,Date,Error,Object,String,prisma:{$transaction:async work=>work(tx)},bcrypt:{hash:async()=>'test-hash'}});
vm.runInContext(fs.readFileSync('lib/registerAccount.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),context);
for(const policy of [{policy_accepted:false},{policy_accepted:undefined},{policy_accepted:'true'},{policy_version:'old'}]){await assert.rejects(()=>context.registerAccount({...body,...policy},'teacher'),e=>e.status===400);assert.equal(queries,0);}
for(const password of rejected){await assert.rejects(()=>context.registerAccount({...body,password,confirm_password:password},'teacher'),e=>e.status===400);assert.equal(queries,0);}
for(const confirm_password of [undefined,'',accepted+' ']){await assert.rejects(()=>context.registerAccount({...body,confirm_password},'teacher'),e=>e.status===400);assert.equal(queries,0);}
for(const names of [{first_name:'Ana',last_name:''},{first_name:'',last_name:'Cruz'}]){await assert.rejects(()=>context.registerAccount({...body,...names},'teacher'),e=>e.status===400);assert.equal(queries,0);}
await context.registerAccount({...body,school_name:'Forged school name'},'teacher');assert.equal(written.schoolName,'Registered School');assert.equal(written.coordinatorId,1);assert.equal(written.fullName,'Ana M. C. Cruz III');assert.equal(written.middleName,'Maria Clara');assert.equal(written.email,body.email);assert.equal(written.twoFactorEnabled,false);assert.ok(consumed);assert.equal(written.policyVersion,REGISTRATION_POLICY_VERSION);assert.ok(written.policyAcceptedAt instanceof Date);
for(const bad of [{...invite,schoolId:'234567'},{...invite,inviteRole:'admin'},{...invite,isUsed:true},{...invite,revokedAt:new Date()},{...invite,expiresAt:new Date(0)}]){const saved=invite;invite=bad;await assert.rejects(()=>context.registerAccount(body,'teacher'),e=>e.status===400);invite=saved;}
issuer={...issuer,schoolId:'234567'};await assert.rejects(()=>context.registerAccount(body,'teacher'),e=>e.status===400);issuer={...issuer,schoolId:'123456',isActive:false};await assert.rejects(()=>context.registerAccount(body,'teacher'),e=>e.status===400);
issuer={id:2,role:'admin',isActive:true};invite={...invite,generatedBy:2,inviteRole:'reading_coordinator'};await context.registerAccount(body,'reading_coordinator');assert.equal(written.role,'reading_coordinator');assert.equal(written.coordinatorId,null);
invite={...invite,inviteRole:'admin',schoolId:null};await context.registerAccount(body,'admin');assert.equal(written.role,'admin');assert.equal(written.schoolId,null);assert.equal(logged.event,'account.registered');assert.equal(logged.actorName,written.fullName);assert.equal(JSON.parse(logged.encryptedDetail).code,body.invite_code);assert.equal(JSON.parse(logged.encryptedDetail).usedByName,written.fullName);
claimCount=0;await assert.rejects(()=>context.registerAccount(body,'admin'),e=>e.status===409);
for(const file of ['app/api/auth/register/route.js','app/api/auth/route.js'])assert.ok(fs.readFileSync(file,'utf8').includes("registerAccount(body,'teacher')")||fs.readFileSync(file,'utf8').includes("registerAccount(await request.json(),'teacher')"));
console.log('PASS password/name validation before database access; canonical school/email, bound-role invitations, issuer school/active checks, one-use claim conflicts and structured name storage');

const structured = getRegistrationName({ first_name: "Theo Lorenzo", last_name: "Gorospe", middle_name: "Maria Clara", suffix: "Jr." });
assert.equal(structured.fullName, "Theo Lorenzo M. C. Gorospe Jr.");
assert.equal(structured.fields.middleName, "Maria Clara");
assert.equal(getRegistrationName({ first_name: "Ana", last_name: "Cruz" }).fullName, "Ana Cruz");
assert.match(getRegistrationName({ first_name: "Ana", last_name: "" }).error, /last name/);
assert.match(getRegistrationName({ first_name: "", last_name: "Cruz" }).error, /first name/);
assert.equal(getRegistrationName({ full_name: "Existing Teacher" }).fullName, "Existing Teacher");
assert.ok(getRegistrationName({ first_name: "A".repeat(51), last_name: "Cruz" }).error);
console.log("PASS structured teacher names preserve full middle names, display initials and suffix, validate required names and keep legacy account compatibility");
