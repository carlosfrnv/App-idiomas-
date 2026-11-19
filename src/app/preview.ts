import { create } from 'zustand';
import { engine } from '@/audio/engine/AudioEngine';
import { ensureAssetLoaded } from './assets';

interface PreviewState { playingId: string | null; set(p: Partial<PreviewState>): void }
export const usePreview = create<PreviewState>((set) => ({ playingId: null, set: (p) => set(p) }));

let current: AudioBufferSourceNode | null = null;

/** Escucha previa de un audio de la biblioteca (fuera de la mezcla). */
export async function togglePreview(assetId: string) {
  const st = usePreview.getState();
  current?.stop();
  current = null;
  if (st.playingId === assetId) { st.set({ playingId: null }); return; }
  await engine.resume();
  if (!(await ensureAssetLoaded(assetId))) return;
  const buf = engine.getBuffer(assetId)!;
  const src = engine.ctx.createBufferSource();
  const g = engine.ctx.createGain();
  g.gain.value = 0.9;
  src.buffer = buf;
  src.connect(g).connect(engine.ctx.destination);
  src.onended = () => { if (current === src) { current = null; usePreview.getState().set({ playingId: null }); } };
  src.start();
  current = src;
  st.set({ playingId: assetId });
}

export function stopPreview() {
  current?.stop();
  current = null;
  usePreview.getState().set({ playingId: null });
}
