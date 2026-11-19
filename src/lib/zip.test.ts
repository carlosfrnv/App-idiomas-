import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip } from './zip';

describe('zip', () => {
  it('crc32 estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('crea y lee un zip con varias entradas', async () => {
    const a = new Uint8Array([1, 2, 3]), b = new TextEncoder().encode('voz principal');
    const z = createZip([{ name: 'Beat.wav', data: a }, { name: 'Voz ñ.wav', data: b }]);
    const back = readZip(await z.arrayBuffer());
    expect(back.map((e) => e.name)).toEqual(['Beat.wav', 'Voz ñ.wav']);
    expect([...back[0].data]).toEqual([1, 2, 3]);
    const bytes = new Uint8Array(await z.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});
