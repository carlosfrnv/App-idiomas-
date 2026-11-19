/**
 * Presets: combinaciones reales de efectos y parámetros, pensadas para voz.
 * Los valores siguen prácticas habituales de mezcla vocal (HPF, control de lodo,
 * presencia, compresión, espacio temporal).
 */
import type { EffectSlot, EqBand } from '@/types/effects';
import { band, createEffect } from './defaults';

export interface EqPreset { id: string; name: string; bands: () => EqBand[] }

export const EQ_PRESETS: EqPreset[] = [
  { id: 'clear', name: 'Voz clara', bands: () => [band('highpass', 90, 0, 0.7), band('lowshelf', 200, -1.5), band('peaking', 350, -2.5, 1.2), band('peaking', 3000, 2.5, 1), band('highshelf', 10000, 2), band('lowpass', 18000, 0, 0.7, false)] },
  { id: 'warm', name: 'Voz cálida', bands: () => [band('highpass', 70, 0, 0.7), band('lowshelf', 180, 2), band('peaking', 450, -1, 1), band('peaking', 2800, 0.5, 1), band('highshelf', 9000, -1.5), band('lowpass', 15000, 0, 0.7)] },
  { id: 'rap', name: 'Rap vocal', bands: () => [band('highpass', 100, 0, 0.7), band('lowshelf', 200, -1), band('peaking', 300, -3, 1.4), band('peaking', 4000, 3, 0.9), band('highshelf', 11000, 2.5), band('lowpass', 18000, 0, 0.7, false)] },
  { id: 'trap', name: 'Trap vocal', bands: () => [band('highpass', 120, 0, 0.7), band('lowshelf', 220, -2), band('peaking', 400, -3, 1.2), band('peaking', 5000, 3.5, 1), band('highshelf', 12000, 4), band('lowpass', 19000, 0, 0.7, false)] },
  { id: 'podcast', name: 'Podcast', bands: () => [band('highpass', 80, 0, 0.7), band('lowshelf', 150, 1.5), band('peaking', 300, -2, 1), band('peaking', 2500, 2, 0.8), band('highshelf', 8000, -1), band('lowpass', 14000, 0, 0.7)] },
  { id: 'bright', name: 'Voz brillante', bands: () => [band('highpass', 100, 0, 0.7), band('lowshelf', 200, -1), band('peaking', 1000, 0, 1, false), band('peaking', 6000, 3, 0.8), band('highshelf', 10000, 5), band('lowpass', 20000, 0, 0.7, false)] },
  { id: 'lowcut', name: 'Reducción de graves', bands: () => [band('highpass', 150, 0, 3), band('lowshelf', 250, -4), band('peaking', 500, -1, 1), band('peaking', 2500, 0, 1, false), band('highshelf', 8000, 0, 1, false), band('lowpass', 18000, 0, 0.7, false)] },
];

export interface ChainPreset { id: string; name: string; description: string; build: () => EffectSlot[] }

const eq = (id: string) => createEffect('eq', { bands: EQ_PRESETS.find((p) => p.id === id)!.bands(), outputGain: 0 });

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: 'rap', name: 'Voz de rap', description: 'Presente y seca, compresión firme',
    build: () => [createEffect('gate', { threshold: -48 }), eq('rap'), createEffect('compressor', { threshold: -20, ratio: 4, attack: 0.005, release: 0.12, makeup: 5 }), createEffect('saturation', { drive: 0.25, mix: 0.3 }), createEffect('reverb', { mix: 0.08, decay: 0.9, preDelay: 0.015 })],
  },
  {
    id: 'trap', name: 'Voz de trap', description: 'Brillante, delay a tempo y espacio',
    build: () => [eq('trap'), createEffect('compressor', { threshold: -22, ratio: 5, attack: 0.003, release: 0.1, makeup: 6 }), createEffect('saturation', { drive: 0.35, mix: 0.35 }), createEffect('delay', { sync: true, division: '1/8', feedback: 0.28, mix: 0.16 }), createEffect('reverb', { mix: 0.16, decay: 1.6 })],
  },
  {
    id: 'reggaeton', name: 'Voz de reguetón', description: 'Cálida al frente, delay corto',
    build: () => [eq('clear'), createEffect('compressor', { threshold: -18, ratio: 3.5, attack: 0.008, release: 0.15, makeup: 4 }), createEffect('delay', { sync: true, division: '1/16', feedback: 0.2, mix: 0.12 }), createEffect('reverb', { mix: 0.14, decay: 1.4, preDelay: 0.03 })],
  },
  {
    id: 'clean', name: 'Voz limpia', description: 'Natural y transparente',
    build: () => [eq('clear'), createEffect('compressor', { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.2, makeup: 3 }), createEffect('reverb', { mix: 0.1, decay: 1.2 })],
  },
  {
    id: 'radio', name: 'Voz de radio', description: 'Banda estrecha tipo transistor',
    build: () => [createEffect('filter', { mode: 'bandpass', frequency: 1600, q: 1.1 }), createEffect('saturation', { drive: 0.6, mix: 0.7, tone: 0.6 }), createEffect('compressor', { threshold: -24, ratio: 6, attack: 0.003, release: 0.08, makeup: 8 })],
  },
  {
    id: 'ambient', name: 'Voz ambiental', description: 'Reverb larga y delay espacioso',
    build: () => [eq('warm'), createEffect('compressor', { threshold: -18, ratio: 2.5, makeup: 3 }), createEffect('delay', { sync: true, division: '1/4d', feedback: 0.45, mix: 0.25, highCut: 4000 }), createEffect('reverb', { mix: 0.38, decay: 4, preDelay: 0.04, damping: 0.6 })],
  },
  {
    id: 'adlibs', name: 'Ad-libs', description: 'Fino, filtrado y con eco',
    build: () => [createEffect('filter', { mode: 'highpass', frequency: 300, q: 0.7 }), eq('bright'), createEffect('compressor', { threshold: -22, ratio: 4, makeup: 4 }), createEffect('delay', { sync: true, division: '1/8d', feedback: 0.35, mix: 0.25 }), createEffect('reverb', { mix: 0.25, decay: 2.2 })],
  },
];
