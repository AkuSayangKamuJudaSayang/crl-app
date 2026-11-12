-- Existing school staff remain approved without changing is_active.
-- New code registers teacher/Reading Coordinator accounts with
-- approval_status='pending' and is_active=false.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approval_status varchar(16) NOT NULL DEFAULT 'approved';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
      WHERE conname='users_approval_status_check' AND conrelid='public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_approval_status_check
      CHECK (approval_status IN ('approved','pending','rejected'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS users_pending_school_approvals_idx
  ON public.users (school_id,role,created_at)
  WHERE approval_status='pending' AND is_active=false;
