-- Keep teacher recommendations on the enrollment, independent of scoresheet remarks.
alter table public.learners
  add column if not exists period_recommendations jsonb not null default '{}'::jsonb;
