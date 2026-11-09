alter table public.assessment_sessions
  add column if not exists story_number integer;

alter table public.host_sessions
  add column if not exists assessment_selection jsonb;
