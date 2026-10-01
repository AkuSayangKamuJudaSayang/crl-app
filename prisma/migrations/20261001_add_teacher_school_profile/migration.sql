ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "school_id" VARCHAR(6),
ADD COLUMN IF NOT EXISTS "school_name" VARCHAR(150);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_school_id_format'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_school_id_format"
    CHECK ("school_id" IS NULL OR "school_id" ~ '^[0-9]{6}$');
  END IF;
END
$$;
