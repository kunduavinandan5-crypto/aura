import React, { useEffect, useState } from 'react';
import { Message } from '@/types';

/** Source list and page numbers are hidden per user preference — show only answers. */
export const AnswerExtras: React.FC<{ message: Message }> = () => {
  return null;
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
