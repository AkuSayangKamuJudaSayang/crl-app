import {UUID_PATTERN,sectionName,workspaceError} from './classWorkspace.mjs';
export async function importSection(tx,teacherId,input){
 if(!UUID_PATTERN.test(input.id)||!UUID_PATTERN.test(input.schoolYearId))throw workspaceError('Choose a valid school year.');
 const name=sectionName(input.name),nameKey=name.toLowerCase();
 await tx.$queryRaw`SELECT id FROM public.school_years WHERE id=${input.schoolYearId}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
 const year=await tx.schoolYear.findFirst({where:{id:input.schoolYearId,teacherId,deletedAt:null,archivedAt:null}});if(!year)throw workspaceError('Choose an active assigned school year.',409);
 const same=await tx.classSection.findUnique({where:{id:input.id}});if(same){if(same.teacherId!==teacherId||same.schoolYearId!==year.id||same.nameKey!==nameKey||same.deletedAt||same.archivedAt)throw workspaceError('This section request changed. Reopen Add section.',409);return same;}
 if(await tx.classSection.findFirst({where:{teacherId,schoolYearId:year.id,nameKey,deletedAt:null}}))throw workspaceError('This section already exists. Choose Existing section to import learners.',409);
 return tx.classSection.create({data:{id:input.id,teacherId,schoolYearId:year.id,name,nameKey}});
}
