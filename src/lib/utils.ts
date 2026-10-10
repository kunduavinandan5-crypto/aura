import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes immediate consecutive duplicate words or phrases (e.g. "what is what is" -> "what is")
 */
export function cleanDuplicatePhrases(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip immediately repeated word or phrase sequences (1-4 words)
  cleaned = cleaned.replace(/\b(\w+(?:\s+\w+){0,3})\s+\1\b/gi, '$1');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Intelligently merges previous and current speech transcripts, deduplicating boundary overlaps
 */
export function mergeTranscripts(prev: string, next: string): string {
  const p = cleanDuplicatePhrases(prev);
  const n = cleanDuplicatePhrases(next);
  if (!p) return n;
  if (!n) return p;

  if (p.toLowerCase() === n.toLowerCase()) return p;

  // If next is a superset starting with prev
  if (n.toLowerCase().startsWith(p.toLowerCase())) {
    return n;
  }

  // If prev already ends with next
  if (p.toLowerCase().endsWith(n.toLowerCase())) {
    return p;
  }

  const pWords = p.split(/\s+/);
  const nWords = n.split(/\s+/);

  const maxOverlap = Math.min(pWords.length, nWords.length);
  for (let len = maxOverlap; len > 0; len--) {
    const pSlice = pWords
      .slice(pWords.length - len)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ');
    const nSlice = nWords
      .slice(0, len)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ');

    if (pSlice && pSlice === nSlice) {
      const remainder = nWords.slice(len).join(' ');
      return remainder ? cleanDuplicatePhrases(`${p} ${remainder}`) : p;
    }
  }

  return cleanDuplicatePhrases(`${p} ${n}`);
}

