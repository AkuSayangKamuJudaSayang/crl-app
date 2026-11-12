import { registrationPolicyError, REGISTRATION_POLICY_VERSION } from '../lib/registrationPolicy.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getRegistrationPasswordChecks, getRegistrationPasswordError } from "../lib/registrationPassword.mjs";
import { getRegistrationName } from "../lib/registrationName.mjs";

const accepted = "Teacher2026!Pass";
const rejected = ["Teacher12!", "teacher2026!pass", "TeacherOnly!Pass", "Teacher2026Pass", "Teacher2026 Pass", "Teacher2026éPass"];
for (const password of rejected) assert.ok(getRegistrationPasswordError(password,password));
assert.equal(getRegistrationPasswordError(accepted,accepted),"");
assert.match(getRegistrationPasswordError("A1!"+"x".repeat(80),"A1!"+"x".repeat(80)),/72 bytes/);
assert.match(getRegistrationPasswordError(accepted,""),/confirm/);
assert.match(getRegistrationPasswordError(accepted,accepted+" "),/do not match/);
assert.match(getRegistrationPasswordError(accepted,undefined),/confirm/);
assert.equal(getRegistrationPasswordChecks("A1!😀😀😀😀😀")[0].met,false);
assert.equal(getRegistrationPasswordError("École2026!Long","École2026!Long"),"");

const body={policy_accepted:true,policy_version:REGISTRATION_POLICY_VERSION,first_name:'Ana',last_name:'Cruz',middle_name:'Maria Clara',suffix:'III',school_id:'123456',username:'teacher_test',email:'teacher@example.test',password:accepted,confirm_password:accepted};
let writes=[],audit=[],lookups=0,schoolActive=true;
const tx={
  school:{findFirst:async({where})=>{lookups++;return schoolActive&&where.id==='123456'?{id:'123456',name:'Registered School'}:null;}},
  user:{create:async({data})=>{writes.push(data);return {id:writes.length,...data};}},
  adminAuditEvent:{create:async({data})=>{audit.push(data);}},
};
const context=vm.createContext({sealPrivateData:JSON.stringify,registrationPolicyError,REGISTRATION_POLICY_VERSION,getRegistrationPasswordError,getRegistrationName,Date,Error,Object,String,
 prisma:{$transaction:async fn=>fn(tx)},bcrypt:{hash:async()=> 'hashed-password'}});
vm.runInContext(fs.readFileSync('lib/registerAccount.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),context);
for (const policy of [{policy_accepted:false},{policy_accepted:undefined},{policy_accepted:'true'},{policy_version:'old'}]) {
  await assert.rejects(()=>context.registerAccount({...body,...policy},'teacher'),e=>e.status===400);
  assert.equal(lookups,0);
}
for(const password of rejected){await assert.rejects(()=>context.registerAccount({...body,password,confirm_password:password},'teacher'),e=>e.status===400);assert.equal(lookups,0);}
for(const confirm_password of [undefined,'',accepted+' ']){await assert.rejects(()=>context.registerAccount({...body,confirm_password},'teacher'),e=>e.status===400);assert.equal(lookups,0);}
for(const names of [{first_name:'Ana',last_name:''},{first_name:'',last_name:'Cruz'}]){await assert.rejects(()=>context.registerAccount({...body,...names},'teacher'),e=>e.status===400);assert.equal(lookups,0);}
await context.registerAccount({...body,school_name:'Forged school name',invite_code:'INVALID'},'teacher');
assert.equal(writes[0].schoolName,'Registered School');
assert.equal(writes[0].coordinatorId,null);
assert.equal(writes[0].fullName,'Ana M. C. Cruz III');
assert.equal(writes[0].middleName,'Maria Clara');
assert.equal(writes[0].email,body.email);
assert.equal(writes[0].isActive,false,'Signup may not activate an account');
assert.equal(writes[0].approvalStatus,'pending','Signup must require human school approval');
assert.equal(writes[0].twoFactorEnabled,false);
assert.equal(writes[0].policyVersion,REGISTRATION_POLICY_VERSION);
assert.ok(writes[0].policyAcceptedAt instanceof Date);
assert.equal(audit[0].event,'account.approval_requested');
await context.registerAccount({...body,invite_code:''},'reading_coordinator');
assert.equal(writes[1].role,'reading_coordinator');
assert.equal(writes[1].isActive,false);
schoolActive=false;
await assert.rejects(()=>context.registerAccount(body,'teacher'),e=>e.status===400);
await assert.rejects(()=>context.registerAccount(body,'admin'),e=>e.status===403);
assert.equal(writes.length,2);
for (const file of ['app/api/auth/register/route.js','app/api/auth/route.js']) {
  const source=fs.readFileSync(file,'utf8');
  assert(source.includes("registerAccount(body,'teacher')")||source.includes("registerAccount(await request.json(),'teacher')"));
  assert(source.includes("pending_approval"),'Registration response must not issue an active session');
}
console.log('PASS staff signups validate policy/password/name/school; invitation codes are ignored, teacher/coordinator accounts start inactive+pending, no session cookie is minted, and prior users remain unaffected');
const structured = getRegistrationName({first_name:"Theo Lorenzo",last_name:"Gorospe",middle_name:"Maria Clara",suffix:"Jr."});
assert.equal(structured.fullName,"Theo Lorenzo M. C. Gorospe Jr.");
assert.equal(structured.fields.middleName,"Maria Clara");
assert.equal(getRegistrationName({first_name:"Ana",last_name:"Cruz"}).fullName,"Ana Cruz");
assert.match(getRegistrationName({first_name:"Ana",last_name:""}).error,/last name/);
console.log('PASS structured names and existing account compatibility');
