import { IMPORT_LIMITS } from '@/config/app';
import { engine } from '@/audio/engine/AudioEngine';
import { repository } from '@/persistence/localRepository';
import { useAssets } from '@/state/assetStore';
import type { AudioAsset, ProjectDoc, StoredAsset } from '@/types/project';
import { uid } from '@/lib/id';
import { formatBytes } from '@/lib/format';

export class ImportError extends Error {}

export function validateAudioFile(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const okType = (IMPORT_LIMITS.acceptedMime as readonly string[]).includes(file.type) || (IMPORT_LIMITS.acceptedExt as readonly string[]).includes(ext);
  if (!okType) throw new ImportError(`"${file.name}" no es un formato de audio admitido (WAV, MP3, OGG, FLAC, AAC/M4A, WEBM).`);
  if (file.size === 0) throw new ImportError(`"${file.name}" está vacío.`);
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new ImportError(`"${file.name}" supera el límite de ${formatBytes(IMPORT_LIMITS.maxFileBytes)}.`);
}

/** Decodifica y guarda un archivo de audio. Devuelve el asset persistido. */
export async function importAudioFile(file: File, kind: AudioAsset['kind'] = 'import'): Promise<AudioAsset> {
  validateAudioFile(file);
  const data = await file.arrayBuffer();
  let buf: AudioBuffer;
  try {
    buf = await engine.decode(data.slice(0));
  } catch {
    throw new ImportError(`No se pudo decodificar "${file.name}". El archivo puede estar dañado o usar un códec no soportado por este navegador.`);
  }
  const asset: StoredAsset = {
    id: uid('ast'),
    name: file.name.replace(/\.[^.]+$/, ''),
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    duration: buf.duration,
    sampleRate: buf.sampleRate,
    channels: buf.numberOfChannels,
    createdAt: Date.now(),
    kind,
    blob: file,
  };
  await repository.putAsset(asset);
  engine.addBuffer(asset.id, buf);
  useAssets.getState().setStatus(asset.id, 'ready', buf.duration);
  const { blob: _b, ...meta } = asset;
  return meta;
}

/** Guarda audio generado (grabación / demo) como WAV y lo registra en el motor. */
export async function storeGeneratedAudio(buf: AudioBuffer, blob: Blob, name: string, kind: AudioAsset['kind']): Promise<AudioAsset> {
  const asset: StoredAsset = {
    id: uid('ast'), name, mimeType: 'audio/wav', size: blob.size, duration: buf.duration,
    sampleRate: buf.sampleRate, channels: buf.numberOfChannels, createdAt: Date.now(), kind, blob,
  };
  await repository.putAsset(asset);
  engine.addBuffer(asset.id, buf);
  useAssets.getState().setStatus(asset.id, 'ready', buf.duration);
  const { blob: _b, ...meta } = asset;
  return meta;
}

const inflight = new Map<string, Promise<boolean>>();

/** Carga (desde IndexedDB) y decodifica un asset si no está en memoria. */
export function ensureAssetLoaded(assetId: string): Promise<boolean> {
  if (engine.hasBuffer(assetId)) return Promise.resolve(true);
  let p = inflight.get(assetId);
  if (p) return p;
  p = (async () => {
    const st = useAssets.getState();
    st.setStatus(assetId, 'loading');
    try {
      const a = await repository.getAsset(assetId);
      if (!a) { st.setStatus(assetId, 'missing'); return false; }
      const buf = await engine.decode(await a.blob.arrayBuffer());
      engine.addBuffer(assetId, buf);
      st.setStatus(assetId, 'ready', buf.duration);
      return true;
    } catch (e) {
      console.error('[sonora] error cargando audio', assetId, e);
      st.setStatus(assetId, 'error');
      return false;
    } finally {
      inflight.delete(assetId);
    }
  })();
  inflight.set(assetId, p);
  return p;
}

export async function loadDocAssets(doc: ProjectDoc): Promise<{ missing: number }> {
  const ids = [...new Set(doc.clips.map((c) => c.assetId))];
  const results = await Promise.all(ids.map(ensureAssetLoaded));
  return { missing: results.filter((r) => !r).length };
}
