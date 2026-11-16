// Pure, internally tagged demonstration fixtures; never connects to a database.
const {buildSyntheticMiscues}=require('./syntheticBosyPlan.cjs');
const PROFILES=['Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level'];
const NOTES=[
 ['Recognized more familiar letter sounds but still hesitated when blending.','Responded more readily to familiar letters; unfamiliar words remained difficult.','Attempted more word items independently, with slow and uncertain blending.','Showed better recall of beginning sounds but needed more practice with whole words.','Read a few more familiar words, although decoding remained inconsistent.'],
 ['Recognized familiar words more quickly but still lost meaning across sentences.','Made fewer guesses on familiar words; passage comprehension remained difficult.','Followed the text with fewer long pauses but could not recall the main events.','Attempted unfamiliar words more consistently, with frequent reading errors.'],
 ['Read more of the passage correctly and recalled a few details.','Showed steadier word recognition but needed time to understand the passage.','Answered some direct questions correctly; fluency was still uneven.'],
 ['Read with fewer interruptions and understood the main events, with some errors.','Used passage details in several answers; a few unfamiliar words slowed reading.'],
 ['Read more confidently and answered most questions with relevant details.','Maintained good accuracy and showed a clearer understanding of the passage.','Read smoothly overall, with only brief pauses on unfamiliar words.','Answered the questions clearly and read the passage at a steady pace.']
];
function buildSyntheticMosyImprovement({baselines,selectionForCode,random=Math.random}){
 if(baselines.length!==32||new Set(baselines.map(r=>r.learnerId)).size!==32)throw Error('Exactly 32 distinct paired demo learners are required.');
 const groups=PROFILES.map(p=>baselines.filter(r=>r.profile===p));
 if(groups.map(g=>g.length).join(',')!=='14,14,0,0,4')throw Error('The original BoSY demo distribution changed.');
 const pick=(a,b)=>a+Math.floor(random()*(b-a+1)),shuffle=a=>{const out=[...a];for(let i=out.length-1;i>0;i--){const j=pick(0,i);[out[i],out[j]]=[out[j],out[i]];}return out;};
 const levelScore=r=>Number(r.accuracy||0)*100+Number(r.task1||0)+Number(r.task2||0);
 groups.forEach(g=>g.sort((a,b)=>levelScore(a)-levelScore(b)||a.learnerId-b.learnerId));
 const planned=[...groups[0].map((r,i)=>[r,i<9?0:1]),...groups[1].map((r,i)=>[r,i<6?1:i<9?2:i<11?3:4]),...groups[4].map(r=>[r,4])],ordinals=[0,0,0,0,0];
 return planned.map(([base,rank])=>{
  const selection=selectionForCode(base.code),low=rank===0;
  if(selection.letters.length!==10||selection.words.length!==10||!selection.stories.length)throw Error('Incomplete frozen assessment content.');
  let task1=Math.max(base.task1,pick(low?2:7,low?7:10)),task2=Math.max(base.task2,pick(low?0:5,low?4:10));
  if(low){task1=Math.min(task1,10-base.task2);task2=Math.min(task2,10-task1);}
  const accuracy=low?0:rank===1?Math.max(base.accuracy||0,pick(30,48)):rank===2?pick(52,68):rank===3?pick(70,85):Math.max(base.accuracy||0,pick(94,100));
  const comprehension=rank<2?0:rank===2?pick(1,2):rank===3?pick(3,4):Math.max(base.comprehension||0,pick(5,6));
  const timerSeconds=low?null:Math.min(base.timerSeconds||119,pick(rank===4?65:rank===3?85:100,rank===4?100:119));
  const ordinal=ordinals[rank]++,story=low?null:selection.stories[ordinal%selection.stories.length],passageWords=story?story.text.trim().split(/\s+/):[];
  if(story&&passageWords.length!==100)throw Error('A published 100-word passage is required.');
  const flags=(n,k)=>new Set(shuffle(Array.from({length:n},(_,i)=>i)).slice(0,k)),letters=flags(10,task1),words=flags(10,task2),questions=flags(6,comprehension);
  const miscues=low?0:100-accuracy,indices=shuffle(Array.from({length:100},(_,i)=>i)).slice(0,miscues).sort((a,b)=>a-b);
  return {synthetic:true,learnerId:base.learnerId,sessionId:base.sessionId,hostId:base.hostId,code:base.code,profile:PROFILES[rank],task1,task2,accuracy,miscues,comprehension,timerSeconds,
   storyTitle:story?.title||null,storyNumber:story?selection.stories.indexOf(story)+1:null,remarks:NOTES[rank][ordinal%NOTES[rank].length],
   letters:selection.letters.map((letter,i)=>({index:i,letter,correct:letters.has(i)})),words:selection.words.map((word,i)=>({index:i,word,correct:words.has(i)})),
   miscueRows:buildSyntheticMiscues(indices,passageWords,ordinal),questions:story?Array.from({length:6},(_,i)=>({index:i,correct:questions.has(i)})):[]};
 });
}
module.exports={buildSyntheticMosyImprovement,PROFILES};
