-- Additive rollout: apply before code that selects these fields.
-- No changes to existing records, grants, policies, definitions or live data.
ALTER TABLE public.global_school_years ADD COLUMN IF NOT EXISTS purged_at timestamptz;
ALTER TABLE public.school_sections ADD COLUMN IF NOT EXISTS purged_at timestamptz;
