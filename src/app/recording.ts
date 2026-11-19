import { engine } from '@/audio/engine/AudioEngine';
import { Recorder, RecorderError, alignRecording, recordingSupported } from '@/audio/recording/Recorder';
import { encodeWav } from '@/audio/export/wav';
import { useTransport } from '@/state/transportStore';
import { useProject } from '@/state/projectStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { addClip, addTrack, makeClip, makeTrack, updateTrack } from '@/state/docOps';
import { storeGeneratedAudio } from './assets';
import { toast } from '@/state/toastStore';
import { create } from 'zustand';

export const recorder = new Recorder(engine);

interface RecState {
  inputOpen: boolean;
  label: string;
  error: string | null;
  busy: boolean;
  takeCount: number;
  set(p: Partial<RecState>): void;
}
export const useRecState = create<RecState>((set) => ({ inputOpen: false, label: '', error: null, busy: false, takeCount: 0, set: (p) => set(p) }));

recorder.onDeviceLost = () => {
  useRecState.getState().set({ inputOpen: false, label: '', error: 'El micrófono se ha desconectado.' });
  if (useTransport.getState().recording) void stopRecording();
  toast.error('Micrófono desconectado', 'Vuelve a conectarlo y selecciónalo en la configuración de grabación.');
};

export async function openInput(deviceId?: string | null): Promise<boolean> {
  const st = useSettings.getState();
  try {
    await engine.resume();
    recorder.setGain(st.inputGain);
    recorder.setMonitor(st.monitor);
    await recorder.open(deviceId === undefined ? st.inputDeviceId : deviceId);
    useSettings.getState().set({ inputDeviceId: recorder.deviceId });
    useRecState.getState().set({ inputOpen: true, label: recorder.label, error: null });
    return true;
  } catch (e) {
    const msg = e instanceof RecorderError ? e.message : (e as Error).message;
    useRecState.getState().set({ inputOpen: false, error: msg });
    return false;
  }
}

/** Latencia total estimada a compensar (s). */
export function totalLatency(): number {
  const s = useSettings.getState();
  const info = engine.latencyInfo();
  const auto = s.autoLatency ? info.base + info.output + recorder.inputLatency() : 0;
  return Math.max(-0.5, auto + s.latencyOffsetMs / 1000);
}

function pickTargetTrack(): string {
  const p = useProject.getState();
  const ui = useUi.getState();
  const tracks = p.doc.tracks;
  const armed = tracks.find((t) => t.armed && !t.locked);
  if (armed) return armed.id;
  const voxCount = tracks.filter((t) => /^Voz/.test(t.name)).length;
  const t = makeTrack(p.doc, { name: voxCount ? `Voz ${voxCount + 1}` : 'Voz', armed: true });
  p.apply((d) => addTrack(d, t));
  ui.set({ selectedTrackId: t.id });
  return t.id;
}

export async function startRecording(): Promise<void> {
  const t = useTransport.getState();
  if (t.recording || useRecState.getState().busy) return;
  if (!recordingSupported()) {
    toast.error('Grabación no disponible', 'Este navegador no permite grabar audio.');
    return;
  }
  useRecState.getState().set({ busy: true });
  try {
    if (!recorder.isOpen) {
      const ok = await openInput();
      if (!ok) {
        useUi.getState().set({ recordSetupOpen: true });
        toast.error('No se puede grabar', useRecState.getState().error ?? undefined);
        return;
      }
    }
    // iOS/Safari: sesión de audio en modo grabación
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) try { nav.audioSession.type = 'play-and-record'; } catch { /* noop */ }
    const trackId = pickTargetTrack();
    recordTarget = trackId;
    engine.autoStop = false;
    const from = engine.playing ? engine.getPosition() : t.position;
    recordFrom = from;
    if (!engine.playing) await engine.play(from);
    recorder.resetClip();
    recorder.start();
    t.set({ recording: true, playing: true });
  } finally {
    useRecState.getState().set({ busy: false });
  }
}

let recordTarget: string | null = null;
let recordFrom = 0;

export async function stopRecording(): Promise<void> {
  const t = useTransport.getState();
  if (!t.recording) return;
  useRecState.getState().set({ busy: true });
  try {
    const res = await recorder.stop();
    // calcular la posición ANTES de parar (los segmentos del transporte siguen vigentes)
    const songPos = res ? engine.positionAtCtxTime(res.startFrame / res.sampleRate) : 0;
    engine.pause();
    engine.autoStop = true;
    // el cabezal vuelve al inicio de la toma para poder escucharla de inmediato
    engine.seek(recordFrom);
    t.set({ recording: false, playing: false, position: recordFrom });
    if (!res) { toast.warning('Grabación vacía', 'No se capturó audio.'); return; }
    const latency = totalLatency();
    const { start, trimHead } = alignRecording(songPos, latency);
    const skip = Math.min(res.channels[0].length, Math.round(trimHead * res.sampleRate));
    const chans = res.channels.map((c) => c.subarray(skip));
    const frames = chans[0].length;
    if (frames < res.sampleRate * 0.15) { toast.warning('Toma demasiado corta', 'Se ha descartado.'); return; }
    const buf = engine.ctx.createBuffer(chans.length, frames, res.sampleRate);
    chans.forEach((c, i) => buf.getChannelData(i).set(c));
    const blob = new Blob([encodeWav({ sampleRate: res.sampleRate, channels: chans }, 32)], { type: 'audio/wav' });
    const n = useRecState.getState().takeCount + 1;
    useRecState.getState().set({ takeCount: n });
    const p = useProject.getState();
    let trackId = recordTarget && p.doc.tracks.some((x) => x.id === recordTarget) ? recordTarget : pickTargetTrack();
    const track = p.doc.tracks.find((x) => x.id === trackId)!;
    const asset = await storeGeneratedAudio(buf, blob, `${track.name} · Toma ${n}`, 'recording');
    const overlaps = p.doc.clips.some((c) => c.trackId === trackId && c.start < start + buf.duration && c.start + c.duration > start);
    p.apply((d) => {
      let doc = d;
      if (overlaps) {
        // la nueva toma va a una pista nueva justo debajo (con los mismos efectos), la anterior se silencia
        const idx = doc.tracks.findIndex((x) => x.id === trackId);
        const nt = makeTrack(doc, { name: `${track.name} · Toma ${n}`, color: track.color, effects: structuredClone(track.effects), volume: track.volume, pan: track.pan, armed: true });
        doc = updateTrack(doc, trackId, { armed: false, mute: true });
        doc = addTrack(doc, nt, idx + 1);
        trackId = nt.id;
      }
      return addClip(doc, makeClip({ trackId, assetId: asset.id, name: asset.name, start, duration: buf.duration, recorded: true }));
    });
    const clip = useProject.getState().doc.clips.at(-1);
    useUi.getState().set({ selectedTrackId: trackId, selectedClipIds: clip ? [clip.id] : [] });
    if (recorder.clipped) toast.warning('Saturación detectada', 'La entrada superó 0 dBFS durante la toma. Baja la ganancia de entrada.');
    else toast.success('Toma guardada', `${buf.duration.toFixed(1)} s · latencia compensada ${(latency * 1000).toFixed(0)} ms`);
  } catch (e) {
    toast.error('Error al finalizar la grabación', (e as Error).message);
  } finally {
    useRecState.getState().set({ busy: false });
  }
}

export async function toggleRecord() {
  if (useTransport.getState().recording) await stopRecording();
  else await startRecording();
}
