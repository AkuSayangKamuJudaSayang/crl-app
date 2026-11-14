import {getRecordProfile,READING_PROFILE_LABELS} from './recordViewModel.mjs';
export const RESULT_PERIODS=['BoSY','MoSY','EoSY'];
export function coordinatorSessionResult(session,learnerId){
 if(!session)return null;
 const m=session.sessionMetrics||{},storyText=session.storyText||'',wordCount=storyText.trim()?storyText.trim().split(/\s+/).length:100;
 const passage=Number(m.task1Score||0)+Number(m.task2Score||0)>10&&m.timerSeconds!==null&&m.timerSeconds!==undefined;
 return {id:session.id,learner_id:learnerId,assessment_period:session.assessmentPeriod,date_administered:session.dateAdministered,is_completed:session.isCompleted===true,
  overall_classification:session.overallClassification,task1_score:m.task1Score??0,task2_score:m.task2Score??0,comprehension_score:m.comprehensionScore??0,
  total_miscues:m.totalMiscues??0,miscue_accuracy:m.miscueAccuracy==null?null:Number(m.miscueAccuracy),timer_seconds:m.timerSeconds??null,
  words_read:passage?Math.max(0,wordCount-Number(m.totalMiscues||0)):0,passage_word_count:wordCount,story_title:session.storyTitle,story_text:storyText,story_questions:session.storyQuestions||[],
  remarks:m.remarks||'',experience_rating:m.experienceRating??null,observation_level:m.observationLevel??null,
  letter_results:(session.letterResults||[]).map(row=>({...row,is_correct:row.isCorrect})),word_results:(session.wordResults||[]).map(row=>({...row,is_correct:row.isCorrect})),
  comprehension_results:(session.comprehensionResults||[]).map(row=>({...row,question_index:row.questionIndex,is_correct:row.isCorrect})),
  passage_miscues:(session.passageMiscues||[]).map(row=>({...row,word_index:row.wordIndex,miscue_type:row.miscueType,misread_word:row.misreadWord}))};
}
export function coordinatorResultLearner(row){return row?{...row,first_name:row.firstName,last_name:row.lastName,middle_name:row.middleName,class_section_id:row.classSectionId}:null;}
export function coordinatorAnalyticsPeriods(learners=[]){
 return RESULT_PERIODS.map(period=>{
  const results=learners.flatMap(learner=>{
   const latest=(learner.assessments||[]).filter(row=>row.assessmentPeriod===period&&row.isCompleted!==false).slice().sort((a,b)=>new Date(b.dateAdministered||0)-new Date(a.dateAdministered||0)||Number(b.id)-Number(a.id))[0];
   return latest?[coordinatorSessionResult(latest,learner.id)]:[];
  });
  return {period,total:results.length,profiles:READING_PROFILE_LABELS.map(label=>{const count=results.filter(row=>getRecordProfile(row)===label).length;return {label,count,percent:results.length?Math.round(count/results.length*100):0};})};
 });
}
