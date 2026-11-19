/** Automatización: curvas por puntos con interpolación lineal, programadas sobre AudioParam. */
import type { AutomationLane, AutomationParam, AutomationPoint, Track } from '@/types/project';

export function valueAt(points: AutomationPoint[], t: number): number {
  if (!points.length) return NaN;
  if (t <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (points[m].t <= t) lo = m; else hi = m; }
  const a = points[lo], b = points[hi];
  return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

export function activeLane(track: Track, param: AutomationParam): AutomationLane | null {
  const l = track.automation?.[param];
  return l && l.enabled && l.points.length ? l : null;
}

/** Programa la curva en el tramo [segPos, segEnd) que suena desde el instante de contexto segCtx. */
export function scheduleLane(param: AudioParam, points: AutomationPoint[], segPos: number, segCtx: number, segEnd: number) {
  param.setValueAtTime(valueAt(points, segPos), segCtx);
  for (const p of points) {
    if (p.t <= segPos || p.t >= segEnd) continue;
    param.linearRampToValueAtTime(p.v, segCtx + (p.t - segPos));
  }
  if (isFinite(segEnd)) {
    const next = points.find((p) => p.t >= segEnd);
    if (next) param.linearRampToValueAtTime(valueAt(points, segEnd), segCtx + (segEnd - segPos));
  }
}

export function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}
