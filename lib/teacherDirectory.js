// One source of truth for assigned, non-deleted classes across coordinator lists.
export const teacherSectionCounts={_count:{select:{classSections:{where:{deletedAt:null,unassignedAt:null,schoolYear:{deletedAt:null}}}}}};
