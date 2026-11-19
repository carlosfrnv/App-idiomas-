import { useEffect, useRef } from 'react';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { secondsPerBar, secondsPerBeat } from '@/lib/time';
import { seek } from '@/app/transport';
import { useTimelineApi, RULER_H } from './TimelineContext';

const LOOP_H = 12;

/** Regla: compases y tiempos. Franja superior = región de bucle (arrastrar para definir). */
export function Ruler() {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useTimelineApi();
  const { pxPerSec, scrollTime, viewportWidth } = useUi();
  const bpm = useProject((s) => s.doc.bpm);
  const ts = useProject((s) => s.doc.timeSignature);
  const loop = useProject((s) => s.doc.loop);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = viewportWidth, H = RULER_H;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // bucle
    const lx0 = (loop.start - scrollTime) * pxPerSec, lx1 = (loop.end - scrollTime) * pxPerSec;
    if (lx1 > 0 && lx0 < W) {
      g.fillStyle = loop.enabled ? 'rgba(139,92,246,0.55)' : 'rgba(155,167,183,0.18)';
      g.fillRect(lx0, 1, lx1 - lx0, LOOP_H - 2);
      g.fillStyle = loop.enabled ? '#C4B5FD' : 'rgba(155,167,183,0.5)';
      g.fillRect(lx0, 1, 2, LOOP_H - 2); g.fillRect(lx1 - 2, 1, 2, LOOP_H - 2);
    }
    const barS = secondsPerBar(bpm, ts);
    const beatS = secondsPerBeat(bpm) * (4 / ts[1]);
    const barPx = barS * pxPerSec;
    const beatPx = beatS * pxPerSec;
    let every = 1;
    while (barPx * every < 44) every *= 2;
    const first = Math.floor(scrollTime / barS);
    const last = Math.ceil((scrollTime + W / pxPerSec) / barS);
    g.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace';
    g.textBaseline = 'middle';
    for (let b = Math.max(0, first); b <= last; b++) {
      const x = Math.round((b * barS - scrollTime) * pxPerSec) + 0.5;
      const major = b % every === 0;
      g.fillStyle = major ? '#4B5668' : '#2E3747';
      g.fillRect(x, major ? LOOP_H + 2 : H - 9, 1, major ? H - LOOP_H - 2 : 9);
      if (major) { g.fillStyle = '#9BA7B7'; g.fillText(String(b + 1), x + 4, LOOP_H + 10); }
      if (beatPx >= 10) {
        for (let k = 1; k < ts[0]; k++) {
          const bx = Math.round(x + k * beatPx);
          g.fillStyle = '#273041';
          g.fillRect(bx, H - 6, 1, 6);
        }
      }
    }
    g.fillStyle = '#293241';
    g.fillRect(0, H - 1, W, 1);
  }, [pxPerSec, scrollTime, viewportWidth, bpm, ts, loop]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const inLoopStrip = e.clientY - rect.top < LOOP_H + 2;
    const t0 = api.timeAtClientX(e.clientX);
    const P = useProject.getState();
    if (inLoopStrip) {
      const l = P.doc.loop;
      const tol = 6 / useUi.getState().pxPerSec;
      const mode = Math.abs(t0 - l.start) < tol ? 'start' : Math.abs(t0 - l.end) < tol ? 'end' : t0 > l.start && t0 < l.end ? 'move' : 'new';
      const s0 = api.snap(t0, e);
      P.checkpoint();
      const move = (ev: PointerEvent) => {
        const t = api.snap(api.timeAtClientX(ev.clientX), ev);
        P.apply((d) => {
          let { start, end } = d.loop;
          if (mode === 'start') start = Math.min(t, end - 0.05);
          else if (mode === 'end') end = Math.max(t, start + 0.05);
          else if (mode === 'move') { const len = l.end - l.start; start = Math.max(0, l.start + (t - s0)); end = start + len; }
          else { start = Math.min(s0, t); end = Math.max(s0, t); }
          return { ...d, loop: { enabled: mode === 'new' ? end - start > 0.05 : d.loop.enabled || mode !== 'move', start: Math.max(0, start), end } };
        }, { history: false });
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      return;
    }
    seek(api.snap(t0, e));
    const move = (ev: PointerEvent) => seek(api.snap(api.timeAtClientX(ev.clientX), ev));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return <canvas ref={ref} data-testid="ruler" onPointerDown={onPointerDown} className="block cursor-pointer touch-none bg-panel" style={{ width: viewportWidth, height: RULER_H }} aria-label="Regla de tiempo: clic para mover el cabezal; arrastra en la franja superior para definir el bucle" />;
}
