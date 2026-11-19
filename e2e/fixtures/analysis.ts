/** Amplitud de una componente sinusoidal (Goertzel) en un tramo. */
export function toneAmplitude(x: Float32Array, sampleRate: number, freq: number, from: number, to: number): number {
  const a = Math.floor(from * sampleRate), b = Math.floor(to * sampleRate);
  const n = b - a;
  const w = (2 * Math.PI * freq) / sampleRate;
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) { re += x[a + i] * Math.cos(w * i); im -= x[a + i] * Math.sin(w * i); }
  return (2 * Math.sqrt(re * re + im * im)) / n;
}

export function rms(x: Float32Array, sampleRate: number, from: number, to: number): number {
  const a = Math.floor(from * sampleRate), b = Math.min(x.length, Math.floor(to * sampleRate));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

/** RMS tras restar la componente sinusoidal conocida (lo que NO es la instrumental). */
export function residualRms(x: Float32Array, sampleRate: number, freq: number, from: number, to: number): number {
  const a = Math.floor(from * sampleRate), b = Math.floor(to * sampleRate);
  const n = b - a;
  const w = (2 * Math.PI * freq) / sampleRate;
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) { re += x[a + i] * Math.cos(w * i); im += x[a + i] * Math.sin(w * i); }
  const A = (2 * re) / n, B = (2 * im) / n;
  let s = 0;
  for (let i = 0; i < n; i++) { const r = x[a + i] - (A * Math.cos(w * i) + B * Math.sin(w * i)); s += r * r; }
  return Math.sqrt(s / n);
}
