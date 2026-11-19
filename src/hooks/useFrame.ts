import { useEffect, useRef } from 'react';
import { onFrame } from '@/lib/frameLoop';

export function useFrame(fn: (now: number) => void, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? onFrame((t) => ref.current(t)) : undefined), [active]);
}
