import type { Clip } from '@/types/project';
import { peakRange, type Peaks } from '@/audio/waveform/peaks';
import { fadeFactor } from '@/audio/engine/scheduleClips';

export interface DrawArgs {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  buffer: AudioBuffer;
  peaks: Peaks;
  clip: Clip;
  pxPerSec: number;
  /** Instante de la línea temporal en el borde izquierdo del canvas. */
  startTime: number;
  color: string;
}

/**
 * Dibuja la forma de onda real del tramo visible del clip. Cada columna de píxel
 * corresponde exactamente a [t, t + 1/pxPerSec) de la línea temporal.
 */
export function drawClipWaveform({ canvas, width, height, buffer, peaks, clip, pxPerSec, startTime, color }: DrawArgs) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(width * dpr));
  const H = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, W, H);
  const sr = buffer.sampleRate;
  const spp = sr / (pxPerSec * dpr); // muestras por píxel físico
  const mid = H / 2;
  const amp = (H / 2) * 0.92;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  g.fillStyle = color;
  g.beginPath();
  for (let x = 0; x < W; x++) {
    const t = startTime + x / (pxPerSec * dpr);
    const rel = t - clip.start;
    if (rel < 0 || rel > clip.duration) continue;
    const s0 = (clip.offset + rel) * sr;
    const s1 = s0 + Math.max(1, spp);
    let mn: number, mx: number;
    if (spp >= peaks.block * 2) {
      [mn, mx] = peakRange(peaks, s0, s1);
    } else {
      mn = 0; mx = 0;
      const a = Math.max(0, Math.floor(s0)), b = Math.min(ch0.length, Math.ceil(s1));
      for (let i = a; i < b; i++) {
        const v = ch0[i];
        if (v < mn) mn = v; if (v > mx) mx = v;
        if (ch1) { const w = ch1[i]; if (w < mn) mn = w; if (w > mx) mx = w; }
      }
    }
    const k = clip.gain * fadeFactor(clip, rel);
    const top = Math.max(-1, Math.min(1, mx * k));
    const bot = Math.max(-1, Math.min(1, mn * k));
    const y0 = mid - top * amp;
    const h = Math.max(dpr * 0.75, (top - bot) * amp);
    g.rect(x, y0, 1, h);
  }
  g.fill();
  // línea central sutil
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, Math.floor(mid), W, Math.max(1, Math.floor(dpr * 0.5)));
}
