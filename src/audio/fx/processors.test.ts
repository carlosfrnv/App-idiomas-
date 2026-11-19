import { describe, expect, it } from 'vitest';
import { qForNode, saturationCurve, SAT_REF } from './processors';

describe('saturación', () => {
  const at = (c: Float32Array, x: number) => c[Math.round(((x + 1) / 2) * (c.length - 1))];
  it('drive 0 es prácticamente transparente', () => {
    const c = saturationCurve(0);
    for (const x of [-0.5, -0.1, 0.1, 0.3]) expect(at(c, x)).toBeCloseTo(x, 1);
  });
  it('ganancia unidad en el nivel de referencia y nunca supera 0 dBFS', () => {
    for (const d of [0.2, 0.5, 1]) {
      const c = saturationCurve(d);
      expect(at(c, SAT_REF)).toBeCloseTo(SAT_REF, 2);
      expect(Math.max(...c.map(Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});

describe('Q del nodo', () => {
  it('lowpass/highpass en dB, el resto lineal', () => {
    expect(qForNode('lowpass', Math.SQRT1_2)).toBeCloseTo(-3.01, 2);
    expect(qForNode('peaking', 2)).toBe(2);
  });
});
