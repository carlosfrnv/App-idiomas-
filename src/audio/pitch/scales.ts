export const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export const SCALES = {
  major: { name: 'Mayor', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Menor natural', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Menor armónica', steps: [0, 2, 3, 5, 7, 8, 11] },
  pentMajor: { name: 'Pentatónica mayor', steps: [0, 2, 4, 7, 9] },
  pentMinor: { name: 'Pentatónica menor', steps: [0, 3, 5, 7, 10] },
  chromatic: { name: 'Cromática', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
} as const;
export type ScaleId = keyof typeof SCALES;

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Nota (MIDI entero) de la escala más cercana a una nota MIDI fraccionaria. */
export function nearestScaleMidi(midi: number, key: number, scale: ScaleId): number {
  const steps = SCALES[scale].steps as readonly number[];
  let best = Math.round(midi), bestD = Infinity;
  for (let m = Math.floor(midi) - 2; m <= Math.ceil(midi) + 2; m++) {
    const pc = (((m - key) % 12) + 12) % 12;
    if (!steps.includes(pc)) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// Perfiles de Krumhansl-Kessler para estimar la tonalidad a partir de las notas cantadas.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function estimateKey(f0: Float32Array): { key: number; scale: 'major' | 'minor'; confidence: number } | null {
  const hist = new Array(12).fill(0);
  let n = 0;
  for (const f of f0) if (f > 0) { hist[((Math.round(hzToMidi(f)) % 12) + 12) % 12]++; n++; }
  if (n < 20) return null;
  const corr = (prof: number[], rot: number) => {
    const ma = prof.reduce((a, b) => a + b) / 12, mb = hist.reduce((a, b) => a + b) / 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { const a = prof[(i - rot + 12) % 12] - ma, b = hist[i] - mb; num += a * b; da += a * a; db += b * b; }
    return num / Math.sqrt(da * db || 1);
  };
  let best = { key: 0, scale: 'major' as 'major' | 'minor', confidence: -2 };
  for (let k = 0; k < 12; k++) {
    for (const [scale, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]] as const) {
      const c = corr(prof as number[], k);
      if (c > best.confidence) best = { key: k, scale, confidence: c };
    }
  }
  return best;
}
