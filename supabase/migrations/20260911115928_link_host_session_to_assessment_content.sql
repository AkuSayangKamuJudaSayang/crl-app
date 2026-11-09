alter table public.host_sessions
  add column if not exists assessment_content_id bigint;

alter table public.host_sessions
  drop constraint if exists host_sessions_assessment_content_id_fkey;

alter table public.host_sessions
  add constraint host_sessions_assessment_content_id_fkey
  foreign key (assessment_content_id)
  references public.assessment_content(id)
  on delete set null;

create index if not exists host_sessions_assessment_content_id_idx
  on public.host_sessions(assessment_content_id);
