ALTER TABLE public.class_sections
  ADD COLUMN IF NOT EXISTS unassigned_at timestamp;
