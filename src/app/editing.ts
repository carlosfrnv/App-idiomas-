/** Comandos de edición de alto nivel (usados por atajos, menús y botones). */
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { useTransport } from '@/state/transportStore';
import { engine } from '@/audio/engine/AudioEngine';
import * as ops from '@/state/docOps';
import { importAudioFile, ImportError } from './assets';
import { toast } from '@/state/toastStore';
import type { Track } from '@/types/project';

const P = () => useProject.getState();
const U = () => useUi.getState();

function editableClipIds(ids: string[]): string[] {
  const doc = P().doc;
  return ids.filter((id) => {
    const c = doc.clips.find((x) => x.id === id);
    return c && !doc.tracks.find((t) => t.id === c.trackId)?.locked;
  });
}

export function deleteSelection() {
  const ids = editableClipIds(U().selectedClipIds);
  if (!ids.length) return false;
  P().apply((d) => ops.deleteClips(d, ids));
  U().set({ selectedClipIds: [] });
  return true;
}

export function duplicateSelection() {
  const ids = editableClipIds(U().selectedClipIds);
  if (!ids.length) return;
  let created: string[] = [];
  P().apply((d) => { const r = ops.duplicateClips(d, ids); created = r.created; return r.doc; });
  U().set({ selectedClipIds: created });
}

export function splitAtPlayhead() {
  const pos = engine.playing ? engine.getPosition() : useTransport.getState().position;
  const sel = U().selectedClipIds;
  let created: string[] = [];
  P().apply((d) => { const r = ops.splitAt(d, pos, sel.length ? sel : undefined); created = r.created; return r.doc; });
  if (!created.length) toast.info('Nada que dividir', 'Coloca el cabezal sobre un clip.');
}

export function addEmptyTrack(partial: Partial<Track> = {}) {
  const p = P();
  const t = ops.makeTrack(p.doc, partial);
  p.apply((d) => ops.addTrack(d, t));
  U().set({ selectedTrackId: t.id, fxTarget: t.id });
  return t.id;
}

export function updateTrack(id: string, patch: Partial<Track>, key?: string) {
  P().apply((d) => ops.updateTrack(d, id, patch), { key: key ? `${key}:${id}` : undefined });
}

export function removeTrack(id: string) {
  P().apply((d) => ops.removeTrack(d, id));
  const u = U();
  if (u.selectedTrackId === id) u.set({ selectedTrackId: P().doc.tracks[0]?.id ?? null });
  if (u.fxTarget === id) u.set({ fxTarget: P().doc.tracks[0]?.id ?? null });
}

export function duplicateTrack(id: string) {
  let nid = id;
  P().apply((d) => { const r = ops.duplicateTrack(d, id); nid = r.trackId; return r.doc; });
  U().set({ selectedTrackId: nid });
}

/** Importa archivos y crea una pista por archivo (o los coloca en una pista dada). */
export async function importFiles(files: File[], opts: { trackId?: string; at?: number } = {}) {
  await engine.resume();
  let created = 0;
  for (const file of files) {
    try {
      const asset = await importAudioFile(file);
      placeAsset(asset.id, asset.name, asset.duration, files.length === 1 ? opts : { at: opts.at });
      created++;
    } catch (e) {
      toast.error('Error al importar', e instanceof ImportError ? e.message : (e as Error).message);
    }
  }
  if (created) toast.success(created === 1 ? 'Audio importado' : `${created} audios importados`);
}

export function placeAsset(assetId: string, name: string, duration: number, opts: { trackId?: string; at?: number } = {}) {
  const p = P();
  let trackId = opts.trackId;
  const target = trackId ? p.doc.tracks.find((t) => t.id === trackId) : undefined;
  if (!target || target.locked) {
    const t = ops.makeTrack(p.doc, { name });
    p.apply((d) => ops.addTrack(d, t));
    trackId = t.id;
  }
  const clip = ops.makeClip({ trackId: trackId!, assetId, name, start: Math.max(0, opts.at ?? 0), duration });
  P().apply((d) => ops.addClip(d, clip));
  U().set({ selectedClipIds: [clip.id], selectedTrackId: trackId! });
}
