import { RagSourceChunk } from '@/types';
import { Subject } from './subjects';
import { extractTextFromImages } from './ocr';

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

const REQUEST_TIMEOUT_MS = 60_000;

export type AnswerMode = 'llm' | 'fallback' | 'flagged' | 'no_results' | 'error';

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

export const PHOTO_UNREADABLE_MESSAGE =
  "I couldn't read a question in that photo. Please retake it closer, in good light and with the page flat, or type the question.";

/** "Class 11" -> "11". Returns undefined when no class number can be found (backend then uses its default). */
function classNumber(studentClass?: string): string | undefined {
  return studentClass?.match(/\d{1,2}/)?.[0];
}

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
  body: Record<string, string>,
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
const CACHE_KEY = 'aura_answer_cache_v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 40;

const answerCacheKey = (subjectId: string, cls: string | undefined, prompt: string) =>
  `${subjectId}|${cls ?? ''}|${prompt.trim().toLowerCase().replace(/s+/g, ' ').replace(/[?.!]+$/, '')}`;

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
  /** Attached photos (data URLs). Their text is read on the device and sent as the question. */
  images?: string[];
}): Promise<AiResult> {
  const { studentClass, subject, signal, images } = params;
  let prompt = params.prompt.trim();
  let photoNote = '';
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (images?.length) {
    // The backend is text-only: read the question out of the photo(s) and append it to anything typed.
    const scanned = await extractTextFromImages(images, signal);
    if (!scanned && prompt.length < 15) throw new UserFacingError(PHOTO_UNREADABLE_MESSAGE);
    if (scanned) {
      photoNote = `> **Read from your photo:** ${scanned}\n\n`;
      prompt = [prompt, scanned].filter(Boolean).join(' ');
    }
  } else if (looksLikeGibberish(prompt)) {
    return { content: GIBBERISH_MESSAGE, followups: [], mode: 'no_results' };
  }

  const body: Record<string, string> = { question: prompt, subject: subject.id.toLowerCase() };

  // student_class comes from the admin-set Supabase profile, not from the subject config.
  const cls = classNumber(studentClass);
  if (cls) body.student_class = cls;

  const cacheKey = answerCacheKey(subject.id, cls, prompt);
  const cached = readCachedAnswer(cacheKey);
  if (cached) return photoNote ? { ...cached, content: photoNote + cached.content } : cached;

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

  const content = cleanAnswerContent(rawAnswer);

  const result: AiResult = {
    content,
    sources: undefined, // Hidden per user preference (show only answers)
    followups: followupsFor(prompt, data.mode),
    answerId: typeof data.answer_id === 'string' ? data.answer_id : undefined,
    mode: data.mode,
  };
  if (data.mode === 'llm') writeCachedAnswer(cacheKey, result);
  return photoNote ? { ...result, content: photoNote + result.content } : result;
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
  if (!feedbackBase || !answerId || feedbackSent.has(answerId)) return;
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

/** One follow-up built from the student's own question; none when no real answer was given. */
function followupsFor(prompt: string, mode?: string): string[] {
  if (mode && mode !== "llm" && mode !== "fallback") return [];
  const q = prompt.trim().replace(/[?.!]+$/, "");
  const topic = q
    .replace(/^(what|who|why|how|when|which)\s+(is|are|was|were|do|does|did|can|to)\s+/i, "")
    .replace(/^(define|explain|describe|meaning of|difference between|types of|state|write)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
  if (!topic || topic.length > 60) return ["Give me 3 practice MCQs on this"];
  if (/^difference between/i.test(q)) return ["Give me 3 practice MCQs on this"];
  if (/^(what|who|define|meaning)/i.test(q)) return [`Give an example of ${topic}`];
  if (/^(how|explain|describe)/i.test(q)) return ["Show me a solved example of this"];
  return [`Explain ${topic} with an example`];
}
