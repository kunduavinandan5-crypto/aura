import React, { useEffect, useState } from 'react';
import { ArrowLeft, GraduationCap, Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import { formatRemaining, lockRemainingMs, recordFailure, resetAttempts } from '@/lib/loginLimiter';

export type LoginResult = 'ok' | 'invalid' | 'error';

interface PhoneLoginProps {
  /** Verifies the credentials. 'invalid' counts toward the lockout; 'error' (network/config) does not. */
  onLogin: (userId: string, password: string) => Promise<LoginResult>;
  /** When provided, shows a "Try the demo" button (device-only session, no account). */
  onDemo?: () => void;
}

export const PhoneLogin: React.FC<PhoneLoginProps> = ({ onLogin, onDemo }) => {
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockMs, setLockMs] = useState(() => lockRemainingMs());
  const locked = lockMs > 0;

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockMs(lockRemainingMs()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const failAttempt = () => {
    const left = recordFailure();
    setPassword('');
    if (left === 0) {
      setLockMs(lockRemainingMs());
      toast.error('Too many failed attempts. Login is locked for 30 minutes.');
    } else {
      toast.error(`Invalid user ID or password. ${left} attempt${left === 1 ? '' : 's'} left before a 30-minute lock.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = userId.trim();
    if (!id || !password || busy) return;
    if (lockRemainingMs() > 0) {
      setLockMs(lockRemainingMs());
      return;
    }
    setBusy(true);
    try {
      const result = await onLogin(id, password);
      if (result === 'ok') resetAttempts();
      else if (result === 'invalid') failAttempt();
    } catch {
      toast.error('Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const lockNotice = locked && (
    <p role="alert" className="text-center text-xs text-amber-300">
      Too many failed attempts. Try again in {formatRemaining(lockMs)}.
    </p>
  );

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-y-auto bg-[#07080e] px-6 py-8 text-white">
      <div className="pointer-events-none absolute top-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[90px]" />

      <div className="mt-2 flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
          <span>Aura</span>
          <span className="rounded-full bg-blue-500/30 px-1.5 text-[9px] font-bold tracking-wider text-blue-300">
            AI STUDY
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-white font-display sm:text-4xl">
          Your personal
          <br />
          study assistant
        </h1>
      </div>

      <div className="my-auto flex flex-col items-center py-6">
        <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/10 bg-gradient-to-br from-indigo-600/30 via-violet-600/20 to-transparent shadow-2xl shadow-indigo-600/20">
          <GraduationCap className="h-14 w-14 text-indigo-300" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p className="mt-6 max-w-[280px] text-center text-xs leading-relaxed text-[#8f96a8]">
          Step-by-step help with photo problems, voice questions and chats synced across devices.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-3 animate-fade-in">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>

            <label htmlFor="login-id" className="sr-only">
              User ID
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="login-id"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={locked}
                className="w-full rounded-full border border-white/15 bg-white/5 py-3.5 pr-4 pl-11 text-sm text-white placeholder-[#60697e] focus:border-indigo-500 focus:outline-none disabled:opacity-60"
              />
            </div>

            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={locked}
                className="w-full rounded-full border border-white/15 bg-white/5 py-3.5 pr-4 pl-11 text-sm text-white placeholder-[#60697e] focus:border-indigo-500 focus:outline-none disabled:opacity-60"
              />
            </div>

            {lockNotice}

            <button
              type="submit"
              disabled={busy || locked}
              className="w-full rounded-full bg-gradient-to-r from-[#5942e8] via-[#634df4] to-[#8042f4] py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Please wait…' : 'Log in'}
            </button>
          </form>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {lockNotice}
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full rounded-full bg-gradient-to-r from-[#5942e8] via-[#634df4] to-[#8042f4] py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:opacity-95 active:scale-[0.98]"
            >
              Log in
            </button>
            {onDemo && (
              <button
                type="button"
                onClick={onDemo}
                className="w-full rounded-full border border-white/10 bg-[#161822] py-3 text-xs font-semibold text-zinc-200 transition-all hover:bg-white/10 active:scale-[0.98]"
              >
                Try the demo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
