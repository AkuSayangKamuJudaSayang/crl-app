# CRL-App Teacher Section Isolation Fix

This package contains the complete original teacher page and the complete assessment/report API files with section isolation integrated.

## Security behavior

A teacher's learner-facing dashboard data is now scoped by both:

- the authenticated teacher account (`teacherId`), and
- the teacher's current section (`section`, compared case-insensitively).

This means a learner with a different section will not be returned to that teacher even if a legacy/misassigned database row happens to have the same `teacher_id`.

### Covered operations

- `get_learners`: roster is restricted to the teacher account and section.
- `get_assessments`: assessment history is restricted to the teacher account and learner section.
- `delete_learner`: cannot delete a learner outside the teacher's section.
- `host_start`: cannot start an assessment for a learner outside the teacher's section.
- All teacher host-session lookups (`host_get`, update/end, task recording, finalize, etc.) require the linked learner to be in the teacher's section.
- Excel scoresheet/class-summary exports are restricted to the teacher's section.
- The teacher page also applies a client-side section filter as a second line of defense.

## Missing section behavior

If a teacher has no section configured, the assessment API refuses teacher learner-record operations with HTTP 403 rather than falling back to an unscoped learner query.

## Existing database data

This fix does not automatically modify database rows. It prevents mismatched rows from being exposed through the teacher application.

Use the following diagnostic query in Supabase SQL Editor to find legacy mismatches before deciding how to reassign them:

```sql
SELECT
    l.id,
    l.lrn,
    l.first_name,
    l.last_name,
    l.section AS learner_section,
    u.id AS teacher_id,
    u.username AS teacher_username,
    u.section AS teacher_section
FROM public.learners AS l
JOIN public.users AS u
    ON u.id = l.teacher_id
WHERE LOWER(TRIM(COALESCE(l.section, '')))
   <> LOWER(TRIM(COALESCE(u.section, '')))
ORDER BY u.username, l.last_name, l.first_name;
```

Review the returned rows manually. Do not run an automatic mass-update without confirming which teacher/section each learner belongs to.
