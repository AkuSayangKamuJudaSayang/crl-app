const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const {validateLearnerDeletion}=await import('../lib/classWorkspace.mjs');
 assert.equal(validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:''}),'');
 assert.equal(validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:'x'}),'x');
 assert.throws(()=>validateLearnerDeletion([],{deletion_reason:''}),/password/);
 assert.throws(()=>validateLearnerDeletion([],{deletion_authorization:{},deletion_reason:'x'.repeat(301)}),/300/);
 const source=fs.readFileSync('app/teacher/page.jsx','utf8');
 const code=source.slice(source.indexOf('  const bulkDeleteLearners ='),source.indexOf('  const requestActivityNavigation'));
 const {withLearnerDeletionRetry}=await import('../lib/learnerDeletionRetry.mjs');
 let attempts=0;assert.equal(await withLearnerDeletionRetry(async()=>{if(++attempts<3)throw Object.assign(Error('Temporary'),{status:503});return 'ok';},async()=>{}),'ok');assert.equal(attempts,3);
 attempts=0;await assert.rejects(()=>withLearnerDeletionRetry(async()=>{attempts++;throw Object.assign(Error('Assessment is active'),{status:409});},async()=>{}),/active/);assert.equal(attempts,1);
 let failSecond=true;
 let release, calls=[],progress=[],closed=false,rows=[1,2,3].map(id=>({id})),selected=[1,2,3],timers=[];
 const ctx={selectedSectionId:"section-A",learners:[{id:1},{id:2},{id:3}],formatName:row=>`Synthetic ${row.id}`,withLearnerDeletionRetry:fn=>fn(),selectedLearnerIds:[1,2,3],savingScoresheet:false,deletingRef:{current:false},assessments:[],
 setBulkDeleteConfirm:v=>{closed=!v;},setDeletingProgress:v=>{if(typeof v!=="function")progress.push(v);},setLearners:f=>rows=f(rows),setAssessments:()=>{},setSelectedLearnerIds:f=>selected=f(selected),setScoresheetDrafts:()=>{},showToast:()=>{},window:{setTimeout:f=>timers.push(f)},
 api:async(action,{body})=>{assert.equal(closed,true);assert.equal(action,'delete_learners');calls.push(body.learner_ids[0]);assert.equal(body.learner_ids.length,1);if(calls.length===1)await new Promise(r=>release=r);assert.equal(body.class_section_id,'section-A');if(body.learner_ids[0]===2&&failSecond)throw Error('synthetic failure');return {deleted_learner_ids:body.learner_ids,offline:body.learner_ids[0]===3};}};
 vm.createContext(ctx);vm.runInContext(code+'\nglobalThis.run=bulkDeleteLearners;globalThis.retry=processLearnerDeletions;',ctx);
 const jobs=[1,2,3].map(id=>({id,body:{deletion_authorization:{}}}));
 const job=ctx.run(true,{jobs});assert.deepEqual(calls,[1]);assert.equal(progress[0].completed,0);
 assert.equal(await ctx.run(true,{jobs}),false,'Duplicate submission must not start another queue');
 release();assert.equal(await job,false);assert.deepEqual(calls,[1,2,3]);assert.deepEqual(progress.map(p=>p.completed),[0,1,2,3,3]);assert.equal(progress[3].failed,1);assert.equal(progress[3].pendingSync,true);assert.deepEqual(rows,[{id:2}]);assert.deepEqual(selected,[2]);assert.equal(ctx.deletingRef.current,false);assert.equal(timers.length,0,'Keep failures visible until retry/dismiss');assert.equal(progress.at(-1).active,false);assert.equal(progress.at(-1).failures[0].id,2);assert.match(progress.at(-1).failures[0].error,/synthetic failure/);assert.equal(progress.at(-1).sectionId,'section-A');
 failSecond=false;ctx.selectedSectionId='section-B';assert.equal(await ctx.retry(progress.at(-1).failures,'section-A'),true);assert.equal(calls.at(-1),2);assert.equal(progress.at(-1).failed,0);assert.equal(timers.length,1);
 calls=[];progress=[];ctx.api=async(action,{body})=>{assert.equal(body.class_section_id,'section-A');calls.push(body.learner_ids[0]);ctx.selectedSectionId='section-B';return {deleted_learner_ids:body.learner_ids};};
 const many=Array.from({length:33},(_,i)=>({id:i+100,name:`Synthetic ${i}`,action:'delete_learners',body:{roster_version:0}}));
 assert.equal(await ctx.retry(many,'section-A'),true);assert.equal(calls.length,33);assert.deepEqual(progress.slice(0,-1).map(p=>p.completed),Array.from({length:34},(_,i)=>i));assert.equal(progress.at(-1).active,false);assert.ok(progress.every(p=>p.sectionId==='section-A'));
 assert.ok(source.indexOf('{deletingProgress && (')>source.lastIndexOf('</main>'),'Progress survives main menu/tab presentation');
 assert.doesNotMatch(source,/className="content" inert/);assert.match(source,/inert=\{deletingProgress\?\.active && deletingProgress.sectionId === selectedSectionId/);assert.match(source,/Retry failed/);
 const dialog=fs.readFileSync('components/DeleteLearnersDialog.jsx','utf8');assert.ok(!dialog.includes('reason.trim().length<5'));assert.match(dialog,/'Confirm'/);assert.match(dialog,/unlockDeletionKey\(password,user\)/);
 for(const file of ['app/learner/LearnerAssessmentPage.jsx','app/teacher/assessment/AssessmentClient.jsx']) assert.match(fs.readFileSync(file,'utf8'), /Comic Sans MS/);
 for(const file of ['public/sw.js','public/learner-pwa-sw.js']) for(const weight of ['Regular','Bold']) assert.ok(fs.readFileSync(file,'utf8').includes(`/fonts/ComicNeue-${weight}.ttf`));
 for(const weight of ['Regular','Bold']) assert.equal(fs.readFileSync(`public/fonts/ComicNeue-${weight}.ttf`).readUInt32BE(0),0x00010000);
 console.log('PASS optional reason, mandatory authorization, actual queue: acknowledged 0–3 progress, mixed failures/offline, duplicate guard, selection preservation, 33 acknowledged items across class navigation, persistent named failures/retry and section-scoped inert roster');
})().catch(e=>{console.error(e);process.exit(1)});
