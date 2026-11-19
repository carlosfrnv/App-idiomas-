import { useCallback } from 'react';

export interface DragInfo { dx: number; dy: number; x: number; y: number; event: PointerEvent }

/** Arrastre con captura de puntero: devuelve un handler para onPointerDown. */
export function useDrag(handlers: {
  onStart?: (e: React.PointerEvent) => boolean | void;
  onMove: (d: DragInfo) => void;
  onEnd?: (d: DragInfo, moved: boolean) => void;
  threshold?: number;
}) {
  return useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (handlers.onStart?.(e) === false) return;
    const el = e.currentTarget as HTMLElement;
    const sx = e.clientX, sy = e.clientY;
    const thr = handlers.threshold ?? 0;
    let moved = false;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < thr) return;
      moved = true;
      handlers.onMove({ dx, dy, x: ev.clientX, y: ev.clientY, event: ev });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      handlers.onEnd?.({ dx: ev.clientX - sx, dy: ev.clientY - sy, x: ev.clientX, y: ev.clientY, event: ev }, moved);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.onStart, handlers.onMove, handlers.onEnd, handlers.threshold]);
}
