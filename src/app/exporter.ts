import { engine } from '@/audio/engine/AudioEngine';
import { renderMix } from '@/audio/export/renderMix';
import { encodeWav, type WavBitDepth } from '@/audio/export/wav';
import { useProject } from '@/state/projectStore';
import { loadDocAssets } from './assets';
import { sanitizeFileName } from '@/lib/format';

export interface ExportOptions {
  fileName: string;
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: WavBitDepth;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
}

export async function exportMixWav(opts: ExportOptions): Promise<{ blob: Blob; fileName: string; duration: number }> {
  const { doc } = useProject.getState();
  const { missing } = await loadDocAssets(doc);
  if (missing > 0) throw new Error(`Faltan ${missing} archivo(s) de audio del proyecto.`);
  const buf = await renderMix(doc, engine.buffersSnapshot(), { sampleRate: opts.sampleRate, onProgress: opts.onProgress, signal: opts.signal });
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  // dither TPDF simple al reducir a 16 bits
  if (opts.bitDepth === 16) {
    for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] += (Math.random() - Math.random()) / 65536;
  }
  const wav = encodeWav({ sampleRate: buf.sampleRate, channels: chans }, opts.bitDepth);
  const fileName = `${sanitizeFileName(opts.fileName)}.wav`;
  return { blob: new Blob([wav], { type: 'audio/wav' }), fileName, duration: buf.duration };
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
