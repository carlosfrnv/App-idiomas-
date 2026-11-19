import { useSyncExternalStore } from 'react';

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(max-width: 1199px)');
