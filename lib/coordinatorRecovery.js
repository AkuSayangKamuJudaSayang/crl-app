import {prisma} from './prisma';
import {archiveSelect} from './classWorkspaces';
import {UUID_PATTERN,workspaceError} from './classWorkspace.mjs';
export async function readCoordinatorRecovery(q,actor){
 const scope=actor?.schoolId?{teacher:{schoolId:actor.schoolId}}:{};
 const category=q.get('category');if(category&&!['learners','classes'].includes(category))throw workspaceError('Choose a valid archive category.');
 const now=new Date();let anchor;const raw=q.get('cursor');if(raw){try{if(raw.length>350)throw Error();anchor=JSON.parse(Buffer.from(raw,'base64url'));if(!UUID_PATTERN.test(anchor.id)||!Number.isFinite(Date.parse(anchor.at))||category&&anchor.category!==category)throw Error();}catch{throw workspaceError('Refresh Recovery before loading more items.');}}
 const group=q.get('group_id'),teacherId=Number(q.get('teacher_id'));if(group&&(!UUID_PATTERN.test(group)||!Number.isSafeInteger(teacherId)||teacherId<1||category!=='learners'||raw))throw workspaceError('Choose a valid deleted learner group.');
 const rows=await prisma.classArchive.findMany({where:{...scope,purgedAt:null,...(group?{deletionGroupId:group,teacherId}:{}),...(category?{kind:category==='learners'?'learner':{in:['school_year','section']}}:{}),AND:[{OR:[{expiresAt:null},{expiresAt:{gt:now}}]},...(anchor?[{OR:[{createdAt:{lt:new Date(anchor.at)}},{createdAt:new Date(anchor.at),id:{lt:anchor.id}}]}]:[])]},orderBy:[{createdAt:'desc'},{id:'desc'}],take:group?501:51,select:{...archiveSelect,teacherId:true,teacher:{select:{fullName:true}}}});
 if(group&&rows.length>500)throw workspaceError('This learner group is too large. Load its archives in smaller batches.',413);
 const page=group?rows:rows.slice(0,50),ids=[...new Set(page.filter(r=>r.kind==='school_year').flatMap(r=>r.memberArchiveIds||[]))],members=ids.length?await prisma.classArchive.findMany({where:{...scope,id:{in:ids},purgedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]},select:{id:true,teacherId:true,learnerCount:true}}):[];
 const groupIds=[...new Set(page.filter(row=>row.kind==='learner'&&row.deletionGroupId).map(row=>row.deletionGroupId))];
 const grouped=group?rows:groupIds.length?await prisma.classArchive.findMany({where:{...scope,kind:'learner',deletionGroupId:{in:groupIds},purgedAt:null,expiresAt:{gt:now}},select:{id:true,teacherId:true,deletionGroupId:true}}):[];
 const sizes=new Map();for(const row of grouped){const key=`${row.teacherId}:${row.deletionGroupId}`;sizes.set(key,(sizes.get(key)||0)+1);}
 const entries=page.map(({teacher,...r})=>{const children=r.kind==='school_year'&&r.memberArchiveIds?.length?members.filter(c=>c.teacherId===r.teacherId&&r.memberArchiveIds.includes(c.id)):null;return {...r,groupSize:r.deletionGroupId?sizes.get(`${r.teacherId}:${r.deletionGroupId}`)||1:1,teacherName:teacher.fullName,...(children?{sectionCount:children.length,learnerCount:children.reduce((n,c)=>n+c.learnerCount,0)}:{})};}),last=entries.at(-1);
 return {entries,serverNow:now.toISOString(),next_cursor:!group&&rows.length>50?Buffer.from(JSON.stringify({id:last.id,at:last.createdAt.toISOString(),category:category||null})).toString('base64url'):null};
}
