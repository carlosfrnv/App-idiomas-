import { engine } from '@/audio/engine/AudioEngine';
import { renderMix, soloDoc } from '@/audio/export/renderMix';
import { encodeWav, type WavBitDepth } from '@/audio/export/wav';
import { encodeMp3, type Mp3Bitrate } from '@/audio/export/mp3';
import { createZip } from '@/lib/zip';
import { useProject } from '@/state/projectStore';
import { projectEnd } from '@/state/docOps';
import { loadDocAssets } from './assets';
import { sanitizeFileName } from '@/lib/format';

export type ExportFormat = 'wav' | 'mp3';
export type ExportRange = 'all' | 'loop';

export interface ExportOptions {
  fileName: string;
  format: ExportFormat;
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: WavBitDepth;
  kbps: Mp3Bitrate;
  range: ExportRange;
  stems: boolean;
  onProgress?: (f: number, label?: string) => void;
  signal?: AbortSignal;
}

async function encode(buf: AudioBuffer, o: ExportOptions, onP?: (f: number) => void): Promise<Blob> {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => new Float32Array(buf.getChannelData(i)));
  if (o.format === 'mp3') return encodeMp3(chans, buf.sampleRate, o.kbps, onP);
  if (o.bitDepth === 16) for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] += (Math.random() - Math.random()) / 65536; // dither TPDF
  return new Blob([encodeWav({ sampleRate: buf.sampleRate, channels: chans }, o.bitDepth)], { type: 'audio/wav' });
}

export async function exportProject(o: ExportOptions): Promise<{ blob: Blob; fileName: string; duration: number; files: number }> {
  const { doc } = useProject.getState();
  const { missing } = await loadDocAssets(doc);
  if (missing > 0) throw new Error(`Faltan ${missing} archivo(s) de audio del proyecto.`);
  if (o.format === 'mp3' && o.sampleRate === 96000) throw new Error('MP3 no admite 96 kHz: elige 44,1 o 48 kHz.');
  const start = o.range === 'loop' ? doc.loop.start : 0;
  const end = o.range === 'loop' ? doc.loop.end : projectEnd(doc);
  if (o.range === 'loop' && end - start < 0.05) throw new Error('La región del bucle está vacía.');
  const ext = o.format === 'mp3' ? 'mp3' : 'wav';
  const base = sanitizeFileName(o.fileName);
  const buffers = engine.buffersSnapshot();
  if (!o.stems) {
    const buf = await renderMix(doc, buffers, { sampleRate: o.sampleRate, start, end, signal: o.signal, onProgress: (f) => o.onProgress?.(o.format === 'mp3' ? f * 0.6 : f, 'Renderizando mezcla…') });
    const blob = await encode(buf, o, (f) => o.onProgress?.(0.6 + f * 0.4, 'Codificando MP3…'));
    return { blob, fileName: `${base}.${ext}`, duration: buf.duration, files: 1 };
  }
  const tracks = doc.tracks.filter((t) => doc.clips.some((c) => c.trackId === t.id));
  if (!tracks.length) throw new Error('No hay pistas con audio.');
  const entries: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  let duration = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (o.signal?.aborted) throw new DOMException('Exportación cancelada', 'AbortError');
    const t = tracks[i];
    const step = (f: number) => o.onProgress?.((i + f) / tracks.length, `Pista ${i + 1}/${tracks.length}: ${t.name}`);
    const buf = await renderMix(soloDoc(doc, t.id), buffers, { sampleRate: o.sampleRate, start, end, signal: o.signal, onProgress: (f) => step(f * 0.7) });
    duration = Math.max(duration, buf.duration);
    const blob = await encode(buf, o, (f) => step(0.7 + f * 0.3));
    let name = `${String(i + 1).padStart(2, '0')} ${sanitizeFileName(t.name)}.${ext}`;
    while (used.has(name)) name = name.replace(`.${ext}`, ` (2).${ext}`);
    used.add(name);
    entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return { blob: createZip(entries), fileName: `${base} (pistas).zip`, duration, files: entries.length };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
