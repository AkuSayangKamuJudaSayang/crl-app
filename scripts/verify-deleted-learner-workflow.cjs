const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const shared=await import('../lib/classWorkspace.mjs');const {historyCodec}=require('./apply-authorized-roster-purges.cjs'),codec=historyCodec('synthetic-test-only-key');
 const source=fs.readFileSync('lib/classWorkspaces.js','utf8');const helpers=source.slice(source.indexOf('export async function readDeletedLearnerArchives'),source.indexOf('async function restoreLearnerArchives')).replaceAll('export ','');
 const id='11111111-1111-4111-8111-111111111111',group='22222222-2222-4222-8222-222222222222';
 const snap={archiveKind:'learner',kind:'class_archive',version:1,teacherId:901,archiveId:id,rosterVersion:0,schoolYear:'2026-2027',learners:[{id:1,lrn:'000000000001',firstName:'Synthetic',lastName:'Learner',sex:'Female',assessmentSessions:[{id:2,assessmentPeriod:'BoSY',isCompleted:true,sessionMetrics:{task1Score:10}}]}]};
 let destinationYear='2026-2027',existing=false,restored=[],audits=0;
 const db={learner:{findMany:async()=>existing?[snap.learners[0]]:[]}};
 const ctx={...shared,openPrivateData:codec.open,archiveAvailable:()=>true,assertRosterVersion:async(_,teacherId,version)=>{assert.equal(teacherId,901);if(version!==0)throw Error('Roster reset');},lockClass:async()=>({id:'destination',name:'Mars',schoolYear:{label:destinationYear}}),restoreSectionLearners:async(_,teacherId,section,snapshot)=>{restored.push(snapshot.learners[0]);},writeAudit:async()=>audits++};vm.createContext(ctx);vm.runInContext(helpers,ctx);
 const backup={format:'crl-learner-backup',version:1,sealed:codec.seal({kind:'learner_backup',teacherId:901,archives:[snap]})};
 let result=await ctx.importDeletedLearnerBackup(db,901,backup,'destination',0);assert.equal(result.imported_count,1);assert.equal(restored[0].assessmentSessions[0].sessionMetrics.task1Score,10);
 destinationYear='2027-2028';restored=[];result=await ctx.importDeletedLearnerBackup(db,901,backup,'destination',0);assert.equal(restored[0].lrn,snap.learners[0].lrn);assert.equal(restored[0].sex,'Female');assert.equal(restored[0].assessmentSessions.length,0);
 existing=true;restored=[];result=await ctx.importDeletedLearnerBackup(db,901,backup,'destination',0);assert.equal(result.skipped_count,1);assert.equal(restored.length,0);existing=false;
 await assert.rejects(()=>ctx.importDeletedLearnerBackup(db,902,backup,'destination',0),/account|backup/);await assert.rejects(()=>ctx.importDeletedLearnerBackup(db,901,{...backup,sealed:backup.sealed+'tampered'},'destination',0),/account|backup/);
 await assert.rejects(()=>ctx.importDeletedLearnerBackup(db,901,backup,'destination',1),/Roster reset/);
 const old={format:'crl-class-archive',version:1,sealed:codec.seal(snap)};result=await ctx.importDeletedLearnerBackup(db,901,old,'destination',0);assert.equal(result.imported_count,1,'Legacy downloaded learner backups remain importable');
 // Execute the real public class-action dispatcher with the production-style
 // coordinator policy, rather than testing only the lower-level import helper.
 ctx.COORDINATOR_ACTIONS=new Set(['import_class_archive','download_class_archive','purge_class_archives']);ctx.coordinatorOnly=()=>{throw Object.assign(Error('Coordinator required'),{status:403});};ctx.prisma={$transaction:work=>work(db)};ctx.classCatalog=async()=>({});ctx.sealPrivateData=codec.seal;
 const dispatch=source.slice(source.indexOf('export async function handleClassAction('),source.indexOf('export async function deleteSharedSchoolYear(')).replaceAll('export ','');vm.runInContext(dispatch,ctx);
 result=await ctx.handleClassAction('import_class_archive',901,{backup,expected_kind:'learner',class_section_id:'destination',roster_version:0});assert.equal(result.imported_count,1,'A signed-in teacher must pass the real archive dispatcher for learner backup import');
 await assert.rejects(()=>ctx.handleClassAction('import_class_archive',901,{backup,expected_kind:'section',class_section_id:'destination',roster_version:0}),e=>e.status===403);
 await assert.rejects(()=>ctx.handleClassAction('download_class_archive',901,{},new URLSearchParams({archive_id:id})),e=>e.status===403);
 ctx.prisma.classArchive={findMany:async({where})=>{assert.equal(where.teacherId,901);return [{id,teacherId:901,kind:'learner',encryptedSnapshot:codec.seal(snap)}];}};
 const downloaded=await ctx.handleClassAction('download_class_archive',901,{},new URLSearchParams({archive_ids:id}));assert.equal(downloaded.backup.format,'crl-learner-backup');assert.equal(codec.open(downloaded.backup.sealed).archives.length,1);
 const viewed=await ctx.handleClassAction('view_learner_archives',901,{},new URLSearchParams({archive_ids:id}));assert.equal(viewed.learners.length,1);
 ctx.classCatalog=async()=>({archives:[{id,kind:'learner'},{id:group,kind:'section'}]});assert.equal((await ctx.handleClassAction('get_classes',901)).archives.length,1);
 ctx.requireDeletionPassword=async()=>{};db.classArchive={findFirst:async()=>({id,teacherId:901,kind:'section'})};await assert.rejects(()=>ctx.handleClassAction('purge_class_archives',901,{archive_ids:[id],confirmation_password:'synthetic',roster_version:0}),e=>e.status===403);
 const protocol=await import('../lib/deletionStatement.mjs');const body={deletion_nonce:group,deletion_group_id:id,deletion_reason:'',roster_version:0};const statement=protocol.deletionStatement('delete_learners',body,[snap.learners[0]]);assert.equal(statement.groupId,id);assert.equal(protocol.matchingDeletionStatement(statement,'delete_learners',{...body,deletion_group_id:group},snap.learners),false);

 const swc=require('next/dist/build/swc');
 async function load(file,stubs){
  const code=(await swc.transform(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>stubs[name]||{},Date,URL,URLSearchParams,console});
  return module.exports;
 }
 const coordinator=await load('lib/coordinatorAdmin.js',{'./classWorkspace.mjs':shared});
 const actor={id:900,role:'reading_coordinator',schoolId:'123456'};
 await assert.rejects(()=>coordinator.coordinatorPost('coordinator_class_action',{teacher_id:901,class_action:'purge_class_archives'},actor),e=>e.status===403);
 for(const action of ['coordinator_recovery','coordinator_learner_view','coordinator_archive'])await assert.rejects(()=>coordinator.coordinatorGet(action,new URLSearchParams(),actor),e=>e.status===403);
 let calls=0;
 const admin={id:800,role:'admin',schoolId:'123456'};
 const route=await load('app/api/access/route.js',{
  '../../../lib/classWorkspace.mjs':shared,
  '../../../lib/prisma':{prisma:{user:{findFirst:async({where})=>{assert.equal(where.schoolId,admin.schoolId);return where.id===901?{id:901,learnerDataVersion:3}:null;}},classArchive:{count:async({where})=>where.kind==='learner'&&where.id.in[0]===id?1:0}},withSchoolScope:async(_,work)=>work()},
  '../../../lib/portalAuth':{getPortalUser:async(_,role)=>role==='admin'?admin:actor},
  '../../../lib/classWorkspaces':{handleClassAction:async(action,owner,payload,_,reviewer)=>{calls++;assert.equal(action,'purge_class_archives');assert.equal(owner,901);assert.equal(payload.roster_version,3);assert.equal(reviewer.id,800);return {status:'ok'};}},
  'next/server':{NextResponse:{json:(body,options)=>({status:options.status,body})}},
 });
 const purge=(role,teacher_id,archiveId)=>route.POST({method:'POST',url:'https://example.test/api/access?role='+role,clone(){return this;},json:async()=>({action:'purge_learner_archives',teacher_id,archive_ids:[archiveId]})});
 assert.equal((await purge('reading_coordinator',901,id)).status,403);
 assert.equal((await purge('admin',902,id)).status,404);
 assert.equal((await purge('admin',901,group)).status,403);
 assert.equal((await purge('admin',901,id)).status,200);
 assert.equal(calls,1);
 const ArchiveList=(await require('./load-ui-component.cjs')('components/ArchiveList.jsx')).default;
 const now=new Date(),expires=new Date(+now+86400000);const rows=Array.from({length:33},(_,i)=>({id:String(i),kind:'learner',deletionGroupId:group,teacherId:901,learnerName:`Synthetic ${i}`,schoolYearLabel:'2026-2027',sectionName:'Mars',createdAt:now,deletedAt:now,expiresAt:expires}));
 const html=renderToStaticMarkup(React.createElement(ArchiveList,{archives:[...rows,{id:'class',kind:'section',createdAt:now}],catalog:{serverNow:now},onView(){},onDownload(){},onPurge(){}}));assert.match(html,/33 deleted learners/);assert.equal((html.match(/>View</g)||[]).length,1);assert.doesNotMatch(html,/Restore|School years|Sections/);
 assert.match(fs.readFileSync('components/SystemAdminDashboard.jsx','utf8'),/tab === 'Archive'/);assert.doesNotMatch(fs.readFileSync('components/CoordinatorArchives.jsx','utf8'),/archiveTabs|ClassArchiveRestore|LearnerArchiveRestore/);assert.match(fs.readFileSync('app/teacher/ClassRecordImport.jsx','utf8'),/expected_kind:'learner'/);
 console.log('PASS same-year evidence/cross-year identity-only learner backup imports, legacy backups, duplicate safety, tamper/account/roster rejection; signed bulk groups, 33-member View-only list, admin Recovery and administrator-only school archive management');
})().catch(e=>{console.error(e);process.exit(1)});
