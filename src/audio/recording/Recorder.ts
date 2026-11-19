/**
 * Grabación de micrófono con AudioWorklet.
 * Flujo: getUserMedia → MediaStreamSource → ganancia de entrada → [medidor] → worklet.
 * La señal NO se envía a los altavoces salvo que se active la monitorización.
 */
import { RECORDER_PROCESSOR } from '@/audio/worklets/names';
import { computeLevels } from '@/audio/engine/meter';
import type { AudioEngine } from '@/audio/engine/AudioEngine';

export type MicPermission = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface RecordingResult {
  channels: Float32Array[];
  sampleRate: number;
  /** Frame del AudioContext en el que empezó la captura. */
  startFrame: number;
}

export class RecorderError extends Error {
  constructor(public code: 'unsupported' | 'denied' | 'notfound' | 'busy' | 'worklet' | 'samplerate' | 'unknown', message: string) {
    super(message);
  }
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
}

export class Recorder {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[][] = [];
  private startFrame = -1;
  private meterBuf = new Float32Array(new ArrayBuffer(2048 * 4));
  private _clipped = false;
  private _gain = 1;
  private _monitor = false;
  deviceId: string | null = null;
  channelCount = 1;
  onDeviceLost: (() => void) | null = null;

  constructor(private engine: AudioEngine) {}

  get isOpen() { return !!this.stream; }
  get clipped() { return this._clipped; }
  resetClip() { this._clipped = false; }

  static async listInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  }

  static async permission(): Promise<MicPermission> {
    if (!recordingSupported()) return 'unsupported';
    try {
      const st = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      return (st?.state as MicPermission) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /** Abre (o reabre con otro dispositivo) la entrada de micrófono. */
  async open(deviceId: string | null = this.deviceId): Promise<void> {
    if (!recordingSupported()) throw new RecorderError('unsupported', 'Tu navegador no permite grabar audio. Usa Chrome, Edge, Firefox o Safari recientes.');
    await this.engine.ready();
    const ctx = this.engine.ctx;
    this.close();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          // voz limpia para producción: sin procesado del navegador
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: this.channelCount },
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new RecorderError('denied', 'Permiso de micrófono denegado. Actívalo en la configuración del navegador (icono del candado en la barra de direcciones).');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new RecorderError('notfound', 'No se encontró ningún micrófono. Conecta uno y vuelve a intentarlo.');
      if (name === 'NotReadableError') throw new RecorderError('busy', 'El micrófono está siendo usado por otra aplicación.');
      throw new RecorderError('unknown', `No se pudo abrir el micrófono: ${(e as Error)?.message ?? e}`);
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    this.deviceId = track?.getSettings().deviceId ?? deviceId;
    track?.addEventListener('ended', () => {
      this.close();
      this.onDeviceLost?.();
    });
    try {
      this.source = ctx.createMediaStreamSource(stream);
    } catch (e) {
      this.close();
      throw new RecorderError('samplerate', `El micrófono usa una frecuencia de muestreo distinta a la del motor (${ctx.sampleRate} Hz) y este navegador no puede convertirla. Cambia la frecuencia del dispositivo en tu sistema. (${(e as Error).message})`);
    }
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = this._gain;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = this._monitor ? 1 : 0;
    this.source.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.monitorGain).connect(this.engine.monitorDestination);
    try {
      this.node = new AudioWorkletNode(ctx, RECORDER_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 0, channelCount: this.channelCount, channelCountMode: 'explicit' });
    } catch {
      this.close();
      throw new RecorderError('worklet', 'No se pudo iniciar el procesador de grabación (AudioWorklet).');
    }
    this.inputGain.connect(this.node);
    this.node.port.onmessage = (e) => this.onMessage(e.data);
  }

  private onMessage(msg: { type: string; frame?: number; data?: Float32Array[] }) {
    if (msg.type === 'started') this.startFrame = msg.frame ?? 0;
    else if (msg.type === 'chunk' && msg.data) this.chunks.push(msg.data);
    else if (msg.type === 'stopped') this.stopResolve?.();
  }

  private stopResolve: (() => void) | null = null;

  setGain(g: number) {
    this._gain = g;
    if (this.inputGain) this.inputGain.gain.setTargetAtTime(g, this.engine.ctx.currentTime, 0.01);
  }
  get gain() { return this._gain; }

  setMonitor(on: boolean) {
    this._monitor = on;
    if (this.monitorGain) this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.engine.ctx.currentTime, 0.01);
  }
  get monitor() { return this._monitor; }

  /** Nivel de entrada (pico lineal) a partir de la señal real del micrófono. */
  readLevel(): { peak: number; rms: number } {
    if (!this.analyser) return { peak: 0, rms: 0 };
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    const l = computeLevels(this.meterBuf);
    if (l.clipped) this._clipped = true;
    return { peak: l.peak, rms: l.rms };
  }

  /** Latencia de entrada informada por el navegador (s), si existe. */
  inputLatency(): number {
    const s = this.stream?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
    return typeof s?.latency === 'number' ? s.latency : 0;
  }

  get label(): string {
    return this.stream?.getAudioTracks()[0]?.label ?? '';
  }

  start() {
    if (!this.node) throw new RecorderError('unknown', 'El micrófono no está abierto.');
    this.chunks = [];
    this.startFrame = -1;
    this.node.port.postMessage({ type: 'start', channels: this.channelCount });
  }

  async stop(): Promise<RecordingResult | null> {
    if (!this.node) return null;
    const done = new Promise<void>((res) => { this.stopResolve = res; });
    this.node.port.postMessage({ type: 'stop' });
    await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
    this.stopResolve = null;
    if (this.startFrame < 0 || this.chunks.length === 0) return null;
    const total = this.chunks.reduce((n, c) => n + c[0].length, 0);
    const numCh = this.chunks[0].length;
    const channels = Array.from({ length: numCh }, () => new Float32Array(total));
    let o = 0;
    for (const c of this.chunks) {
      for (let ch = 0; ch < numCh; ch++) channels[ch].set(c[ch], o);
      o += c[0].length;
    }
    this.chunks = [];
    return { channels, sampleRate: this.engine.ctx.sampleRate, startFrame: this.startFrame };
  }

  close() {
    this.node?.port.postMessage({ type: 'stop' });
    [this.source, this.inputGain, this.analyser, this.monitorGain, this.node].forEach((n) => { try { n?.disconnect(); } catch { /* noop */ } });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.node = null;
    this.analyser = null;
    this.inputGain = null;
    this.monitorGain = null;
  }
}

/**
 * Calcula la posición del clip grabado en la línea temporal.
 * La voz que llega al worklet en el instante T corresponde a lo que el usuario oyó
 * (salida) y cantó (entrada) → se resta la latencia total de ida y vuelta.
 */
export function alignRecording(songPosAtStart: number, latencySec: number): { start: number; trimHead: number } {
  const start = songPosAtStart - latencySec;
  if (start >= 0) return { start, trimHead: 0 };
  return { start: 0, trimHead: -start };
}
