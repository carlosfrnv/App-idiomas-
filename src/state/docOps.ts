/**
 * Operaciones puras e inmutables sobre ProjectDoc. Toda la edición pasa por aquí,
 * lo que garantiza coherencia entre interfaz y motor, y permite deshacer/rehacer.
 */
import type { Clip, ProjectDoc, Track } from '@/types/project';
import type { EffectSlot } from '@/types/effects';
import { TRACK_COLORS } from '@/config/app';
import { uid } from '@/lib/id';

export const MIN_CLIP = 0.01;
export const DEFAULT_TRACK_HEIGHT = 96;

export function emptyDoc(): ProjectDoc {
  return {
    version: 1,
    bpm: 90,
    timeSignature: [4, 4],
    sampleRate: 48000,
    tracks: [],
    clips: [],
    loop: { enabled: false, start: 0, end: 8 },
    masterVolume: 1,
    masterEffects: [],
  };
}

export function makeTrack(doc: ProjectDoc, partial: Partial<Track> = {}): Track {
  const color = TRACK_COLORS[doc.tracks.length % TRACK_COLORS.length];
  return {
    id: uid('trk'),
    name: `Pista ${doc.tracks.length + 1}`,
    kind: 'audio',
    color,
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
    locked: false,
    armed: false,
    height: DEFAULT_TRACK_HEIGHT,
    effects: [],
    ...partial,
  };
}

export function addTrack(doc: ProjectDoc, track: Track, index = doc.tracks.length): ProjectDoc {
  const tracks = [...doc.tracks];
  tracks.splice(index, 0, track);
  return { ...doc, tracks };
}

export function removeTrack(doc: ProjectDoc, trackId: string): ProjectDoc {
  return { ...doc, tracks: doc.tracks.filter((t) => t.id !== trackId), clips: doc.clips.filter((c) => c.trackId !== trackId) };
}

export function updateTrack(doc: ProjectDoc, trackId: string, patch: Partial<Track>): ProjectDoc {
  return { ...doc, tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) };
}

export function duplicateTrack(doc: ProjectDoc, trackId: string): { doc: ProjectDoc; trackId: string } {
  const idx = doc.tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) return { doc, trackId };
  const src = doc.tracks[idx];
  const copy: Track = {
    ...structuredClone(src),
    id: uid('trk'),
    name: `${src.name} (copia)`,
    solo: false,
    armed: false,
    effects: src.effects.map((e) => ({ ...structuredClone(e), id: uid('fx') }) as EffectSlot),
  };
  const clips = doc.clips.filter((c) => c.trackId === trackId).map((c) => ({ ...c, id: uid('clp'), trackId: copy.id }));
  const next = addTrack(doc, copy, idx + 1);
  return { doc: { ...next, clips: [...next.clips, ...clips] }, trackId: copy.id };
}

export function moveTrack(doc: ProjectDoc, trackId: string, toIndex: number): ProjectDoc {
  const from = doc.tracks.findIndex((t) => t.id === trackId);
  if (from < 0) return doc;
  const tracks = [...doc.tracks];
  const [t] = tracks.splice(from, 1);
  tracks.splice(Math.max(0, Math.min(tracks.length, toIndex)), 0, t);
  return { ...doc, tracks };
}

export function makeClip(partial: Omit<Clip, 'id' | 'gain' | 'fadeIn' | 'fadeOut' | 'offset'> & Partial<Clip>): Clip {
  return { id: uid('clp'), gain: 1, fadeIn: 0, fadeOut: 0, offset: 0, ...partial };
}

export function addClip(doc: ProjectDoc, clip: Clip): ProjectDoc {
  return { ...doc, clips: [...doc.clips, clip] };
}

export function updateClip(doc: ProjectDoc, clipId: string, patch: Partial<Clip>): ProjectDoc {
  return { ...doc, clips: doc.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) };
}

export function deleteClips(doc: ProjectDoc, ids: string[]): ProjectDoc {
  const set = new Set(ids);
  return { ...doc, clips: doc.clips.filter((c) => !set.has(c.id)) };
}

