import { describe, expect, it } from 'vitest';
import { computePeaks, peakRange, thumbnail } from './peaks';

describe('peaks', () => {
  it('calcula min/max por bloque y en rangos', () => {
    const d = new Float32Array(1024);
    d[10] = 0.8; d[600] = -0.9;
    const p = computePeaks([d], 48000, 256);
    expect(p.data.length).toBe(8);
    expect(p.data[1]).toBeCloseTo(0.8);
    expect(p.data[4]).toBeCloseTo(-0.9);
    expect(peakRange(p, 0, 1024)).toEqual([expect.closeTo(-0.9), expect.closeTo(0.8)]);
    expect(peakRange(p, 256, 512)).toEqual([0, 0]);
  });
  it('mezcla canales', () => {
    const a = new Float32Array(256), b = new Float32Array(256);
    b[3] = 0.5;
    expect(computePeaks([a, b], 44100).data[1]).toBeCloseTo(0.5);
  });
  it('miniatura normalizada', () => {
    const d = new Float32Array(2048).map((_, i) => (i < 1024 ? 0.25 : 0.5));
    const th = thumbnail(computePeaks([d], 44100), 2);
    expect(th).toEqual([0.5, 1]);
  });
});
