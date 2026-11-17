-- Independent database-side 60-second disconnect expiry.
-- Only unfinished runs are canceled. Never mutate a completed scoresheet.
-- When one active peer session expires, all unfinished sessions for that
-- teacher/class section are canceled in the same transaction.
-- pg_cron runs even if both devices/browser tabs are closed.
CREATE OR REPLACE FUNCTION public.crl_expire_assessment_hosts()
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutoff timestamptz;
  now_at timestamptz;
  target record;
  candidate record;
  host_ids integer[];
  draft_ids integer[];
  closed integer := 0;
  batch_count integer;
BEGIN
  -- Lock order matches the assessment start/library publisher. A concurrent
  -- start cannot slip in while a teacher's class is being canceled.
  PERFORM pg_advisory_xact_lock(177631, 1);
  now_at := statement_timestamp();
  cutoff := now_at - interval '60 seconds';

  FOR target IN
    SELECT h.teacher_id, l.class_section_id
    FROM public.host_sessions h
    JOIN public.learners l ON l.id = h.learner_id AND l.teacher_id = h.teacher_id
    JOIN public.assessment_sessions a ON a.id = h.assessment_session_id AND NOT a.is_completed
    LEFT JOIN public.assessment_presence p ON p.host_session_id = h.id
    WHERE NOT h.ended AND (
      (
        h.linked_at IS NOT NULL
        AND h.stage IN ('connected', 'letter', 'word', 'story_choice',
                        'passage', 'comprehension', 'learner_experience')
        -- Teacher challenge is sent regardless of whether the peer uses
        -- WebRTC, realtime or the learner HTTP acknowledgement fallback.
        AND coalesce(p.teacher_seen_at, h.linked_at) <= cutoff
      )
      -- Retain the established 24h manual teacher-review recovery window.
      -- Invitations and review screens are not peer-disconnect stages.
      OR greatest(h.updated_at, h.created_at,
                  coalesce(p.teacher_seen_at, h.created_at))
         < now_at - interval '24 hours'
    )
    GROUP BY h.teacher_id, l.class_section_id
    ORDER BY h.teacher_id, l.class_section_id
  LOOP
    host_ids := ARRAY[]::integer[];
    draft_ids := ARRAY[]::integer[];
    -- Serialize against final save, which also locks each host first.
    -- Stop only unfinished work from this teacher and this section.
    FOR candidate IN
      SELECT h.id, h.assessment_session_id
      FROM public.host_sessions h
      JOIN public.learners l ON l.id = h.learner_id AND l.teacher_id = h.teacher_id
      LEFT JOIN public.assessment_sessions a ON a.id = h.assessment_session_id
      WHERE h.teacher_id = target.teacher_id
        AND l.class_section_id = target.class_section_id
        AND NOT h.ended AND (a.id IS NULL OR NOT a.is_completed)
      ORDER BY h.id
      FOR UPDATE OF h
    LOOP
      host_ids := array_append(host_ids, candidate.id);
      IF candidate.assessment_session_id IS NOT NULL THEN
        draft_ids := array_append(draft_ids, candidate.assessment_session_id);
      END IF;
    END LOOP;

    IF array_length(host_ids, 1) IS NOT NULL THEN
      UPDATE public.host_sessions
      SET ended = true, stage = 'ended', linked_at = NULL,
          assessment_session_id = NULL,
          current_content = 'Assessment ended after the one-minute connection grace period.',
          updated_at = now_at
      WHERE id = ANY(host_ids) AND NOT ended;
      GET DIAGNOSTICS batch_count = ROW_COUNT;
      closed := closed + batch_count;
      -- ON DELETE CASCADE removes answers, miscues and metrics from canceled
      -- drafts; a completed result is protected even under concurrent saves.
      IF array_length(draft_ids, 1) IS NOT NULL THEN
        DELETE FROM public.assessment_sessions
        WHERE id = ANY(draft_ids) AND NOT is_completed;
      END IF;
    END IF;
  END LOOP;
  RETURN closed;
END;
$$;
REVOKE ALL ON FUNCTION public.crl_expire_assessment_hosts() FROM PUBLIC, anon, authenticated;

-- Always-on server sweep: the frontend's 60-second timer is not a dependency.
SELECT cron.schedule(
  'crl-expire-disconnected-assessments',
  '15 seconds',
  'SELECT public.crl_expire_assessment_hosts();'
);
