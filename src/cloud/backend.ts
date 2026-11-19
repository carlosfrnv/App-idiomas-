/** Contrato del backend en la nube (implementado con Supabase; sustituible en pruebas). */
import type { AudioAsset, ProjectMeta, StoredProject } from '@/types/project';

export interface CloudBackend {
  readonly userId: string;
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  upsertProject(p: StoredProject, assetIds: string[]): Promise<void>;
  /** Borrado lógico (papelera); la purga definitiva la hace la política de retención del servidor. */
  deleteProject(id: string): Promise<void>;
  /** Devuelve los IDs (de la lista) que ya existen en la nube. */
  existingAssets(ids: string[]): Promise<Set<string>>;
  uploadAsset(meta: AudioAsset, blob: Blob): Promise<void>;
  downloadAsset(id: string): Promise<{ meta: AudioAsset; blob: Blob } | undefined>;
  deleteAsset(id: string): Promise<void>;
  storageUsed(): Promise<number>;
}
