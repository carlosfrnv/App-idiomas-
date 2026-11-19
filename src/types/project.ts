/** Modelo de datos del proyecto: JSON serializable, fuente de verdad única. */
import type { EffectSlot } from './effects';

export type TrackKind = 'audio';

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  name: string;
  /** Inicio en la línea temporal (s). */
  start: number;
  /** Desplazamiento dentro del audio fuente (s). */
  offset: number;
  /** Duración audible (s). */
  duration: number;
  /** Ganancia del clip (lineal). */
  gain: number;
  fadeIn: number;
  fadeOut: number;
  /** Si el clip proviene de una grabación. */
  recorded?: boolean;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  color: string;
  /** Ganancia lineal (fader). 1 = 0 dB. */
  volume: number;
  /** -1 (izq) .. 1 (dcha) */
  pan: number;
  mute: boolean;
  solo: boolean;
  locked: boolean;
  armed: boolean;
  height: number;
  effects: EffectSlot[];
}

export interface LoopRegion {
  enabled: boolean;
  start: number;
  end: number;
}

export interface ProjectDoc {
  version: 1;
  bpm: number;
  timeSignature: [number, number];
  sampleRate: number;
  tracks: Track[];
  clips: Clip[];
  loop: LoopRegion;
  masterVolume: number;
  masterEffects: EffectSlot[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Mini forma de onda de la mezcla para la vista previa (0..1). */
  thumbnail?: number[];
  durationSec?: number;
}

export interface StoredProject extends ProjectMeta {
  doc: ProjectDoc;
}

export interface AudioAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  createdAt: number;
  kind: 'import' | 'recording' | 'demo';
}

export interface StoredAsset extends AudioAsset {
  blob: Blob;
}
