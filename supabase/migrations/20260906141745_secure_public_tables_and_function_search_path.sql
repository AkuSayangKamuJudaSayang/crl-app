alter table public.assessment_content enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.comprehension_results enable row level security;
alter table public.host_sessions enable row level security;
alter table public.invite_codes enable row level security;
alter table public.learners enable row level security;
alter table public.letter_task_results enable row level security;
alter table public.passage_miscues enable row level security;
alter table public.session_metrics enable row level security;
alter table public.users enable row level security;
alter table public.word_task_results enable row level security;

create policy assessment_content_deny_public on public.assessment_content as restrictive for all to anon, authenticated using (false) with check (false);
create policy assessment_sessions_deny_public on public.assessment_sessions as restrictive for all to anon, authenticated using (false) with check (false);
create policy comprehension_results_deny_public on public.comprehension_results as restrictive for all to anon, authenticated using (false) with check (false);
create policy host_sessions_deny_public on public.host_sessions as restrictive for all to anon, authenticated using (false) with check (false);
create policy invite_codes_deny_public on public.invite_codes as restrictive for all to anon, authenticated using (false) with check (false);
create policy learners_deny_public on public.learners as restrictive for all to anon, authenticated using (false) with check (false);
create policy letter_task_results_deny_public on public.letter_task_results as restrictive for all to anon, authenticated using (false) with check (false);
create policy passage_miscues_deny_public on public.passage_miscues as restrictive for all to anon, authenticated using (false) with check (false);
create policy session_metrics_deny_public on public.session_metrics as restrictive for all to anon, authenticated using (false) with check (false);
create policy users_deny_public on public.users as restrictive for all to anon, authenticated using (false) with check (false);
create policy word_task_results_deny_public on public.word_task_results as restrictive for all to anon, authenticated using (false) with check (false);

alter function public.set_assessment_content_updated_at() set search_path = public;

create index if not exists invite_codes_generated_by_idx on public.invite_codes (generated_by);
