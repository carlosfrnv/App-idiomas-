/**
 * Renderizado offline de la mezcla con el MISMO grafo que la reproducción en tiempo real
 * (canales, efectos, volumen, panorama, mute/solo, master).
 */
import type { ProjectDoc } from '@/types/project';
import { ensureWorklets } from '@/audio/worklets/loader';
import { isTrackAudible, projectEnd } from '@/state/docOps';
import { TrackChannel } from '@/audio/engine/TrackChannel';
import { MasterBus } from '@/audio/engine/MasterBus';
import { scheduleClips } from '@/audio/engine/scheduleClips';

export interface RenderOptions {
  sampleRate: number;
  start?: number;
  end?: number;
  /** Cola extra para reverbs/delays (s). Si no se indica, se calcula según los efectos. */
  tail?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function effectTail(doc: ProjectDoc): number {
  let tail = 0.05;
  const all = [...doc.masterEffects, ...doc.tracks.flatMap((t) => t.effects)];
  for (const e of all) {
    if (!e.enabled) continue;
    if (e.type === 'reverb') tail = Math.max(tail, e.params.decay + e.params.preDelay);
    if (e.type === 'delay') tail = Math.max(tail, Math.min(6, 1.5 + e.params.feedback * 4));
  }
  return tail;
}

export async function renderMix(doc: ProjectDoc, buffers: Map<string, AudioBuffer>, opts: RenderOptions): Promise<AudioBuffer> {
  const start = Math.max(0, opts.start ?? 0);
  const end = opts.end ?? projectEnd(doc);
  if (end - start <= 0) throw new Error('No hay audio que exportar: el proyecto está vacío.');
  const tail = opts.tail ?? effectTail(doc);
  const length = Math.ceil((end - start + tail) * opts.sampleRate);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: opts.sampleRate });
  const workletsReady = await ensureWorklets(ctx);
  const fx = { bpm: doc.bpm, workletsReady };
  const master = new MasterBus(ctx, ctx.destination);
  master.update(doc.masterVolume, doc.masterEffects, fx);
  const channels = new Map<string, TrackChannel>();
  for (const t of doc.tracks) {
    const ch = new TrackChannel(ctx, master.input);
    ch.update(t, isTrackAudible(doc, t), fx, true);
    channels.set(t.id, ch);
  }
  scheduleClips(ctx, doc.clips, (id) => buffers.get(id), (id) => channels.get(id)?.input, start, 0, end);

  // Progreso real: suspensiones periódicas del contexto offline.
  const duration = length / opts.sampleRate;
  const steps = Math.min(40, Math.max(4, Math.floor(duration / 2)));
  const quantum = 128 / opts.sampleRate;
  for (let i = 1; i < steps; i++) {
    const t = Math.floor(((duration * i) / steps) / quantum) * quantum;
    if (t <= 0 || t >= duration) continue;
    ctx.suspend(t).then(() => {
      if (opts.signal?.aborted) return; // se deja suspendido: la promesa se descarta
      opts.onProgress?.(t / duration);
      void ctx.resume();
    }).catch(() => { /* suspend no soportado: sin progreso intermedio */ });
  }
  const abort = new Promise<never>((_, rej) => opts.signal?.addEventListener('abort', () => rej(new DOMException('Exportación cancelada', 'AbortError'))));
  const result = await Promise.race([ctx.startRendering(), abort]);
  opts.onProgress?.(1);
  return result;
}

/** Normaliza para pico máximo dado (dBFS), opcional. */
export function peakOf(buf: AudioBuffer): number {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
  }
  return p;
}
