-- ==============================================================================
-- AURA - STUDENT TABLES (Class 11 and Class 12)
-- Run in: Supabase Dashboard > SQL Editor > New query > Run. Safe to re-run.
-- ==============================================================================

-- Class 11 ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_11_students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone      TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  subject    TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 80),
  email      TEXT UNIQUE CHECK (email IS NULL OR char_length(email) <= 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Class 12 ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_12_students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone      TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  subject    TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 80),
  email      TEXT UNIQUE CHECK (email IS NULL OR char_length(email) <= 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_11_students_subject ON public.class_11_students (subject);
CREATE INDEX IF NOT EXISTS idx_class_12_students_subject ON public.class_12_students (subject);

-- Security: phone numbers are personal data --------------------------------------
-- RLS on, no write policies: only you (Dashboard / service role) can add or edit students.
-- A signed-in student can read ONLY their own row (matched by the email they log in with).
ALTER TABLE public.class_11_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_12_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_11: student reads own row" ON public.class_11_students;
CREATE POLICY "class_11: student reads own row" ON public.class_11_students
  FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "class_12: student reads own row" ON public.class_12_students;
CREATE POLICY "class_12: student reads own row" ON public.class_12_students
  FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT auth.jwt() ->> 'email')));

REVOKE ALL ON public.class_11_students, public.class_12_students FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.class_11_students, public.class_12_students FROM authenticated;
GRANT SELECT ON public.class_11_students, public.class_12_students TO authenticated;

-- Example rows (edit or delete):
-- INSERT INTO public.class_11_students (name, phone, subject, email)
--   VALUES ('Asha Verma', '+919876543210', 'Accountancy', 'asha@example.com');
-- INSERT INTO public.class_12_students (name, phone, subject, email)
--   VALUES ('Rohan Das', '9123456780', 'Economics', 'rohan@example.com');
