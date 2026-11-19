/**
 * Picos multirresolución para dibujar formas de onda reales.
 * Nivel base: min/max cada `BASE_BLOCK` muestras (mezcla de canales por valor absoluto máximo).
 */
export const BASE_BLOCK = 256;

export interface Peaks {
  sampleRate: number;
  length: number;
  block: number;
  /** Intercalado [min0, max0, min1, max1, ...] */
  data: Float32Array;
}

export function computePeaks(channels: Float32Array[], sampleRate: number, block = BASE_BLOCK): Peaks {
  const length = channels[0]?.length ?? 0;
  const n = Math.ceil(length / block);
  const data = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let mn = 0, mx = 0;
    const s = i * block;
    const e = Math.min(length, s + block);
    for (const ch of channels) {
      for (let j = s; j < e; j++) {
        const v = ch[j];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    data[i * 2] = mn;
    data[i * 2 + 1] = mx;
  }
  return { sampleRate, length, block, data };
}

/**
 * Devuelve min/max para el rango de muestras [s0, s1) consultando el nivel base.
 */
export function peakRange(p: Peaks, s0: number, s1: number): [number, number] {
  const b0 = Math.max(0, Math.floor(s0 / p.block));
  const b1 = Math.min(p.data.length / 2, Math.max(b0 + 1, Math.ceil(s1 / p.block)));
  let mn = 0, mx = 0;
  for (let b = b0; b < b1; b++) {
    const a = p.data[b * 2], c = p.data[b * 2 + 1];
    if (a < mn) mn = a;
    if (c > mx) mx = c;
  }
  return [mn, mx];
}

/** Miniatura normalizada (0..1) de N columnas, para vistas previas de proyecto. */
export function thumbnail(p: Peaks, columns: number): number[] {
  const out: number[] = [];
  const per = p.length / columns;
  let max = 0;
  for (let i = 0; i < columns; i++) {
    const [mn, mx] = peakRange(p, i * per, (i + 1) * per);
    const v = Math.max(-mn, mx);
    out.push(v);
    if (v > max) max = v;
  }
  return out.map((v) => (max > 0 ? Math.round((v / max) * 100) / 100 : 0));
}
