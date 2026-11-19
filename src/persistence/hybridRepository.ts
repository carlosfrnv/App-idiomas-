/**
 * Repositorio híbrido: IndexedDB siempre (funciona sin conexión) + nube cuando hay sesión.
 * Lo último modificado gana; los audios se suben una sola vez (son inmutables).
 */
import type { AudioAsset, ProjectMeta, StoredAsset, StoredProject } from '@/types/project';
import type { ProjectRepository } from './repository';
import type { CloudBackend } from '@/cloud/backend';

export type SyncState = 'local' | 'syncing' | 'synced' | 'error';

export class HybridRepository implements ProjectRepository {
  onSync: (s: SyncState, error?: string) => void = () => undefined;

  constructor(private local: ProjectRepository, private cloud: () => CloudBackend | null) {}

  private async sync<T>(fn: (c: CloudBackend) => Promise<T>): Promise<T | undefined> {
    const c = this.cloud();
    if (!c) return undefined;
    this.onSync('syncing');
    try {
      const r = await fn(c);
      this.onSync('synced');
      return r;
    } catch (e) {
      this.onSync('error', (e as Error).message);
      return undefined;
    }
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const local = await this.local.listProjects();
    const remote = (await this.sync((c) => c.listProjects())) ?? [];
    const map = new Map<string, ProjectMeta>();
    for (const p of [...local, ...remote]) { const cur = map.get(p.id); if (!cur || p.updatedAt > cur.updatedAt) map.set(p.id, p); }
    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string) {
    const local = await this.local.getProject(id);
    const remote = await this.sync((c) => c.getProject(id));
    if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      await this.local.saveProject(remote); // caché local para trabajar sin conexión
      return remote;
    }
    return local;
  }

  /** Sube a la nube los audios del proyecto que aún no estén allí. */
  private async pushAssets(c: CloudBackend, ids: string[]) {
    const have = await c.existingAssets(ids);
    for (const id of ids) {
      if (have.has(id)) continue;
      const a = await this.local.getAsset(id);
      if (!a) continue;
      const { blob, ...meta } = a;
      await c.uploadAsset(meta, blob);
    }
  }

  async saveProject(p: StoredProject) {
    await this.local.saveProject(p);
    await this.sync(async (c) => {
      const ids = [...new Set(p.doc.clips.flatMap((cl) => [cl.assetId, ...(cl.pitch ? [cl.pitch.sourceAssetId] : [])]))];
      await this.pushAssets(c, ids);
      await c.upsertProject(p, ids);
    });
  }

  async deleteProject(id: string) {
    await this.local.deleteProject(id);
    await this.sync((c) => c.deleteProject(id));
  }

  async duplicateProject(id: string, newName: string) {
    if (!(await this.local.getProject(id))) await this.getProject(id);
    const copy = await this.local.duplicateProject(id, newName);
    await this.saveProject(copy);
    return copy;
  }

  async putAsset(a: StoredAsset) {
    await this.local.putAsset(a);
    // se sube al guardar el proyecto que lo use (evita subir tomas descartadas)
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    const local = await this.local.getAsset(id);
    if (local) return local;
    const r = await this.sync((c) => c.downloadAsset(id));
    if (!r) return undefined;
    const stored: StoredAsset = { ...r.meta, blob: r.blob };
    await this.local.putAsset(stored);
    return stored;
  }

  listAssets(): Promise<AudioAsset[]> {
    return this.local.listAssets();
  }

  async deleteAsset(id: string) {
    await this.local.deleteAsset(id);
    await this.sync((c) => c.deleteAsset(id));
  }

  /** Sube todos los proyectos locales (p. ej. al iniciar sesión por primera vez). */
  async uploadAllLocal(onProgress?: (done: number, total: number) => void): Promise<number> {
    const c = this.cloud();
    if (!c) return 0;
    const list = await this.local.listProjects();
    let n = 0;
    for (const m of list) {
      const p = await this.local.getProject(m.id);
      if (p) { await this.saveProject(p); n++; }
      onProgress?.(n, list.length);
    }
    return n;
  }
}
