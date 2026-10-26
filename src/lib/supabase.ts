import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Message, Thread, UserProfile, UserSearchRecord, MessageFeedback } from '@/types';
import { newId } from './id';

/**
 * The URL and anon key are PUBLIC by design (they ship in every Supabase web app).
 * Data is protected by Row Level Security (see supabase_schema.sql), never by hiding
 * these values. Never put a service_role key in any VITE_* variable.
 */
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || '';

// Strip accidental quotes or trailing slashes from Vercel environment variables
const supabaseUrl = rawUrl.replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const supabaseKey = rawKey.replace(/^["']|["']$/g, '');

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && /^https:\/\/.+\.supabase\.(co|in)$/.test(supabaseUrl)
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/* ─────────────────────────── Auth ─────────────────────────── */

export interface StudentRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  studentClass: 'Class 11' | 'Class 12';
}

export type StudentLookup =
  | { status: 'found'; student: StudentRecord }
  | { status: 'missing' }
  | { status: 'error' };

/** Phones lose spaces/dashes; emails are only trimmed and lower-cased. */
function normalizeLogin(identifier: string): string {
  const clean = identifier.trim().toLowerCase();
  return clean.includes('@') ? clean : clean.replace(/[\s-]/g, '');
}

function rowToStudent(row: any, fallbackEmail: string): StudentRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email || fallbackEmail,
    phone: row.phone,
    subject: row.subject,
    studentClass: row.student_class || (row.class === 12 ? 'Class 12' : 'Class 11'),
  };
}

/**
 * Looks up a student in class_11_students / class_12_students through the SECURITY DEFINER RPC
 * (the tables themselves are not readable by the browser). 'error' means "could not check",
 * so callers must not treat it as "student removed".
 */
export async function lookupStudent(identifier: string): Promise<StudentLookup> {
  if (!supabase || !identifier?.trim()) return { status: 'error' };
  const clean = normalizeLogin(identifier);
  try {
    const { data, error } = await supabase.rpc('get_student_by_email', { p_identifier: clean });
    if (error) return { status: 'error' };
    return data ? { status: 'found', student: rowToStudent(data, clean) } : { status: 'missing' };
  } catch {
    return { status: 'error' };
  }
}

export async function fetchStudentByEmailOrPhone(identifier: string): Promise<StudentRecord | null> {
  const res = await lookupStudent(identifier);
  return res.status === 'found' ? res.student : null;
}

/**
 * Authenticates a student against class_11_students / class_12_students with ONE server-side call.
 * The RPC also throttles repeated failures (error message 'too_many_attempts').
 */
export async function authenticateStudentFromClassTables(
  loginId: string,
  password: string
): Promise<{ student: StudentRecord | null; error?: string }> {
  if (!supabase || !loginId?.trim() || !password) return { student: null };
  const login = normalizeLogin(loginId);
  try {
    const { data, error } = await supabase.rpc('login_student', { p_login: login, p_password: password.trim() });
    if (error) return { student: null, error: error.message };
    return { student: data ? rowToStudent(data, login) : null };
  } catch (e: any) {
    return { student: null, error: e?.message || 'Network error' };
  }
}

export function userToProfile(user: User, row?: Partial<UserProfile> | null): UserProfile {
  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  return {
    id: user.id,
    email: row?.email || user.email || '',
    name: row?.name || meta.name || meta.full_name || user.email?.split('@')[0] || 'Scholar',
    studentClass: row?.studentClass || meta.student_class || '',
    subject: row?.subject || meta.subject || '',
    avatarUrl: row?.avatarUrl || meta.avatar_url || meta.picture || '',
    isGuest: Boolean(user.is_anonymous),
  };
}

export type PasswordSignInResult =
  | { status: 'ok'; profile?: UserProfile }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

/**
 * Sign in using email/phone and password.
 * Prioritizes checking class_11_students and class_12_students tables.
 * Falls back to Supabase Auth if the user exists there.
 */
