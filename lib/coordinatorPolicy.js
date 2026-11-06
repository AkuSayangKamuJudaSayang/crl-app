import {liveAssessmentStatus} from './liveAssessments';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {prisma} from './prisma';
import {workspaceError,UUID_PATTERN} from './classWorkspace.mjs';
import {serializeAssessmentContent,serializeAssessmentContentMode,serializeAssessmentContentDefaults} from './contentCatalog';
import {ASSESSMENT_PERIODS,DEFAULT_ASSESSMENT_CONTENT,cloneAssessmentContent,normalizeAssessmentPeriodContent,normalizeAssessmentContentModes,normalizeAssessmentContentDefaults,getAssessmentPublicationIssues,serializeAssessmentContentSettings} from './assessmentContent';
import {getStoryQuestions} from './storyComprehension.mjs';
import {getPossibleStoryAnswer} from './storyAnswerGuides.mjs';
import {sealPrivateData,openPrivateData,writeAudit} from './adminHistory';
export const COORDINATOR_ACTIONS=new Set(['save_school_year','edit_school_year','save_class_section','archive_school_year','archive_class','delete_school_year','delete_class_section','restore_class_archive','import_class_archive','delete_class_archive','download_class_archive','restore_learner_archives','purge_class_archives']);
export const LEGACY_MANAGED_ACTIONS=new Set(['save_school_year','edit_school_year','save_class_section','save_activities','save_content_mode']);
export function coordinatorOnly(){throw Object.assign(workspaceError('School years, section assignments and shared contents are managed through the school workspace.',403),{code:'COORDINATOR_MANAGED'});}
const key=()=>crypto.createHmac('sha256',process.env.JWT_SECRET||process.env.AUTH_SECRET).update('crl-coordinator-offline-window-v1').digest();
export function issueWindowGrant(teacherId,year,window,revisionId){return jwt.sign({purpose:'assessment-window',teacherId:Number(teacherId),startYear:year.startYear,schoolYearId:year.id,period:window.activePeriod,windowRevision:window.revision,catalogRevisionId:revisionId,policyVersion:2},key(),{algorithm:'HS256',audience:'crl-offline-assessment',expiresIn:'24h'});}
export function verifyWindowGrant(token,teacherId,year,period){try{const c=jwt.verify(token,key(),{algorithms:['HS256'],audience:'crl-offline-assessment'});if(c.purpose!=='assessment-window'||c.teacherId!==Number(teacherId)||!Number.isInteger(c.startYear)||c.startYear<2000||c.startYear>2100||c.schoolYearId!==year.id||c.period!==period||!UUID_PATTERN.test(c.catalogRevisionId))throw Error();return c;}catch{throw Object.assign(workspaceError('Synchronize shared assessment contents before starting offline. Existing progress remains saved.',409),{code:'WINDOW_AUTH_REQUIRED'});}}
export async function coordinatorCatalog(teacherId,years){
 const live=await prisma.schoolAssessment.findMany({where:{isLive:true,startYear:{in:years.map(y=>y.startYear)}}});
 return {coordinatorManaged:true,timelinePolicyVersion:2,assessmentWindows:[],assessmentAuthorities:years.flatMap(year=>live.filter(w=>w.startYear===year.startYear).map(w=>({schoolYearId:year.id,period:w.period,catalogRevisionId:w.catalogRevisionId,expiresAt:new Date(Date.now()+86400000).toISOString(),grant:issueWindowGrant(teacherId,year,{activePeriod:w.period,revision:w.revision},w.catalogRevisionId)})))};
}
// Shared by publication, start and live-presence activation transactions.
export async function lockSharedLibrary(db){await db.$queryRaw`SELECT pg_advisory_xact_lock(177631,1)::text AS locked`;}
export async function expireInactiveAssessments(db=prisma){await db.$queryRaw`SELECT public.crl_expire_assessment_hosts()`;}
export async function libraryEditStatus(db=prisma){await expireInactiveAssessments(db);return liveAssessmentStatus(db);}
export async function assertLibraryEditable(db=prisma){if((await libraryEditStatus(db)).editingLocked)throw Object.assign(workspaceError('An assessment is in progress. Contents are view-only until all active assessments end.',423),{code:'ASSESSMENT_IN_PROGRESS'});}
export async function sharedLibrary(db=prisma){const heads=await db.assessmentLibraryHead.findMany(),revisions=await db.assessmentLibraryRevision.findMany({where:{id:{in:heads.map(h=>h.revisionId)}}}),rows=revisions.flatMap(r=>r.rows);return {status:'ok',coordinatorManaged:true,activities:serializeAssessmentContent(rows),contentMode:serializeAssessmentContentMode(rows),contentDefaults:serializeAssessmentContentDefaults(rows),catalogRevisions:Object.fromEntries(revisions.map(r=>[r.period,r.id]))};}
export function catalogRows(period,content,modes,defaults){
 const pool=normalizeAssessmentPeriodContent(content||{}),issues=getAssessmentPublicationIssues(pool,modes,defaults).map(i=>i.message);
 if(issues.length)throw Object.assign(workspaceError(issues[0]),{issues});
 const selected=normalizeAssessmentContentDefaults(defaults),normalizedModes=normalizeAssessmentContentModes(modes);
 // Random draws do not require fixed selections. Keep only still-valid choices
 // so switching back to Fixed default can expose an incomplete selection safely.
 for(const category of ['letters','words','stories'])if(normalizedModes[category]==='random'){
  const keys=new Set(category==='stories'?pool.stories.map(s=>s.title):pool[category]);
  selected[category]=[...new Set(selected[category])].filter(key=>keys.has(key));
 }
 const rows=[];for(const category of ['letters','words','stories'])pool[category].forEach((v,i)=>{rows.push({id:i+1,assessmentPeriod:period,category,position:i+1,content:category==='stories'?v.text:v,storyTitle:category==='stories'?v.title:null});if(category==='stories')rows.push({assessmentPeriod:period,category:'story_questions',position:i+1,storyTitle:v.title,content:JSON.stringify({questions:getStoryQuestions(v)})});});rows.push({assessmentPeriod:period,category:'settings',position:1,content:serializeAssessmentContentSettings(normalizeAssessmentContentModes(modes),selected)});return rows;}
