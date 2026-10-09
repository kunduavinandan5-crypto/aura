import { Thread, UserProfile, UserSearchRecord } from '@/types';
import { newId } from './id';
import {
  deleteRemoteUserData,
  fetchRemoteThreads,
  fetchUserSearches,
  recordUserSearch,
  syncThreads,
  syncUserProfile,
} from './supabase';

const THREADS_KEY = 'aura_chat_threads_v2';
const SEARCHES_KEY = 'aura_user_searches_v2';
const USER_KEY = 'aura_user_profile_v2';

/** Keys written by older builds; wiped on sign-out so no student data lingers on shared devices. */
const LEGACY_KEYS = [
  'aura_subject_v1',
  'aura_subject_v2',
  'aura_chat_threads_v1',
  'aura_edu_rag_documents_v1',
  'aura_user_profile_v1',
  'aura_user_searches_v1',
  'aura_api_keys_v1',
  'aura_theme_v1',
  'aura_rag_endpoint_v1',
  'aura_auth_user_v2',
  'aura_phone_auth_user',
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not persist "${key}" (storage full or blocked):`, e);
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

export const storage = {
  getThreads(): Thread[] {
    return read<Thread[]>(THREADS_KEY, []);
  },

  /** Persists locally right away; cloud sync is debounced. Image attachments are never persisted. */
  saveThreads(threads: Thread[], userId?: string): void {
    const slim = threads.map((t) => ({
      ...t,
      messages: t.messages.map(({ imageUrl: _image, ...m }) => m),
    }));
    write(THREADS_KEY, slim);
    if (!userId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncThreads(slim, userId).catch(() => {});
    }, 1500);
  },

  getUser(): UserProfile | null {
    return read<UserProfile | null>(USER_KEY, null);
  },

  saveUser(user: UserProfile): void {
    write(USER_KEY, user);
    syncUserProfile(user).catch(() => {});
  },

  recordSearch(query: string, userId: string, category = 'General'): void {
    const text = query.trim();
    if (!text) return;
    const record: UserSearchRecord = {
      id: newId('search'),
      userId,
      searchQuery: text,
      category,
      createdAt: new Date().toISOString(),
    };
    write(SEARCHES_KEY, [record, ...this.getSearches()].slice(0, 50));
    recordUserSearch(userId, text, category).catch(() => {});
  },

  getSearches(): UserSearchRecord[] {
    return read<UserSearchRecord[]>(SEARCHES_KEY, []);
  },

  /** Delete chat history and search records locally and in the cloud. */
  async clearAllUserData(userId?: string): Promise<void> {
    clearTimeout(syncTimer);
    localStorage.removeItem(THREADS_KEY);
    localStorage.removeItem(SEARCHES_KEY);
    if (userId) await deleteRemoteUserData(userId);
  },

  /** Remove everything this app stored in the browser (used on sign-out). */
  wipeLocal(): void {
    clearTimeout(syncTimer);
    [THREADS_KEY, SEARCHES_KEY, USER_KEY, ...LEGACY_KEYS].forEach((k) => localStorage.removeItem(k));
  },

  /** Pull chats and searches from Supabase down to local state. */
  async syncFromSupabase(userId: string): Promise<{ threads: number; searches: number }> {
    const [remoteThreads, remoteSearches] = await Promise.all([
      fetchRemoteThreads(userId),
      fetchUserSearches(userId),
    ]);
    if (remoteThreads?.length) write(THREADS_KEY, remoteThreads);
    if (remoteSearches.length) write(SEARCHES_KEY, remoteSearches);
    return { threads: remoteThreads?.length ?? 0, searches: remoteSearches.length };
  },
};
