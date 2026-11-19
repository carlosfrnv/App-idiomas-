/// <reference path="./worklet-env.d.ts" />
/**
 * Captura de micrófono con precisión de muestra. Envía bloques Float32 por canal al hilo
 * principal (transferibles) y reporta el frame exacto de inicio para alinear la toma.
 */
const CHUNK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  private recording = false;
  private pendingStart = false;
  private stopRequested = false;
  private buffers: Float32Array[] = [];
  private filled = 0;
  private channels = 1;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; channels?: number };
      if (msg.type === 'start') {
        this.channels = Math.max(1, Math.min(2, msg.channels ?? 1));
        this.pendingStart = true;
        this.stopRequested = false;
      } else if (msg.type === 'stop') {
        this.stopRequested = true;
      }
    };
  }

  private alloc() {
    this.buffers = Array.from({ length: this.channels }, () => new Float32Array(CHUNK));
    this.filled = 0;
  }

  private flush() {
    if (this.filled === 0) return;
    const out = this.buffers.map((b) => b.slice(0, this.filled));
    this.port.postMessage({ type: 'chunk', data: out }, out.map((b) => b.buffer));
    this.alloc();
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (this.pendingStart) {
      this.pendingStart = false;
      this.recording = true;
      this.alloc();
      this.port.postMessage({ type: 'started', frame: currentFrame, sampleRate });
    }
    if (this.recording) {
      const frames = input && input.length ? input[0].length : 128;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < this.channels; c++) {
          const src = input && input.length ? input[Math.min(c, input.length - 1)] : null;
          this.buffers[c][this.filled] = src ? src[i] : 0;
        }
        this.filled++;
        if (this.filled === CHUNK) this.flush();
      }
      if (this.stopRequested) {
        this.flush();
        this.recording = false;
        this.stopRequested = false;
        this.port.postMessage({ type: 'stopped', frame: currentFrame });
      }
    }
    return true;
  }
}

registerProcessor('sonora-recorder', RecorderProcessor);
