const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const sql = fs.readFileSync('supabase/migrations/20261117181500_server_disconnect_timeout.sql','utf8');
  const server = fs.readFileSync('app/api/assessment/route.js','utf8');
  const runtime = fs.readFileSync('app/components/OfflineRuntime.jsx','utf8');
  const teacher = fs.readFileSync('app/teacher/assessment/AssessmentClient.jsx','utf8');
  const worker = fs.readFileSync('public/sw.js','utf8');
  const { buildCanceledAssessmentPlan } = await import('../lib/canceledAssessmentQueue.mjs');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.crl_expire_assessment_hosts\(\)/);
  assert.match(sql, /interval '60 seconds'/);
  assert.match(sql, /h\.linked_at IS NOT NULL/);
  assert.match(sql, /coalesce\(p\.teacher_seen_at, h\.linked_at\)/);
  assert.match(sql, /AND NOT a\.is_completed/);
  assert.match(sql, /FOR UPDATE OF h/);
  assert.match(sql, /AND \(a\.id IS NULL OR NOT a\.is_completed\)/);
  assert.match(sql, /WHERE id = ANY\(draft_ids\) AND NOT is_completed/);
  assert.match(sql, /l\.class_section_id = target\.class_section_id/);
  assert.match(sql, /h\.teacher_id = target\.teacher_id/);
  assert.match(sql, /'crl-expire-disconnected-assessments'/);
  assert.match(sql, /'15 seconds'/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.crl_expire_assessment_hosts\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /stage IN \('connected', 'letter', 'word', 'story_choice'/);
  assert.match(sql, /interval '24 hours'/, 'Teacher review recovery remains available');
  console.log('PASS scheduled 60-second disconnect expiry, teacher/class isolation, locked transactions, saved-result protection');

  assert.match(server, /code: "ASSESSMENT_CANCELED", canceled: true, auto_timeout: timedOut/);
  assert.match(server, /\}, 410\);/);
  assert.match(server, /_queued_replay === true/);
  assert.match(server, /pastHost\.stage === "ended"/);
  assert.match(server, /const automaticTimeout = body\?\.auto_timeout === true/);
  assert.match(server, /isCompleted: false/);
  assert.match(server, /if \(!host \|\| host\.ended\)/);
  assert.match(server, /pg_cron worker enforces the peer lease/);
  console.log('PASS terminal cloud cancellation protocol and idempotent End Session');

  assert.match(runtime, /blockedOutboxEntry = \{ id: entry\.id, userId, message: failure \}/);
  assert.match(runtime, /const blockedRow = entries\.find/);
  assert.match(runtime, /response\.status === 410 && rejected\?\.code === "ASSESSMENT_CANCELED"/);
  assert.match(runtime, /localHost\?\.stage === "completed" && localHost\?\.ended/);
  assert.match(runtime, /discardCanceledAssessmentWork\(userId, canceledCodes/);
  assert.match(runtime, /blockedOutboxEntry = null;\s+void syncOutbox\(\)/);
  assert.match(runtime, /window\.addEventListener\("crl-offline-sync-retry", retryHandler\)/);
  assert.match(runtime, /window\.removeEventListener\("crl-offline-sync-retry", retryHandler\)/);

  const canceledHost = {code:'ZX1234',teacher_id:8,stage:'word',ended:false,task1Results:[{isCorrect:true}],task2Results:[]};
  const completedHost = {...canceledHost,stage:'completed',ended:true};
  const queued = [{id:'a',userId:8,kind:'record_letter',body:{code:'ZX1234'}},
    {id:'b',userId:8,kind:'host_advance',body:{code:'ZX1234'}},
    {id:'c',userId:8,kind:'record_letter',body:{code:'AB1234'}}];
  const plan = buildCanceledAssessmentPlan({userId:8,codes:['ZX1234'],hosts:[canceledHost],entries:queued,automaticTimeout:true,now:1000});
  assert.deepEqual(plan.canceledCodes,['ZX1234']);
  assert(plan.changes.some(change=>change.key==='outbox:a'&&change.remove));
  assert(plan.changes.some(change=>change.key==='outbox:b'&&change.remove));
  assert(!plan.changes.some(change=>change.key==='outbox:c'),'Unrelated learner work survives');
  assert(plan.changes.some(change=>change.value?.kind==='host_end'&&change.value.body.auto_timeout===true));
  assert.deepEqual(buildCanceledAssessmentPlan({userId:8,codes:['ZX1234'],hosts:[completedHost],entries:queued}).canceledCodes,[],
    'Completed offline results must never be silently removed');
  assert.match(teacher, /_queued_replay: true/);
  assert.match(teacher, /response\.status === 410 && data\?\.code === "ASSESSMENT_CANCELED"/);
  assert.match(teacher, /blockedAnswerMutationRef\.current === mutationId/);
  assert.match(teacher, /canceledDuringFlush\.add\(canceledCode\)/);
  assert.match(teacher, /window\.addEventListener\("crl-offline-sync-retry", retry\)/);
  assert.match(teacher, /blockedAnswerMutationRef\.current === id\) blockedAnswerMutationRef\.current = null/);
  console.log('PASS canceled draft journal compaction, completed offline protection, and bounded 409 retries');

  for (const path of ['learners-1.svg','learners-2.svg','learners-3.svg'])
    assert(!worker.includes('/login-slides/'+path),'Do not precache missing '+path);
  assert.match(worker,/crla-pwa-v120/);
  assert.equal((worker.match(/\/login-slides\/classroom-[123]\.webp/g)||[]).length,3);
  console.log('PASS missing login SVG references removed; real WebP assets remain cached');
})().catch(error=>{console.error(error);process.exitCode=1});
