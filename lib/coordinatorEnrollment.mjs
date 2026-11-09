import {learnerIdentityConflict,workspaceError} from './classWorkspace.mjs';
export function normalizeEnrollment(items){
 if(!Array.isArray(items)||!items.length||items.length>100)throw workspaceError('Add 1 to 100 learners per batch.');
 const normalized=items.map((item,index)=>{
  const v={lrn:String(item.lrn||'').trim(),firstName:String(item.first_name||'').trim().toUpperCase(),lastName:String(item.last_name||'').trim().toUpperCase(),middleName:String(item.middle_name||'').trim().toUpperCase(),suffix:String(item.suffix||'').trim().toUpperCase(),sex:item.sex};
  if(!/^\d{10,12}$/.test(v.lrn)||!v.firstName||!v.lastName||v.firstName.length>50||v.lastName.length>50||v.middleName.length>50||v.suffix.length>20||!['Male','Female'].includes(v.sex))throw workspaceError(`Learner ${index+1}: enter a valid LRN, first name, last name and sex.`);
  return v;
 });
 for(let i=0;i<normalized.length;i++)if(learnerIdentityConflict(normalized.slice(0,i),normalized[i]))throw workspaceError(`Learner ${i+1}: this name or LRN is already in this batch.`,409);
 return normalized;
}
export function validateEnrollmentConflicts(existing,items){
 for(let i=0;i<items.length;i++)if(learnerIdentityConflict(existing,items[i]))throw workspaceError(`Learner ${i+1}: a learner with this name or LRN already exists in this school year.`,409);
}
