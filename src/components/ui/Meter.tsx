import { useRef } from 'react';
import { useFrame } from '@/hooks/useFrame';
import { gainToDb } from '@/lib/audioMath';

type Reading = [{ level: number; hold: number }, { level: number; hold: number }] | { peak: number }[] | null;

const FLOOR = -60;
const norm = (g: number) => { const db = gainToDb(g); return isFinite(db) ? Math.max(0, Math.min(1, (db - FLOOR) / (6 - FLOOR))) : 0; };

/**
 * Medidor de nivel dibujado en canvas a partir de la señal real (AnalyserNode).
 * Escala -60..+6 dBFS, zonas verde/ámbar/rojo, retención de pico.
 */
export function Meter({ read, width = 10, height = 160, orientation = 'vertical', channels = 2, className = '' }: { read: () => Reading; width?: number; height?: number; orientation?: 'vertical' | 'horizontal'; channels?: 1 | 2; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useFrame(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = width * dpr, H = height * dpr;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const r = read();
    const vals: { level: number; hold: number }[] = r
      ? (r as { level?: number; hold?: number; peak?: number }[]).map((x) => ({ level: x.level ?? x.peak ?? 0, hold: x.hold ?? x.peak ?? 0 }))
      : [{ level: 0, hold: 0 }, { level: 0, hold: 0 }];
    const n = channels;
    const vertical = orientation === 'vertical';
    const len = vertical ? H : W;
    const thick = vertical ? W : H;
    const gap = n === 2 ? Math.max(1, Math.round(dpr)) : 0;
    const bw = (thick - gap * (n - 1)) / n;
    const grad = vertical ? g.createLinearGradient(0, H, 0, 0) : g.createLinearGradient(0, 0, W, 0);
    const z0 = (-18 - FLOOR) / (6 - FLOOR), z1 = (-6 - FLOOR) / (6 - FLOOR), z2 = (0 - FLOOR) / (6 - FLOOR);
    grad.addColorStop(0, '#16a34a'); grad.addColorStop(z0, '#22C55E'); grad.addColorStop(z1, '#F59E0B'); grad.addColorStop(z2, '#EF4444'); grad.addColorStop(1, '#EF4444');
    // LED segmentados: verde → ámbar (−18 dB) → rojo (−6 dB); apagados en tono oscuro
    const seg = Math.max(2, Math.round(3 * dpr));
    const gapPx = Math.max(1, Math.round(dpr));
    const count = Math.floor(len / (seg + gapPx));
    const colorAt = (f: number) => (f >= z2 ? '#EF4444' : f >= z1 ? '#F59E0B' : '#22C55E');
    for (let i = 0; i < n; i++) {
      const v = vals[Math.min(i, vals.length - 1)];
      const o = i * (bw + gap);
      const lit = norm(v.level);
      const hold = norm(v.hold);
      for (let k = 0; k < count; k++) {
        const f = (k + 0.5) / count;
        const on = f <= lit;
        const isHold = hold > 0.02 && Math.abs(f - hold) < 0.5 / count;
        g.fillStyle = on || isHold ? colorAt(f) : 'rgba(255,255,255,0.045)';
        g.globalAlpha = on || isHold ? 1 : 1;
        const p0 = k * (seg + gapPx);
        if (vertical) g.fillRect(o, H - p0 - seg, bw, seg); else g.fillRect(p0, o, seg, bw);
      }
    }
    void grad;
    // marca de 0 dBFS
    g.fillStyle = 'rgba(245,247,250,0.25)';
    const zp = z2 * len;
    if (vertical) g.fillRect(0, H - zp, W, Math.max(1, dpr * 0.5)); else g.fillRect(zp, 0, Math.max(1, dpr * 0.5), H);
  });
  return <canvas ref={ref} className={`block rounded-[2px] ${className}`} style={{ width, height }} aria-hidden />;
}
