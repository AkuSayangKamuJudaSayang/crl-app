-- Connection proof is separate from assessment timestamps, items and scores.
CREATE TABLE public.assessment_presence (
  host_session_id integer PRIMARY KEY REFERENCES public.host_sessions(id) ON DELETE CASCADE,
  teacher_nonce varchar(100) NOT NULL,
  teacher_challenges jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_seen_at timestamptz NOT NULL,
  teacher_status varchar(20) NOT NULL CHECK (teacher_status IN ('active', 'interrupted')),
  recovering boolean NOT NULL DEFAULT false,
  learner_nonce varchar(100),
  learner_seen_at timestamptz
);
ALTER TABLE public.assessment_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessment_presence FROM anon, authenticated;
