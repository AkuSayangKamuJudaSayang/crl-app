export const SIGN_IN_EVENTS=['login','sign_in','signin','signed_in','account.signed_in','account.login'];
const LABELS={
 'account.registered':'Account registered','school.created':'School registered','coordinator.invite.created':'Coordinator invited','admin.invite.created':'Administrator invited','coordinator.access.changed':'Coordinator access changed','teacher.access.changed':'Teacher access changed','school_year.deleted':'School year deleted','class.deleted':'Class deleted',
 'assessment.activation.changed':'Assessment timeline updated','archives.permanently_deleted':'Learner archives deleted',
 'account.unlocked':'Teacher account unlocked','account.unlock_dismissed':'Unlock request dismissed','account.approval_requested':'Staff signup requested','account.approved':'Account approved','account.rejected':'Registration rejected',
 'learner.created':'Learner added','learner.deleted':'Learner deleted','learners.deleted':'Learners deleted','learners.imported':'Learners imported','learners.backup_imported':'Learner backup imported','learners.restored':'Learners restored',
 'section.assigned':'Section assigned','section.reassigned':'Section reassigned','section.removed_from_year':'Section removed from school year','section.teacher_unassigned':'Teacher unassigned from section','section.settings.changed':'Section settings updated','sections.inserted':'Sections added to school year',
 'school_year.created_globally':'School year created','school_year.deleted_globally':'School year deleted','school_year.archived':'School year archived','school_year.imported':'School year imported',
 'class.archived':'Class archived','class.imported':'Class imported','coordinator.class_managed':'Class records updated','content.changed':'Assessment content updated','library.published':'Assessment contents published',
 'invite.generated':'Registration code created','invite.revoked':'Registration code revoked','teacher.registered':'Teacher registered','report.deleted':'Report deleted',
 'backup.created':'Backup created','backup.renamed':'Backup renamed','backup.deleted':'Backup deleted','recovery.restored':'Records recovered'
};
export function auditEventLabel(event){if(LABELS[event])return LABELS[event];const words=String(event||'Activity recorded').replace(/[._-]+/g,' ').trim();return words?words[0].toUpperCase()+words.slice(1):'Activity recorded';}
