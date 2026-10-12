import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { PhoneLogin, type LoginResult } from './phone/PhoneLogin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDevice } from './hooks/useDevice';
import { UserProfile } from './types';
import { storage } from './lib/storage';
import {
  fetchStudentByEmailOrPhone,
  fetchUserProfile,
  isSupabaseConfigured,
  signInWithPassword,
  signOutRemote,
  supabase,
  syncUserProfile,
  userToProfile,
} from './lib/supabase';
import { saveSubjectId } from './lib/subjects';
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
  const [user, setUser] = useState<UserProfile | null>(() => storage.getUser());
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    registerPWA();
  }, []);

  /* Session hydration: supports both class_11/12 table students and Supabase Auth sessions */
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const hydrate = async (authUser: Parameters<typeof userToProfile>[0] | null) => {
      if (!authUser) {
        // If no active Supabase Auth session, check if student was logged in from class tables
        const localUser = storage.getUser();
        if (localUser && localUser.studentClass && !localUser.isGuest) {
          const fresh = await fetchStudentByEmailOrPhone(localUser.email);
          if (fresh && !cancelled) {
            const updated: UserProfile = {
              ...localUser,
              name: fresh.name || localUser.name,
              studentClass: fresh.studentClass,
              subject: fresh.subject || localUser.subject,
            };
            storage.saveUser(updated);
            setUser(updated);
            setAuthReady(true);
            return;
          } else if (!cancelled) {
            setUser(localUser);
            setAuthReady(true);
            return;
          }
        }
        if (!cancelled) {
          setUser(null);
          setAuthReady(true);
        }
        return;
      }

      const row = await fetchUserProfile(authUser.id, authUser.email);
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
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setTimeout(() => hydrate(session?.user ?? null), 0);
      }
      if (event === 'SIGNED_OUT') {
        const local = storage.getUser();
        if (!local?.studentClass || local?.isGuest) {
          setTimeout(() => hydrate(null), 0);
        }
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Login handles credentials against class_11_students / class_12_students first, then Supabase Auth. */
  const handleLogin = useCallback(async (userId: string, password: string): Promise<LoginResult> => {
    if (!isSupabaseConfigured) {
      toast.error('Login is unavailable: Supabase cloud service is not configured.');
      return 'error';
    }
    const result = await signInWithPassword(userId, password);
    if (result.status === 'ok') {
      if (result.profile) {
        storage.saveUser(result.profile);
        setUser(result.profile);
        if (result.profile.subject) {
          saveSubjectId(result.profile.subject);
        }
        toast.success(`Welcome back, ${result.profile.name}!`);
      }
      return 'ok';
    }
    if (result.status === 'error') toast.error(result.message);
    return result.status;
  }, []);

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

  const toaster = <Toaster position="top-center" richColors theme="dark" visibleToasts={1} duration={3500} />;

  if (!authReady) return <Splash />;

  if (!user) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#07080e]">
        {toaster}
        <main className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-[#07080e]">
          <PhoneLogin onLogin={handleLogin} />
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
