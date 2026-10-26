-- Retained metadata only: backups and restore receipts survive source deletion.
ALTER TABLE public.class_archives
  ADD COLUMN deletion_group_id uuid,
  ADD COLUMN restored_at timestamp(3),
  ADD COLUMN restored_section_id uuid;
ALTER TABLE public.class_archives ADD CONSTRAINT class_archives_restore_receipt_check
 CHECK ((restored_at IS NULL AND restored_section_id IS NULL) OR
        (kind = 'learner' AND restored_at IS NOT NULL AND restored_section_id IS NOT NULL));
ALTER TABLE public.class_archives ADD CONSTRAINT class_archives_deletion_group_check
 CHECK (deletion_group_id IS NULL OR kind = 'learner');
CREATE INDEX class_archives_teacher_deletion_group_idx
 ON public.class_archives (teacher_id, deletion_group_id) WHERE deletion_group_id IS NOT NULL;
ALTER TABLE public.class_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_archives FROM PUBLIC, anon, authenticated;
