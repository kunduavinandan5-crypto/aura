-- ==============================================================================
-- AURA - CLASS 11 & CLASS 12 STUDENT TABLES & AUTHENTICATION
-- Run this in: Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run multiple times (idempotent).
-- ==============================================================================
--
-- HOW IT WORKS:
--   1. You (the Admin) add students directly into either:
--        • class_11_students  (for Class 11 students)
--        • class_12_students  (for Class 12 students)
--      with their name, phone, subject, email, and password.
--
--   2. The student opens the app and logs in with their email (or phone) and password.
--   3. The app automatically determines if they are in Class 11 or Class 12,
--      fetches their name and default subject, and logs them in.
--   4. The student selects a subject in the UI (e.g. Accountancy).
--   5. When they ask questions, the RAG backend receives:
--        • subject: chosen in UI (e.g. "accountancy")
--        • student_class: "11" or "12" (automatically fetched from the table!)
-- ==============================================================================

-- 1. Ensure tables exist ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_11_students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone      TEXT UNIQUE CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{7,15}$'),
  subject    TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 80),
  email      TEXT UNIQUE CHECK (email IS NULL OR char_length(email) <= 320),
  password   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_12_students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone      TEXT UNIQUE CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{7,15}$'),
  subject    TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 80),
  email      TEXT UNIQUE CHECK (email IS NULL OR char_length(email) <= 320),
  password   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add password column if missing (safe if already added) -------------------
ALTER TABLE public.class_11_students ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.class_12_students ADD COLUMN IF NOT EXISTS password TEXT;

-- Phone is optional (a student can log in with just an email). Safe on existing tables.
ALTER TABLE public.class_11_students ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.class_12_students ALTER COLUMN phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_11_students_email ON public.class_11_students (lower(email));
CREATE INDEX IF NOT EXISTS idx_class_12_students_email ON public.class_12_students (lower(email));
CREATE INDEX IF NOT EXISTS idx_class_11_students_phone ON public.class_11_students (phone);
CREATE INDEX IF NOT EXISTS idx_class_12_students_phone ON public.class_12_students (phone);

-- 3. Lock the student tables down ---------------------------------------------
-- The browser must NEVER read these tables directly (they hold passwords and phone numbers).
-- All access goes through the SECURITY DEFINER functions below, which bypass RLS.
ALTER TABLE public.class_11_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_12_students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_11_students, public.class_12_students FROM anon, authenticated;

-- 3b. Server-side brute-force throttle (the browser lock can be bypassed by clearing storage) ----
CREATE TABLE IF NOT EXISTS public.login_attempts (
  login        TEXT PRIMARY KEY,
  fails        INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

-- 3c. Secure Student Login Function (SECURITY DEFINER) ------------------------
-- One call per sign-in. After 10 wrong passwords for the same login the id is locked for 5 minutes
-- (generous on purpose: many students may share one id). Passwords stay plain text so you can read
-- and edit them in the Supabase table editor.
CREATE OR REPLACE FUNCTION public.login_student(p_login TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_login TEXT;
  v_pass  TEXT;
  v_att   RECORD;
BEGIN
  v_login := lower(trim(p_login));
  IF position('@' in v_login) = 0 THEN
    v_login := regexp_replace(v_login, '[\s-]', '', 'g');
  END IF;
  v_pass := trim(p_password);

  SELECT * INTO v_att FROM public.login_attempts WHERE login = v_login;
  IF FOUND AND v_att.locked_until IS NOT NULL AND v_att.locked_until > now() THEN
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  SELECT id, name, email, phone, subject, 'Class 11' AS student_class
  INTO v_student
  FROM public.class_11_students
  WHERE (lower(email) = v_login OR phone = v_login)
    AND password = v_pass
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT id, name, email, phone, subject, 'Class 12' AS student_class
    INTO v_student
    FROM public.class_12_students
    WHERE (lower(email) = v_login OR phone = v_login)
      AND password = v_pass
    LIMIT 1;
  END IF;

  IF FOUND THEN
    DELETE FROM public.login_attempts WHERE login = v_login;
    RETURN to_jsonb(v_student);
  END IF;

  INSERT INTO public.login_attempts AS la (login, fails, updated_at)
  VALUES (v_login, 1, now())
  ON CONFLICT (login) DO UPDATE
    SET fails        = CASE WHEN la.locked_until IS NOT NULL AND la.locked_until <= now() THEN 1 ELSE la.fails + 1 END,
        locked_until = CASE
                         WHEN (CASE WHEN la.locked_until IS NOT NULL AND la.locked_until <= now() THEN 1 ELSE la.fails + 1 END) >= 10
                         THEN now() + interval '5 minutes'
                         ELSE NULL
                       END,
        updated_at   = now();
  RETURN NULL;
END;
$$;

-- 4. Lookup Student by Email or Phone (refreshes class/subject; never returns the password) ------
CREATE OR REPLACE FUNCTION public.get_student_by_email(p_identifier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_clean TEXT;
BEGIN
  v_clean := lower(trim(p_identifier));
  IF position('@' in v_clean) = 0 THEN
    v_clean := regexp_replace(v_clean, '[\s-]', '', 'g');
  END IF;

  -- Check Class 11
  SELECT id, name, email, phone, subject, 'Class 11' AS student_class
  INTO v_student
  FROM public.class_11_students
  WHERE lower(email) = v_clean OR phone = v_clean
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_student);
  END IF;

  -- Check Class 12
  SELECT id, name, email, phone, subject, 'Class 12' AS student_class
  INTO v_student
  FROM public.class_12_students
  WHERE lower(email) = v_clean OR phone = v_clean
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_student);
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Grant permissions to call these functions --------------------------------
GRANT EXECUTE ON FUNCTION public.login_student(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_by_email(TEXT) TO anon, authenticated;

-- ==============================================================================
-- EXAMPLE: HOW TO ADD STUDENTS (Run in SQL Editor or use Table Editor UI)
-- ==============================================================================
--
-- Class 11 Student:
-- INSERT INTO public.class_11_students (name, phone, subject, email, password)
-- VALUES (
--   'Asha Verma',
--   '9876543210',
--   'Accountancy',
--   'asha@example.com',
--   'study123'
-- );
--
-- Class 12 Student:
-- INSERT INTO public.class_12_students (name, phone, subject, email, password)
-- VALUES (
--   'Rohan Das',
--   '9876543211',
--   'Accountancy',
--   'rohan@example.com',
--   'study123'
-- );
