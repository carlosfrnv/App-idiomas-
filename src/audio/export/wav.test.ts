import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from './wav';

const sine = (n: number, f: number, sr: number, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));

describe('WAV', () => {
  it.each([16, 24, 32] as const)('codifica y decodifica %i bits sin pérdida significativa', (bits) => {
    const sr = 48000;
    const L = sine(4800, 440, sr), R = sine(4800, 880, sr, 0.25);
    const buf = encodeWav({ sampleRate: sr, channels: [L, R] }, bits);
    expect(buf.byteLength).toBe(44 + 4800 * 2 * (bits / 8));
    const out = decodeWav(buf);
    expect(out.sampleRate).toBe(sr);
    expect(out.channels).toHaveLength(2);
    const tol = bits === 16 ? 1 / 30000 : bits === 24 ? 1e-6 : 1e-7;
    for (let i = 0; i < 4800; i += 97) {
      expect(Math.abs(out.channels[0][i] - L[i])).toBeLessThan(tol);
      expect(Math.abs(out.channels[1][i] - R[i])).toBeLessThan(tol);
    }
  });

  it('recorta valores fuera de rango en PCM', () => {
    const out = decodeWav(encodeWav({ sampleRate: 44100, channels: [Float32Array.from([2, -2, 0.5])] }, 16));
    expect(out.channels[0][0]).toBeCloseTo(1, 3);
    expect(out.channels[0][1]).toBeCloseTo(-1, 3);
  });

  it('escribe cabecera RIFF correcta', () => {
    const v = new DataView(encodeWav({ sampleRate: 44100, channels: [new Float32Array(10)] }, 32));
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint16(20, true)).toBe(3); // IEEE float
    expect(v.getUint32(24, true)).toBe(44100);
  });
});
