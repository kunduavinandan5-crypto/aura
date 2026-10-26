import { RagSourceChunk } from '@/types';
import { Subject } from './subjects';
import { toRequestImage } from './attachments';
import { buildAskBody } from './askBody';

/**
 * Chat goes through the deployed RAG backend (NEXT_PUBLIC_API_URL, no trailing slash).
 * The URL is public by design; no API keys live in this client.
 */
const customApi = (
  (import.meta.env.NEXT_PUBLIC_API_URL as string | undefined) ||
  (import.meta.env.VITE_RAG_API_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  ''
)
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 100_000;

export type AnswerMode = 'llm' | 'fallback' | 'flagged' | 'no_results' | 'no_question' | 'error';

export interface AiResult {
  content: string;
  sources?: RagSourceChunk[];
  followups: string[];
  answerId?: string;
  mode?: AnswerMode;
}

/** Thrown for any failure; the message is safe to show to the student. */
export const AI_ERROR_MESSAGE = 'Sorry, something went wrong. Please try again in a moment.';

/** An error whose message is meant to be shown to the student as-is (in the chat and in a toast). */
export class UserFacingError extends Error {}

export const GIBBERISH_MESSAGE =
  "I couldn't understand that question. Please type a clear question about your subject, for example: \"What is a partnership deed?\"";

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function isGibberishWord(word: string): boolean {
  const w = word.toLowerCase();
  if (/(.)\1{3,}/.test(w)) return true; // "aaaaa"
  if (w.length >= 4) {
    for (const row of KEYBOARD_ROWS) {
      for (let i = 0; i + 4 <= row.length; i++) {
        const seq = row.slice(i, i + 4);
        if (w.includes(seq) || w.includes([...seq].reverse().join(''))) return true;
      }
    }
  }
  if (w.length >= 3 && !/[aeiouy]/.test(w)) return true;
  if (/[^aeiouy]{6,}/.test(w)) return true;
  if (w.length >= 6 && (w.match(/[aeiouy]/g)?.length ?? 0) / w.length < 0.25) return true;
  return false;
}

/**
 * Conservative check for random keystrokes ("asdfgh", "qwkjhs"). Only plain Latin-letter
 * input is judged; digits, formulas and non-Latin scripts (Hindi) always pass through.
 */
export function looksLikeGibberish(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/[^\x00-\x7F]/.test(t) || /\d/.test(t)) return false;
  const words = t.split(/[^A-Za-z]+/).filter(Boolean);
  if (!words.length) return true;
  if (words.length === 1 && words[0].length < 2) return true;
  const long = words.filter((w) => w.length >= 3);
  if (!long.length) return false; // short inputs like "GST", "what is it" are left to the backend
  return long.every(isGibberishWord);
}

