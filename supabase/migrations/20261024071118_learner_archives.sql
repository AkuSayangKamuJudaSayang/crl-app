-- Additive rollout: legacy rows remain section archives. No learner data is deleted.
ALTER TABLE public.class_archives
  ADD COLUMN IF NOT EXISTS kind varchar(12) NOT NULL DEFAULT 'section',
  ADD COLUMN IF NOT EXISTS source_learner_id integer,
  ADD COLUMN IF NOT EXISTS learner_name varchar(220);
ALTER TABLE public.class_archives ADD CONSTRAINT class_archives_kind_check
  CHECK ((kind = 'section' AND source_learner_id IS NULL AND learner_name IS NULL)
      OR (kind = 'learner' AND source_learner_id IS NOT NULL AND learner_name IS NOT NULL AND learner_count = 1));
-- This app uses authenticated, teacher-scoped server routes, not public Data API access.
ALTER TABLE public.class_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_archives FROM PUBLIC, anon, authenticated;
