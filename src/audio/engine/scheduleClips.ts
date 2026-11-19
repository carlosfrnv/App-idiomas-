import type { Clip } from '@/types/project';

export interface ScheduledSource { source: AudioBufferSourceNode; gain: GainNode; clipId: string }

/** Factor de fundido (0..1) en una posición relativa al inicio del clip. */
export function fadeFactor(c: Clip, rel: number): number {
  let f = 1;
  if (c.fadeIn > 0 && rel < c.fadeIn) f = Math.min(f, Math.max(0, rel / c.fadeIn));
  const toEnd = c.duration - rel;
  if (c.fadeOut > 0 && toEnd < c.fadeOut) f = Math.min(f, Math.max(0, toEnd / c.fadeOut));
  return f;
}

export interface ClipWindow { playFrom: number; when: number; offset: number; duration: number }

/**
 * Calcula qué parte de un clip suena dentro de un segmento de reproducción
 * [segPos, segEnd) que empieza en el instante de contexto `segCtx`.
 * Función pura: es la base de la sincronización (testeada).
 */
export function clipWindow(c: Clip, segPos: number, segCtx: number, segEnd: number): ClipWindow | null {
  const clipEnd = c.start + c.duration;
  if (clipEnd <= segPos || c.start >= segEnd) return null;
  const playFrom = Math.max(segPos, c.start);
  const until = Math.min(clipEnd, segEnd);
  const duration = until - playFrom;
  if (duration <= 0.0005) return null;
  return { playFrom, when: segCtx + (playFrom - segPos), offset: c.offset + (playFrom - c.start), duration };
}

/**
 * Programa las fuentes de un conjunto de clips. Se usa para reproducción y exportación.
 */
export function scheduleClips(
  ctx: BaseAudioContext,
  clips: Clip[],
  getBuffer: (assetId: string) => AudioBuffer | undefined,
  getDestination: (trackId: string) => AudioNode | undefined,
  segPos: number,
  segCtx: number,
  segEnd: number,
): ScheduledSource[] {
  const out: ScheduledSource[] = [];
  for (const c of clips) {
    const buf = getBuffer(c.assetId);
    const dest = getDestination(c.trackId);
    if (!buf || !dest) continue;
    const w = clipWindow(c, segPos, segCtx, segEnd);
    if (!w || w.offset >= buf.duration) continue;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    const g = gain.gain;
    const rel0 = w.playFrom - c.start;
    const rel1 = rel0 + w.duration;
    g.setValueAtTime(c.gain * fadeFactor(c, rel0), w.when);
    // puntos de automatización de los fundidos
    const points: number[] = [];
    if (c.fadeIn > 0 && c.fadeIn > rel0 && c.fadeIn < rel1) points.push(c.fadeIn);
    const foStart = c.duration - c.fadeOut;
    if (c.fadeOut > 0 && foStart > rel0 && foStart < rel1) points.push(foStart);
    if (c.fadeOut > 0) points.push(rel1);
    for (const p of points.sort((a, b) => a - b)) g.linearRampToValueAtTime(c.gain * fadeFactor(c, p), w.when + (p - rel0));
    source.connect(gain).connect(dest);
    const dur = Math.min(w.duration, buf.duration - w.offset);
    source.start(Math.max(w.when, ctx.currentTime), w.offset, dur);
    out.push({ source, gain, clipId: c.id });
  }
  return out;
}
