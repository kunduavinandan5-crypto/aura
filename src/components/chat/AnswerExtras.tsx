import React, { useEffect, useState } from 'react';
import { Message } from '@/types';

/** Source list and the "busy server" note shown under an assistant answer. */
export const AnswerExtras: React.FC<{ message: Message }> = ({ message }) => {
  const sources = message.sources?.filter((s) => s.documentTitle) ?? [];
  return (
    <>
      {message.mode === 'fallback' && (
        <p className="mt-2 text-[11px] italic text-amber-300/80">
          The AI writer was busy, so these are the closest passages from your book.
        </p>
      )}
      {sources.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-400">
          {sources.map((s) => (
            <li key={s.documentId}>
              {s.documentTitle}
              {s.page !== undefined ? ` - Page ${s.page}` : ''}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/** True once `active` has been true for `ms` (used to explain a cold-starting server). */
export function useSlowHint(active: boolean, ms = 8000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return slow;
}

export const SLOW_HINT = 'The server is waking up, this can take up to a minute the first time.';
