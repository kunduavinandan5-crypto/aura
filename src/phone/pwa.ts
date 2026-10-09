import { toast } from 'sonner';

const UPDATE_CHECK_MS = 10 * 60 * 1000;

/** True when the user is mid-typing, so an automatic reload would lose their text. */
function isUserTyping(): boolean {
  const el = document.activeElement;
  return (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim().length > 0
  );
}

/**
 * Registers the service worker (production only) and keeps the installed app current:
 * checks for a new deploy on launch, on focus and periodically, then reloads into it automatically.
 * If the user is mid-typing, a toast offers the reload instead so nothing is lost.
 */
export function registerPWA(): void {
  if (!import.meta.env.PROD || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // A controller already present means this is an update, not the first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const reload = () => {
      reloading = true;
      window.location.reload();
    };
    if (isUserTyping()) {
      toast('A new version of Aura is ready.', {
        duration: Infinity,
        action: { label: 'Update', onClick: reload },
      });
    } else {
      reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const check = () => registration.update().catch(() => {});
        setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.addEventListener('online', check);
      })
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
