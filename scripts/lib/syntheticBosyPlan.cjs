// Explicitly labelled test fixtures only. This module never writes a database.
const crypto=require('node:crypto');
const SYNTHETIC_MARKER='[SYNTHETIC TEST DATA]';
const SAMPLE_OBSERVATIONS={
 low:['Recognized a few familiar letter sounds; needed time before responding.','Confused several letter sounds and paused on unfamiliar words.','Read familiar letters more confidently than whole words.','Attempted to sound out words but often stopped before blending.','Needed repeated encouragement to attempt unfamiliar letter sounds.','Gave short responses and hesitated on most word-reading items.','Recognized some beginning sounds; blending remained difficult.'],
 high:['Read slowly with frequent pauses; lost the meaning of the passage.','Skipped several words and had difficulty answering the questions.','Recognized familiar words but guessed at longer ones.','Repeated words while trying to follow the passage.','Needed more time to blend unfamiliar words in the passage.','Sounded out parts of words but had trouble reading connected text.','Answered hesitantly and could not recall the main events.'],
 grade:['Read steadily and answered most questions using passage details.','Read with good accuracy; paused briefly on a few unfamiliar words.','Followed the story well and explained the main events clearly.','Read fluently overall and gave relevant answers to the questions.']
};
function sampleObservation(profile,index){const pool=SAMPLE_OBSERVATIONS[profile.includes('Low')?'low':profile.includes('High')?'high':'grade'];return pool[index%pool.length];}
function buildSyntheticMiscues(indices,passageWords,offset=0){
 const types=['Substitution','Omission','Insertion','Repetition'];
 return indices.map((index,i)=>{const type=types[(i+offset)%types.length],word=String(passageWords[index]||'word').replace(/[^a-z]/gi,'').toLowerCase()||'word';let readAs=null;if(type==='Substitution'){const swaps={a:'e',e:'a',i:'e',o:'u',u:'a'};readAs=word.replace(/[aeiou]/,v=>swaps[v]);if(readAs===word)readAs=word+'s';}else if(type==='Insertion')readAs=i%2?'the':'a';else if(type==='Repetition')readAs=`${word} ${word}`;return {index,type,readAs:readAs?.slice(0,100)||null};});
}
function buildSyntheticAssessmentPlan({learnerIds,selectionForCode,seedTag,random=Math.random}){
 if(learnerIds.length!==32||new Set(learnerIds).size!==32||learnerIds.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Exactly 32 distinct eligible learners are required.');
 const pick=(min,max)=>min+Math.floor(random()*(max-min+1));
 const shuffle=values=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=pick(0,i);[result[i],result[j]]=[result[j],result[i]];}return result;};
 const flags=(length,score)=>new Set(shuffle(Array.from({length},(_,i)=>i)).slice(0,score));
 return shuffle(learnerIds).map((learnerId,index)=>{
  const code=crypto.createHash('sha256').update(`${seedTag}:${learnerId}`).digest('hex').slice(0,6).toUpperCase();
  const selection=selectionForCode(code);
  if(selection.letters.length!==10||selection.words.length!==10||!selection.stories.length)throw Error('The published catalog must provide ten letters, ten words and a story.');
  const low=index<14,grade=index>=28,task1=low?pick(1,6):grade?pick(9,10):pick(7,10),task2=low?pick(0,4):grade?pick(8,10):pick(5,10);
  const letterFlags=flags(10,task1),wordFlags=flags(10,task2),story=low?null:selection.stories[pick(0,selection.stories.length-1)];
  const count=story?String(story.text||'').trim().split(/\s+/).filter(Boolean).length:0;
  if(story&&count!==100)throw Error('Synthetic passage measures require the published 100-word CRLA story.');
  const wordsRead=low?null:grade?pick(91,100):pick(15,45),miscues=low?0:count-wordsRead,comprehension=low?0:grade?pick(5,6):0,accuracy=low?0:wordsRead;
  const wrongIndices=story?shuffle(Array.from({length:count},(_,i)=>i)).slice(0,miscues).sort((a,b)=>a-b):[],compFlags=flags(6,comprehension);
  const profile=low?'Low Emerging Reader':grade?'Reading At Grade Level':'High Emerging Reader';
  return {synthetic:true,learnerId,code,profile,storyTitle:story?.title||null,storyNumber:story?selection.stories.indexOf(story)+1:null,task1,task2,miscues,accuracy,comprehension,timerSeconds:low?null:grade?pick(60,110):pick(100,119),remarks:sampleObservation(profile,low?index:grade?index-28:index-14),
   letters:selection.letters.map((letter,i)=>({index:i,letter,correct:letterFlags.has(i)})),words:selection.words.map((word,i)=>({index:i,word,correct:wordFlags.has(i)})),miscueIndices:wrongIndices,miscueRows:buildSyntheticMiscues(wrongIndices,story?story.text.trim().split(/\s+/):[],index),questions:story?Array.from({length:6},(_,i)=>({index:i,correct:compFlags.has(i)})):[]};
 });
}
module.exports={buildSyntheticBosyPlan:buildSyntheticAssessmentPlan,buildSyntheticAssessmentPlan,buildSyntheticMiscues,sampleObservation,SAMPLE_OBSERVATIONS,SYNTHETIC_MARKER};
