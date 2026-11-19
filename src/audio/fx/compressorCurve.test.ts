import { describe, expect, it } from 'vitest';
import { compressorCurve } from './compressorCurve';

// Mediciones reales en Chromium (OfflineAudioContext, señal a -60 dBFS bajo el umbral).
const MEASURED: [number, number, number, number][] = [
  [-24, 6, 6, 10.81], [-18, 3, 6, 6.13], [-40, 20, 0, 22.8], [-10, 2, 30, 0.15],
  [-30, 4, 10, 11.43], [-50, 10, 20, 21.5], [0, 1, 0, 0], [-20, 1, 6, 0.01],
];

describe('modelo del DynamicsCompressorNode', () => {
  it.each(MEASURED)('T=%i R=%i K=%i → makeup interno %f dB', (T, R, K, db) => {
    expect(compressorCurve(T, K, R).internalMakeupDb).toBeCloseTo(db, 0);
    expect(Math.abs(compressorCurve(T, K, R).internalMakeupDb - db)).toBeLessThan(0.25);
  });
  it('lineal bajo el umbral, pendiente 1/ratio por encima de la rodilla', () => {
    const c = compressorCurve(-20, 0, 4);
    expect(c.staticOut(-40)).toBeCloseTo(-40, 3);
    expect(c.staticOut(-8) - c.staticOut(-12)).toBeCloseTo(1, 1);
  });
});
