import { describe, expect, it } from 'vitest';
import { biquadCoefs, biquadMagnitude } from './biquadMath';

const db = (x: number) => 20 * Math.log10(x);
const sr = 48000;

describe('respuesta biquad (RBJ / Web Audio)', () => {
  it('peaking: ganancia exacta en la frecuencia central', () => {
    const c = biquadCoefs('peaking', 1000, 1, 6, sr);
    expect(db(biquadMagnitude(c, 1000, sr))).toBeCloseTo(6, 2);
    expect(Math.abs(db(biquadMagnitude(c, 20, sr)))).toBeLessThan(0.1);
  });
  it('peaking 0 dB es identidad', () => {
    const c = biquadCoefs('peaking', 500, 2, 0, sr);
    for (const f of [30, 500, 5000, 15000]) expect(biquadMagnitude(c, f, sr)).toBeCloseTo(1, 6);
  });
  it('highpass atenúa graves y deja pasar agudos', () => {
    const c = biquadCoefs('highpass', 100, Math.SQRT1_2, 0, sr);
    expect(db(biquadMagnitude(c, 25, sr))).toBeLessThan(-20);
    expect(Math.abs(db(biquadMagnitude(c, 5000, sr)))).toBeLessThan(0.1);
    expect(db(biquadMagnitude(c, 100, sr))).toBeCloseTo(-3, 0);
  });
  it('shelves: ganancia en el extremo', () => {
    const lo = biquadCoefs('lowshelf', 200, 1, -6, sr);
    expect(db(biquadMagnitude(lo, 20, sr))).toBeCloseTo(-6, 1);
    const hi = biquadCoefs('highshelf', 8000, 1, 4, sr);
    expect(db(biquadMagnitude(hi, 20000, sr))).toBeCloseTo(4, 0);
  });
});
