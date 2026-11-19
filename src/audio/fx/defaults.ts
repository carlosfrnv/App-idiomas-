import type { EffectParamsMap, EffectSlot, EffectType, EqBand } from '@/types/effects';
import { uid } from '@/lib/id';

export const EFFECT_LABELS: Record<EffectType, string> = {
  eq: 'Ecualizador',
  compressor: 'Compresor',
  reverb: 'Reverb',
  delay: 'Delay',
  filter: 'Filtro',
  saturation: 'Saturación',
  gate: 'Noise Gate',
};

export const EFFECT_ORDER: EffectType[] = ['gate', 'eq', 'compressor', 'saturation', 'filter', 'delay', 'reverb'];

export function band(type: EqBand['type'], frequency: number, gain = 0, q = 1, enabled = true): EqBand {
  return { id: uid('b'), type, frequency, gain, q, enabled };
}

export function defaultEqBands(): EqBand[] {
  return [
    band('highpass', 80, 0, 0.7, false),
    band('lowshelf', 200, 0, 1),
    band('peaking', 500, 0, 1),
    band('peaking', 2500, 0, 1),
    band('highshelf', 8000, 0, 1),
    band('lowpass', 18000, 0, 0.7, false),
  ];
}

export function defaultParams<K extends EffectType>(type: K): EffectParamsMap[K] {
  const map: { [T in EffectType]: () => EffectParamsMap[T] } = {
    eq: () => ({ bands: defaultEqBands(), outputGain: 0 }),
    compressor: () => ({ threshold: -18, ratio: 3, attack: 0.01, release: 0.15, knee: 6, makeup: 3 }),
    reverb: () => ({ mix: 0.2, decay: 1.8, preDelay: 0.02, damping: 0.5 }),
    delay: () => ({ time: 0.375, feedback: 0.3, mix: 0.2, sync: true, division: '1/8d', highCut: 6000 }),
    filter: () => ({ mode: 'lowpass', frequency: 8000, q: 0.7 }),
    saturation: () => ({ drive: 0.3, mix: 0.5, tone: 0.5 }),
    gate: () => ({ threshold: -50, attack: 0.002, release: 0.12, range: -60 }),
  };
  return map[type]() as EffectParamsMap[K];
}

export function createEffect<K extends EffectType>(type: K, params?: Partial<EffectParamsMap[K]>, enabled = true): EffectSlot {
  return { id: uid('fx'), type, enabled, params: { ...defaultParams(type), ...(params ?? {}) } } as unknown as EffectSlot;
}

export const DELAY_DIVISION_BEATS: Record<string, number> = {
  '1/2': 2, '1/4d': 1.5, '1/4': 1, '1/8d': 0.75, '1/8': 0.5, '1/8t': 1 / 3, '1/16': 0.25,
};

export function delaySeconds(p: EffectParamsMap['delay'], bpm: number): number {
  if (!p.sync) return p.time;
  return (60 / bpm) * (DELAY_DIVISION_BEATS[p.division] ?? 0.5);
}
