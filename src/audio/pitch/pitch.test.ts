import { describe, expect, it } from 'vitest';
import { trackPitch } from './yin';
import { autotune, correctionCurve } from './autotune';
import { estimateKey, nearestScaleMidi, hzToMidi } from './scales';

const SR = 44100;
/** Voz sintética: tono con armónicos (diente de sierra suavizado). */
function voice(hz: number | ((t: number) => number), seconds: number, amp = 0.5) {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof hz === 'number' ? hz : hz(i / SR);
    ph += (2 * Math.PI * f) / SR;
    let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(h * ph) / h;
    x[i] = amp * 0.6 * v;
  }
  return x;
}
function medianPitch(x: Float32Array, from = 0.2, to = 0.8) {
  const t = trackPitch(x, SR);
  const vals = [...t.f0].filter((f, i) => f > 0 && i * t.hopSec > from * x.length / SR && i * t.hopSec < to * x.length / SR).sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

describe('detección de tono (YIN)', () => {
  it.each([110, 220, 330, 523.25])('%f Hz', (hz) => {
    expect(medianPitch(voice(hz, 1)) / hz).toBeCloseTo(1, 2);
  });
  it('silencio y ruido no tienen tono', () => {
    const noise = Float32Array.from({ length: SR }, () => (Math.random() * 2 - 1) * 0.3);
    const t = trackPitch(noise, SR);
    expect([...t.f0].filter((f) => f > 0).length / t.f0.length).toBeLessThan(0.1);
    expect([...trackPitch(new Float32Array(SR), SR).f0].every((f) => f === 0)).toBe(true);
  });
});

describe('escalas', () => {
  it('nota más cercana dentro de la escala', () => {
    expect(nearestScaleMidi(hzToMidi(450), 0, 'major')).toBe(69); // La4 en Do mayor
    expect(nearestScaleMidi(61.4, 0, 'major')).toBe(62); // Do# no está en Do mayor → Re
    expect(nearestScaleMidi(61.4, 0, 'chromatic')).toBe(61);
  });
  it('estima la tonalidad de una melodía', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64, 60, 67].map((m) => 440 * Math.pow(2, (m - 69) / 12));
    const f0 = new Float32Array(notes.flatMap((f) => Array(10).fill(f)));
    expect(estimateKey(f0)).toMatchObject({ key: 0, scale: 'major' });
  });
});

describe('corrección de afinación', () => {
  it('modo robótico: una voz desafinada (450 Hz) acaba exactamente en La 440 Hz', () => {
    const x = voice(450, 1);
    const out = autotune([x], SR, { key: 0, scale: 'major', strength: 1, speedMs: 0 });
    expect(out.channels[0].length).toBe(x.length); // misma duración
    expect(medianPitch(out.channels[0]) / 440).toBeCloseTo(1, 2);
  });
  it('intensidad 50 % corrige la mitad de la desviación', () => {
    const out = autotune([voice(450, 1)], SR, { key: 0, scale: 'major', strength: 0.5, speedMs: 0 });
    const expected = 440 * Math.pow(2, (hzToMidi(450) - 69) / 2 / 12);
    expect(medianPitch(out.channels[0]) / expected).toBeCloseTo(1, 2);
  });
  it('modo natural: la corrección es progresiva según la velocidad', () => {
    const f0 = new Float32Array(100).fill(450);
    const fast = correctionCurve(f0, 0.01, { key: 0, scale: 'major', strength: 1, speedMs: 0 }).corrected;
    const slow = correctionCurve(f0, 0.01, { key: 0, scale: 'major', strength: 1, speedMs: 200 }).corrected;
    expect(fast[0]).toBeCloseTo(440, 1);
    expect(Math.abs(slow[1] - 440)).toBeGreaterThan(Math.abs(slow[60] - 440));
    expect(slow[99]).toBeCloseTo(440, 0);
  });
  it('conserva el nivel y deja pasar las partes sordas', () => {
    const x = voice(300, 1);
    const out = autotune([x], SR, { key: 0, scale: 'chromatic', strength: 1, speedMs: 0 }).channels[0];
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    expect(rms(out) / rms(x)).toBeCloseTo(1, 1);
  });
});
