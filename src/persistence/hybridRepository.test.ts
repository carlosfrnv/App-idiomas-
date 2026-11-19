import { describe, expect, it, beforeEach } from 'vitest';
import { HybridRepository } from './hybridRepository';
import { LocalRepository } from './localRepository';
import type { CloudBackend } from '@/cloud/backend';
import type { AudioAsset, ProjectMeta, StoredProject } from '@/types/project';
import { emptyDoc, makeClip } from '@/state/docOps';
import { _resetDbConnection } from './idb';

class FakeCloud implements CloudBackend {
  userId = 'u1';
  projects = new Map<string, StoredProject>();
  assets = new Map<string, { meta: AudioAsset; blob: Blob }>();
  links = new Map<string, string[]>();
  uploads = 0;
  fail = false;
  private check() { if (this.fail) throw new Error('sin conexión'); }
  async listProjects(): Promise<ProjectMeta[]> { this.check(); return [...this.projects.values()].map(({ doc: _d, ...m }) => m); }
  async getProject(id: string) { this.check(); return this.projects.get(id); }
  async upsertProject(p: StoredProject, ids: string[]) { this.check(); this.projects.set(p.id, structuredClone(p)); this.links.set(p.id, ids); }
  async deleteProject(id: string) { this.check(); this.projects.delete(id); }
  async existingAssets(ids: string[]) { return new Set(ids.filter((i) => this.assets.has(i))); }
  async uploadAsset(meta: AudioAsset, blob: Blob) { this.check(); this.uploads++; this.assets.set(meta.id, { meta, blob }); }
  async downloadAsset(id: string) { this.check(); return this.assets.get(id); }
  async deleteAsset(id: string) { this.assets.delete(id); }
  async storageUsed() { return 0; }
}

const asset = (id: string) => ({ id, name: id, mimeType: 'audio/wav', size: 3, duration: 1, sampleRate: 48000, channels: 1, createdAt: 1, kind: 'recording' as const, blob: new Blob([new Uint8Array([1, 2, 3])]) });
const project = (id: string, assets: string[], updatedAt: number): StoredProject => ({ id, name: id, createdAt: 0, updatedAt, doc: { ...emptyDoc(), clips: assets.map((a) => makeClip({ trackId: 't', assetId: a, name: a, start: 0, duration: 1 })) } });

describe('HybridRepository (local + nube)', () => {
  let cloud: FakeCloud, active: CloudBackend | null, repo: HybridRepository, states: string[];
  beforeEach(async () => {
    indexedDB.deleteDatabase('sonora-studio');
    _resetDbConnection();
    cloud = new FakeCloud();
    active = null;
    repo = new HybridRepository(new LocalRepository(), () => active);
    states = [];
    repo.onSync = (s) => states.push(s);
  });

  it('sin sesión todo es local', async () => {
    await repo.putAsset(asset('a1'));
    await repo.saveProject(project('p1', ['a1'], 10));
    expect(cloud.projects.size).toBe(0);
    expect((await repo.listProjects()).map((p) => p.id)).toEqual(['p1']);
  });

  it('con sesión sube el proyecto y su audio una sola vez', async () => {
    active = cloud;
    await repo.putAsset(asset('a1'));
    await repo.saveProject(project('p1', ['a1'], 10));
    await repo.saveProject(project('p1', ['a1'], 11));
    expect(cloud.projects.get('p1')!.updatedAt).toBe(11);
    expect(cloud.links.get('p1')).toEqual(['a1']);
    expect(cloud.uploads).toBe(1);
    expect(states.at(-1)).toBe('synced');
  });

  it('otro dispositivo: descarga proyecto y audio de la nube y los cachea', async () => {
    cloud.projects.set('p2', project('p2', ['a9'], 50));
    cloud.assets.set('a9', { meta: (({ blob: _b, ...m }) => m)(asset('a9')), blob: new Blob([new Uint8Array([9])]) });
    active = cloud;
    expect((await repo.listProjects()).map((p) => p.id)).toContain('p2');
    expect((await repo.getProject('p2'))!.doc.clips[0].assetId).toBe('a9');
    const a = await repo.getAsset('a9');
    expect(a!.blob.size).toBe(1);
    active = null; // sin conexión: sigue disponible desde la caché
    expect(await repo.getProject('p2')).toBeDefined();
    expect(await repo.getAsset('a9')).toBeDefined();
  });

  it('gana la versión más reciente', async () => {
    active = cloud;
    await repo.saveProject(project('p3', [], 10));
    cloud.projects.set('p3', { ...project('p3', [], 99), name: 'desde el móvil' });
    expect((await repo.getProject('p3'))!.name).toBe('desde el móvil');
  });

  it('un fallo de red no impide guardar en local', async () => {
    active = cloud;
    cloud.fail = true;
    await repo.saveProject(project('p4', [], 1));
    expect(states).toContain('error');
    active = null;
    expect(await repo.getProject('p4')).toBeDefined();
  });

  it('subir proyectos locales al iniciar sesión', async () => {
    await repo.putAsset(asset('a1'));
    await repo.saveProject(project('l1', ['a1'], 1));
    await repo.saveProject(project('l2', [], 2));
    active = cloud;
    expect(await repo.uploadAllLocal()).toBe(2);
    expect([...cloud.projects.keys()].sort()).toEqual(['l1', 'l2']);
    expect(cloud.assets.has('a1')).toBe(true);
  });
});
