import { encodeWav } from '../../src/audio/export/wav';

/** Instrumental de prueba determinista: seno de 220 Hz, amplitud 0.5, estéreo. */
export function makeSineWav(seconds = 6, sampleRate = 44100, freq = 220, amp = 0.5): Buffer {
  const n = Math.round(seconds * sampleRate);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return Buffer.from(encodeWav({ sampleRate, channels: [ch, ch.slice()] }, 16));
}
