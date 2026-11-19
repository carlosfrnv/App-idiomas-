/**
 * Codificación MP3 con LAME (@breezystack/lamejs, LGPL-3.0). Se carga bajo demanda como
 * módulo independiente y sin modificar (ver THIRD_PARTY_NOTICES.md).
 */
export type Mp3Bitrate = 128 | 192 | 256 | 320;
export const MP3_RATES = [32000, 44100, 48000];

function toInt16(x: Float32Array, from: number, to: number): Int16Array<ArrayBuffer> {
  const out = new Int16Array(new ArrayBuffer((to - from) * 2));
  for (let i = from; i < to; i++) {
    const s = x[i] > 1 ? 1 : x[i] < -1 ? -1 : x[i];
    out[i - from] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function encodeMp3(channels: Float32Array[], sampleRate: number, kbps: Mp3Bitrate, onProgress?: (f: number) => void): Promise<Blob> {
  if (!MP3_RATES.includes(sampleRate)) throw new Error(`MP3 admite 32, 44,1 o 48 kHz (no ${sampleRate} Hz).`);
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const stereo = channels.length > 1;
  const enc = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps);
  const L = channels[0], R = stereo ? channels[1] : undefined;
  const parts: BlobPart[] = [];
  const BLOCK = 1152 * 32;
  for (let i = 0; i < L.length; i += BLOCK) {
    const end = Math.min(L.length, i + BLOCK);
    const mp3 = R ? enc.encodeBuffer(toInt16(L, i, end), toInt16(R, i, end)) : enc.encodeBuffer(toInt16(L, i, end));
    if (mp3.length) parts.push(new Uint8Array(mp3));
    if ((i / BLOCK) % 8 === 0) { onProgress?.(end / L.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}