export const BUSY_MESSAGE = 'The server is busy right now. Please try again in a few seconds.';
const RETRYABLE_STATUS = new Set([502, 503, 504]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/** One POST to `<endpoint>/ask`. Throws on network failure/abort; a 'TimeoutError' when the backend is too slow. */
async function postAsk(
  endpoint: string,
  body: object,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; data?: any }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(`${endpoint}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, status: response.status, data: await response.json() };
  } catch (err: any) {
    if (timedOut) {
      const e = new Error('Request timed out');
      e.name = 'TimeoutError';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* Repeated questions (many students revise the same syllabus) are answered from this device's cache. */
const CACHE_KEY = 'aura_answer_cache_v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week: the study material rarely changes
const CACHE_MAX = 150;

const answerCacheKey = (subjectId: string, cls: string | undefined, prompt: string) =>
  `${subjectId}|${cls ?? ''}|${prompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;

function readCache(): Record<string, { at: number; result: AiResult }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') || {};
  } catch {
    return {};
  }
}

function readCachedAnswer(key: string): AiResult | null {
  const hit = readCache()[key];
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.result : null;
}

/** Drops a cached answer the student rated down, so asking again fetches a fresh one. */
function evictCachedAnswer(answerId: string): void {
  try {
    const cache = readCache();
    let changed = false;
    for (const [key, entry] of Object.entries(cache)) {
      if (entry.result.answerId === answerId) {
        delete cache[key];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function writeCachedAnswer(key: string, result: AiResult): void {
  try {
    const cache = readCache();
    cache[key] = { at: Date.now(), result };
    const newest = Object.entries(cache)
      .sort((x, y) => y[1].at - x[1].at)
      .slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* storage full or blocked: skip caching */
  }
}

export async function generateAiResponse(params: {
  prompt: string;
  /**
   * The student's class from their Supabase profile (e.g. "Class 11").
   * Set by the admin in the profiles table — never entered by the student.
   * Converted to a plain number ("11") before being sent to the backend.
   */
  studentClass?: string;
  /** Subject selected by the student in the UI (e.g. { id: "accountancy" }). */
  subject: Subject;
  /** Optional cancellation signal from user stopping generation. */
  signal?: AbortSignal;
  /** Attached photo (data URL). Sent to the backend with the typed text, which reads the photo. */
  images?: string[];
}): Promise<AiResult> {
  const { studentClass, subject, signal, images } = params;
  const prompt = params.prompt.trim(); // may be empty when a photo is attached
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Resized to <= 1600 px / JPEG 0.8 and sent as raw base64 next to the typed text.
  const image = images?.length ? await toRequestImage(images[0]) : undefined;
  if (!image && looksLikeGibberish(prompt)) {
    return { content: GIBBERISH_MESSAGE, followups: [], mode: 'no_results' };
  }

  // subject = the dropdown selection (lowercased); class = the student's own class from their account ("Class 12" -> "12").
  const body = buildAskBody(prompt, studentClass, subject.id, image);
  const cls = body.student_class;

  const cacheKey = answerCacheKey(subject.id, cls, prompt);
  const cached = image ? null : readCachedAnswer(cacheKey); // photo questions are never cached
  if (cached) return cached;

  // Same-origin /api/rag proxy first (no CORS), then the direct URLs. They all reach the SAME backend, so
  // we only move on when an endpoint is unreachable (or missing, 404) — never after the backend answered
  // with an error, which would just multiply the load on an already struggling server.
  const candidateEndpoints = [
    '/api/rag',
    customApi,
    'https://rag11acc.onrender.com',
  ].filter((url, idx, self) => url && self.indexOf(url) === idx) as string[];

  let data: any = null;
  let lastError: any = null;

  for (const endpoint of candidateEndpoints) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      let res = await postAsk(endpoint, body, signal);
      if (!res.ok && RETRYABLE_STATUS.has(res.status)) {
        // Free-tier hosts return 502/503/504 while waking up: wait once, then retry the same endpoint.
        await delay(3000, signal);
        res = await postAsk(endpoint, body, signal);
      }
      if (res.ok) {
        data = res.data;
        break;
      }
      if (res.status === 429) throw new UserFacingError(BUSY_MESSAGE);
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status === 404) continue; // proxy not present (e.g. local dev): try the next URL
      break;
    } catch (err: any) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (err instanceof UserFacingError) throw err;
      lastError = err;
      if (err?.name === 'TimeoutError') break; // backend reachable but too slow: don't stack more waiting
    }
  }

  if (!data) {
    console.error('All AI endpoints failed. Last error:', lastError);
    throw new Error(AI_ERROR_MESSAGE);
  }

  const rawAnswer = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!rawAnswer) throw new Error(AI_ERROR_MESSAGE);

  // "no_question" / "error" replies are shown exactly as the backend wrote them.
  const content = data.mode === 'no_question' || data.mode === 'error' ? rawAnswer : cleanAnswerContent(rawAnswer);

  const result: AiResult = {
    content,
    sources: undefined, // Hidden per user preference (show only answers)
    followups: followupsFor(prompt, data.mode),
    answerId: typeof data.answer_id === 'string' ? data.answer_id : undefined,
    mode: data.mode,
  };
  if (data.mode === 'llm' && !image) writeCachedAnswer(cacheKey, result);
  return result;
}

