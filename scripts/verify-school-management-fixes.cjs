const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const {transform}=require('next/dist/build/swc');
(async()=>{
 async function load(file,dependencies,context={}){
  const module={exports:{}};
  const {code}=await transform(fs.readFileSync(file,'utf8'),{
   filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true}},module:{type:'commonjs'}
  });
  vm.runInNewContext(code,{
   module,exports:module.exports,process,Date,Number,Error,URL,console,
   require:name=>Object.prototype.hasOwnProperty.call(dependencies,name)
    ?dependencies[name]:name.startsWith('.')?{}:require(name),
   ...context
  },{filename:file});
  return module.exports;
 }
 const sectionId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const classId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 const administrator={id:22,role:'admin',schoolId:'123456'};
 const state={inclusion:{removedAt:null},class:{id:classId,teacherId:28,unassignedAt:null},activeHost:false};
 const audits=[];
 let inclusionUpdates=0,guardCalls=0;
 const db={
  $transaction:async fn=>fn(db),
  $queryRaw:async(fragments,...values)=>{
   const sql=fragments.join(' ');
   if(sql.includes('pg_advisory_xact_lock'))return [{locked:'ok'}];
   if(sql.includes('FROM public.school_sections'))return [{id:sectionId}];
   if(sql.includes('WITH locked AS')){
    guardCalls++;
    if(state.activeHost)return [{updated:0,active:true}];
    if(state.class.unassignedAt)return [{updated:0,active:false}];
    state.class.unassignedAt=new Date();
    return [{updated:1,active:false}];
   }
   throw Error('Unexpected query in school-management regression.');
  },
  $executeRaw:async(_fragments,...values)=>{audits.push({event:values[3],teacherId:values[2]});return 1;},
  globalSchoolYear:{findUnique:async()=>({startYear:2026,deletedAt:null})},
  schoolSection:{findFirst:async()=>({
   id:sectionId,schoolId:'123456',name:'Jupiter',
   classes:[{id:classId,teacherId:state.class.teacherId,unassignedAt:state.class.unassignedAt,
    schoolYear:{startYear:2026,deletedAt:null},_count:{learners:2}}]
  })},
  schoolYearSectionInsertion:{
   findUnique:async()=>state.inclusion,
   upsert:async args=>{inclusionUpdates++;state.inclusion.removedAt=args.update.removedAt;return state.inclusion;}
  }
 };
 const domain=await load('lib/schoolAssignments.js',{
  './assessmentSchedule.mjs':await import('../lib/assessmentSchedule.mjs'),
  './prisma':{prisma:db},
  './schoolContext':{schoolScope:()=>administrator.schoolId},
  './classWorkspace.mjs':await import('../lib/classWorkspace.mjs'),
  './adminHistory':{sealPrivateData:()=> 'synthetic-sealed',writeAudit:async()=>{}}
 });
 const unassigned=await domain.assignSchoolSection({
  start_year:2026,section_id:sectionId,teacher_id:null,unassign_teacher:true
 },administrator);
 assert.equal(unassigned.unassigned,true);
 assert.equal(unassigned.removed,false,'Unassign must preserve the school-year insertion');
 assert.ok(state.class.unassignedAt,'Unassign must set the class visibility flag');
 assert.equal(state.inclusion.removedAt,null,'Unassign may not remove the section');
 assert.equal(inclusionUpdates,0,'Unassign must not update insertion');
 assert.equal(audits[0].event,'section.teacher_unassigned');
 assert.equal(audits[0].teacherId,28);
 const repeat=await domain.assignSchoolSection({
  start_year:2026,section_id:sectionId,teacher_id:null,unassign_teacher:true
 },administrator);
 assert.equal(repeat.alreadyUnassigned,true,'Repeated unassign is safe');
 assert.equal(audits.length,1,'Repeated unassign must not add an audit');
 assert.equal(guardCalls,1,'Repeated unassign should not rewrite the class');
 const removed=await domain.removeSchoolSectionFromYear({start_year:2026,section_id:sectionId},administrator);
 assert.equal(removed.removed,true);
 assert.ok(state.inclusion.removedAt,'Remove hides only this school-year inclusion');
 assert.equal(inclusionUpdates,1);
 assert.equal(audits[1].event,'section.removed_from_year');
 await assert.rejects(()=>domain.assignSchoolSection({
  start_year:2026,section_id:sectionId,teacher_id:null,unassign_teacher:true
 },administrator),error=>error.status===409);
 state.inclusion.removedAt=null;
 state.class.unassignedAt=null;
 state.activeHost=true;
 const previousAuditCount=audits.length;
 await assert.rejects(()=>domain.assignSchoolSection({
  start_year:2026,section_id:sectionId,teacher_id:null,unassign_teacher:true
 },administrator),error=>error.status===409&&/active assessment/.test(error.message));
 assert.equal(state.class.unassignedAt,null,'Active hosts must block unassignment');
 assert.equal(state.inclusion.removedAt,null,'Blocked operations must preserve insertion');
 assert.equal(audits.length,previousAuditCount,'Rejected mutations must not add an audit');
 await assert.rejects(()=>domain.assignSchoolSection({
  start_year:2026,section_id:sectionId,teacher_id:null,unassign_teacher:true
 },{...administrator,role:'teacher'}),error=>error.status===403);
 const routeCalls=[];
 const thrown=message=>Object.assign(Error(message),{status:409});
 const route=await load('app/api/access/route.js',{
  '../../../lib/prisma':{prisma:{},withSchoolScope:async(_id,fn)=>fn()},
  '../../../lib/schoolAssignments':{
   removeSchoolSectionFromYear:async()=>{routeCalls.push('remove');throw thrown('Section assignment changed. Refresh first.');},
   assignSchoolSection:async()=>{routeCalls.push('unassign');throw thrown('End the active assessment first.');}
  },
  '../../../lib/classWorkspaces':{
   deleteSharedSchoolYear:async()=>{routeCalls.push('delete');throw thrown('Sections changed. Refresh and confirm again.');}
  },
  '../../../lib/portalAuth':{getPortalUser:async()=>administrator},
  'next/server':{NextResponse:{json:(body,options)=>({status:options.status,body})}}
 });
 for(const [action,message] of [
  ['remove_section','Section assignment changed.'],
  ['delete_school_year','Sections changed.'],
  ['assign_section','End the active assessment first.']
 ]){
  const request={method:'POST',url:'https://app.example/api/access?role=admin',
   json:async()=>({action}),clone(){return this;}};
  const response=await route.POST(request);
  assert.equal(response.status,409,action+' must retain meaningful validation status');
  assert.ok(response.body.error.includes(message),action+' must not become a generic error');
 }
 assert.deepEqual(routeCalls,['remove','delete','unassign']);
 const ui=fs.readFileSync('components/SchoolYearAssignments.jsx','utf8');
 const css=fs.readFileSync('components/Coordinator.module.css','utf8');
 assert.ok(ui.includes('<circle cx="9" cy="5" r="1.65"'));
 assert.ok(ui.includes('<circle cx="9" cy="19" r="1.65"'));
 assert.ok(ui.includes('confirmation.mode === \'unassign\''));
 assert.ok(ui.includes('className={styles.unassignTeacher}'));
 assert.ok(css.includes('.panel .sectionMenuButton{display:grid;place-items:center;box-sizing:border-box;width:32px;min-width:32px;height:36px;min-height:36px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none'));
 assert.ok(css.includes('.panel .sectionMenuButton[aria-expanded=true]{color:var(--crl-text,#24364b);background:transparent;border:0;border-radius:0;box-shadow:none}'));
 assert.ok(css.includes('.panel .sectionMenuButton:hover{background:transparent;border:0;box-shadow:none;filter:none;'));
 const sharedButtonIndex=css.indexOf('.toolbar button,.panel button,.sidebar button');
 const scopedMenuIndex=css.indexOf('.panel .sectionMenuButton{');
 assert.ok(sharedButtonIndex>=0&&scopedMenuIndex>sharedButtonIndex,'Specific menu override must follow the general panel button rule');
 assert.ok(!css.includes('}.sectionMenuButton{display:grid;'),'Unscoped selector loses to .panel button');
 assert.ok(css.includes('.panel .sectionMenuButton:focus-visible{outline:'),'Keyboard focus remains visible');
 assert.ok(css.includes('.teacherAssignment .unassignTeacher'));
 const routeText=fs.readFileSync('app/api/access/route.js','utf8');
 assert.ok(routeText.includes("let action='';"));
 assert.ok(routeText.includes("console.error('[school-access-write]',{action,name:"));
 console.log('PASS school-management fixes: distinguish Remove from Unassign, atomic host guard, retained insertion/history, idempotence, role denial, truthful API errors and plain vertical three-dot control.');
})().catch(error=>{console.error(error);process.exitCode=1;});