export async function signInWithPassword(userId: string, password: string): Promise<PasswordSignInResult> {
  if (!supabase) return { status: 'error', message: 'Cloud sign-in is not configured.' };

  const cleanUser = userId.trim();
  const cleanPass = password.trim();

  // 1. Check class_11_students and class_12_students tables first (single RPC call)
  const { student, error: studentErr } = await authenticateStudentFromClassTables(cleanUser, cleanPass);
  if (studentErr) {
    if (/too_many_attempts/i.test(studentErr)) {
      return { status: 'error', message: 'Too many failed attempts. Please wait a few minutes and try again.' };
    }
    // RPC unreachable (offline / not deployed): only an email could still match a Supabase Auth account.
    if (!cleanUser.includes('@')) {
      return { status: 'error', message: 'Could not reach the sign-in service. Please check your connection and try again.' };
    }
  }
  if (student) {
    const profile: UserProfile = {
      id: student.id,
      name: student.name || 'Scholar',
      email: student.email || cleanUser,
      studentClass: student.studentClass,
      subject: student.subject || '',
      isGuest: false,
    };
    return { status: 'ok', profile };
  }

  // 2. Fallback to Supabase Auth (if created in Auth > Users). Auth ids are emails, so skip it for phone logins.
  if (!cleanUser.includes('@')) return { status: 'invalid' };
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: cleanUser,
    password: cleanPass,
  });

  if (!error && authData?.user) {
    // Look up class and subject from class_11_students / class_12_students
    const studentInfo = await fetchStudentByEmailOrPhone(authData.user.email || cleanUser);
    const profile = userToProfile(authData.user, {
      studentClass: studentInfo?.studentClass,
      subject: studentInfo?.subject,
      name: studentInfo?.name,
    });
    return { status: 'ok', profile };
  }

  // Wrong id and wrong password are deliberately indistinguishable.
  if (error && (error.status === 400 || /invalid login credentials|invalid (email|credentials)/i.test(error.message))) {
    return { status: 'invalid' };
  }
  if (error) {
    return { status: 'error', message: error.message };
  }

  return { status: 'invalid' };
}

export async function signOutRemote(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Supabase signOut error:', e);
  }
}

/* ─────────────────── Connection diagnostics ─────────────────── */

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!supabase || !supabaseUrl || !supabaseKey) {
    return { success: false, message: 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const health = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseKey },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!health.ok) {
      return { success: false, message: `Supabase auth service returned HTTP ${health.status}.` };
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      return { success: true, message: 'Reachable. Sign in to enable cloud sync.' };
    }

    const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' });
    if (error) {
      return {
        success: false,
        message: /relation .* does not exist|schema cache/i.test(error.message)
          ? 'Connected, but tables are missing. Run supabase_schema.sql in the SQL editor.'
          : error.message,
      };
    }
    return { success: true, message: 'Connected to Supabase and database access verified.' };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      success: false,
      message: aborted ? 'Connection to Supabase timed out.' : 'Could not reach Supabase. Check your network and project URL.',
    };
  }
}

/* ─────────────────────────── Profiles ─────────────────────────── */

export async function syncUserProfile(profile: UserProfile): Promise<boolean> {
  if (!supabase || !profile.id) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== profile.id) return false;
  const { error } = await supabase.from('profiles').upsert(
    {
      id: profile.id,
      name: profile.name.slice(0, 120) || 'Scholar',
      email: profile.email || null,
      student_class: profile.studentClass || null,
      subject: profile.subject || null,
      avatar_url: profile.avatarUrl || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) console.warn('Supabase syncUserProfile error:', error.message);
  return !error;
}

export async function fetchUserProfile(userId: string, emailHint?: string): Promise<Partial<UserProfile> | null> {
  if (!supabase) return null;
  let profileData: Partial<UserProfile> | null = null;
  if (userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) {
      profileData = {
        name: data.name,
        email: data.email || '',
        studentClass: data.student_class || '',
        subject: data.subject || '',
        avatarUrl: data.avatar_url || '',
      };
    }
  }

  // Look up class_11_students and class_12_students tables to get official class & subject
  const identifier = emailHint || profileData?.email || userId;
  if (identifier) {
    const student = await fetchStudentByEmailOrPhone(identifier);
    if (student) {
      profileData = {
        ...(profileData || {}),
        name: profileData?.name || student.name,
        email: profileData?.email || student.email,
        studentClass: student.studentClass,
        subject: student.subject || profileData?.subject || '',
      };
    }
  }

  return profileData;
}

