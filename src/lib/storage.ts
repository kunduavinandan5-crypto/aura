import { Thread, UserProfile, UserSearchRecord } from '@/types';
import { newId } from './id';
import { clearMessageImages, deleteMessageImages } from './imageStore';
import {
  deleteRemoteThread,
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
/** Conversation ids deleted locally whose cloud delete has not succeeded yet (e.g. offline). */
const PENDING_DELETES_KEY = 'aura_pending_thread_deletes_v1';
/** Conversation ids known to exist in the cloud; one missing from a later fetch was deleted on another device. */
const SYNCED_KEY = 'aura_synced_thread_ids_v1';

/** Keys written by older builds; wiped on sign-out so no student data lingers on shared devices. */
const LEGACY_KEYS = [
  'aura_pending_thread_deletes_v1',
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

  /** Persists locally right away; cloud sync is debounced. Image attachments are kept out of this store (see imageStore.ts: device-local IndexedDB). */
  saveThreads(threads: Thread[], userId?: string): void {
    const slim = threads.map((t) => ({
      ...t,
      messages: t.messages.map(({ imageUrls: _images, ...m }) => m),
    }));
    write(THREADS_KEY, slim);
    if (!userId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncThreads(slim, userId)
        .then((ok) => ok && this.markSynced(slim.map((t) => t.id)))
        .catch(() => {});
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

  /** Delete one conversation locally (caller updates state) and in the cloud, retrying later if offline. */
  async deleteThread(threadId: string): Promise<void> {
    const doomed = this.getThreads().find((t) => t.id === threadId);
    if (doomed) void deleteMessageImages(doomed.messages.map((m) => m.id));
    write(THREADS_KEY, this.getThreads().filter((t) => t.id !== threadId));
    const ok = await deleteRemoteThread(threadId).catch(() => false);
    if (!ok) write(PENDING_DELETES_KEY, [...new Set([...read<string[]>(PENDING_DELETES_KEY, []), threadId])]);
  },

  async flushPendingDeletes(): Promise<void> {
    const pending = read<string[]>(PENDING_DELETES_KEY, []);
    if (!pending.length) return;
    const stillPending: string[] = [];
    for (const id of pending) {
      if (!(await deleteRemoteThread(id).catch(() => false))) stillPending.push(id);
    }
    write(PENDING_DELETES_KEY, stillPending);
  },

  /** Delete chat history and search records locally and in the cloud. */
  async clearAllUserData(userId?: string): Promise<void> {
    clearTimeout(syncTimer);
    localStorage.removeItem(THREADS_KEY);
    localStorage.removeItem(SEARCHES_KEY);
    void clearMessageImages();
    if (userId) await deleteRemoteUserData(userId);
  },

  /** Remove everything this app stored in the browser (used on sign-out). */
  wipeLocal(): void {
    clearTimeout(syncTimer);
    [THREADS_KEY, SEARCHES_KEY, USER_KEY, SYNCED_KEY, ...LEGACY_KEYS].forEach((k) => localStorage.removeItem(k));
    void clearMessageImages();
  },

  /** Record chat ids known to exist in the cloud, so a later absence means "deleted on another device". */
  markSynced(ids: string[]): void {
    if (!ids.length) return;
    write(SYNCED_KEY, [...new Set([...read<string[]>(SYNCED_KEY, []), ...ids])]);
  },

  /**
   * Merge cloud chats into a local list. Messages are unioned by id (so chats continued on two devices
   * keep both sides), the newer copy wins for title/pin, and chats that were synced before but are now
   * gone from the cloud (deleted on another device) are dropped. Unsynced local chats are always kept.
   */
  mergeThreads(local: Thread[], remote: Thread[] | null): Thread[] {
    if (!remote) return local;
    const pendingDeletes = new Set(read<string[]>(PENDING_DELETES_KEY, []));
    const synced = new Set(read<string[]>(SYNCED_KEY, []));
    const remoteIds = new Set(remote.map((t) => t.id));
    const merged = new Map<string, Thread>();

    for (const t of local) {
      if (pendingDeletes.has(t.id)) continue;
      if (synced.has(t.id) && !remoteIds.has(t.id)) continue; // deleted elsewhere
      merged.set(t.id, t);
    }
    for (const r of remote) {
      if (pendingDeletes.has(r.id)) continue;
      const l = merged.get(r.id);
      if (!l) {
        merged.set(r.id, r);
        continue;
      }
      const msgs = new Map(r.messages.map((m) => [m.id, m]));
      for (const m of l.messages) msgs.set(m.id, m); // local copy keeps device-only photos
      const newer = r.updatedAt > l.updatedAt ? r : l;
      merged.set(r.id, {
        ...l,
        title: newer.title,
        isPinned: newer.isPinned,
        updatedAt: newer.updatedAt,
        messages: [...msgs.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
      });
    }
    return [...merged.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  /** Fetch chats from the cloud (null when unavailable) and remember which ids exist there. */
  async pullRemoteThreads(userId: string): Promise<Thread[] | null> {
    await this.flushPendingDeletes();
    const remote = await fetchRemoteThreads(userId);
    return remote;
  },

  /** Pull chats and searches from Supabase down to local state. */
  async syncFromSupabase(userId: string): Promise<{ threads: number; searches: number }> {
    const [remoteThreads, remoteSearches] = await Promise.all([
      this.pullRemoteThreads(userId),
      fetchUserSearches(userId),
    ]);
    const threads = this.mergeThreads(this.getThreads(), remoteThreads);
    if (threads.length) write(THREADS_KEY, threads);
    if (remoteThreads) this.markSynced(remoteThreads.map((t) => t.id));
    if (remoteSearches.length) write(SEARCHES_KEY, remoteSearches);
    return { threads: threads.length, searches: remoteSearches.length };
  },
};
