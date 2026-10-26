import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Message, Thread, UserProfile } from '@/types';
import { storage } from '@/lib/storage';
import { AI_ERROR_MESSAGE, generateAiResponse } from '@/lib/ai-engine';
import { newId } from '@/lib/id';
import { getSubject, loadSubjectId, saveSubjectId } from '@/lib/subjects';
import { loadAllMessageImages, saveMessageImages } from '@/lib/imageStore';

const FALLBACK_REPLY = AI_ERROR_MESSAGE;

/** Shared chat state for the desktop and phone layouts. */
export function useChat(user: UserProfile) {
  const [threads, setThreads] = useState<Thread[]>(() => storage.getThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  /** Ids of the threads that currently have a reply in flight (each chat generates independently). */
  const [generatingIds, setGeneratingIds] = useState<string[]>([]);
  const [subjectId, setSubjectIdState] = useState(() => {
    const saved = loadSubjectId();
    if (saved) return saved;
    if (user.subject) {
      const match = getSubject(user.subject);
      if (match) return match.id;
    }
    return '';
  });

  const setSubjectId = useCallback((id: string) => {
    const next = getSubject(id)?.id;
    if (!next) return;
    setSubjectIdState(next);
    saveSubjectId(next);
  }, []);

  useEffect(() => {
    if (!subjectId && user.subject) {
      const match = getSubject(user.subject);
      if (match) {
        setSubjectIdState(match.id);
        saveSubjectId(match.id);
      }
    }
  }, [user.subject, subjectId]);

  const threadsRef = useRef(threads);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  threadsRef.current = threads;

  const setThreadGenerating = (threadId: string, on: boolean) =>
    setGeneratingIds((prev) => (on ? (prev.includes(threadId) ? prev : [...prev, threadId]) : prev.filter((id) => id !== threadId)));

  const cancelGeneration = useCallback(() => {
    if (!activeThreadId) return;
    abortControllersRef.current.get(activeThreadId)?.abort();
    abortControllersRef.current.delete(activeThreadId);
    setThreadGenerating(activeThreadId, false);
  }, [activeThreadId]);

  const isGenerating = activeThreadId !== null && generatingIds.includes(activeThreadId);

  useEffect(() => {
    storage.saveThreads(threads, user.id);
  }, [threads, user.id]);

  /* Pull chats changed on other devices (same account) when the app regains focus and every 30s while visible. */
  useEffect(() => {
    let running = false;
    const signature = (list: Thread[]) =>
      list.map((t) => `${t.id}|${t.title}|${t.updatedAt}|${t.isPinned ? 1 : 0}|${t.messages.length}`).join(';');
    const refresh = async () => {
      if (running || document.visibilityState !== 'visible' || !navigator.onLine) return;
      running = true;
      try {
        const remote = await storage.pullRemoteThreads(user.id);
        if (!remote) return;
        setThreads((prev) => {
          const next = storage.mergeThreads(prev, remote);
          return signature(next) === signature(prev) ? prev : next;
        });
        storage.markSynced(remote.map((t) => t.id));
      } catch {
        /* offline or signed out: try again next tick */
      } finally {
        running = false;
      }
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [user.id]);

  /* Photos live in IndexedDB (not in the saved threads); restore them onto their messages on startup. */
  useEffect(() => {
    let cancelled = false;
    loadAllMessageImages().then((byMessage) => {
      if (cancelled || !Object.keys(byMessage).length) return;
      setThreads((prev) =>
        prev.map((t) => ({
          ...t,
          messages: t.messages.map((m) => (byMessage[m.id] && !m.imageUrls ? { ...m, imageUrls: byMessage[m.id] } : m)),
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages ?? [];

  const patchThread = (threadId: string, fn: (t: Thread) => Thread) =>
    setThreads((prev) => prev.map((t) => (t.id === threadId ? fn(t) : t)));

  /** Sends a message and resolves with the assistant reply, or null if nothing was sent / it failed. */
  const sendMessage = useCallback(
    async (text: string, images?: string[]): Promise<string | null> => {
      const prompt = text.trim() || (images?.length ? `Please analyze and explain ${images.length > 1 ? 'these photos' : 'this photo'}.` : '');
      if (!prompt || (activeThreadId && abortControllersRef.current.has(activeThreadId))) return null;

      // Clear any prior toasts (e.g. "Photo attached") so toasts never stack or overlap
      toast.dismiss();

      const subject = getSubject(subjectId);
      if (!subject) {
        toast.error('Please select a subject before asking a question.');
        return null;
      }

      storage.recordSearch(prompt, user.id, subject.label);


      const now = new Date().toISOString();
      const userMessage: Message = { id: newId('msg'), role: 'user', content: prompt, imageUrls: images, createdAt: now };
      if (images?.length) void saveMessageImages(userMessage.id, images);
      const assistantId = newId('msg');

      let threadId = activeThreadId;
      if (!threadId) {
        threadId = newId('thread');
        const created: Thread = {
          id: threadId,
          title: prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt,
          createdAt: now,
          updatedAt: now,
          messages: [userMessage],
        };
        setThreads((prev) => [created, ...prev]);
        setActiveThreadId(threadId);
      } else {
        patchThread(threadId, (t) => ({ ...t, updatedAt: now, messages: [...t.messages, userMessage] }));
      }

      const targetId = threadId;
      const abortController = new AbortController();
      abortControllersRef.current.set(targetId, abortController);
      setThreadGenerating(targetId, true);
      try {
        const result = await generateAiResponse({
          prompt,
          studentClass: user.studentClass,
          subject,
          signal: abortController.signal,
        });
        const assistantMessage: Message = {
          id: assistantId,
          role: 'assistant',
          content: result.content,
          sources: result.sources,
          suggestedFollowups: result.followups,
          answerId: result.answerId,
          mode: result.mode,
          createdAt: new Date().toISOString(),
        };
        patchThread(targetId, (t) => ({
          ...t,
          messages: [...t.messages.filter((m) => m.id !== assistantId), assistantMessage],
        }));
        return result.content;
      } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          // Cancelled by user - clean stop, no error toast
          return null;
        }
        toast.error(err instanceof Error ? err.message : AI_ERROR_MESSAGE);
        const fallbackMessage: Message = {
          id: assistantId,
          role: 'assistant',
          content: FALLBACK_REPLY,
          createdAt: new Date().toISOString(),
        };
        patchThread(targetId, (t) => ({
          ...t,
          messages: [...t.messages.filter((m) => m.id !== assistantId), fallbackMessage],
        }));
        return null;
      } finally {
        // Only clear our own slot; a cancel + resend may have installed a newer controller
        if (abortControllersRef.current.get(targetId) === abortController) {
          abortControllersRef.current.delete(targetId);
          setThreadGenerating(targetId, false);
        }
      }
    },
    [activeThreadId, user.id, user.studentClass, subjectId]
  );

  const startNewChat = useCallback(() => setActiveThreadId(null), []);

  /** Deletes one conversation from this device and from the database. */
  const deleteThread = useCallback(
    async (threadId: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) setActiveThreadId(null);
      await storage.deleteThread(threadId);
      toast.success('Conversation deleted');
    },
    [activeThreadId]
  );

  const clearAllChats = useCallback(async () => {
    await storage.clearAllUserData(user.id);
    setThreads([]);
    setActiveThreadId(null);
  }, [user.id]);

  const reloadFromStorage = useCallback(() => setThreads(storage.getThreads()), []);

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    messages,
    activeThread,
    isGenerating,
    cancelGeneration,
    subjectId,
    setSubjectId,
    sendMessage,
    startNewChat,
    deleteThread,
    clearAllChats,
    reloadFromStorage,
  };
}
