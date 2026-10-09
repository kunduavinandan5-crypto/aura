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
  signInAsGuest,
  signInWithEmailLink,
  signInWithGoogle,
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

  const handleGoogle = useCallback(async () => {
    const error = await signInWithGoogle();
    if (error) toast.error(error);
  }, []);

  const handleEmail = useCallback(
    async (profile: Pick<UserProfile, 'name' | 'email' | 'studentClass' | 'subject'>) => {
      if (!isSupabaseConfigured) {
        startLocalSession({ id: newId('local'), ...profile, isGuest: false });
        return true;
      }
      const error = await signInWithEmailLink(profile);
      if (error) {
        toast.error(error);
        return false;
      }
      toast.success('Check your inbox for a sign-in link.');
      return true;
    },
    [startLocalSession]
  );

  const handleGuest = useCallback(async () => {
    if (isSupabaseConfigured) {
      const error = await signInAsGuest();
      if (!error) return;
      toast.info('Guest cloud sync is unavailable; continuing on this device only.');
    }
    startLocalSession({ id: newId('guest'), name: 'Guest Scholar', email: '', isGuest: true });
  }, [startLocalSession]);

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
            onGoogle={handleGoogle}
            onEmail={handleEmail}
            onGuest={handleGuest}
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
          <div className="h-dvh w-full overflow-hidden bg-[#07080e]">
            <PhoneApp user={user} onSignOut={handleSignOut} onUpdateUser={handleUpdateUser} />
          </div>
        ) : (
          <div className="fixed inset-0 h-full w-full overflow-hidden bg-[#07080e]">
            <DesktopApp user={user} onSignOut={handleSignOut} onUpdateUser={handleUpdateUser} />
          </div>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
