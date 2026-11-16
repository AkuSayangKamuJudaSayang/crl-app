// Pure demo-data refinement. No database access or automatic deployment seeding.
const crypto=require('node:crypto');
const PROFILES=['Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level'];
const CONFUSIONS={she:'he',he:'she',it:'is',is:'it',a:'the',an:'a',to:'the',of:'off',and:'an',in:'on',on:'in',for:'from',some:'same',but:'put',go:'got',home:'house',look:'looks',getting:'get',learn:'lean',this:'his',that:'than',can:'came',must:'most',never:'ever',more:'most',about:'above',the:'they',into:'onto',his:'her',her:'his',under:'other',they:'the',their:'the',there:'they',then:'than',them:'the',was:'is',were:'was',with:'which',from:'for',flies:'fly',flying:'fly',houses:'house',fruits:'fruit',wants:'want',stops:'stop',lands:'land',parked:'park',police:'please',officer:'office',directing:'direction',dancing:'dance',smiling:'smile',fields:'field',works:'work',helps:'help',drains:'drain',prepares:'prepare',seedbed:'seed',weeds:'weed',boiled:'boil',beans:'bean',terraces:'terrace',handful:'hand',because:'becus'};
function saidWord(word){const clean=String(word).replace(/[^a-z]/gi,'').toLowerCase()||'word';if(CONFUSIONS[clean])return CONFUSIONS[clean];if(clean.length>5&&clean.endsWith('ing'))return clean.slice(0,-3);if(clean.length>4&&clean.endsWith('ed'))return clean.slice(0,-2);if(clean.length>3&&clean.endsWith('s'))return clean.slice(0,-1);const swapped=clean.replace(/[aeiou]/,v=>({a:'e',e:'i',i:'e',o:'a',u:'o'}[v]));return swapped===clean?clean+'s':swapped;}
function buildRefinedMiscues(words,count,random=Math.random){
 const scored=words.map((word,index)=>({index,score:-Math.log(Math.max(.000001,random()))/(1+Math.min(word.length,12)/3+(/[bcdfghjklmnpqrstvwxyz]{2}/i.test(word)?1:0))})).sort((a,b)=>a.score-b.score).slice(0,count).sort((a,b)=>a.index-b.index);
 return scored.map(({index})=>{const n=random(),type=n<.46?'Substitution':n<.68?'Repetition':n<.83?'Omission':n<.94?'Insertion':'SelfCorrection';return {index,type,readAs:type==='Omission'?null:type==='Insertion'?(random()<.5?'a':'the'):type==='Repetition'?`${words[index]} ${words[index]}`.slice(0,100):saidWord(words[index])};});
}
function refineDemoRecords({pairs,selectionForCode,random=Math.random}){
 if(pairs.length!==32||new Set(pairs.map(p=>p.learnerId)).size!==32)throw Error('Exactly 32 paired demo learners required.');
 const pick=(a,b)=>a+Math.floor(random()*(b-a+1)),flags=(n,k)=>new Set(Array.from({length:n},(_,i)=>({i,r:random()})).sort((a,b)=>a.r-b.r).slice(0,k).map(r=>r.i));
 const bosy=[],mosy=[];
 const build=(old,peer,period,learnerId)=>{
  const rank=PROFILES.indexOf(old.profile);if(rank<0)throw Error('Unknown demo profile.');const low=rank===0;
  let errors=low?0:rank===1?Math.min(old.miscues,pick(period==='BoSY'?52:50,period==='BoSY'?60:56)):rank===2?Math.min(old.miscues,pick(26,38)):rank===3?Math.min(old.miscues,pick(12,22)):Math.min(old.miscues,pick(0,3));
  if(period==='MoSY'&&peer.timerSeconds!==null){if(rank===1)errors=Math.max(50,Math.min(errors,peer.miscues-1));else errors=Math.min(errors,Math.max(0,peer.miscues-pick(0,3)));}
  const code=crypto.createHash('sha256').update(`DEMO-REFINE-16.5:${period}:${old.code}`).digest('hex').slice(0,6).toUpperCase(),content=selectionForCode(old,code);
  const story=low?null:content.stories.find(s=>s.title===old.storyTitle)||content.stories[0],words=story?story.text.trim().split(/\s+/):[];if(story&&words.length!==100)throw Error('Frozen 100-word story required.');
  const experience=low?null:period==='BoSY'?pick(1,5):Math.max(1,Math.min(5,(peer.experience||pick(1,5))+pick(-1,1))),observation=low?null:Math.max(period==='MoSY'?peer.observation||1:1,pick(rank===1?1:rank===2?2:3,rank===1?2:rank===2?3:4));
  const timerSeconds=low?null:Math.min(old.timerSeconds,period==='MoSY'&&peer.timerSeconds!==null?peer.timerSeconds:119,pick(rank===4?60:95,rank===4?105:118)),letterFlags=flags(10,old.task1),wordFlags=flags(10,old.task2),questionFlags=flags(6,old.comprehension);
  return {synthetic:true,learnerId,oldId:old.id,oldHostId:old.hostId,oldCode:old.code,revisionId:old.revisionId,period,profile:old.profile,code,task1:old.task1,task2:old.task2,miscues:errors,accuracy:low?0:100-errors,comprehension:old.comprehension,timerSeconds,experience,observation,remarks:old.remarks,storyTitle:story?.title||null,storyNumber:story?content.stories.indexOf(story)+1:null,
   letters:content.letters.map((letter,i)=>({index:i,letter,correct:letterFlags.has(i)})),words:content.words.map((word,i)=>({index:i,word,correct:wordFlags.has(i)})),miscueRows:buildRefinedMiscues(words,errors,random),questions:story?Array.from({length:6},(_,i)=>({index:i,correct:questionFlags.has(i)})):[]};
 };
 for(const pair of pairs){const b=build(pair.bosy,null,'BoSY',pair.learnerId),m=build(pair.mosy,b,'MoSY',pair.learnerId);bosy.push(b);mosy.push(m);}
 return [...bosy,...mosy];
}
module.exports={refineDemoRecords,buildRefinedMiscues,saidWord,PROFILES};
