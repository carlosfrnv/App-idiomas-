/**
 * Detección de frecuencia fundamental con YIN (de Cheveigné & Kawahara, 2002):
 * diferencia acumulada normalizada + umbral absoluto + interpolación parabólica.
 */
export interface PitchTrack { f0: Float32Array; clarity: Float32Array; hopSec: number }

export function yinFrame(x: Float32Array, start: number, W: number, minLag: number, maxLag: number, d: Float32Array, threshold = 0.12): { lag: number; clarity: number } {
  d[0] = 1;
  let running = 0;
  let best = -1;
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[start + i] - x[start + i + tau]; s += v * v; }
    running += s;
    d[tau] = running > 0 ? (s * tau) / running : 1;
  }
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return { lag: 0, clarity: 0 };
  const a = d[best - 1] ?? d[best], b = d[best], c = d[best + 1] ?? d[best];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  return { lag: best + Math.max(-1, Math.min(1, shift)), clarity: 1 - b };
}

/** Diezmado simple (media + paso) para acelerar la detección. */
function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) { let s = 0; for (let k = 0; k < factor; k++) s += x[i * factor + k]; out[i] = s / factor; }
  return out;
}

export function trackPitch(x: Float32Array, sampleRate: number, opts: { hopSec?: number; minHz?: number; maxHz?: number; onProgress?: (f: number) => void } = {}): PitchTrack {
  const factor = Math.max(1, Math.floor(sampleRate / 16000));
  const y = decimate(x, factor);
  const sr = sampleRate / factor;
  const hopSec = opts.hopSec ?? 0.01;
  const hop = Math.max(1, Math.round(hopSec * sr));
  const minLag = Math.floor(sr / (opts.maxHz ?? 1000));
  const maxLag = Math.ceil(sr / (opts.minHz ?? 70));
  const W = maxLag;
  const frames = Math.max(0, Math.floor((y.length - W - maxLag - 1) / hop) + 1);
  const total = Math.ceil(x.length / (hopSec * sampleRate));
  const f0 = new Float32Array(total), clarity = new Float32Array(total);
  const d = new Float32Array(maxLag + 2);
  // energía mínima para considerar una trama sonora (evita "detectar" tono en silencio)
  let peak = 0; for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const gate = Math.pow(10, -45 / 20) * Math.max(peak, 1e-6);
  for (let k = 0; k < frames && k < total; k++) {
    const start = k * hop;
    let e = 0; for (let i = 0; i < W; i++) e = Math.max(e, Math.abs(y[start + i]));
    if (e < gate) continue;
    const r = yinFrame(y, start, W, minLag, maxLag, d);
    if (r.lag > 0 && r.clarity > 0.75) {
      // el centro de la ventana corresponde al instante (start + W/2)
      const idx = Math.round((start + W / 2) / hop);
      if (idx < total) { f0[idx] = sr / r.lag; clarity[idx] = r.clarity; }
    }
    if (k % 500 === 0) opts.onProgress?.(k / frames);
  }
  // rellenar huecos de una trama y quitar puntos aislados
  for (let i = 1; i < total - 1; i++) {
    if (!f0[i] && f0[i - 1] && f0[i + 1] && Math.abs(f0[i - 1] - f0[i + 1]) / f0[i - 1] < 0.06) f0[i] = (f0[i - 1] + f0[i + 1]) / 2;
    else if (f0[i] && !f0[i - 1] && !f0[i + 1]) f0[i] = 0;
  }
  return { f0, clarity, hopSec };
}
