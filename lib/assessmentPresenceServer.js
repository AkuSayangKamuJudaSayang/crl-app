import { Prisma } from "@prisma/client";

// A live, short-lived challenge relay. It never writes assessment progress,
// updated_at, scores or the offline outbox. Public reads expose only a nonce.
export async function relayTeacherPresence(db, { code, teacherId, nonce, status, recovering }) {
  return db.$queryRaw(Prisma.sql`
    INSERT INTO public.assessment_presence AS p
      (host_session_id, teacher_nonce, teacher_challenges, teacher_seen_at, teacher_status, recovering)
    SELECT h.id, ${nonce}, jsonb_build_array(jsonb_build_object('nonce', ${nonce}::text, 'issued_at', statement_timestamp())),
      statement_timestamp(), ${status}, ${recovering}
    FROM public.host_sessions h
    WHERE h.code = ${code} AND h.teacher_id = ${teacherId} AND NOT h.ended
      AND h.learner_id IS NOT NULL AND h.assessment_session_id IS NOT NULL
    ON CONFLICT (host_session_id) DO UPDATE SET
      teacher_nonce = EXCLUDED.teacher_nonce,
      teacher_challenges = (
        SELECT COALESCE(jsonb_agg(recent.challenge), '[]'::jsonb)
        FROM (
          SELECT challenge FROM jsonb_array_elements(p.teacher_challenges || EXCLUDED.teacher_challenges) challenge
          WHERE (challenge->>'issued_at')::timestamptz > statement_timestamp() - interval '15 seconds'
          ORDER BY (challenge->>'issued_at')::timestamptz DESC LIMIT 8
        ) recent
      ),
      teacher_seen_at = EXCLUDED.teacher_seen_at,
      teacher_status = EXCLUDED.teacher_status,
      recovering = EXCLUDED.recovering
    RETURNING learner_nonce
  `);
}

export async function readTeacherPresence(db, code) {
  return db.$queryRaw(Prisma.sql`
    SELECT p.teacher_nonce AS nonce, p.teacher_status AS status, p.recovering
    FROM public.assessment_presence p JOIN public.host_sessions h ON h.id = p.host_session_id
    WHERE h.code = ${code} AND NOT h.ended AND h.linked_at IS NOT NULL
      AND h.learner_id IS NOT NULL AND h.assessment_session_id IS NOT NULL
      AND p.teacher_seen_at > statement_timestamp() - interval '15 seconds'
  `);
}

export async function acknowledgeTeacherPresence(db, code, nonce) {
  return db.$queryRaw(Prisma.sql`
    UPDATE public.assessment_presence p SET learner_nonce = ${nonce}, learner_seen_at = statement_timestamp(),
      teacher_challenges = (SELECT COALESCE(jsonb_agg(challenge), '[]'::jsonb)
        FROM jsonb_array_elements(p.teacher_challenges) challenge WHERE challenge->>'nonce' <> ${nonce})
    FROM public.host_sessions h
    WHERE h.id = p.host_session_id AND h.code = ${code} AND NOT h.ended AND h.linked_at IS NOT NULL
      AND h.learner_id IS NOT NULL AND h.assessment_session_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.teacher_challenges) challenge
        WHERE challenge->>'nonce' = ${nonce}
          AND (challenge->>'issued_at')::timestamptz > statement_timestamp() - interval '15 seconds')
    RETURNING p.host_session_id
  `);
}
