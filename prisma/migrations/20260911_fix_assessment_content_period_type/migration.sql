-- Reconcile the live Supabase schema with prisma/schema.prisma.
-- Some existing deployments created assessment_content.assessment_period as text,
-- while Prisma expects the AssessmentPeriod enum. The mismatch causes Prisma reads
-- from getLiveAssessmentContent() to fail with a text = AssessmentPeriod operator error.
-- Keep this migration idempotent so it is safe to deploy after manual repair.

DO $$
DECLARE
  column_type text;
BEGIN
  SELECT data_type
    INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'assessment_content'
    AND column_name = 'assessment_period';

  IF column_type = 'text' THEN
    ALTER TABLE public.assessment_content
      DROP CONSTRAINT IF EXISTS assessment_content_assessment_period_check;

    ALTER TABLE public.assessment_content
      ALTER COLUMN assessment_period TYPE "AssessmentPeriod"
      USING assessment_period::"AssessmentPeriod";

    ALTER TABLE public.assessment_content
      ADD CONSTRAINT assessment_content_assessment_period_check
      CHECK (
        assessment_period IN (
          'BoSY'::"AssessmentPeriod",
          'MoSY'::"AssessmentPeriod",
          'EoSY'::"AssessmentPeriod"
        )
      );
  END IF;
END $$;
