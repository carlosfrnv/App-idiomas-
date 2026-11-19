/** Codificación / lectura WAV (RIFF). PCM 16/24 bits y IEEE float 32 bits. */
export type WavBitDepth = 16 | 24 | 32;

export interface PcmData { sampleRate: number; channels: Float32Array[] }

export function encodeWav({ sampleRate, channels }: PcmData, bitDepth: WavBitDepth = 16): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const isFloat = bitDepth === 32;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, isFloat ? 3 : 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      if (isFloat) { v.setFloat32(o, s, true); o += 4; continue; }
      s = s > 1 ? 1 : s < -1 ? -1 : s;
      if (bitDepth === 16) {
        v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
        o += 2;
      } else {
        const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(o, x & 0xff); v.setUint8(o + 1, (x >> 8) & 0xff); v.setUint8(o + 2, (x >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return buffer;
}

/** Lector WAV mínimo (para pruebas y verificación de exportaciones). */
export function decodeWav(buf: ArrayBuffer): PcmData & { bitDepth: number; format: number } {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('No es un archivo WAV válido');
  let o = 12;
  let format = 1, numCh = 0, sampleRate = 0, bitDepth = 0;
  while (o + 8 <= v.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      format = v.getUint16(o + 8, true);
      numCh = v.getUint16(o + 10, true);
      sampleRate = v.getUint32(o + 12, true);
      bitDepth = v.getUint16(o + 22, true);
    } else if (id === 'data') {
      const bps = bitDepth / 8;
      const frames = Math.floor(size / (bps * numCh));
      const channels = Array.from({ length: numCh }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < numCh; c++) {
          let s: number;
          if (format === 3) s = v.getFloat32(p, true);
          else if (bitDepth === 16) s = v.getInt16(p, true) / 0x8000;
          else if (bitDepth === 24) {
            let x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16);
            if (x & 0x800000) x |= ~0xffffff;
            s = x / 0x800000;
          } else throw new Error(`Profundidad no soportada: ${bitDepth}`);
          channels[c][i] = s;
          p += bps;
        }
      }
      return { sampleRate, channels, bitDepth, format };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV sin bloque de datos');
}
