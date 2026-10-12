import { RagSourceChunk } from '@/types';
import { Subject } from './subjects';

/**
 * Chat goes through the deployed RAG backend (NEXT_PUBLIC_API_URL, no trailing slash).
 * The URL is public by design; no API keys live in this client.
 */
const API_BASE: string = ((import.meta.env.NEXT_PUBLIC_API_URL as string | undefined) ?? '')
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
}): Promise<AiResult> {
  if (!API_BASE) {
    throw new Error('The AI service is not configured. Set NEXT_PUBLIC_API_URL for this deployment.');
  }

  const { prompt, studentClass, subject } = params;
  const body: Record<string, string> = { question: prompt, subject: subject.id.toLowerCase() };

  // student_class comes from the admin-set Supabase profile, not from the subject config.
  const cls = classNumber(studentClass);
  if (cls) body.student_class = cls;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let data: any;
  try {
    const response = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    // The student only sees the generic message; keep the real cause (CORS, timeout, HTTP status) in the console.
    console.error('AI request failed:', err);
    throw new Error(AI_ERROR_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  const content = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!content) throw new Error(AI_ERROR_MESSAGE);

  return {
    content,
    sources: extractSources(data.sources),
    followups: followupsFor(prompt),
    answerId: typeof data.answer_id === 'string' ? data.answer_id : undefined,
    mode: data.mode,
  };
}

const feedbackSent = new Set<string>();

/** Fire-and-forget, at most once per answer; errors are ignored on purpose. */
export async function sendAnswerFeedback(answerId: string, rating: 'up' | 'down'): Promise<void> {
  if (!API_BASE || !answerId || feedbackSent.has(answerId)) return;
  feedbackSent.add(answerId);
  try {
    await fetch(`${API_BASE}/feedback`, {
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
