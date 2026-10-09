import { EduDocument, Message, RagSourceChunk } from '@/types';
import { storage } from './storage';

/**
 * Clean semantic document chunking
 */
export function chunkDocument(text: string, chunkSize = 400): string[] {
  if (!text || !text.trim()) return [];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length <= chunkSize) {
      chunks.push(trimmed);
    } else {
      const sentences = trimmed.split(/(?<=[.?!])\s+/);
      let currentChunk = '';
      for (const sentence of sentences) {
        if ((currentChunk + ' ' + sentence).length > chunkSize && currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
    }
  }
  return chunks;
}

/**
 * Test connectivity to the user's pre-built local RAG model backend
 */
export async function testRagModelConnection(
  endpointUrl?: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const url = endpointUrl || storage.getRagEndpoint();
  const startTime = performance.now();

  try {
    // Try pinging endpoint with health check or minimal prompt
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'ping',
        prompt: 'ping',
        ping: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Math.round(performance.now() - startTime);

    if (res.ok || res.status === 400 || res.status === 422) {
      return {
        success: true,
        message: `Connected to RAG model (${latency}ms latency).`,
        latencyMs: latency,
      };
    }

    return {
      success: false,
      message: `RAG endpoint returned HTTP status ${res.status} (${res.statusText}).`,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return {
      success: false,
      message: isTimeout
        ? `Connection timed out after 6s. Is your model server running at ${url}?`
        : `Could not reach ${url}. Please ensure your local model backend is active.`,
    };
  }
}

/**
 * Call the pre-built working RAG model backend with query, documents, and conversation history
 */
export async function callPrebuiltRagModel(params: {
  query: string;
  documents: EduDocument[];
  history?: Message[];
  onChunk?: (chunk: string) => void;
  customEndpoint?: string;
}): Promise<{ content: string; sources?: RagSourceChunk[] }> {
  const { query, documents, history = [], onChunk, customEndpoint } = params;
  const endpoint = customEndpoint || storage.getRagEndpoint();

  // Prepare context payloads from active documents
  const docPayloads = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    content: doc.content,
  }));

  const historyPayloads = history.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const requestBody = {
    query,
    prompt: query,
    question: query,
    history: historyPayloads,
    documents: docPayloads,
    context: docPayloads.map((d) => `[Document: ${d.title}]\n${d.content}`).join('\n\n'),
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Pre-built RAG API returned ${response.status}: ${errorText || response.statusText}`
      );
    }

    // Check if response is a stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        if (onChunk) onChunk(fullText);
      }

      return { content: fullText };
    }

    // Parse standard JSON response
    const data = await response.json();

    // Extract text from common API response schemas
    let textContent = '';
    if (typeof data === 'string') {
      textContent = data;
    } else if (data.response) {
      textContent = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
    } else if (data.answer) {
      textContent = data.answer;
    } else if (data.content) {
      textContent = data.content;
    } else if (data.output) {
      textContent = data.output;
    } else if (data.text) {
      textContent = data.text;
    } else if (data.choices?.[0]?.message?.content) {
      textContent = data.choices[0].message.content;
    } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      textContent = data.candidates[0].content.parts[0].text;
    } else {
      textContent = JSON.stringify(data, null, 2);
    }

    // Extract citations/sources if returned by RAG backend
    let extractedSources: RagSourceChunk[] | undefined;
    if (Array.isArray(data.sources)) {
      extractedSources = data.sources.map((s: any, idx: number) => ({
        documentId: s.documentId || s.id || `doc_${idx}`,
        documentTitle: s.documentTitle || s.title || s.source || 'Document Reference',
        snippet: s.snippet || s.text || s.chunk || '',
        similarityScore: typeof s.score === 'number' ? s.score : 0.95,
      }));
    } else if (Array.isArray(data.context_chunks)) {
      extractedSources = data.context_chunks.map((c: any, idx: number) => ({
        documentId: c.doc_id || `doc_${idx}`,
        documentTitle: c.doc_title || 'Document Source',
        snippet: typeof c === 'string' ? c : c.text || '',
        similarityScore: 0.9,
      }));
    }

    if (onChunk) onChunk(textContent);

    return {
      content: textContent,
      sources: extractedSources,
    };
  } catch (error: any) {
    console.error('Failed to query pre-built RAG model:', error);
    throw error;
  }
}
