/** Conversión de tiempo musical. Todas las posiciones del modelo están en segundos. */
export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

export function secondsPerBar(bpm: number, ts: [number, number]): number {
  return secondsPerBeat(bpm) * ts[0] * (4 / ts[1]);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const ms = Math.floor((r - whole) * 1000);
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Posición en formato compás.tiempo.tick (1-based), 960 ticks por negra. */
export function formatBars(sec: number, bpm: number, ts: [number, number]): string {
  const beatLen = secondsPerBeat(bpm) * (4 / ts[1]);
  const totalBeats = Math.max(0, sec) / beatLen;
  const bar = Math.floor(totalBeats / ts[0]) + 1;
  const beat = Math.floor(totalBeats % ts[0]) + 1;
  const tick = Math.floor((totalBeats % 1) * 960);
  return `${bar}.${beat}.${String(tick).padStart(3, '0')}`;
}

/** Ajusta un tiempo a la rejilla (subdivisión en fracción de tiempo/beat). */
export function snapTime(sec: number, bpm: number, ts: [number, number], gridBeats: number): number {
  const step = secondsPerBeat(bpm) * (4 / ts[1]) * gridBeats;
  if (step <= 0) return sec;
  return Math.round(sec / step) * step;
}

/** Elige una subdivisión de rejilla legible según el zoom (px por segundo). */
export function gridForZoom(pxPerSec: number, bpm: number, ts: [number, number]): number {
  const beatPx = pxPerSec * secondsPerBeat(bpm) * (4 / ts[1]);
  const candidates = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
  for (const c of candidates) if (beatPx * c >= 14) return c;
  return 64;
}
