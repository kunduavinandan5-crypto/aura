import { Message, RagSourceChunk } from '@/types';
import { supabase } from './supabase';

/**
 * All model calls go through the RAG backend (VITE_RAG_API_URL). Provider API keys
 * (Gemini / Claude / OpenAI) live on that server and must never be bundled into this client.
 * If the user is signed in, their Supabase access token is sent so the backend can verify it.
 */
const RAG_ENDPOINT: string =
  (import.meta.env.VITE_RAG_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://localhost:8000/api/chat' : '');

const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT =
  'You are Aura, an empathetic and brilliant AI Professor and Educational Mentor. ' +
  'Explain complex ideas using intuitive analogies, structured step-by-step breakdowns, and an encouraging tone.';

export interface AiResult {
  content: string;
  sources?: RagSourceChunk[];
  followups: string[];
}

export async function generateAiResponse(params: {
  prompt: string;
  image?: string; // base64 data URL
  history?: Message[];
  studentClass?: string;
  subject?: string;
}): Promise<AiResult> {
  if (!RAG_ENDPOINT) {
    throw new Error('The AI service is not configured. Set VITE_RAG_API_URL for this deployment.');
  }

  const { prompt, image, history = [], studentClass, subject } = params;
  const profileHint = studentClass ? ` Student: ${studentClass}${subject ? `, ${subject}` : ''}.` : '';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(RAG_ENDPOINT, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        query: prompt,
        prompt,
        question: prompt,
        system: SYSTEM_PROMPT + profileHint,
        image,
        history: history.slice(-6).map(({ role, content }) => ({ role, content })),
      }),
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new Error(aborted ? 'The AI service took too long to respond.' : 'Could not reach the AI service.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`The AI service returned an error (HTTP ${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  const content = extractText(data);
  if (!content) throw new Error('The AI service returned an empty answer.');

  return { content, sources: extractSources(data), followups: followupsFor(prompt) };
}

function extractText(data: any): string {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';
  const candidate =
    data.response ??
    data.answer ??
    data.content ??
    data.output ??
    data.text ??
    data.choices?.[0]?.message?.content ??
    data.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function extractSources(data: any): RagSourceChunk[] | undefined {
  if (!Array.isArray(data?.sources)) return undefined;
  return data.sources.map((s: any, i: number) => ({
    documentId: String(s.documentId ?? s.id ?? `doc_${i}`),
    documentTitle: String(s.documentTitle ?? s.title ?? s.source ?? 'Reference'),
    snippet: String(s.snippet ?? s.text ?? s.chunk ?? ''),
    similarityScore: typeof s.score === 'number' ? s.score : 0,
  }));
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
