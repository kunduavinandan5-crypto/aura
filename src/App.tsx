import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { PhoneLogin } from './phone/PhoneLogin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDevice } from './hooks/useDevice';
import { UserProfile } from './types';
import { storage } from './lib/storage';
import { newId } from './lib/id';
import {
  fetchUserProfile,
  isSupabaseConfigured,
  signInWithEmailLink,
  signOutRemote,
  supabase,
  syncUserProfile,
  userToProfile,
} from './lib/supabase';
import { registerPWA } from './phone/pwa';

const DesktopApp = lazy(() =>
  import('./components/desktop/DesktopApp').then((m) => ({ default: m.DesktopApp }))
);
const PhoneApp = lazy(() => import('./phone/PhoneApp').then((m) => ({ default: m.PhoneApp })));

const Splash: React.FC = () => (
  <div className="flex h-dvh w-full items-center justify-center bg-[#07080e]" role="status" aria-live="polite">
    <span className="text-xs text-zinc-500">Loading Aura…</span>
  </div>
);

export const App: React.FC = () => {
  const { isMobileOrTablet } = useDevice();
  const [user, setUser] = useState<UserProfile | null>(() => (isSupabaseConfigured ? null : storage.getUser()));
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    registerPWA();
  }, []);

  /* Cloud mode: the Supabase session is the single source of truth for who is signed in. */
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const hydrate = async (authUser: Parameters<typeof userToProfile>[0] | null) => {
      if (!authUser) {
        if (!cancelled) {
          setUser(null);
          setAuthReady(true);
        }
        return;
      }
      const row = await fetchUserProfile(authUser.id);
      const profile = userToProfile(authUser, row);
      if (!row) await syncUserProfile(profile);
      await storage.syncFromSupabase(authUser.id);
      if (!cancelled) {
        storage.saveUser(profile);
        setUser(profile);
        setAuthReady(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => hydrate(data.session?.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: never await Supabase calls inside this callback (can deadlock the auth client).
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => hydrate(session?.user ?? null), 0);
      if (event === 'SIGNED_OUT') setTimeout(() => hydrate(null), 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const startLocalSession = useCallback((profile: UserProfile) => {
    storage.saveUser(profile);
    setUser(profile);
  }, []);

  /** Temporary demo: a device-only session. It has no Supabase session, so nothing syncs to the cloud. */
  const handleDemo = useCallback(() => {
    startLocalSession({ id: newId('demo'), name: 'Demo Student', email: '', studentClass: 'Class 12', subject: 'Science', isGuest: true });
  }, [startLocalSession]);

  const handleEmail = useCallback(
    async (email: string) => {
      if (!isSupabaseConfigured) {
        startLocalSession({ id: newId('local'), name: email.split('@')[0] || 'Scholar', email, isGuest: false });
        return true;
      }
      const error = await signInWithEmailLink(email);
      if (error) {
        toast.error(error);
        return false;
      }
      toast.success('Check your inbox for a sign-in link.');
      return true;
    },
    [startLocalSession]
  );

  const handleSignOut = useCallback(async () => {
    await signOutRemote();
    storage.wipeLocal();
    setUser(null);
    toast.info('Signed out');
  }, []);

  const handleUpdateUser = useCallback((updated: UserProfile) => {
    setUser(updated);
    storage.saveUser(updated);
  }, []);

  const toaster = <Toaster position="top-center" richColors theme="dark" />;

  if (!authReady) return <Splash />;

  if (!user) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#07080e]">
        {toaster}
        <main className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-[#07080e]">
          <PhoneLogin
            cloudEnabled={isSupabaseConfigured}
            onEmail={handleEmail}
            onDemo={import.meta.env.VITE_ENABLE_DEMO === 'false' ? undefined : handleDemo}
          />
        </main>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {toaster}
      <Suspense fallback={<Splash />}>
        {isMobileOrTablet ? (
          <div className="h-dvh w-full overflow-hidden bg-[#070a14]">
            <PhoneApp user={user} onSignOut={handleSignOut} onUpdateUser={handleUpdateUser} />
          </div>
        ) : (
          <div className="fixed inset-0 h-full w-full overflow-hidden bg-[#070a14]">
            <DesktopApp user={user} onSignOut={handleSignOut} onUpdateUser={handleUpdateUser} />
          </div>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
