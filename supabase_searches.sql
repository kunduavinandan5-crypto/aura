-- ==============================================================================
-- AURA - STUDENT SEARCH LOG (user_searches) FOR CLASS-TABLE STUDENTS
-- Run in: Supabase Dashboard > SQL Editor > New query > Run. Safe to re-run.
--
-- Problem: user_searches.user_id pointed at auth.users and only signed-in Supabase Auth users could
-- write, but students log in through class_11_students / class_12_students (no Auth account), so
-- none of their questions were recorded. This lets those students add rows (and only add: they
-- cannot read or change anyone's searches). You read the log in the Table Editor.
-- ==============================================================================

-- 1. Remove the foreign key to auth.users (class-table student ids are not in auth.users) -------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.user_searches'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.user_searches DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2. Who asked: email + class next to the id -----------------------------------------------------
ALTER TABLE public.user_searches ADD COLUMN IF NOT EXISTS student_email TEXT CHECK (char_length(student_email) <= 320);
ALTER TABLE public.user_searches ADD COLUMN IF NOT EXISTS student_class TEXT CHECK (char_length(student_class) <= 80);

-- 3. Allow adding rows from the app for students without a Supabase Auth session -----------------
DROP POLICY IF EXISTS "user_searches: student insert" ON public.user_searches;
CREATE POLICY "user_searches: student insert" ON public.user_searches
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT INSERT ON public.user_searches TO anon;
