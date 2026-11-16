// Explicit, internally traceable demo fixtures only. No connection or automatic seed.
const {buildRefinedMiscues,PROFILES}=require('./refineDemoRecords.cjs');
const NOTES=[
 ['Recognizes familiar sounds; blending is still hesitant.','Tries to blend short words, with several pauses.','More confident with letters than unfamiliar words.','Beginning sounds are clearer; word reading needs practice.'],
 ['Reads more familiar words but loses some meaning.','Fewer long pauses; needs help recalling details.','Attempts longer words instead of skipping them.','Tracks the passage better; answers remain brief.'],
 ['Reads steadily and recalls some important details.','Answers direct questions; pace is still uneven.','Uses context to correct a few unfamiliar words.','Word recognition is improving across sentences.'],
 ['Reads with fewer pauses and explains the main events.','Recalls key details, with occasional word errors.','Follows punctuation more consistently.','Checks unfamiliar words and continues reading.'],
 ['Reads smoothly and explains the story clearly.','Accurate reading; brief pauses on longer words.','Answers with relevant details from the passage.','Maintains a steady pace and good understanding.']
];
function buildSyntheticEosyProgress({baselines,content,random=Math.random}){
 if(baselines.length!==32||new Set(baselines.map(r=>r.learnerId)).size!==32)throw Error('Exactly 32 paired demo records required.');
 const groups=PROFILES.map(p=>baselines.filter(r=>r.profile===p));if(groups.map(g=>g.length).join(',')!=='9,11,3,2,7')throw Error('MoSY baseline changed.');
 if(content.letters.length!==10||content.words.length!==10||content.stories.length<1||content.stories.some(s=>s.text.trim().split(/\s+/).length!==100))throw Error('Complete published content required.');
 const pick=(a,b)=>a+Math.floor(random()*(b-a+1)),flags=(n,k)=>new Set(Array.from({length:n},(_,i)=>({i,r:random()})).sort((a,b)=>a.r-b.r).slice(0,k).map(x=>x.i));
 groups.forEach(g=>g.sort((a,b)=>(a.accuracy*10+a.task1+a.task2)-(b.accuracy*10+b.task1+b.task2)||a.learnerId-b.learnerId));
 const ranks=[...groups[0].map((r,i)=>[r,i<5?0:1]),...groups[1].map((r,i)=>[r,i<4?1:i<9?2:3]),...groups[2].map((r,i)=>[r,i<2?3:4]),...groups[3].map(r=>[r,4]),...groups[4].map(r=>[r,4])];
 return ranks.map(([b,rank],i)=>{
  const low=rank===0,task1=low?b.task1:Math.max(b.task1,pick(8,10)),task2=low?Math.min(10-task1,Math.max(b.task2,pick(1,4))):Math.max(b.task2,pick(6,10));
  const errors=low?0:rank===1?Math.max(50,Math.min(b.timerSeconds===null?55:b.miscues-pick(0,4),pick(50,54))):rank===2?Math.min(b.miscues,pick(25,35)):rank===3?Math.min(b.miscues,pick(8,20)):Math.min(b.timerSeconds===null?3:b.miscues,pick(0,3));
  const comp=rank<2?0:rank===2?Math.max(b.comprehension,pick(1,2)):rank===3?Math.max(b.comprehension,pick(3,4)):Math.max(b.comprehension,pick(5,6));
  const seconds=low?null:Math.min(b.timerSeconds||118,pick(rank===4?57:rank===3?78:96,rank===4?98:115)),story=low?null:content.stories[pick(0,content.stories.length-1)],words=story?story.text.trim().split(/\s+/):[],letters=flags(10,task1),wordFlags=flags(10,task2),q=flags(6,comp);
  return {synthetic:true,learnerId:b.learnerId,baselineId:b.id,profile:PROFILES[rank],task1,task2,miscues:errors,accuracy:low?0:100-errors,comprehension:comp,timerSeconds:seconds,experience:low?null:Math.max(1,Math.min(5,(b.experience||pick(2,5))+pick(-1,1))),observation:low?null:Math.max(b.observation||1,pick(rank===1?1:rank===2?2:3,rank===1?2:4)),storyTitle:story?.title||null,storyNumber:story?content.stories.indexOf(story)+1:null,remarks:NOTES[rank][i%NOTES[rank].length],letters:content.letters.map((letter,index)=>({index,letter,correct:letters.has(index)})),words:content.words.map((word,index)=>({index,word,correct:wordFlags.has(index)})),miscueRows:buildRefinedMiscues(words,errors,random),questions:story?Array.from({length:6},(_,index)=>({index,correct:q.has(index)})):[]};
 });
}
function selectDemoRemarks(records,count,random=Math.random){if(count>records.length||count<0)throw Error('Invalid remark count.');const selected=new Set(records.map((_,index)=>({index,r:random()})).sort((a,b)=>a.r-b.r).slice(0,count).map(r=>r.index));return records.map((r,index)=>({...r,remarks:selected.has(index)?NOTES[PROFILES.indexOf(r.profile)][index%NOTES[PROFILES.indexOf(r.profile)].length]:''}));}
module.exports={buildSyntheticEosyProgress,selectDemoRemarks,NOTES};
