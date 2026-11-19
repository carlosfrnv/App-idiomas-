export const MIN_DB = -60;

export function dbToGain(db: number): number {
  return db <= MIN_DB - 30 ? 0 : Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return g <= 0.000001 ? -Infinity : 20 * Math.log10(g);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Curva del fader: posición 0..1 ↔ ganancia. 0.75 ≈ 0 dB, 1 = +6 dB, 0 = -inf.
 * Escala en dB para que el recorrido sea musical.
 */
export function faderPosToGain(pos: number): number {
  if (pos <= 0.001) return 0;
  const db = pos >= 0.75 ? (pos - 0.75) / 0.25 * 6 : -60 * Math.pow((0.75 - pos) / 0.75, 1.6);
  return dbToGain(db);
}

export function gainToFaderPos(g: number): number {
  if (g <= 0.001) return 0;
  const db = gainToDb(g);
  if (db >= 0) return clamp(0.75 + (db / 6) * 0.25, 0, 1);
  const x = Math.pow(Math.min(1, -db / 60), 1 / 1.6);
  return clamp(0.75 - x * 0.75, 0, 1);
}

export function formatDb(g: number, digits = 1): string {
  const db = gainToDb(g);
  if (!isFinite(db)) return '-∞';
  return `${db > 0 ? '+' : ''}${db.toFixed(digits)}`;
}

/** Panorama de potencia constante (para pruebas y medición). */
export function equalPowerPan(pan: number): [number, number] {
  const x = (clamp(pan, -1, 1) + 1) / 2;
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}
