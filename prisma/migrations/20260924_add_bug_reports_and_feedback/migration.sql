-- Public landing-page submissions.
-- Bugs and feedback live in separate tables so the administrator dashboard can
-- present them as two distinct fields.
-- Idempotent: safe to re-run if the tables already exist.

CREATE TABLE IF NOT EXISTS "bug_reports" (
  "id"          SERIAL PRIMARY KEY,
  "name"        VARCHAR(100),
  "contact"     VARCHAR(254),
  "message"     VARCHAR(4000) NOT NULL,
  "page_url"    VARCHAR(500),
  "user_agent"  VARCHAR(500),
  "is_resolved" BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "bug_reports_created_at_idx" ON "bug_reports" ("created_at");
CREATE INDEX IF NOT EXISTS "bug_reports_is_resolved_idx" ON "bug_reports" ("is_resolved");

CREATE TABLE IF NOT EXISTS "feedback" (
  "id"          SERIAL PRIMARY KEY,
  "name"        VARCHAR(100),
  "contact"     VARCHAR(254),
  "message"     VARCHAR(4000) NOT NULL,
  "page_url"    VARCHAR(500),
  "user_agent"  VARCHAR(500),
  "is_resolved" BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "feedback_created_at_idx" ON "feedback" ("created_at");
CREATE INDEX IF NOT EXISTS "feedback_is_resolved_idx" ON "feedback" ("is_resolved");

-- Both tables share the same shape. Applied separately so a database created
-- from an earlier revision of this migration is brought up to date too.
ALTER TABLE "bug_reports" ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(500);
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(500);
