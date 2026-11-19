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
    for (let i = 0; i < n; i++) {
      const v = vals[Math.min(i, vals.length - 1)];
      const o = i * (bw + gap);
      g.fillStyle = '#0B0E14';
      if (vertical) g.fillRect(o, 0, bw, H); else g.fillRect(0, o, W, bw);
      const l = norm(v.level) * len;
      g.fillStyle = grad;
      if (vertical) g.fillRect(o, H - l, bw, l); else g.fillRect(0, o, l, bw);
      const h = norm(v.hold) * len;
      if (h > 1) {
        g.fillStyle = v.hold >= 0.999 ? '#EF4444' : '#F5F7FA';
        if (vertical) g.fillRect(o, H - h, bw, Math.max(1, dpr)); else g.fillRect(h - dpr, o, Math.max(1, dpr), bw);
      }
    }
    // marca de 0 dBFS
    g.fillStyle = 'rgba(245,247,250,0.25)';
    const zp = z2 * len;
    if (vertical) g.fillRect(0, H - zp, W, Math.max(1, dpr * 0.5)); else g.fillRect(zp, 0, Math.max(1, dpr * 0.5), H);
  });
  return <canvas ref={ref} className={`block rounded-[2px] ${className}`} style={{ width, height }} aria-hidden />;
}
