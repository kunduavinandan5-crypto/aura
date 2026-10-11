/**
 * Client-side sign-in throttle: after MAX_ATTEMPTS failed attempts the login is locked for LOCK_MS.
 * State lives in localStorage so a page refresh doesn't clear it. This is a UX safeguard only;
 * a determined user can clear storage, so enforce the same limit on the server (Supabase auth rate limits).
 */
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 30 * 60 * 1000;

const KEY = 'aura_login_attempts';

interface State {
  fails: number;
  lockedUntil: number;
}

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.fails === 'number' && typeof raw.lockedUntil === 'number') return raw;
  } catch {
    /* storage unavailable or corrupt */
  }
  return { fails: 0, lockedUntil: 0 };
}

function write(state: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Milliseconds of lockout remaining (0 when not locked). Expired locks are cleared. */
export function lockRemainingMs(): number {
  const s = read();
  if (!s.lockedUntil) return 0;
  const left = s.lockedUntil - Date.now();
  if (left > 0) return left;
  write({ fails: 0, lockedUntil: 0 });
  return 0;
}

/** Records a failed attempt. Returns how many attempts remain before the lock (0 = now locked). */
export function recordFailure(): number {
  const s = read();
  const fails = s.fails + 1;
  if (fails >= MAX_ATTEMPTS) {
    write({ fails, lockedUntil: Date.now() + LOCK_MS });
    return 0;
  }
  write({ fails, lockedUntil: 0 });
  return MAX_ATTEMPTS - fails;
}

export function resetAttempts(): void {
  write({ fails: 0, lockedUntil: 0 });
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
