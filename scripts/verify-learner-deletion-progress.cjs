const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const {validateLearnerDeletion}=await import('../lib/classWorkspace.mjs');
 assert.equal(validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:''}),'');
 assert.equal(validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:'x'}),'x');
 assert.throws(()=>validateLearnerDeletion([],{deletion_reason:''}),/password/);
 assert.throws(()=>validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:'x'.repeat(301)}),/300/);
 const source=fs.readFileSync('app/teacher/page.jsx','utf8');
 const code=source.slice(source.indexOf('  const bulkDeleteLearners ='),source.indexOf('  const requestActivityNavigation'));
 let release, calls=[],progress=[],closed=false,rows=[1,2,3].map(id=>({id})),selected=[1,2,3],timers=[];
 const ctx={selectedLearnerIds:[1,2,3],savingScoresheet:false,deletingRef:{current:false},assessments:[],
 setBulkDeleteConfirm:v=>{closed=!v;},setDeletingProgress:v=>{progress.push(v);},setLearners:f=>rows=f(rows),setAssessments:()=>{},setSelectedLearnerIds:f=>selected=f(selected),setScoresheetDrafts:()=>{},showToast:()=>{},window:{setTimeout:f=>timers.push(f)},
 api:async(action,{body})=>{assert.equal(closed,true);assert.equal(action,'delete_learners');calls.push(body.learner_ids[0]);assert.equal(body.learner_ids.length,1);if(calls.length===1)await new Promise(r=>release=r);if(body.learner_ids[0]===2)throw Error('synthetic failure');return {deleted_learner_ids:body.learner_ids,offline:body.learner_ids[0]===3};}};
 vm.createContext(ctx);vm.runInContext(code+'\nglobalThis.run=bulkDeleteLearners;',ctx);
 const jobs=[1,2,3].map(id=>({id,body:{deletion_authorization:{}}}));
 const job=ctx.run(true,{jobs});assert.deepEqual(calls,[1]);assert.equal(progress[0].completed,0);
 assert.equal(await ctx.run(true,{jobs}),false,'Duplicate submission must not start another queue');
 release();assert.equal(await job,false);assert.deepEqual(calls,[1,2,3]);assert.deepEqual(progress.map(p=>p.completed),[0,1,2,3]);assert.equal(progress[3].failed,1);assert.equal(progress[3].pendingSync,true);assert.deepEqual(rows,[{id:2}]);assert.deepEqual(selected,[2]);assert.equal(ctx.deletingRef.current,true);timers[0]();assert.equal(ctx.deletingRef.current,false);
 assert.ok(source.indexOf('{deletingProgress && (')>source.lastIndexOf('</main>'),'Progress survives main menu/tab presentation');
 assert.match(source,/className="content" inert=\{deletingProgress/);
 const dialog=fs.readFileSync('components/DeleteLearnersDialog.jsx','utf8');assert.ok(!dialog.includes('reason.trim().length<5'));assert.match(dialog,/'Confirm'/);assert.match(dialog,/unlockDeletionKey\(password,user\)/);
 for(const file of ['app/learner/LearnerAssessmentPage.jsx','app/teacher/assessment/AssessmentClient.jsx']) assert.match(fs.readFileSync(file,'utf8'), /Comic Sans MS/);
 for(const file of ['public/sw.js','public/learner-pwa-sw.js']) for(const weight of ['Regular','Bold']) assert.ok(fs.readFileSync(file,'utf8').includes(`/fonts/ComicNeue-${weight}.ttf`));
 for(const weight of ['Regular','Bold']) assert.equal(fs.readFileSync(`public/fonts/ComicNeue-${weight}.ttf`).readUInt32BE(0),0x00010000);
 console.log('PASS optional reason, mandatory authorization, actual queue: acknowledged 0–3 progress, mixed failures/offline, duplicate guard, selection preservation, navigation-independent progress and inert content');
})().catch(e=>{console.error(e);process.exit(1)});
