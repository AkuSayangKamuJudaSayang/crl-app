const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  let users = [
    {id:1,role:"reading_coordinator",schoolId:"123456",isActive:true,approvalStatus:"approved"},
    {id:2,role:"admin",schoolId:"123456",isActive:true,approvalStatus:"approved"},
    {id:3,role:"reading_coordinator",schoolId:"654321",isActive:true,approvalStatus:"approved"},
    {id:10,role:"teacher",schoolId:"123456",fullName:"Pending Teacher",username:"teacher",email:"teacher@example.test",isActive:false,approvalStatus:"pending",createdAt:new Date()},
    {id:11,role:"reading_coordinator",schoolId:"123456",fullName:"Pending Coordinator",username:"coordinator",email:"coord@example.test",isActive:false,approvalStatus:"pending",createdAt:new Date()},
    {id:12,role:"teacher",schoolId:"654321",fullName:"Other School",isActive:false,approvalStatus:"pending",createdAt:new Date()},
    {id:13,role:"teacher",schoolId:"123456",fullName:"Previously Disabled",isActive:false,approvalStatus:"approved",createdAt:new Date()},
    {id:14,role:"teacher",schoolId:"123456",fullName:"Previously Rejected",isActive:false,approvalStatus:"rejected",createdAt:new Date()},
  ];
  const audit = [];
  const matches = (row, where) => Object.entries(where).every(([key,value]) => {
    const actual=row[key];
    if(value&&typeof value==="object"&&"in" in value) return value.in.includes(actual);
    return actual===value;
  });
  const prisma = {
    user:{
      findMany:async({where,select})=>users.filter(u=>matches(u,where)).map(u=>Object.fromEntries(Object.keys(select).map(k=>[k,u[k]]))),
      findFirst:async({where,select})=>{
        const row=users.find(u=>matches(u,where));
        return row ? (select ? Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])) : row) : null;
      },
      updateMany:async({where,data})=>{
        const found=users.filter(u=>matches(u,where));
        for(const item of found){
          for(const [key,value] of Object.entries(data)) {
            item[key]=value&&typeof value==="object"&&"increment" in value
              ? (item[key]||0)+value.increment : value;
          }
        }
        return {count:found.length};
      },
    },
  };
  prisma.$transaction=async fn=>fn(prisma);
  const context=vm.createContext({
    prisma,Date,Number,String,Error,Object,
    writeAudit:async(tx,evt)=>audit.push(evt),
  });
  vm.runInContext(fs.readFileSync("lib/staffSignupApproval.js","utf8").replace(/^import .*;\s*/gm,"").replace(/^export /gm,""),context);
  const coordinator=users[0],admin=users[1],foreign=users[2];

  let list=await context.listStaffSignupRequests(prisma,coordinator);
  assert.deepEqual(list.map(x=>x.id),[10],"A coordinator sees only pending teachers from their own school");
  list=await context.listStaffSignupRequests(prisma,admin);
  assert.deepEqual(list.map(x=>x.id),[10,11],"An administrator sees pending teachers and coordinators in their school");
  await assert.rejects(()=>context.reviewStaffSignup(prisma,coordinator,{id:11,decision:"approve"}),e=>e.status===409);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,foreign,{id:10,decision:"approve"}),e=>e.status===409);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,coordinator,{id:12,decision:"approve"}),e=>e.status===409);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,admin,{id:13,decision:"approve"}),e=>e.status===409);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,admin,{id:14,decision:"approve"}),e=>e.status===409);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,admin,{id:10,decision:"invalid"}),e=>e.status===400);

  await context.reviewStaffSignup(prisma,coordinator,{id:10,decision:"approve"});
  assert.equal(users.find(u=>u.id===10).approvalStatus,"approved");
  assert.equal(users.find(u=>u.id===10).isActive,true);
  assert.equal(users.find(u=>u.id===10).coordinatorId,1);
  assert.equal(audit.at(-1).event,"account.approved");
  await assert.rejects(()=>context.reviewStaffSignup(prisma,coordinator,{id:10,decision:"approve"}),e=>e.status===409,
    "Concurrent/duplicate approvals may not activate the same request twice");
  await context.reviewStaffSignup(prisma,admin,{id:11,decision:"reject"});
  assert.equal(users.find(u=>u.id===11).approvalStatus,"rejected");
  assert.equal(users.find(u=>u.id===11).isActive,false);
  assert.equal(audit.at(-1).event,"account.rejected");
  assert.equal(audit.length,2,"Each successful decision has one audit event");
  assert.equal((await context.listStaffSignupRequests(prisma,admin)).length,0);
  coordinator.isActive=false;
  await assert.rejects(()=>context.listStaffSignupRequests(prisma,coordinator),e=>e.status===403);
  await assert.rejects(()=>context.reviewStaffSignup(prisma,coordinator,{id:12,decision:"approve"}),e=>e.status===403);

  const teacher=fs.readFileSync("app/api/auth/route.js","utf8");
  const teacherRegister=fs.readFileSync("app/api/auth/register/route.js","utf8");
  const portal=fs.readFileSync("app/api/access/route.js","utf8");
  const coordinatorRoute=fs.readFileSync("app/api/coordinator/route.js","utf8");
  const prismaSchema=fs.readFileSync("prisma/schema.prisma","utf8");
  const adminUI=fs.readFileSync("components/SystemAdminDashboard.jsx","utf8");
  const coordUI=fs.readFileSync("app/admin/AdminDashboard.jsx","utf8");
  const loginUI=fs.readFileSync("app/login/page.jsx","utf8");
  const portalUI=fs.readFileSync("components/PortalAccess.jsx","utf8");
  assert(prismaSchema.includes('approvalStatus String @default("approved")'));
  assert(teacher.includes("ACCOUNT_PENDING_APPROVAL"));
  assert(teacherRegister.includes("pending_approval")&&!teacherRegister.includes("setAuthCookie"));
  assert(teacher.includes("return jsonResponse({status:'pending_approval'"));
  assert(portal.includes("listStaffSignupRequests(prisma,user)")&&portal.includes("reviewStaffSignup(prisma,user,body)"));
  assert(coordinatorRoute.includes("listStaffSignupRequests(prisma, user)")&&coordinatorRoute.includes("reviewStaffSignup(prisma, user, body)"));
  assert(!loginUI.includes("invite-code")&&!loginUI.includes("inviteCode"));
  assert(!portalUI.includes("field('invite_code'"));
  assert(adminUI.includes("'Account approvals'"));
  assert(coordUI.includes('"Account approvals"'));
  assert(adminUI.includes("StaffApprovalRequests")&&coordUI.includes("StaffApprovalRequests"));
  console.log("PASS approval authorization: coordinator teacher-only, admin both roles, school isolation, duplicate-review conflict, disabled/rejected protection, audit, no invitation input and no signup auto-login");
})().catch(err=>{console.error(err);process.exitCode=1});
