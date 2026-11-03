// Matches the teacher record API's workbook fields. Never treats unfinished work
// as a completed result; rosterRecords supplies enrolled-only rows separately.
export function coordinatorRecordData(report) {
 const learners=report.learners.map(l=>({id:l.id,lrn:l.lrn,first_name:l.firstName,last_name:l.lastName,middle_name:l.middleName,suffix:l.suffix,sex:l.sex}));
 const assessments=report.learners.flatMap(l=>l.assessments.map(s=>{
  const m=s.metrics||{},passage=Number(m.task1Score||0)+Number(m.task2Score||0)>10&&m.timerSeconds!==null&&m.timerSeconds!==undefined;
  const words=passage?Math.max(0,100-Number(m.totalMiscues||0)):0;
  const title=String(s.storyTitle||'').trim().toLowerCase();
  return {id:s.id,learner_id:l.id,assessment_period:s.period,date_administered:s.date,is_completed:s.completed,overall_classification:s.classification,
   task1_score:m.task1Score||0,task2_score:m.task2Score||0,total_miscues:m.totalMiscues||0,miscue_accuracy:passage?Number(m.miscueAccuracy):0,
   comprehension_score:m.comprehensionScore||0,classification_label:m.classificationLabel||null,timer_seconds:m.timerSeconds??null,experience_rating:m.experienceRating??null,
   story_number:title==='para the parrot'?1:title==='a day in the fields'?2:s.storyNumber??null,observation_level:m.observationLevel??null,remarks:s.remarks||null,
   words_read:words,wpm:passage&&Number(m.timerSeconds)>0?Number((words/Number(m.timerSeconds)*60).toFixed(2)):null};
 }));
 return {learners,assessments};
}
