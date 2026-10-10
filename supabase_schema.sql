-- ==============================================================================
-- AURA EDU RAG - SUPABASE SCHEMA (production, per-user Row Level Security)
--
-- Run in: Supabase Dashboard > SQL Editor > New query.
-- Safe to re-run (idempotent).
--
-- Prerequisites (Dashboard > Authentication):
--   * Providers: enable Email (magic link). The app signs in by email only.
--   * URL Configuration: set Site URL + add your production URL to Redirect URLs.
-- ==============================================================================

-- 1. PROFILES -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email         TEXT CHECK (char_length(email) <= 320),
  student_class TEXT CHECK (char_length(student_class) <= 80),
  subject       TEXT CHECK (char_length(subject) <= 80),
  avatar_url    TEXT CHECK (char_length(avatar_url) <= 2048),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. USER SEARCHES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_searches (
  id           TEXT PRIMARY KEY,
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  search_query TEXT NOT NULL CHECK (char_length(search_query) <= 2000),
  category     TEXT NOT NULL DEFAULT 'General' CHECK (char_length(category) <= 80),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. THREADS ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.threads (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (char_length(title) <= 200),
  is_pinned  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. MESSAGES -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id                  TEXT PRIMARY KEY,
  thread_id           TEXT NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content             TEXT NOT NULL CHECK (char_length(content) <= 100000),
  sources             JSONB,
  suggested_followups JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CLEAN UP LEGACY OBJECTS FROM THE PREVIOUS (INSECURE) SCHEMA --------------
DROP POLICY IF EXISTS "Allow public read/write on profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Allow public read/write on user_searches" ON public.user_searches;
DROP POLICY IF EXISTS "Allow public read/write on threads"       ON public.threads;
DROP POLICY IF EXISTS "Allow public read/write on messages"      ON public.messages;
DROP POLICY IF EXISTS "Allow public read/write on documents"     ON public.documents;
DROP TABLE  IF EXISTS public.documents;
ALTER TABLE public.threads  DROP COLUMN IF EXISTS model_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS model;

-- 6. INDEXES ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_searches_user_created ON public.user_searches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_user_updated       ON public.threads (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created    ON public.messages (thread_id, created_at);

-- 7. ROW LEVEL SECURITY: every row is private to its owner --------------------
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: owner full access" ON public.profiles;
CREATE POLICY "profiles: owner full access" ON public.profiles
  FOR ALL TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_searches: owner full access" ON public.user_searches;
CREATE POLICY "user_searches: owner full access" ON public.user_searches
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "threads: owner full access" ON public.threads;
CREATE POLICY "threads: owner full access" ON public.threads
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "messages: owner full access" ON public.messages;
CREATE POLICY "messages: owner full access" ON public.messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = messages.thread_id AND t.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = messages.thread_id AND t.user_id = (SELECT auth.uid())
  ));

-- 8. MESSAGE FEEDBACK ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_feedback (
  id              TEXT PRIMARY KEY,
  message_id      TEXT,
  thread_id       TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT,
  rating          TEXT NOT NULL CHECK (rating IN ('positive', 'negative', 'thumbs_up', 'thumbs_down')),
  reason          TEXT,
  comment         TEXT,
  message_snippet TEXT,
  subject_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. INDEXES FOR FEEDBACK -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_message_feedback_created ON public.message_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_feedback_msg     ON public.message_feedback (message_id);
CREATE INDEX IF NOT EXISTS idx_message_feedback_user    ON public.message_feedback (user_id);

-- 10. ROW LEVEL SECURITY FOR FEEDBACK -----------------------------------------
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_feedback: insert access" ON public.message_feedback;
CREATE POLICY "message_feedback: insert access" ON public.message_feedback
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "message_feedback: owner select" ON public.message_feedback;
CREATE POLICY "message_feedback: owner select" ON public.message_feedback
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- Permissions
REVOKE ALL ON public.profiles, public.user_searches, public.threads, public.messages FROM anon;
GRANT INSERT ON public.message_feedback TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profiles, public.user_searches, public.threads, public.messages, public.message_feedback TO authenticated;

