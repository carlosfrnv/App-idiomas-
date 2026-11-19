import { engine } from '@/audio/engine/AudioEngine';
import { useTransport } from '@/state/transportStore';
import { useProject } from '@/state/projectStore';
import { stopRecording } from './recording';

engine.onEnded(() => useTransport.getState().set({ playing: false, position: engine.getPosition() }));

export async function play() {
  const t = useTransport.getState();
  if (t.playing) return;
  await engine.play(t.position);
  t.set({ playing: engine.playing });
}

export async function pause() {
  const t = useTransport.getState();
  if (t.recording) { await stopRecording(); return; }
  engine.pause();
  t.set({ playing: false, position: engine.getPosition() });
}

export async function togglePlay() {
  if (useTransport.getState().playing) await pause();
  else await play();
}

export async function stop() {
  const t = useTransport.getState();
  if (t.recording) await stopRecording();
  const wasPlaying = engine.playing;
  // Detener: primera pulsación vuelve a donde empezó; con el transporte parado, vuelve a 0.
  engine.stop(wasPlaying ? t.position : 0);
  t.set({ playing: false, position: wasPlaying ? t.position : 0 });
}

export function seek(pos: number) {
  const p = Math.max(0, pos);
  engine.seek(p);
  if (!engine.playing) useTransport.getState().set({ position: p });
}

export function rewind() {
  seek(useProject.getState().doc.loop.enabled ? useProject.getState().doc.loop.start : 0);
}

export function setMetronome(on: boolean) {
  engine.metronome = on;
  useTransport.getState().set({ metronome: on });
}

export function toggleLoop() {
  const p = useProject.getState();
  const l = p.doc.loop;
  p.apply((d) => ({ ...d, loop: { ...l, enabled: !l.enabled } }), { history: false });
}
