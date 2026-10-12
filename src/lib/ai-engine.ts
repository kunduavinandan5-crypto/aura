import { RagSourceChunk } from '@/types';
import { Subject } from './subjects';

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

/** "Class 11" -> "11". Returns undefined when no class number can be found (backend then uses its default). */
function classNumber(studentClass?: string): string | undefined {
  return studentClass?.match(/\d{1,2}/)?.[0];
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
}): Promise<AiResult> {
  const { prompt, studentClass, subject, signal } = params;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const body: Record<string, string> = { question: prompt, subject: subject.id.toLowerCase() };

  // student_class comes from the admin-set Supabase profile, not from the subject config.
  const cls = classNumber(studentClass);
  if (cls) body.student_class = cls;

  // Try same-origin /api/rag proxy first (bypasses browser CORS restrictions completely),
  // then fallback to direct Render URLs.
  const candidateEndpoints = [
    '/api/rag',
    customApi,
    'https://rag11acc.onrender.com',
  ].filter((url, idx, self) => url && self.indexOf(url) === idx) as string[];

  let data: any = null;
  let lastError: any = null;

  for (const endpoint of candidateEndpoints) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onSignalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onSignalAbort, { once: true });
    }

    try {
      const response = await fetch(`${endpoint}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (response.ok) {
        data = await response.json();
        clearTimeout(timer);
        break;
      }
    } catch (err: any) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', onSignalAbort);
      }
    }
  }

  if (!data) {
    console.error('All AI endpoints failed. Last error:', lastError);
    throw new Error(AI_ERROR_MESSAGE);
  }

  const rawAnswer = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!rawAnswer) throw new Error(AI_ERROR_MESSAGE);

  const content = cleanAnswerContent(rawAnswer);

  return {
    content,
    sources: undefined, // Hidden per user preference (show only answers)
    followups: followupsFor(prompt),
    answerId: typeof data.answer_id === 'string' ? data.answer_id : undefined,
    mode: data.mode,
  };
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

function followupsFor(prompt: string): string[] {
  const p = prompt.toLowerCase();
  if (/(math|integral|formula|calculate|equation)/.test(p)) {
    return ['Show me another step-by-step example', 'Give me 2 practice questions on this', 'Explain this with a real-world analogy'];
  }
  if (/(code|algorithm|python|javascript|sql)/.test(p)) {
    return ['What are the edge cases?', 'Can you optimize this?', 'How would I write unit tests for this?'];
  }
  return ['Can you break this down with an example?', 'Give me 3 practice MCQs for revision', 'Summarize the top 3 points to remember'];
}
