-- Nullable name parts preserve existing accounts and legacy full_name clients.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS name_suffix VARCHAR(15);