/**
 * Strips book names, document filenames (.docx, .pdf, .doc), and page numbers
 * so the student sees only the clean answer.
 */
function cleanAnswerContent(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // Clean fallback header if present
  text = text.replace(
    /The AI answer writer is temporarily unavailable\.\s*Here are the most relevant passages from your study material:?/gi,
    ''
  );

  // Remove list items like "1. FILENAME.docx - Page 123\n456"
  text = text.replace(/^\s*\d+\.\s+[\w\s\-_,.]+\.(docx?|pdf|txt|doc)\s*-\s*Page\s*\d+[\s\d]*/gim, '');

  // Remove inline "FILENAME.docx - Page 123"
  text = text.replace(/[\w\s\-_,.]+\.(docx?|pdf|txt|doc)\s*-\s*Page\s*\d+/gi, '');

  // Remove standalone "- Page 123" or "(Page 123)"
  text = text.replace(/\s*-\s*Page\s*\d+/gi, '');
  text = text.replace(/\(Page\s*\d+\)/gi, '');

  // Remove stray document file references
  text = text.replace(/\[?[a-zA-Z0-9_\-\s]+\.(docx?|pdf|txt|doc)\]?/gi, '');

  // Clean orphaned numbering lines
  text = text.replace(/^\s*\d+\.\s*$/gm, '');

  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text || rawText.trim();
}

const feedbackSent = new Set<string>();

/** Fire-and-forget, at most once per answer; errors are ignored on purpose. */
export async function sendAnswerFeedback(answerId: string, rating: 'up' | 'down'): Promise<void> {
  const feedbackBase = customApi || '/api/rag';
  if (!feedbackBase || !answerId) return;
  if (rating === 'down') evictCachedAnswer(answerId); // never serve an answer the student rejected
  if (feedbackSent.has(answerId)) return;
  feedbackSent.add(answerId);
  try {
    await fetch(`${feedbackBase}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_id: answerId, rating }),
    });
  } catch {
    /* ignore */
  }
}

function extractSources(raw: unknown): RagSourceChunk[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: RagSourceChunk[] = [];
  for (const s of raw as any[]) {
    const document = String(s?.document ?? '').trim();
    if (!document) continue;
    const page = typeof s?.page === 'number' ? s.page : undefined;
    const key = `${document}|${page ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ documentId: key, documentTitle: document, page, snippet: '', similarityScore: 0 });
  }
  return out.length ? out : undefined;
}

/**
 * Follow-up suggestions built from the student's own question. The backend has no memory of earlier
 * questions, so every suggestion must name its topic and make sense on its own (never "on this").
 * None when no real answer was given or no clean topic can be found.
 */
function followupsFor(prompt: string, mode?: string): string[] {
  if (mode && mode !== 'llm' && mode !== 'fallback') return [];
  const q = prompt.trim().replace(/[?.!]+$/, '');
  const whWord = /^(w?hat|who|why|how|when|which)\s+(is|are|was|were|do|does|did|can|to)\s+/i;
  // "how to prepare a trial balance" reads best whole; the other question types are reduced to their subject.
  const topic = /^how\b/i.test(q)
    ? q.charAt(0).toLowerCase() + q.slice(1)
    : q
    .replace(whWord, '')
    .replace(/^(define|explain|describe|meaning of|difference between|types of|state|write)\s+/i, '')
    .replace(whWord, '') // "explain what is X"
    .replace(/^(a|an|the)\s+/i, '')
    .trim();
  if (!topic || topic.length > 70 || topic.split(/\s+/).length > 12) return [];

  const mcqs = `Give me 3 practice MCQs on ${topic}`;
  if (/^difference between/i.test(q)) return [mcqs, `Explain ${topic} with an example`];
  if (/^(w?hat|who|define|meaning)/i.test(q)) return [`Give an example of ${topic}`, mcqs];
  if (/^(how|explain|describe)/i.test(q)) return [`Show me a solved example of ${topic}`, mcqs];
  return [`Explain ${topic} with an example`, mcqs];
}
