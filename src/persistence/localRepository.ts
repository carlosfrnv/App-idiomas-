import type { AudioAsset, ProjectMeta, StoredAsset, StoredProject } from '@/types/project';
import type { ProjectRepository } from './repository';
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { uid } from '@/lib/id';
import { HybridRepository } from './hybridRepository';
import type { CloudBackend } from '@/cloud/backend';

export class LocalRepository implements ProjectRepository {
  async listProjects(): Promise<ProjectMeta[]> {
    const all = await idbGetAll<StoredProject>('projects');
    return all
      .map(({ doc: _doc, ...meta }) => meta)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProject(id: string) {
    return idbGet<StoredProject>('projects', id);
  }

  async saveProject(p: StoredProject) {
    await idbPut('projects', p);
  }

  /** Elimina el proyecto y los audios que ya no use ningún otro proyecto. */
  async deleteProject(id: string) {
    const all = await idbGetAll<StoredProject>('projects');
    const target = all.find((p) => p.id === id);
    if (!target) return;
    const usedElsewhere = new Set<string>();
    for (const p of all) if (p.id !== id) for (const c of p.doc.clips) usedElsewhere.add(c.assetId);
    const orphan = [...new Set(target.doc.clips.map((c) => c.assetId))].filter((a) => !usedElsewhere.has(a));
    await idbDelete('projects', id);
    if (orphan.length) await idbDelete('assets', orphan);
  }

  async duplicateProject(id: string, newName: string) {
    const src = await this.getProject(id);
    if (!src) throw new Error('Proyecto no encontrado');
    const now = Date.now();
    // Los assets son inmutables: el duplicado los comparte por referencia.
    const copy: StoredProject = { ...structuredClone(src), id: uid('prj'), name: newName, createdAt: now, updatedAt: now };
    await this.saveProject(copy);
    return copy;
  }

  putAsset(a: StoredAsset) {
    return idbPut('assets', a);
  }

  getAsset(id: string) {
    return idbGet<StoredAsset>('assets', id);
  }

  async listAssets(): Promise<AudioAsset[]> {
    const all = await idbGetAll<StoredAsset>('assets');
    return all.map(({ blob: _b, ...m }) => m).sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteAsset(id: string) {
    return idbDelete('assets', id);
  }
}

export const localRepository = new LocalRepository();

let activeCloud: CloudBackend | null = null;
/** Activa/desactiva la nube (al iniciar o cerrar sesión). */
export function setCloudBackend(b: CloudBackend | null) { activeCloud = b; }

/** Repositorio que usa la app: local + nube si hay sesión. */
export const repository = new HybridRepository(localRepository, () => activeCloud);

/** Solicita almacenamiento persistente (evita purgas, importante en Safari). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
