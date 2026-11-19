import { useRef } from 'react';
import { useFrame } from '@/hooks/useFrame';
import { engine } from '@/audio/engine/AudioEngine';
import { useUi } from '@/state/uiStore';
import { useTransport } from '@/state/transportStore';

/** Cabezal animado. Se mueve con rAF leyendo el reloj del motor (sin re-render de React). */
export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const ui = useUi.getState();
    const tr = useTransport.getState();
    const pos = engine.playing ? engine.getPosition() : tr.position;
    let x = (pos - ui.scrollTime) * ui.pxPerSec;
    if (engine.playing && tr.follow && (x > ui.viewportWidth * 0.94 || x < 0)) {
      const next = Math.max(0, pos - (ui.viewportWidth * 0.06) / ui.pxPerSec);
      ui.set({ scrollTime: next });
      x = (pos - next) * ui.pxPerSec;
    }
    el.style.transform = `translateX(${x}px)`;
    el.style.opacity = x < -2 || x > ui.viewportWidth + 2 ? '0' : '1';
    el.dataset.recording = tr.recording ? '1' : '0';
  });
  return (
    <div ref={ref} data-testid="playhead" className="pointer-events-none absolute inset-y-0 left-0 z-30 w-px will-change-transform group" aria-hidden>
      <div className="absolute inset-y-0 -left-px w-[2px] bg-fg shadow-[0_0_8px_rgba(245,247,250,0.4)] group-data-[recording=1]:bg-rec" />
      <div className="absolute -left-[6px] top-0 h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-fg group-data-[recording=1]:border-t-rec" />
    </div>
  );
}
