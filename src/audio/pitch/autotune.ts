/** Corrección de afinación completa: detección → objetivo en la escala → PSOLA. */
import { trackPitch } from './yin';
import { psolaShift } from './psola';
import { hzToMidi, midiToHz, nearestScaleMidi, type ScaleId } from './scales';

export interface AutotuneParams {
  key: number;
  scale: ScaleId;
  /** 0..1: cuánto se corrige la desviación. */
  strength: number;
  /** ms para alcanzar la nota (0 = efecto robótico instantáneo). */
  speedMs: number;
}

export interface AutotuneResult { channels: Float32Array[]; detected: Float32Array; corrected: Float32Array; hopSec: number }

/** Curva de corrección en cents (suavizada por la velocidad de retoque). */
export function correctionCurve(f0: Float32Array, hopSec: number, p: AutotuneParams): { ratio: Float32Array; corrected: Float32Array } {
  const ratio = new Float32Array(f0.length).fill(1);
  const corrected = new Float32Array(f0.length);
  const alpha = p.speedMs <= 0 ? 1 : 1 - Math.exp(-(hopSec * 1000) / p.speedMs);
  let cents = 0;
  let wasVoiced = false;
  for (let i = 0; i < f0.length; i++) {
    const f = f0[i];
    if (!(f > 0)) { wasVoiced = false; continue; }
    const midi = hzToMidi(f);
    const target = nearestScaleMidi(midi, p.key, p.scale);
    const desired = (target - midi) * 100 * Math.max(0, Math.min(1, p.strength));
    // al empezar una nota se parte de la corrección completa para no oír el "deslizamiento"
    cents = wasVoiced ? cents + (desired - cents) * alpha : desired * (p.speedMs <= 0 ? 1 : alpha);
    wasVoiced = true;
    ratio[i] = Math.pow(2, cents / 1200);
    corrected[i] = midiToHz(midi + cents / 100);
  }
  return { ratio, corrected };
}

export function autotune(channels: Float32Array[], sampleRate: number, p: AutotuneParams, onProgress?: (f: number) => void): AutotuneResult {
  // detección sobre la mezcla mono
  const mono = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / channels.length;
  const { f0, hopSec } = trackPitch(mono, sampleRate, { onProgress: (f) => onProgress?.(f * 0.6) });
  const { ratio, corrected } = correctionCurve(f0, hopSec, p);
  const out = channels.map((c, i) => { const r = psolaShift(c, sampleRate, f0, ratio, hopSec); onProgress?.(0.6 + (0.4 * (i + 1)) / channels.length); return r; });
  return { channels: out, detected: f0, corrected, hopSec };
}
