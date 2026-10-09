import React, { useState } from 'react';
import { User } from 'lucide-react';
import { PhoneOrb } from './PhoneOrb';
import { UserProfile } from '@/types';
import { toast } from 'sonner';

interface PhoneLoginProps {
  /** True when Supabase is configured: email uses a magic link and Google sign-in is offered. */
  cloudEnabled: boolean;
  onGoogle: () => Promise<void>;
  /** Resolves true when the request succeeded (magic link sent / local profile created). */
  onEmail: (profile: Pick<UserProfile, 'name' | 'email' | 'studentClass' | 'subject'>) => Promise<boolean>;
  onGuest: () => Promise<void>;
}

export const PhoneLogin: React.FC<PhoneLoginProps> = ({ cloudEnabled, onGoogle, onEmail, onGuest }) => {
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [subject, setSubject] = useState('');

  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (cloudEnabled && !email.trim()) {
      toast.error('Please enter your email to receive a sign-in link');
      return;
    }
    run(async () => {
      const ok = await onEmail({
        name: name.trim().slice(0, 120),
        email: email.trim(),
        studentClass: studentClass.trim().slice(0, 80),
        subject: subject.trim().slice(0, 80),
      });
      if (ok && cloudEnabled) setLinkSent(true);
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-y-auto bg-[#07080e] px-6 py-8 text-white select-none">
      {/* Top Ambient Glow */}
      <div className="absolute top-12 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-purple-600/20 blur-[90px] pointer-events-none" />

      {/* Top Brand Header */}
      <div className="mt-2 flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
          <span>Aura</span>
          <span className="rounded-full bg-blue-500/30 px-1.5 py-0.2 text-[9px] font-bold tracking-wider text-blue-300">
            AI STUDY
          </span>
        </div>

        <h1 className="mt-3 text-3xl font-medium tracking-tight text-white font-display sm:text-4xl">
          Your personal
          <br />
          assistant
        </h1>
      </div>

      {/* Center 3D Iridescent Orb */}
      <div className="my-auto flex flex-col items-center py-4">
        <PhoneOrb type="sphere" size="hero" />

        <p className="mt-6 max-w-[280px] text-center text-xs leading-relaxed text-[#8f96a8]">
          AI study mentor with photo problem solving, voice & cloud sync
        </p>

        <div className="mt-4 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white transition-all" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25 transition-all" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25 transition-all" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25 transition-all" />
        </div>
      </div>

      {/* Bottom Auth / Student Setup */}
      <div className="flex flex-col gap-3">
        {linkSent ? (
          <div role="status" className="space-y-3 text-center animate-fade-in">
            <p className="text-sm font-semibold text-white">Check your inbox</p>
            <p className="text-xs leading-relaxed text-[#8f96a8]">
              We sent a sign-in link to <span className="text-white">{email.trim()}</span>. Open it on this device to continue.
            </p>
            <button
              type="button"
              onClick={() => setLinkSent(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Use a different email
            </button>
          </div>
        ) : isEmailFormOpen ? (
          <form onSubmit={handleEmailSubmit} className="space-y-2.5 animate-fade-in">
            <input
              type="text"
              required
              maxLength={120}
              autoComplete="name"
              aria-label="Your full name"
              placeholder="Your Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-white placeholder-[#60697e] focus:border-purple-500 focus:outline-none"
            />

            <input
              type="email"
              required={cloudEnabled}
              autoComplete="email"
              aria-label="Email address"
              placeholder={cloudEnabled ? 'Email Address' : 'Email Address (optional)'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-white placeholder-[#60697e] focus:border-purple-500 focus:outline-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Class / Grade"
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-[#60697e] focus:border-purple-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Subject / Stream"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-[#60697e] focus:border-purple-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-purple-500/25 active:scale-95 transition-transform disabled:opacity-60"
            >
              {cloudEnabled ? 'Email me a sign-in link' : 'Start Learning with Aura'}
            </button>
            <button
              type="button"
              onClick={() => setIsEmailFormOpen(false)}
              className="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Back
            </button>
          </form>
        ) : (
          <>
            {cloudEnabled && (
            <button
              onClick={() => run(onGoogle)}
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#5942e8] via-[#634df4] to-[#8042f4] py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8 0-1.3.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
            )}

            <button
              onClick={() => setIsEmailFormOpen(true)}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/10 bg-[#161822] py-3.5 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98]"
            >
              <User className="h-4 w-4 text-zinc-400" />
              <span>{cloudEnabled ? 'Sign in with email' : 'Setup Student Profile'}</span>
            </button>

            <button
              onClick={() => run(onGuest)}
              disabled={busy}
              className="mt-1 text-center text-xs font-medium text-purple-400/80 hover:text-purple-300 disabled:opacity-60"
            >
              Skip & Continue as Guest &rarr;
            </button>
          </>
        )}
      </div>
    </div>
  );
};
