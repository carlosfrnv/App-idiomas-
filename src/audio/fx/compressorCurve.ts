/**
 * Modelo de la curva estática de DynamicsCompressorNode (algoritmo de la especificación
 * Web Audio / implementación de Blink, WebKit y Gecko). Sirve para:
 *  1) anular la compensación automática interna ("makeup" implícito = (1/G(0 dBFS))^0.6),
 *     de modo que el control Makeup de SONORA sea la única ganancia de compensación;
 *  2) dibujar la curva de transferencia real.
 */
const dbToLin = (db: number) => Math.pow(10, db / 20);
const linToDb = (x: number) => (x <= 0 ? -1000 : 20 * Math.log10(x));

export interface CompressorCurve {
  /** Ganancia de compensación automática que aplica el nodo (dB). */
  internalMakeupDb: number;
  /** Salida estática (dB) para una entrada (dB), sin la compensación automática. */
  staticOut(inDb: number): number;
}

export function compressorCurve(thresholdDb: number, kneeDb: number, ratio: number): CompressorCurve {
  const linearThreshold = dbToLin(thresholdDb);
  const slope = 1 / Math.max(1, ratio);
  const kneeCurve = (x: number, k: number) => (x < linearThreshold ? x : linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k);
  const slopeAt = (x: number, k: number) => {
    if (x < linearThreshold) return 1;
    const x2 = x * 1.001;
    const xDb = linToDb(x), x2Db = linToDb(x2);
    const yDb = linToDb(kneeCurve(x, k)), y2Db = linToDb(kneeCurve(x2, k));
    return (y2Db - yDb) / (x2Db - xDb);
  };
  const xKnee = dbToLin(thresholdDb + kneeDb);
  let minK = 0.1, maxK = 10000, k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(xKnee, k) < slope) maxK = k; else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  const kneeThresholdDb = thresholdDb + kneeDb;
  const kneeThreshold = dbToLin(kneeThresholdDb);
  const yKneeDb = linToDb(kneeCurve(kneeThreshold, k));
  const saturate = (x: number) => (x < kneeThreshold ? kneeCurve(x, k) : dbToLin(yKneeDb + slope * (linToDb(x) - kneeThresholdDb)));
  const fullRange = saturate(1);
  return {
    internalMakeupDb: ratio <= 1 ? 0 : 0.6 * -linToDb(fullRange),
    staticOut: (inDb) => linToDb(saturate(dbToLin(inDb))),
  };
}
