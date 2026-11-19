import type { AudioAsset, ProjectMeta, StoredAsset, StoredProject } from '@/types/project';

/**
 * Contrato de persistencia. Implementaciones:
 *  - LocalRepository (IndexedDB) — Fase 1
 *  - SupabaseRepository (Postgres + Storage con RLS) — Fase 3
 */
export interface ProjectRepository {
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  saveProject(p: StoredProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string, newName: string): Promise<StoredProject>;
  putAsset(a: StoredAsset): Promise<void>;
  getAsset(id: string): Promise<StoredAsset | undefined>;
  listAssets(): Promise<AudioAsset[]>;
  deleteAsset(id: string): Promise<void>;
}
