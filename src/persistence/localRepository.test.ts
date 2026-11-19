import { describe, expect, it } from 'vitest';
import { LocalRepository } from './localRepository';
import { emptyDoc, makeClip } from '@/state/docOps';
import type { StoredAsset, StoredProject } from '@/types/project';

const repo = new LocalRepository();
const asset = (id: string): StoredAsset => ({ id, name: id, mimeType: 'audio/wav', size: 4, duration: 1, sampleRate: 48000, channels: 1, createdAt: Date.now(), kind: 'import', blob: new Blob([new Uint8Array([1, 2, 3, 4])]) });
const project = (id: string, assetIds: string[], updatedAt = Date.now()): StoredProject => ({
  id, name: id, createdAt: 0, updatedAt,
  doc: { ...emptyDoc(), clips: assetIds.map((a) => makeClip({ trackId: 't', assetId: a, name: a, start: 0, duration: 1 })) },
});

describe('LocalRepository (IndexedDB)', () => {
  it('guarda y recupera proyectos y audios (Blob persistente)', async () => {
    await repo.putAsset(asset('a1'));
    await repo.saveProject(project('p1', ['a1']));
    const p = await repo.getProject('p1');
    expect(p?.doc.clips[0].assetId).toBe('a1');
    const a = await repo.getAsset('a1');
    expect(a?.blob.size).toBe(4);
  });
  it('lista ordenado por fecha de modificación', async () => {
    await repo.saveProject(project('old', [], 1));
    await repo.saveProject(project('new', [], Date.now() + 1000));
    const list = await repo.listProjects();
    expect(list[0].id).toBe('new');
    expect('doc' in list[0]).toBe(false);
  });
  it('duplicar comparte audios; eliminar sólo borra audios huérfanos', async () => {
    await repo.putAsset(asset('shared'));
    await repo.putAsset(asset('own'));
    await repo.saveProject(project('src', ['shared', 'own']));
    const copy = await repo.duplicateProject('src', 'Copia');
    expect(copy.id).not.toBe('src');
    await repo.deleteProject('src');
    expect(await repo.getAsset('shared')).toBeDefined(); // usado por la copia
    await repo.deleteProject(copy.id);
    expect(await repo.getAsset('shared')).toBeUndefined();
    expect(await repo.getAsset('own')).toBeUndefined();
  });
});
