-- ==============================================================================
-- AURA - FEEDBACK TABLES (separate tables for good and bad answers)
-- Run in: Supabase Dashboard > SQL Editor > New query > Run. Safe to re-run.
--
--   feedback_positive : answers a student marked as helpful (thumbs up)
--   feedback_negative : answers a student marked as wrong/unhelpful (thumbs down), with reason + comment
--
-- Each row stores the student's QUESTION and the ANSWER they were given, so you can review exactly
-- what went wrong. Students can only add rows; only you (dashboard / service role) can read them.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.feedback_positive (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  question      TEXT NOT NULL CHECK (char_length(question) <= 4000),
  answer        TEXT CHECK (char_length(answer) <= 20000),
  subject       TEXT CHECK (char_length(subject) <= 80),
  student_class TEXT CHECK (char_length(student_class) <= 80),
  student_email TEXT CHECK (char_length(student_email) <= 320),
  student_id    TEXT CHECK (char_length(student_id) <= 80)
);

CREATE TABLE IF NOT EXISTS public.feedback_negative (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  question      TEXT NOT NULL CHECK (char_length(question) <= 4000),
  answer        TEXT CHECK (char_length(answer) <= 20000),
  reason        TEXT CHECK (char_length(reason) <= 200),
  comment       TEXT CHECK (char_length(comment) <= 2000),
  subject       TEXT CHECK (char_length(subject) <= 80),
  student_class TEXT CHECK (char_length(student_class) <= 80),
  student_email TEXT CHECK (char_length(student_email) <= 320),
  student_id    TEXT CHECK (char_length(student_id) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_feedback_positive_created ON public.feedback_positive (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_negative_created ON public.feedback_negative (created_at DESC);

ALTER TABLE public.feedback_positive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_negative ENABLE ROW LEVEL SECURITY;

-- Anyone using the app (signed in through Supabase Auth or through the class tables) may add feedback...
DROP POLICY IF EXISTS "feedback_positive: insert" ON public.feedback_positive;
CREATE POLICY "feedback_positive: insert" ON public.feedback_positive
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "feedback_negative: insert" ON public.feedback_negative;
CREATE POLICY "feedback_negative: insert" ON public.feedback_negative
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ...but nobody can read them through the app (no SELECT policy). You read them in the Table Editor.
REVOKE ALL ON public.feedback_positive, public.feedback_negative FROM anon, authenticated;
GRANT INSERT ON public.feedback_positive, public.feedback_negative TO anon, authenticated;
