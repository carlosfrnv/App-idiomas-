import { create } from 'zustand';
import { engine } from '@/audio/engine/AudioEngine';
import { encodeWav } from '@/audio/export/wav';
import type { AutotuneParams } from '@/audio/pitch/autotune';
import type { ScaleId } from '@/audio/pitch/scales';
import { useProject } from '@/state/projectStore';
import { updateClip } from '@/state/docOps';
import { ensureAssetLoaded, storeGeneratedAudio } from './assets';

export interface PitchCurves { detected: Float32Array; corrected: Float32Array; hopSec: number }
interface PitchState { busy: string | null; progress: number; curves: Record<string, PitchCurves>; set(p: Partial<PitchState>): void }
export const usePitch = create<PitchState>((set) => ({ busy: null, progress: 0, curves: {}, set: (p) => set(p) }));

function runWorker<T>(msg: unknown, transfer: Transferable[], onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../audio/pitch/autotune.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') { onProgress?.(d.f); return; }
      w.terminate();
      if (d.type === 'error') reject(new Error(d.message)); else resolve(d as T);
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Error en el procesador de afinación')); };
    w.postMessage(msg, transfer);
  });
}

const copyChannels = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, i) => new Float32Array(b.getChannelData(i)));

/** Estima la tonalidad cantada en el audio original del clip. */
export async function detectClipKey(clipId: string): Promise<{ key: number; scale: 'major' | 'minor' } | null> {
  const clip = useProject.getState().doc.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  const src = clip.pitch?.sourceAssetId ?? clip.assetId;
  if (!(await ensureAssetLoaded(src))) throw new Error('No se pudo cargar el audio del clip.');
  const buf = engine.getBuffer(src)!;
  const ch = copyChannels(buf);
  const r = await runWorker<{ key: { key: number; scale: 'major' | 'minor' } | null }>({ type: 'detect', channels: ch, sampleRate: buf.sampleRate }, ch.map((c) => c.buffer));
  return r.key;
}

/** Afina el clip a partir de su audio ORIGINAL (repetir no acumula artefactos). */
export async function applyAutotune(clipId: string, p: AutotuneParams & { scale: ScaleId }) {
  const st = usePitch.getState();
  const clip = useProject.getState().doc.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const src = clip.pitch?.sourceAssetId ?? clip.assetId;
  st.set({ busy: clipId, progress: 0 });
  try {
    if (!(await ensureAssetLoaded(src))) throw new Error('No se pudo cargar el audio del clip.');
    const buf = engine.getBuffer(src)!;
    const ch = copyChannels(buf);
    const r = await runWorker<{ channels: Float32Array[]; detected: Float32Array; corrected: Float32Array; hopSec: number }>(
      { type: 'autotune', channels: ch, sampleRate: buf.sampleRate, params: p }, ch.map((c) => c.buffer), (f) => usePitch.getState().set({ progress: f }),
    );
    const out = engine.ctx.createBuffer(r.channels.length, r.channels[0].length, buf.sampleRate);
    r.channels.forEach((c, i) => out.getChannelData(i).set(c));
    const blob = new Blob([encodeWav({ sampleRate: buf.sampleRate, channels: r.channels }, 32)], { type: 'audio/wav' });
    const asset = await storeGeneratedAudio(out, blob, `${clip.name} · afinado`, 'processed');
    useProject.getState().apply((d) => updateClip(d, clipId, { assetId: asset.id, pitch: { sourceAssetId: src, key: p.key, scale: p.scale, strength: p.strength, speedMs: p.speedMs } }));
    usePitch.getState().set({ curves: { ...usePitch.getState().curves, [clipId]: { detected: r.detected, corrected: r.corrected, hopSec: r.hopSec } } });
  } finally {
    usePitch.getState().set({ busy: null, progress: 0 });
  }
}

export function restoreOriginal(clipId: string) {
  const clip = useProject.getState().doc.clips.find((c) => c.id === clipId);
  if (!clip?.pitch) return;
  useProject.getState().apply((d) => updateClip(d, clipId, { assetId: clip.pitch!.sourceAssetId, pitch: undefined }));
}
