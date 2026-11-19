import type { SupabaseClient } from '@supabase/supabase-js';
import type { AudioAsset, ProjectMeta, StoredProject } from '@/types/project';
import type { CloudBackend } from './backend';

const EXT: Record<string, string> = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm' };

interface ProjectRow { id: string; name: string; created_at: string; updated_at: string; thumbnail: number[] | null; duration_sec: number | null; doc?: StoredProject['doc'] }
interface AssetRow { id: string; name: string; mime_type: string; size_bytes: number; duration: number; sample_rate: number; channels: number; kind: AudioAsset['kind']; storage_path: string; created_at: string }

function fail(what: string, error: { message: string } | null): never | void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Backend Supabase: Postgres (RLS por usuario) + Storage privado `audio/<user_id>/…`. */
export class SupabaseBackend implements CloudBackend {
  constructor(private sb: SupabaseClient, readonly userId: string) {}

  private toMeta(r: ProjectRow): ProjectMeta {
    return { id: r.id, name: r.name, createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at), thumbnail: r.thumbnail ?? undefined, durationSec: r.duration_sec ?? undefined };
  }

  async listProjects() {
    const { data, error } = await this.sb.from('projects').select('id,name,created_at,updated_at,thumbnail,duration_sec').is('deleted_at', null).order('updated_at', { ascending: false });
    fail('No se pudo leer la lista de proyectos', error);
    return (data as ProjectRow[]).map((r) => this.toMeta(r));
  }

  async getProject(id: string) {
    const { data, error } = await this.sb.from('projects').select('id,name,created_at,updated_at,thumbnail,duration_sec,doc').eq('id', id).is('deleted_at', null).maybeSingle();
    fail('No se pudo leer el proyecto', error);
    if (!data) return undefined;
    const r = data as ProjectRow;
    return { ...this.toMeta(r), doc: r.doc! };
  }

  async upsertProject(p: StoredProject, assetIds: string[]) {
    const { error } = await this.sb.from('projects').upsert({
      id: p.id, owner_id: this.userId, name: p.name, doc: p.doc, thumbnail: p.thumbnail ?? null, duration_sec: p.durationSec ?? null,
      created_at: new Date(p.createdAt).toISOString(), updated_at: new Date(p.updatedAt).toISOString(), deleted_at: null,
    });
    fail('No se pudo guardar el proyecto en la nube', error);
    const { error: e2 } = await this.sb.from('project_assets').delete().eq('project_id', p.id);
    fail('No se pudo actualizar el proyecto', e2);
    if (assetIds.length) {
      const { error: e3 } = await this.sb.from('project_assets').insert(assetIds.map((a) => ({ project_id: p.id, asset_id: a })));
      fail('No se pudo enlazar el audio del proyecto', e3);
    }
  }

  async deleteProject(id: string) {
    const { error } = await this.sb.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    fail('No se pudo eliminar el proyecto de la nube', error);
  }

  async existingAssets(ids: string[]) {
    if (!ids.length) return new Set<string>();
    const { data, error } = await this.sb.from('assets').select('id').in('id', ids);
    fail('No se pudo comprobar el audio en la nube', error);
    return new Set((data as { id: string }[]).map((r) => r.id));
  }

  async uploadAsset(meta: AudioAsset, blob: Blob) {
    const path = `${this.userId}/${meta.id}.${EXT[meta.mimeType] ?? 'bin'}`;
    const { error } = await this.sb.storage.from('audio').upload(path, blob, { upsert: true, contentType: meta.mimeType });
    fail('No se pudo subir el audio', error);
    const { error: e2 } = await this.sb.from('assets').upsert({
      id: meta.id, owner_id: this.userId, name: meta.name, mime_type: meta.mimeType, size_bytes: meta.size, duration: meta.duration,
      sample_rate: meta.sampleRate, channels: meta.channels, kind: meta.kind, storage_path: path, created_at: new Date(meta.createdAt).toISOString(),
    });
    fail('No se pudo registrar el audio', e2);
  }

  async downloadAsset(id: string) {
    const { data, error } = await this.sb.from('assets').select('*').eq('id', id).maybeSingle();
    fail('No se pudo leer el audio', error);
    if (!data) return undefined;
    const r = data as AssetRow;
    const { data: blob, error: e2 } = await this.sb.storage.from('audio').download(r.storage_path);
    fail('No se pudo descargar el audio', e2);
    if (!blob) return undefined;
    return { meta: { id: r.id, name: r.name, mimeType: r.mime_type, size: r.size_bytes, duration: r.duration, sampleRate: r.sample_rate, channels: r.channels, kind: r.kind, createdAt: Date.parse(r.created_at) }, blob };
  }

  async deleteAsset(id: string) {
    const { data } = await this.sb.from('assets').select('storage_path').eq('id', id).maybeSingle();
    if (data) await this.sb.storage.from('audio').remove([(data as { storage_path: string }).storage_path]);
    const { error } = await this.sb.from('assets').delete().eq('id', id);
    fail('No se pudo borrar el audio de la nube', error);
  }

  async storageUsed() {
    const { data, error } = await this.sb.from('assets').select('size_bytes');
    fail('No se pudo calcular el espacio', error);
    return (data as { size_bytes: number }[]).reduce((n, r) => n + Number(r.size_bytes), 0);
  }
}
