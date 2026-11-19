/** Cálculo de niveles a partir de muestras reales (AnalyserNode.getFloatTimeDomainData). */
export interface Levels { peak: number; rms: number; clipped: boolean }

export function computeLevels(buf: Float32Array): Levels {
  let peak = 0, sum = 0, clipped = false;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    if (a >= 0.999) clipped = true;
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, buf.length)), clipped };
}

/** Lectura estéreo con retención de pico y retorno balístico (caída suave). */
export class StereoMeter {
  readonly analysers: [AnalyserNode, AnalyserNode];
  private readonly splitter: ChannelSplitterNode;
  private readonly buf: Float32Array<ArrayBuffer>;
  private display = [0, 0];
  private hold = [0, 0];
  private holdAt = [0, 0];
  clipped = false;

  constructor(ctx: AudioContext, source: AudioNode) {
    this.splitter = ctx.createChannelSplitter(2);
    const mk = () => { const a = ctx.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; return a; };
    this.analysers = [mk(), mk()];
    source.connect(this.splitter);
    this.splitter.connect(this.analysers[0], 0);
    this.splitter.connect(this.analysers[1], 1);
    this.buf = new Float32Array(new ArrayBuffer(1024 * 4));
  }

  /** Devuelve [L, R] con { level (con caída), peak hold, rms } en lineal. */
  read(now = performance.now()) {
    const out = this.analysers.map((a, i) => {
      a.getFloatTimeDomainData(this.buf);
      const l = computeLevels(this.buf);
      if (l.clipped) this.clipped = true;
      // caída ~ 24 dB/s aprox.
      this.display[i] = Math.max(l.peak, this.display[i] * 0.86);
      if (l.peak >= this.hold[i] || now - this.holdAt[i] > 1200) { this.hold[i] = l.peak; this.holdAt[i] = now; }
      return { level: this.display[i], hold: this.hold[i], rms: l.rms };
    });
    return out as [{ level: number; hold: number; rms: number }, { level: number; hold: number; rms: number }];
  }

  /** Espectro (dB por bin) de la señal real, canal izquierdo. */
  readSpectrum(out: Float32Array<ArrayBuffer>) {
    this.analysers[0].getFloatFrequencyData(out);
  }

  get binCount() { return this.analysers[0].frequencyBinCount; }

  dispose() {
    try { this.splitter.disconnect(); } catch { /* noop */ }
  }
}
