-- Additive login protection. Account state is accessible only through server
-- Prisma connections; public Data API roles cannot read or modify requests.
ALTER TABLE public.users
  ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts BETWEEN 0 AND 7),
  ADD COLUMN login_locked_until TIMESTAMP(3),
  ADD COLUMN login_lock_id UUID;

CREATE TABLE public.account_unlock_requests (
  id UUID PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lock_id UUID NOT NULL,
  locked_until TIMESTAMP(3) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP(3),
  resolved_by_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (teacher_id, lock_id)
);
CREATE INDEX account_unlock_requests_created_at_id_idx ON public.account_unlock_requests(created_at, id);
ALTER TABLE public.account_unlock_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_unlock_requests FROM PUBLIC, anon, authenticated;
