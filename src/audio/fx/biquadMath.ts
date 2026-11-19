/**
 * Respuesta en frecuencia de filtros biquad según el "Audio EQ Cookbook" (R. Bristow-Johnson),
 * que es exactamente lo que especifica la Web Audio API para BiquadFilterNode.
 * Se usa para dibujar la curva del EQ: representa los parámetros reales del filtro.
 */
import type { EqBandType } from '@/types/effects';

export interface BiquadCoefs { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number }

export function biquadCoefs(type: EqBandType | 'bandpass', freq: number, q: number, gainDb: number, sampleRate: number): BiquadCoefs {
  const nyq = sampleRate / 2;
  const f = Math.min(Math.max(freq, 1), nyq * 0.999);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  switch (type) {
    case 'lowpass': {
      // q lineal; el nodo Web Audio lo recibe en dB (20·log10 q) → mismo alpha
      const alpha = sin / (2 * Math.max(q, 0.0001));
      return { b0: (1 - cos) / 2, b1: 1 - cos, b2: (1 - cos) / 2, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha };
    }
    case 'highpass': {
      const alpha = sin / (2 * Math.max(q, 0.0001));
      return { b0: (1 + cos) / 2, b1: -(1 + cos), b2: (1 + cos) / 2, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha };
    }
    case 'bandpass': {
      const alpha = sin / (2 * Math.max(q, 0.0001));
      return { b0: alpha, b1: 0, b2: -alpha, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha };
    }
    case 'notch': {
      const alpha = sin / (2 * Math.max(q, 0.0001));
      return { b0: 1, b1: -2 * cos, b2: 1, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha };
    }
    case 'peaking': {
      const alpha = sin / (2 * Math.max(q, 0.0001));
      return { b0: 1 + alpha * A, b1: -2 * cos, b2: 1 - alpha * A, a0: 1 + alpha / A, a1: -2 * cos, a2: 1 - alpha / A };
    }
    case 'lowshelf': {
      // Web Audio: shelf con S = 1 (Q ignorado)
      const alpha = (sin / 2) * Math.sqrt(2);
      const k = 2 * Math.sqrt(A) * alpha;
      return {
        b0: A * (A + 1 - (A - 1) * cos + k),
        b1: 2 * A * (A - 1 - (A + 1) * cos),
        b2: A * (A + 1 - (A - 1) * cos - k),
        a0: A + 1 + (A - 1) * cos + k,
        a1: -2 * (A - 1 + (A + 1) * cos),
        a2: A + 1 + (A - 1) * cos - k,
      };
    }
    case 'highshelf': {
      const alpha = (sin / 2) * Math.sqrt(2);
      const k = 2 * Math.sqrt(A) * alpha;
      return {
        b0: A * (A + 1 + (A - 1) * cos + k),
        b1: -2 * A * (A - 1 + (A + 1) * cos),
        b2: A * (A + 1 + (A - 1) * cos - k),
        a0: A + 1 - (A - 1) * cos + k,
        a1: 2 * (A - 1 - (A + 1) * cos),
        a2: A + 1 - (A - 1) * cos - k,
      };
    }
  }
}

/** Magnitud (lineal) de la respuesta del biquad a la frecuencia f. */
export function biquadMagnitude(c: BiquadCoefs, f: number, sampleRate: number): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const cos1 = Math.cos(w), sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const ni = -(c.b1 * sin1 + c.b2 * sin2);
  const dr = c.a0 + c.a1 * cos1 + c.a2 * cos2;
  const di = -(c.a1 * sin1 + c.a2 * sin2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

export function logFrequencies(count: number, min = 20, max = 20000): Float32Array {
  const out = new Float32Array(count);
  const lmin = Math.log10(min), lmax = Math.log10(max);
  for (let i = 0; i < count; i++) out[i] = Math.pow(10, lmin + ((lmax - lmin) * i) / (count - 1));
  return out;
}