/**
 * True only when a real Supabase Auth session for this user exists. Students who sign in through the
 * class tables have no session, so RLS would reject every cloud read/write; skip those calls entirely.
 */
async function hasCloudSession(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId;
}

/* ─────────────────────────── Searches ─────────────────────────── */

export async function recordUserSearch(userId: string, searchQuery: string, category = 'General'): Promise<boolean> {
  if (!searchQuery.trim() || !(await hasCloudSession(userId))) return false;
  const { error } = await supabase!.from('user_searches').insert({
    id: newId('search'),
    user_id: userId,
    search_query: searchQuery.trim().slice(0, 2000),
    category: category.slice(0, 80),
  });
  return !error;
}

export async function fetchUserSearches(userId: string): Promise<UserSearchRecord[]> {
  if (!(await hasCloudSession(userId))) return [];
  const { data, error } = await supabase!
    .from('user_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    searchQuery: row.search_query,
    category: row.category,
    createdAt: row.created_at,
  }));
}

/* ─────────────────────────── Threads ─────────────────────────── */

/** Upserts the given conversations. Callers pass only the ones that changed since their last push. */
export async function syncThreads(threads: Thread[], userId: string): Promise<boolean> {
  if (!threads.length || !(await hasCloudSession(userId))) return false;

  const { error: threadErr } = await supabase!.from('threads').upsert(
    threads.map((t) => ({
      id: t.id,
      user_id: userId,
      title: t.title.slice(0, 200),
      created_at: t.createdAt,
      updated_at: t.updatedAt,
      is_pinned: Boolean(t.isPinned),
    })),
    { onConflict: 'id' }
  );
  if (threadErr) {
    console.warn('Supabase syncThreads error:', threadErr.message);
    return false;
  }

  const rows = threads.flatMap((t) =>
    t.messages.map((m) => ({
      id: m.id,
      thread_id: t.id,
      role: m.role,
      content: m.content,
      sources: m.sources ?? null,
      suggested_followups: m.suggestedFollowups ?? null,
      created_at: m.createdAt,
    }))
  );
  // Chunked so a long history is never one huge request.
  for (let i = 0; i < rows.length; i += 200) {
    const { error: msgErr } = await supabase!.from('messages').upsert(rows.slice(i, i + 200), { onConflict: 'id' });
    if (msgErr) {
      console.warn('Supabase syncThreads (messages) error:', msgErr.message);
      return false;
    }
  }
  return true;
}

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

/**
 * Lists the user's conversations. Messages are downloaded only for conversations that are new or newer
 * than the local copy; unchanged ones reuse the local messages, so a refresh is one small query.
 * Resolves null when there is no cloud session or the request failed.
 */
export async function fetchRemoteThreads(userId: string, local: Thread[] = []): Promise<Thread[] | null> {
  if (!(await hasCloudSession(userId))) return null;
  const { data: threadsData, error } = await supabase!
    .from('threads')
    .select('id,title,is_pinned,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !threadsData) return null;

  const localById = new Map(local.map((t) => [t.id, t]));
  const stale = threadsData.filter((t) => {
    const l = localById.get(t.id);
    return !l || l.updatedAt < t.updated_at;
  });

  const byThread: Record<string, Message[]> = {};
  for (let i = 0; i < stale.length; i += 50) {
    const ids = stale.slice(i, i + 50).map((t) => t.id);
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error: msgErr } = await supabase!
        .from('messages')
        .select('id,thread_id,role,content,sources,suggested_followups,created_at')
        .in('thread_id', ids)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (msgErr) return null;
      for (const m of rows ?? []) {
        (byThread[m.thread_id] ||= []).push({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          sources: m.sources ?? undefined,
          suggestedFollowups: m.suggested_followups ?? undefined,
        });
      }
      if ((rows?.length ?? 0) < PAGE) break;
    }
  }

  return threadsData.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    isPinned: t.is_pinned,
    messages: byThread[t.id] ?? localById.get(t.id)?.messages ?? [],
  }));
}

