const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const completion=await import('../lib/learnerCompletion.mjs');
  const source=fs.readFileSync('app/learner/LearnerAssessmentPage.jsx','utf8');
  for(const [stage,current_content] of [['terminated','ZERO_SCORE_PART1_TASK1'],['terminated','PART1_TOTAL_LOW'],['teacher_review','TEACHER_REVIEW']]){
    let scheduled=0,resets=0,message='',callback;
    const ctx=vm.createContext({learnerCompletionMessage:completion.learnerCompletionMessage,useCallback:fn=>fn,codeInput:'ABC123',
      sessionRef:{current:{}},localSessionKeyRef:{current:'learner:ABC123'},lastAppliedStageRef:{current:''},resetTimerRef:{current:null},completionRedirectingRef:{current:false},zeroScoreRedirectingRef:{current:false},sessionEndRedirectingRef:{current:false},
      persistLocalLearnerSession:async()=>{},resetToCodeEntry:()=>resets++,triggerWordPreparation(){},normalizeCode:x=>String(x).toUpperCase(),
      setCompletionMessage:value=>message=value,window:{clearTimeout(){},setTimeout(fn,delay){assert.equal(delay,3000);scheduled++;callback=fn;return scheduled;}}
    });
    for(const setter of ['setSession','setLoading','setConnected','setCompleted','setZeroScore','setShowZeroScoreOverlay','setShowExperienceOverlay','setSelectedExperienceRating','setSavingExperienceRating','setStatusMessage','setError','setTeacherInterrupted','setShowPreparationOverlay'])ctx[setter]=()=>{};
    let start=source.indexOf('  const showWellDoneAndReset =');let end=source.indexOf('  const triggerWordPreparation',start);
    vm.runInContext(source.slice(start,end),ctx);
    start=source.indexOf('  const applyIncomingSession =');end=source.indexOf('  const joinAssessment =',start);
    vm.runInContext(source.slice(start,end)+';globalThis.apply=applyIncomingSession;',ctx);
    const session={code:'ABC123',stage,current_content};
    for(const transport of ['server','broadcast','peer'])for(let i=0;i<20;i++)ctx.apply(session,transport);
    assert.equal(scheduled,1,'Frequent polls/broadcasts cannot postpone completion');assert.equal(message,completion.learnerCompletionMessage(session));callback();assert.equal(resets,1);
  }
  assert.equal(new Set(['ZERO_SCORE_PART1_TASK1','PART1_TOTAL_LOW','TEACHER_REVIEW'].map(current_content=>completion.learnerCompletionMessage({current_content}))).size,3);
  console.log('PASS actual learner completion handler: three compassionate messages, terminal online/direct/realtime packets schedule exactly one 3-second return before teacher final save');

  const ratingSource=fs.readFileSync('lib/assessmentExperience.js','utf8').replace(/^export /gm,'');
  let host,writes,answers,miscues,fail;
  const clone=value=>structuredClone(value);
  const tx={$queryRaw:async()=>[],hostSession:{findFirst:async({where})=>host.teacherId===where.teacherId?clone(host):null,update:async({data})=>{writes++;Object.assign(host,data);return clone(host);}},
    comprehensionResult:{deleteMany:async()=>{writes++;answers=[];},createMany:async({data})=>{if(fail)throw Error('synthetic failure');answers=clone(data);writes++;}},
    passageMiscue:{deleteMany:async()=>{miscues=[];writes++;},createMany:async({data})=>{miscues=clone(data);writes++;}},
    sessionMetrics:{upsert:async({update})=>{Object.assign(host.assessmentSession.sessionMetrics,update);writes++;}}};
  let tail=Promise.resolve();const db={$transaction:fn=>{const call=tail.then(async()=>{const before=clone({host,answers,miscues,writes});try{return await fn(tx);}catch(e){({host,answers,miscues,writes}=before);throw e;}});tail=call.catch(()=>{});return call;}};
  const ctx=vm.createContext({Date});vm.runInContext(ratingSource,ctx);
  const input={code:'ABC123',learnerId:406,rating:4,timerSeconds:120,comprehension:Array.from({length:6},(_,questionIndex)=>({questionIndex,isCorrect:questionIndex<5})),miscues:[{wordIndex:2,miscueType:'Insertion',misreadWord:null}]};
  const reset=()=>{writes=0;answers=[];miscues=[];fail=false;host={id:1,code:'ABC123',teacherId:901,learnerId:406,assessmentSessionId:30,ended:false,stage:'comprehension',assessmentSession:{teacherId:901,sessionMetrics:{}}};};
  reset();const results=await Promise.all([ctx.persistExperienceRating(db,901,input),ctx.persistExperienceRating(db,901,input)]);assert.equal(results.filter(row=>row.duplicate).length,1);assert.equal(answers.length,6);assert.equal(miscues.length,1);assert.equal(host.stage,'teacher_review');assert.equal(host.assessmentSession.sessionMetrics.experienceRating,4);
  const written=writes;answers[0].isCorrect=false;host.stage='completed';host.ended=true;
  assert.equal((await ctx.persistExperienceRating(db,901,input)).duplicate,true);assert.equal(writes,written);assert.equal(answers[0].isCorrect,false,'A late retry cannot overwrite a corrected final record');
  await assert.rejects(()=>ctx.persistExperienceRating(db,901,{...input,rating:5}),/conflicts/);assert.equal(writes,written);
  await assert.rejects(()=>ctx.persistExperienceRating(db,902,input),/not found/);await assert.rejects(()=>ctx.persistExperienceRating(db,901,{...input,learnerId:999}),/does not match/);assert.equal(writes,written);
  reset();fail=true;await assert.rejects(()=>ctx.persistExperienceRating(db,901,input),/synthetic/);assert.equal(writes,0);assert.equal(host.stage,'comprehension');assert.equal(answers.length,0);
  reset();host.stage='letter';await assert.rejects(()=>ctx.persistExperienceRating(db,901,input),/conflicts/);assert.equal(writes,0);
  console.log('PASS actual rating persistence: concurrent/replayed/finalized duplicate acknowledgement without writes; owner/learner/stage/conflict checks; atomic rollback; complete six-answer/miscue/timer/rating persistence');
})().catch(e=>{console.error(e);process.exitCode=1;});
