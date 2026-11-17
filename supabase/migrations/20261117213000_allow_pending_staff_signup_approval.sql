-- CRL-2026-11-17.6. Retain the school boundary; allow approval-based
-- teacher applications to exist before a coordinator is assigned.
-- The old invitation-era trigger required coordinator_id on every INSERT,
-- so a valid inactive teacher signup failed with HTTP 503.
-- It also rejected the coordinator assignment performed on approval under
-- the school-scoped crl_school role.
-- This changes no account data and never bypasses same-school validation.
CREATE OR REPLACE FUNCTION crl_private.guard_account_school()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF current_user = 'crl_school' THEN
    IF TG_OP = 'INSERT' AND NEW.role <> 'teacher' THEN
      RAISE EXCEPTION 'Account role change is not permitted';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.school_id IS DISTINCT FROM OLD.school_id THEN
        RAISE EXCEPTION 'Account school/role changes require platform administration';
      END IF;
      IF NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id THEN
        -- A reviewer who has been checked by reviewStaffSignup may claim
        -- an unassigned pending teacher in their *same* school. The ordinary
        -- teacher-coordinator relationship is validated below as well.
        IF NOT (
          OLD.role = 'teacher'
          AND OLD.approval_status = 'pending'
          AND OLD.is_active = false
          AND OLD.coordinator_id IS NULL
          AND NEW.role = 'teacher'
          AND NEW.approval_status = 'approved'
          AND NEW.is_active = true
          AND NEW.coordinator_id IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Account school/role changes require platform administration';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.role IN ('teacher', 'reading_coordinator')
     AND NEW.school_id IS NULL THEN
    RAISE EXCEPTION 'An assigned school is required';
  END IF;

  IF NEW.role = 'teacher' THEN
    IF NEW.coordinator_id IS NULL THEN
      -- Pending registration and a rejected application are inactive.
      -- On approval, the Reading Coordinator must be recorded atomically.
      IF NEW.is_active OR NEW.approval_status NOT IN ('pending', 'rejected') THEN
        RAISE EXCEPTION 'An approved teacher requires a Reading Coordinator';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.users c
       WHERE c.id = NEW.coordinator_id
         AND c.role = 'reading_coordinator'
         AND c.school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'The teacher Reading Coordinator must belong to the selected school';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
