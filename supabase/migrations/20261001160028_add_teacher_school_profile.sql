ALTER TABLE "users"
ADD COLUMN "school_id" VARCHAR(6),
ADD COLUMN "school_name" VARCHAR(150);

ALTER TABLE "users"
ADD CONSTRAINT "users_school_id_format"
CHECK ("school_id" IS NULL OR "school_id" ~ '^[0-9]{6}$');
