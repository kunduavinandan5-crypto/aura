import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Message, Thread, UserProfile, UserSearchRecord, MessageFeedback } from '@/types';
import { newId } from './id';

/**
 * The URL and anon key are PUBLIC by design (they ship in every Supabase web app).
 * Data is protected by Row Level Security (see supabase_schema.sql), never by hiding
 * these values. Never put a service_role key in any VITE_* variable.
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && /^https:\/\/.+\.supabase\.(co|in)$/.test(supabaseUrl)
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
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

/**
 * Looks up student details in class_11_students and class_12_students tables.
 * Returns studentClass ('Class 11' | 'Class 12'), subject, name, etc.
 */
export async function fetchStudentByEmailOrPhone(identifier: string): Promise<StudentRecord | null> {
  if (!supabase || !identifier?.trim()) return null;
  const clean = identifier.trim().toLowerCase();

  // 1. Try RPC function first (handles SECURITY DEFINER permissions cleanly)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_student_by_email', {
      p_identifier: clean,
    });
    if (!rpcErr && rpcData) {
      return {
        id: rpcData.id,
        name: rpcData.name,
        email: rpcData.email || clean,
        phone: rpcData.phone,
        subject: rpcData.subject,
        studentClass: rpcData.student_class || (rpcData.class === 12 ? 'Class 12' : 'Class 11'),
      };
    }
  } catch (_) {}

  // 2. Direct query on class_11_students
  try {
    const { data: c11 } = await supabase
      .from('class_11_students')
      .select('id, name, email, phone, subject')
      .or(`email.ilike.${clean},phone.eq.${clean}`)
      .maybeSingle();

    if (c11) {
      return {
        id: c11.id,
        name: c11.name,
        email: c11.email || clean,
        phone: c11.phone,
        subject: c11.subject,
        studentClass: 'Class 11',
      };
    }
  } catch (_) {}

  // 3. Direct query on class_12_students
  try {
    const { data: c12 } = await supabase
      .from('class_12_students')
      .select('id, name, email, phone, subject')
      .or(`email.ilike.${clean},phone.eq.${clean}`)
      .maybeSingle();

    if (c12) {
      return {
        id: c12.id,
        name: c12.name,
        email: c12.email || clean,
        phone: c12.phone,
        subject: c12.subject,
        studentClass: 'Class 12',
      };
    }
  } catch (_) {}

  return null;
}

/**
 * Authenticates a student against class_11_students and class_12_students tables.
 * Admin enters email/phone and password directly into these tables.
 */
export async function authenticateStudentFromClassTables(
  loginId: string,
  password: string
): Promise<{ student: StudentRecord | null; error?: string }> {
  if (!supabase || !loginId?.trim() || !password) return { student: null };
  const cleanLogin = loginId.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. Try secure RPC function if created in Supabase
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('login_student', {
      p_login: cleanLogin,
      p_password: cleanPass,
    });
    if (!rpcErr && rpcData) {
      return {
        student: {
          id: rpcData.id,
          name: rpcData.name,
          email: rpcData.email || cleanLogin,
          phone: rpcData.phone,
          subject: rpcData.subject,
          studentClass: rpcData.student_class || (rpcData.class === 12 ? 'Class 12' : 'Class 11'),
        },
      };
    }
  } catch (_) {}

  // 2. Direct query on class_11_students
  try {
    const { data: c11, error: e11 } = await supabase
      .from('class_11_students')
      .select('id, name, email, phone, subject, password')
      .or(`email.ilike.${cleanLogin},phone.eq.${cleanLogin}`)
      .eq('password', cleanPass)
      .maybeSingle();

    if (!e11 && c11) {
      return {
        student: {
          id: c11.id,
          name: c11.name,
          email: c11.email || cleanLogin,
          phone: c11.phone,
          subject: c11.subject,
          studentClass: 'Class 11',
        },
      };
    }
  } catch (e: any) {
    console.warn('Class 11 table login query:', e);
  }

  // 3. Direct query on class_12_students
  try {
    const { data: c12, error: e12 } = await supabase
      .from('class_12_students')
      .select('id, name, email, phone, subject, password')
      .or(`email.ilike.${cleanLogin},phone.eq.${cleanLogin}`)
      .eq('password', cleanPass)
      .maybeSingle();

    if (!e12 && c12) {
      return {
        student: {
          id: c12.id,
          name: c12.name,
          email: c12.email || cleanLogin,
          phone: c12.phone,
          subject: c12.subject,
          studentClass: 'Class 12',
        },
      };
    }
  } catch (e: any) {
    console.warn('Class 12 table login query:', e);
  }

  return { student: null };
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

  // 1. Check class_11_students and class_12_students tables first
  const { student, error: studentErr } = await authenticateStudentFromClassTables(cleanUser, cleanPass);
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

  // 2. Fallback to Supabase Auth (if created in Auth > Users)
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

  if (studentErr) {
    console.warn('Student login error:', studentErr);
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

/* ─────────────────────────── Searches ─────────────────────────── */

export async function recordUserSearch(userId: string, searchQuery: string, category = 'General'): Promise<boolean> {
  if (!supabase || !userId || !searchQuery.trim()) return false;
  const { error } = await supabase.from('user_searches').insert({
    id: newId('search'),
    user_id: userId,
    search_query: searchQuery.trim().slice(0, 2000),
    category: category.slice(0, 80),
  });
  return !error;
}

export async function fetchUserSearches(userId: string): Promise<UserSearchRecord[]> {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
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

export async function syncThreads(threads: Thread[], userId: string): Promise<boolean> {
  if (!supabase || !threads.length || !userId) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== userId) return false;

  const { error: threadErr } = await supabase.from('threads').upsert(
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
  if (rows.length) {
    const { error: msgErr } = await supabase.from('messages').upsert(rows, { onConflict: 'id' });
    if (msgErr) {
      console.warn('Supabase syncThreads (messages) error:', msgErr.message);
      return false;
    }
  }
  return true;
}

export async function fetchRemoteThreads(userId: string): Promise<Thread[] | null> {
  if (!supabase || !userId) return null;
  const { data: threadsData, error } = await supabase
    .from('threads')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !threadsData) return null;
  if (!threadsData.length) return [];

  const { data: messagesData } = await supabase
    .from('messages')
    .select('*')
    .in('thread_id', threadsData.map((t) => t.id))
    .order('created_at', { ascending: true });

  const byThread: Record<string, Message[]> = {};
  for (const m of messagesData ?? []) {
    (byThread[m.thread_id] ||= []).push({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      sources: m.sources ?? undefined,
      suggestedFollowups: m.suggested_followups ?? undefined,
    });
  }

  return threadsData.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    isPinned: t.is_pinned,
    messages: byThread[t.id] || [],
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
    const validUuid = feedback.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(feedback.userId)
      ? feedback.userId
      : null;

    const { error } = await supabase.from('message_feedback').insert({
      id,
      message_id: feedback.messageId,
      thread_id: feedback.threadId || null,
      user_id: validUuid,
      user_email: feedback.userEmail || null,
      rating: feedback.rating,
      reason: feedback.reason || null,
      comment: feedback.comment || null,
      message_snippet: feedback.messageSnippet ? feedback.messageSnippet.slice(0, 1000) : null,
      subject_id: feedback.subjectId || null,
    });

    if (error) {
      console.warn('Supabase submitMessageFeedback error:', error.message);
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


