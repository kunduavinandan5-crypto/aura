import React, { useState } from 'react';
import { GraduationCap, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface PhoneLoginProps {
  /** True when Supabase is configured: a magic link is emailed. Otherwise a local profile is created. */
  cloudEnabled: boolean;
  /** Resolves true when the request succeeded (magic link sent / local session started). */
  onEmail: (email: string) => Promise<boolean>;
}

export const PhoneLogin: React.FC<PhoneLoginProps> = ({ cloudEnabled, onEmail }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const ok = await onEmail(value);
      if (ok && cloudEnabled) setLinkSent(true);
    } catch {
      toast.error('Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

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
        {linkSent ? (
          <div role="status" className="space-y-3 text-center animate-fade-in">
            <p className="text-sm font-semibold text-white">Check your inbox</p>
            <p className="text-xs leading-relaxed text-[#8f96a8]">
              We sent a sign-in link to <span className="text-white">{email.trim()}</span>. Open it on this device to
              continue.
            </p>
            <button
              type="button"
              onClick={() => setLinkSent(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 animate-fade-in">
            <label htmlFor="login-email" className="sr-only">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-full border border-white/15 bg-white/5 py-3.5 pr-4 pl-11 text-sm text-white placeholder-[#60697e] focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-gradient-to-r from-[#5942e8] via-[#634df4] to-[#8042f4] py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Please wait…' : cloudEnabled ? 'Email me a sign-in link' : 'Log in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
