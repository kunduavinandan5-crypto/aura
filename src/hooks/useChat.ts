import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Message, Thread, UserProfile } from '@/types';
import { storage } from '@/lib/storage';
import { generateAiResponse } from '@/lib/ai-engine';
import { newId } from '@/lib/id';

const FALLBACK_REPLY =
  "Sorry, I couldn't get an answer just now. Please check your connection and try again.";

/** Shared chat state for the desktop and phone layouts. */
export function useChat(user: UserProfile) {
  const [threads, setThreads] = useState<Thread[]>(() => storage.getThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const threadsRef = useRef(threads);
  const busyRef = useRef(false);
  threadsRef.current = threads;

  useEffect(() => {
    storage.saveThreads(threads, user.id);
  }, [threads, user.id]);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages ?? [];

  const patchThread = (threadId: string, fn: (t: Thread) => Thread) =>
    setThreads((prev) => prev.map((t) => (t.id === threadId ? fn(t) : t)));

  /** Sends a message and resolves with the assistant reply, or null if nothing was sent / it failed. */
  const sendMessage = useCallback(
    async (text: string, image?: string): Promise<string | null> => {
      const prompt = text.trim() || (image ? 'Please analyze and explain this photo.' : '');
      if (!prompt || busyRef.current) return null;
      busyRef.current = true;

      storage.recordSearch(prompt, user.id, user.subject || 'General');

      const now = new Date().toISOString();
      const userMessage: Message = { id: newId('msg'), role: 'user', content: prompt, imageUrl: image, createdAt: now };
      const assistantId = newId('msg');
      const placeholder: Message = { id: assistantId, role: 'assistant', content: '', createdAt: now };

      let threadId = activeThreadId;
      let history: Message[];
      if (!threadId) {
        threadId = newId('thread');
        history = [];
        const created: Thread = {
          id: threadId,
          title: prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt,
          createdAt: now,
          updatedAt: now,
          messages: [userMessage, placeholder],
        };
        setThreads((prev) => [created, ...prev]);
        setActiveThreadId(threadId);
      } else {
        history = threadsRef.current.find((t) => t.id === threadId)?.messages ?? [];
        patchThread(threadId, (t) => ({ ...t, updatedAt: now, messages: [...t.messages, userMessage, placeholder] }));
      }

      const targetId = threadId;
      setIsGenerating(true);
      try {
        const result = await generateAiResponse({
          prompt,
          image,
          history,
          studentClass: user.studentClass,
          subject: user.subject,
        });
        patchThread(targetId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === assistantId
              ? { ...m, content: result.content, sources: result.sources, suggestedFollowups: result.followups }
              : m
          ),
        }));
        return result.content;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong.');
        patchThread(targetId, (t) => ({
          ...t,
          messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content: FALLBACK_REPLY } : m)),
        }));
        return null;
      } finally {
        busyRef.current = false;
        setIsGenerating(false);
      }
    },
    [activeThreadId, user.id, user.subject, user.studentClass]
  );

  const startNewChat = useCallback(() => setActiveThreadId(null), []);

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
    sendMessage,
    startNewChat,
    clearAllChats,
    reloadFromStorage,
  };
}
