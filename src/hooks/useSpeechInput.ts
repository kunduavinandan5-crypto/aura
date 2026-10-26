import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const join = (a: string, b: string) => [a, b].filter(Boolean).join(' ').trim();

/**
 * Turns a SpeechRecognition result list into one string. Android Chrome can report cumulative partial
 * results as separate entries ("what", "what is", "what is journal"); keep only the longest of each run.
 */
function collapseResults(results: ArrayLike<{ 0: { transcript: string } }>): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0].transcript.trim();
    if (!t) continue;
    const last = parts[parts.length - 1];
    if (last && t.toLowerCase().startsWith(last.toLowerCase())) parts[parts.length - 1] = t;
    else if (last && last.toLowerCase().startsWith(t.toLowerCase())) continue;
    else parts.push(t);
  }
  return parts.join(' ');
}

const FATAL_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission is blocked. Allow the microphone for this site and try again.',
  'service-not-allowed': 'Voice input is not allowed on this device or browser.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection.',
};

/**
 * Speech-to-text for the question box. Runs short recognition sessions back to back (more reliable on
 * phones than one long continuous session) and keeps the text from finished sessions in `committed`.
 * Every handler ignores events from a recognizer that is no longer the current one, so a late `onend`
 * from an aborted session can never start a second recognizer.
 */
export function useSpeechInput() {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const recRef = useRef<any>(null);
  const activeRef = useRef(false); // true while we should keep (re)starting sessions
  const shownRef = useRef(false); // the voice UI is open (isActive mirror)
  const committedRef = useRef('');
  const liveRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publish = () => setTranscript(join(committedRef.current, liveRef.current));

  /** Detaches and aborts the current recognizer, keeping whatever it had heard. */
  const detach = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
    committedRef.current = join(committedRef.current, liveRef.current);
    liveRef.current = '';
    setIsListening(false);
  }, []);

  const close = useCallback(() => {
    detach();
    shownRef.current = false;
    committedRef.current = '';
    setIsActive(false);
    setTranscript('');
  }, [detach]);

  const fail = useCallback(
    (message: string) => {
      close();
      toast.error(message);
    },
    [close]
  );

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input is not supported in this browser. Please type your question.');
      return;
    }
    detach(); // never more than one recognizer
    if (!shownRef.current) {
      committedRef.current = '';
      liveRef.current = '';
      setTranscript('');
    }
    shownRef.current = true;
    activeRef.current = true;
    setIsActive(true);

    let quickEnds = 0;

    const run = () => {
      if (!activeRef.current) return;
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;
      const startedAt = Date.now();
      let heard = false;
      const current = () => recRef.current === rec;

      rec.onstart = () => {
        if (current()) setIsListening(true);
      };
      rec.onresult = (e: any) => {
        if (!current()) return;
        heard = true;
        liveRef.current = collapseResults(e.results);
        publish();
      };
      rec.onerror = (e: any) => {
        if (!current()) return;
        const message = FATAL_ERRORS[e.error];
        if (message) fail(message);
        // 'no-speech' / 'aborted' are normal during pauses; onend restarts the session.
      };
      rec.onend = () => {
        if (!current()) return;
        committedRef.current = join(committedRef.current, liveRef.current);
        liveRef.current = '';
        setIsListening(false);
        if (!activeRef.current) return;
        // A session that dies instantly several times in a row means the mic can't start: stop, don't spin.
        quickEnds = !heard && Date.now() - startedAt < 700 ? quickEnds + 1 : 0;
        if (quickEnds >= 4) {
          fail('Could not start the microphone. Please try again.');
          return;
        }
        timerRef.current = setTimeout(run, 250);
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch {
        recRef.current = null;
        if (activeRef.current) timerRef.current = setTimeout(run, 400);
      }
    };

    run();
  }, [detach, fail]);

  /** Stop listening but keep the recognized text so it can still be sent. */
  const pause = useCallback(() => {
    detach();
    publish();
  }, [detach]);

  /** Stops everything and returns the final text (empty string if nothing was heard). */
  const finish = useCallback((): string => {
    detach();
    const text = committedRef.current.replace(/\s+/g, ' ').trim();
    close();
    return text;
  }, [detach, close]);

  useEffect(() => detach, [detach]);

  return { isActive, isListening, transcript, start, pause, cancel: close, finish };
}
