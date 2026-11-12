const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  let created=0,reviewed=0;
  const user={id:901,role:'reading_coordinator',schoolId:'123456',isActive:true,approvalStatus:'approved'};
  const prisma={$transaction:async()=>{throw Error('A retired invite must never write to the database');}};
  const context=vm.createContext({
    Date,Number,URL,Map,prisma,crypto:require('node:crypto'),
    NextResponse:{json:(body,init)=>({body,status:init.status})},
    getCoordinatorUser:async()=>user,withSchoolScope:async(_,f)=>f(),
    writeAudit:async()=>{},adminProfileSelect:{id:true},logSecureError:()=>{},
    listStaffSignupRequests:async()=>[],reviewStaffSignup:async(_db,actor,body)=>{reviewed++;assert.equal(actor.id,901);return {status:'ok',decision:body.decision};}
  });
  vm.runInContext(fs.readFileSync('app/api/coordinator/route.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),context);
  const post=body=>context.POST({json:async()=>body});
  for(const action of ['generate_code','reset_code','revoke_code']){
    const response=await post({action,count:3,id:1});
    assert.equal(response.status,410,'Invitation endpoints must no longer issue registration codes');
    assert.match(response.body.error,/retired/i);
  }
  const approved=await post({action:'review_signup',id:5,decision:'approve'});
  assert.equal(approved.status,200);
  assert.equal(reviewed,1);
  assert.equal(created,0);
  console.log('PASS teacher registration invitation endpoints are retired and coordinator approvals use a reviewer-authenticated action instead');
})().catch(error=>{console.error(error);process.exitCode=1});