export async function publishLibrary(adminId,body,requestId=null){if(!ASSESSMENT_PERIODS.includes(body.period))throw workspaceError('Choose a valid assessment period.');const rows=catalogRows(body.period,body.content,body.modes,body.defaults);return prisma.$transaction(async tx=>{await lockSharedLibrary(tx);if(requestId&&await tx.assessmentLibraryRevision.findUnique({where:{id:requestId}}))return sharedLibrary(tx);await assertLibraryEditable(tx);const head=await tx.assessmentLibraryHead.findUnique({where:{period:body.period}});if((head?.revisionId||null)!==(body.expected_revision||null))throw workspaceError('The library changed in another window. Reload before publishing.',409);const previous=head?await tx.assessmentLibraryRevision.findUnique({where:{id:head.revisionId}}):null;const revision=await tx.assessmentLibraryRevision.create({data:{...(requestId?{id:requestId}:{}),period:body.period,version:(previous?.version||0)+1,rows,publishedBy:adminId}});await tx.assessmentLibraryHead.upsert({where:{period:body.period},create:{period:body.period,revisionId:revision.id},update:{revisionId:revision.id}});await tx.schoolAssessment.updateMany({where:{period:body.period},data:{catalogRevisionId:revision.id,revision:{increment:1}}});await writeAudit(tx,{actorId:adminId,event:'library.published',count:rows.length,detail:{period:body.period,revisionId:revision.id}});return sharedLibrary(tx);});}
export async function resolveStartPolicy(db,teacherId,year,body){
 if(!ASSESSMENT_PERIODS.includes(body.period))throw workspaceError('Choose BoSY, MoSY or EoSY before starting.',400);
 // Replay an already-conducted signed offline assessment without changing its saved version.
 if(body._offline_replay&&body.offline_window_grant){
  let c;try{c=jwt.verify(body.offline_window_grant,key(),{algorithms:['HS256'],audience:'crl-offline-assessment',ignoreExpiration:true});}catch{throw workspaceError('The saved offline assessment authorization is invalid.',409);}
  if(c.purpose!=='assessment-window'||c.teacherId!==Number(teacherId)||c.schoolYearId!==year.id||c.period!==body.period||!UUID_PATTERN.test(c.catalogRevisionId))throw workspaceError('The saved authorization belongs to another assessment.',403);
  const started=Date.parse(body.offline_started_at||'');
  if(c.policyVersion===2&&(!Number.isFinite(started)||started/1000<c.iat-300||started/1000>c.exp))throw workspaceError('This offline assessment started outside its activation period.',409);
  if(c.policyVersion!==2){const cutover=Number((await db.systemState.findUnique({where:{key:'school_flow_cutover'}}))?.value||0);if(!cutover||!Number.isFinite(started)||started/1000>cutover||c.iat>cutover)throw workspaceError('Synchronize the activated timelines before starting a new assessment.',409);}
  const r=await db.assessmentLibraryRevision.findUnique({where:{id:c.catalogRevisionId}});if(!r||r.period!==c.period)throw workspaceError('The offline content version is unavailable. Progress remains saved.',409);return {period:c.period,revisionId:r.id};
 }
 await db.$queryRaw`SELECT id FROM public.school_assessments WHERE start_year=${year.startYear} AND period=${body.period}::public."AssessmentPeriod" FOR SHARE`;
 const activation=await db.schoolAssessment.findFirst({where:{startYear:year.startYear,period:body.period,isLive:true}});
 if(!activation)throw Object.assign(workspaceError('This timeline is not live for the selected school year. Ask the Reading Coordinator to activate it.',409),{code:'TIMELINE_NOT_LIVE'});
 const r=await db.assessmentLibraryRevision.findUnique({where:{id:activation.catalogRevisionId}});if(!r||r.period!==body.period)throw workspaceError('The activated assessment contents are unavailable.',409);
 return {period:body.period,revisionId:r.id};
}
export async function submitLegacyChange(teacherId,body){
 if(!LEGACY_MANAGED_ACTIONS.has(body.kind))throw workspaceError('This action has no legacy reconciliation route.');
 if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||typeof body.request_key!=='string'||!body.request_key||body.request_key.length>120||JSON.stringify(body.payload).length>250000)throw workspaceError('Invalid retained change.');
 const fields=['save_activities','save_content_mode'].includes(body.kind)?['period','content','modes','mode','defaults']:['id','start_year','school_year_id','name','roster_version'];const payload=Object.fromEntries(fields.filter(k=>Object.hasOwn(body.payload,k)).map(k=>[k,body.payload[k]]));
 const previous=await prisma.coordinatorChangeRequest.findUnique({where:{teacherId_requestKey:{teacherId,requestKey:body.request_key}}});if(!previous&&await prisma.coordinatorChangeRequest.count({where:{teacherId,status:'retained'}})>=100)throw workspaceError('Too many retained legacy drafts. Current assessment work remains saved; contact the Reading Coordinator.',409);
 await prisma.coordinatorChangeRequest.upsert({where:{teacherId_requestKey:{teacherId,requestKey:body.request_key}},create:{teacherId,requestKey:body.request_key,action:body.kind,status:'retained',encryptedPayload:sealPrivateData(payload)},update:{status:'retained'}});
 // Keep old proposals encrypted, without granting retired teacher writes or
 // making a pending-review tab a prerequisite for synchronizing assessments.
 if(['save_activities','save_content_mode'].includes(body.kind))return {status:'approved',result:{...await sharedLibrary(),retained_legacy_draft:true}};
 const {classCatalog}=await import('./classWorkspaces');let match;
 if(['save_school_year','edit_school_year'].includes(body.kind))match=await prisma.schoolYear.findFirst({where:{teacherId,deletedAt:null,...(body.kind==='edit_school_year'?{id:payload.id}:{startYear:Number(payload.start_year)})}});
 else match=await prisma.classSection.findFirst({where:{teacherId,deletedAt:null,schoolYearId:payload.school_year_id,nameKey:String(payload.name||'').trim().replace(/\s+/g,' ').toLowerCase()}});
 if(!match)throw workspaceError('This older saved class is not assigned. Ask the Reading Coordinator to create the matching school year or section in Classes, then synchronize again. All pending assessment work remains saved.',409);
 const key=body.kind==='save_class_section'?'section_alias':'year_alias';return {status:'approved',result:{...await classCatalog(teacherId),...(match.id!==payload.id?{[key]:{from:payload.id,to:match.id}}:{}),retained_legacy_draft:true}};
}
export function reviewPayload(row){return openPrivateData(row.encryptedPayload);}
export function defaultLibraryBody(period){const pool=cloneAssessmentContent(DEFAULT_ASSESSMENT_CONTENT)[period];pool.stories=pool.stories.map(s=>({...s,questions:getStoryQuestions(s).map(q=>({...q,possibleAnswer:q.possibleAnswer||getPossibleStoryAnswer(q.text)}))}));return {period,content:pool,modes:{letters:'fixed',words:'fixed',stories:'fixed'},defaults:{letters:pool.letters.slice(0,10),words:pool.words.slice(0,10),stories:pool.stories.slice(0,2).map(s=>s.title)}};}
// Older mode-only drafts used empty defaults to mean the first required items.
// Preserve that meaning only after explicit coordinator review.
export function legacyPublication(library,action,payload){
 const period=payload.period,content=action==='save_activities'?(payload.content?.[period]||payload.content):library.activities[period],pool=normalizeAssessmentPeriodContent(content),wanted=normalizeAssessmentContentDefaults(action==='save_content_mode'?payload.defaults:library.contentDefaults[period]),defaults={};
 for(const category of ['letters','words','stories']){const keys=category==='stories'?pool.stories.map(s=>s.title):pool[category],required=category==='stories'?2:10;defaults[category]=[...new Set([...wanted[category].filter(k=>keys.includes(k)),...keys])].slice(0,required);}
 return {period,content,modes:action==='save_content_mode'?(payload.modes||payload.mode):library.contentMode[period],defaults};
}