export function moveClip(doc: ProjectDoc, clipId: string, start: number, trackId?: string): ProjectDoc {
  return updateClip(doc, clipId, { start: Math.max(0, start), ...(trackId ? { trackId } : {}) });
}

/**
 * Recorte de extremos. `sourceDuration` limita el recorte al audio disponible.
 * edge 'start': mueve el inicio manteniendo el final fijo en la línea temporal.
 */
export function trimClip(doc: ProjectDoc, clipId: string, edge: 'start' | 'end', time: number, sourceDuration: number): ProjectDoc {
  const c = doc.clips.find((x) => x.id === clipId);
  if (!c) return doc;
  if (edge === 'end') {
    const maxEnd = c.start + (sourceDuration - c.offset);
    const end = Math.min(Math.max(time, c.start + MIN_CLIP), maxEnd);
    return updateClip(doc, clipId, { duration: end - c.start, fadeOut: Math.min(c.fadeOut, end - c.start) });
  }
  const end = c.start + c.duration;
  const minStart = Math.max(0, c.start - c.offset);
  const start = Math.max(minStart, Math.min(time, end - MIN_CLIP));
  const delta = start - c.start;
  return updateClip(doc, clipId, { start, offset: c.offset + delta, duration: end - start, fadeIn: Math.min(c.fadeIn, end - start) });
}

export function splitClip(doc: ProjectDoc, clipId: string, at: number): { doc: ProjectDoc; newId: string | null } {
  const c = doc.clips.find((x) => x.id === clipId);
  if (!c || at <= c.start + MIN_CLIP || at >= c.start + c.duration - MIN_CLIP) return { doc, newId: null };
  const leftDur = at - c.start;
  const right: Clip = { ...c, id: uid('clp'), start: at, offset: c.offset + leftDur, duration: c.duration - leftDur, fadeIn: 0 };
  const next = updateClip(doc, clipId, { duration: leftDur, fadeOut: 0 });
  return { doc: { ...next, clips: [...next.clips, right] }, newId: right.id };
}

/** Divide todos los clips (o los indicados) que cruzan `at`. */
export function splitAt(doc: ProjectDoc, at: number, onlyIds?: string[]): { doc: ProjectDoc; created: string[] } {
  let d = doc;
  const created: string[] = [];
  const targets = doc.clips.filter((c) => (!onlyIds || onlyIds.includes(c.id)) && at > c.start && at < c.start + c.duration);
  for (const c of targets) {
    const track = doc.tracks.find((t) => t.id === c.trackId);
    if (track?.locked) continue;
    const r = splitClip(d, c.id, at);
    d = r.doc;
    if (r.newId) created.push(r.newId);
  }
  return { doc: d, created };
}

export function duplicateClips(doc: ProjectDoc, ids: string[]): { doc: ProjectDoc; created: string[] } {
  const created: string[] = [];
  const copies: Clip[] = [];
  for (const id of ids) {
    const c = doc.clips.find((x) => x.id === id);
    if (!c) continue;
    const copy = { ...c, id: uid('clp'), start: c.start + c.duration };
    copies.push(copy);
    created.push(copy.id);
  }
  return { doc: { ...doc, clips: [...doc.clips, ...copies] }, created };
}

export function projectEnd(doc: ProjectDoc): number {
  return doc.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function isTrackAudible(doc: ProjectDoc, t: Track): boolean {
  const anySolo = doc.tracks.some((x) => x.solo);
  return !t.mute && (!anySolo || t.solo);
}

export function setTrackEffects(doc: ProjectDoc, trackId: string | 'master', effects: EffectSlot[]): ProjectDoc {
  if (trackId === 'master') return { ...doc, masterEffects: effects };
  return updateTrack(doc, trackId, { effects });
}

export function getEffects(doc: ProjectDoc, trackId: string | 'master'): EffectSlot[] {
  if (trackId === 'master') return doc.masterEffects;
  return doc.tracks.find((t) => t.id === trackId)?.effects ?? [];
}
