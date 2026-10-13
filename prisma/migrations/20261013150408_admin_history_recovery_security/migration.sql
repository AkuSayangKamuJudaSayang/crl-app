-- AlterTable
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "used_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "used_by_id" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_audit_events" (
    "id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "teacher_id" INTEGER,
    "event" VARCHAR(40) NOT NULL,
    "entity_count" INTEGER NOT NULL DEFAULT 1,
    "group_key" VARCHAR(100),
    "encrypted_detail" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_recovery_items" (
    "id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "teacher_id" INTEGER,
    "kind" VARCHAR(30) NOT NULL,
    "entity_count" INTEGER NOT NULL,
    "encrypted_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "restored_at" TIMESTAMP(3),
    "restored_by_id" INTEGER,

    CONSTRAINT "admin_recovery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "security_rate_buckets" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_rate_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "admin_audit_events_group_key_key" ON "admin_audit_events"("group_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_events_teacher_id_created_at_idx" ON "admin_audit_events"("teacher_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_events_created_at_idx" ON "admin_audit_events"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_recovery_items_teacher_id_created_at_idx" ON "admin_recovery_items"("teacher_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_recovery_items_expires_at_idx" ON "admin_recovery_items"("expires_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "security_rate_buckets_expires_at_idx" ON "security_rate_buckets"("expires_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invite_codes_used_by_id_idx" ON "invite_codes"("used_by_id");

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invite_codes_used_by_id_fkey') THEN
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END IF; END $$;

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.admin_recovery_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_recovery_items FROM PUBLIC, anon, authenticated;

ALTER TABLE public.security_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_rate_buckets FROM PUBLIC, anon, authenticated;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin_session_version INTEGER NOT NULL DEFAULT 0;