/**
 * Delete one conversation (its messages cascade). Resolves true when there is nothing to delete remotely
 * (no cloud session) or the delete succeeded; false means it should be retried later.
 */
export async function deleteRemoteThread(threadId: string): Promise<boolean> {
  if (!supabase) return true;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return true;
  const { error } = await supabase.from('threads').delete().eq('id', threadId);
  if (error) console.warn('Supabase deleteRemoteThread error:', error.message);
  return !error;
}

/** Delete all of the signed-in user's chats (messages cascade) and search history. */
export async function deleteRemoteUserData(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const [searches, threads] = await Promise.all([
    supabase.from('user_searches').delete().eq('user_id', userId),
    supabase.from('threads').delete().eq('user_id', userId),
  ]);
  return !searches.error && !threads.error;
}

/* ─────────────────────────── Feedback ─────────────────────────── */

/**
 * Submit thumbs up/down user feedback for an AI response to the message_feedback table.
 */
export async function submitMessageFeedback(feedback: MessageFeedback): Promise<boolean> {
  const id = feedback.id || newId('fb');

  // Cache locally in localStorage for backup/offline durability
  try {
    const raw = localStorage.getItem('aura_feedback_history');
    const history = raw ? JSON.parse(raw) : [];
    history.push({ ...feedback, id, createdAt: new Date().toISOString() });
    localStorage.setItem('aura_feedback_history', JSON.stringify(history.slice(-100)));
  } catch (_) {}

  if (!supabase) return true;

  try {
    // user_id has a foreign key to auth.users, so it may only hold a real Supabase Auth id. Students who sign in
    // through the class tables have no Auth account: their id goes in student_id (no foreign key) instead.
    const { data: sessionData } = await supabase.auth.getSession();
    const authId = sessionData.session?.user.id ?? null;
    const isAuthUser = Boolean(authId && authId === feedback.userId);

    const row = {
      id,
      message_id: feedback.messageId,
      thread_id: feedback.threadId || null,
      user_id: isAuthUser ? authId : null,
      user_email: feedback.userEmail || null,
      rating: feedback.rating,
      reason: feedback.reason || null,
      comment: feedback.comment || null,
      message_snippet: feedback.messageSnippet ? feedback.messageSnippet.slice(0, 1000) : null,
      subject_id: feedback.subjectId || null,
    };

    let { error } = await supabase.from('message_feedback').insert({ ...row, student_id: isAuthUser ? null : feedback.userId || null });
    // Database not migrated yet (no student_id column): still record the feedback without it.
    if (error && /student_id|PGRST204/i.test(`${error.code ?? ''} ${error.message}`)) {
      ({ error } = await supabase.from('message_feedback').insert(row));
    }

    if (error) {
      console.warn('Supabase submitMessageFeedback error:', error.code, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase submitMessageFeedback exception:', err);
    return false;
  }
}

const FEEDBACK_RATINGS_STORAGE_KEY = 'aura_rated_messages';

/**
 * Retrieve map of messageId -> rating ('positive' | 'negative') already submitted by the user.
 */
export function getSavedFeedbackRatings(): Record<string, 'positive' | 'negative'> {
  try {
    const raw = localStorage.getItem(FEEDBACK_RATINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/**
 * Persist feedback state for a message to ensure it cannot be submitted twice.
 */
export function saveFeedbackRating(messageId: string, rating: 'positive' | 'negative'): void {
  try {
    const current = getSavedFeedbackRatings();
    current[messageId] = rating;
    localStorage.setItem(FEEDBACK_RATINGS_STORAGE_KEY, JSON.stringify(current));
  } catch (_) {}
}


