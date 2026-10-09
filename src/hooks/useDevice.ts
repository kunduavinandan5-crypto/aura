import { useState, useEffect } from 'react';

export function useDevice() {
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isMobileWidth = window.innerWidth <= 1024;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return isMobileWidth || isTouchDevice;
  });

  useEffect(() => {
    const handleResize = () => {
      const isMobileWidth = window.innerWidth <= 1024;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobileOrTablet(isMobileWidth || (isTouchDevice && window.innerWidth <= 1200));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { isMobileOrTablet };
}
