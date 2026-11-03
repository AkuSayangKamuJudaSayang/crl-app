-- Additive metadata only. Existing encrypted recovery snapshots and expiry dates remain intact.
ALTER TABLE public.admin_recovery_items
  ADD COLUMN IF NOT EXISTS backup_name varchar(100),
  ADD COLUMN IF NOT EXISTS backup_teacher_ids integer[] NOT NULL DEFAULT '{}';
UPDATE public.admin_recovery_items
SET backup_name='Earlier backup - ' || to_char(created_at,'YYYY-MM-DD'),
    backup_teacher_ids=CASE WHEN teacher_id IS NULL THEN '{}'::integer[] ELSE ARRAY[teacher_id] END
WHERE kind='backup' AND backup_name IS NULL;
CREATE INDEX IF NOT EXISTS admin_recovery_backups_page_idx
ON public.admin_recovery_items(created_at DESC,id DESC)
WHERE kind IN ('backup','records_backup');
-- RLS and the existing backend-only grants are deliberately preserved.
