/**
 * Desplazamiento de tono por TD-PSOLA (Pitch-Synchronous Overlap-Add): se toman granos de dos
 * periodos centrados en las marcas de pitch y se recolocan a la distancia del nuevo periodo.
 * Conserva la duración y los formantes (la voz no suena "ardilla"). Tramas sordas: sin cambio.
 */
export function psolaShift(x: Float32Array, sampleRate: number, f0: Float32Array, ratio: Float32Array, hopSec: number): Float32Array {
  const N = x.length;
  const hop = hopSec * sampleRate;
  const frameAt = (n: number) => Math.min(f0.length - 1, Math.max(0, Math.round(n / hop)));
  const DEFAULT = Math.round(0.01 * sampleRate);

  // 1) marcas de análisis
  const marks: number[] = [];
  const periods: number[] = [];
  let n = 0;
  while (n < N) {
    const f = f0[frameAt(n)];
    if (f > 0) {
      const P = sampleRate / f;
      // refinar: máximo de amplitud en ±P/3 alrededor de la posición prevista
      const lo = Math.max(0, Math.round(n - P / 3)), hi = Math.min(N - 1, Math.round(n + P / 3));
      let best = Math.round(n), bv = -1;
      for (let i = lo; i <= hi; i++) { const v = Math.abs(x[i]); if (v > bv) { bv = v; best = i; } }
      if (marks.length && best <= marks[marks.length - 1] + P * 0.5) best = Math.round(marks[marks.length - 1] + P);
      marks.push(best);
      periods.push(P);
      n = best + P;
    } else {
      marks.push(Math.round(n));
      periods.push(DEFAULT);
      n += DEFAULT;
    }
  }

  // 2) síntesis por solape y suma, normalizada por la suma de ventanas
  const out = new Float32Array(N);
  const wsum = new Float32Array(N);
  let ts = 0, k = 0;
  while (ts < N) {
    while (k + 1 < marks.length && Math.abs(marks[k + 1] - ts) < Math.abs(marks[k] - ts)) k++;
    const m = marks[k];
    const P = Math.max(16, Math.round(periods[k]));
    const voiced = f0[frameAt(m)] > 0;
    const r = voiced ? Math.max(0.5, Math.min(2, ratio[frameAt(m)] || 1)) : 1;
    for (let j = -P; j <= P; j++) {
      const src = m + j, dst = Math.round(ts) + j;
      if (src < 0 || src >= N || dst < 0 || dst >= N) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * j) / P);
      out[dst] += x[src] * w;
      wsum[dst] += w;
    }
    ts += P / r;
  }
  for (let i = 0; i < N; i++) if (wsum[i] > 1e-3) out[i] /= wsum[i];
  return out;
}
