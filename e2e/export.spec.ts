/** Exportación avanzada: MP3, región del bucle y stems en ZIP, verificados por análisis. */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeSineWav } from './fixtures/makeFixture';
import { toneAmplitude } from './fixtures/analysis';
import { decodeWav } from '../src/audio/export/wav';
import { readZip } from '../src/lib/zip';
import { doc } from './helpers';

async function setup(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('file-input').setInputFiles({ name: 'Grave.wav', mimeType: 'audio/wav', buffer: makeSineWav(3, 44100, 220, 0.4) });
  await expect(page.getByTestId('clip')).toHaveCount(1);
  await page.getByTestId('file-input').setInputFiles({ name: 'Agudo.wav', mimeType: 'audio/wav', buffer: makeSineWav(3, 44100, 660, 0.4) });
  await expect(page.getByTestId('clip')).toHaveCount(2);
}

async function download(page: Page, path: string) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await d.saveAs(path);
  await expect(page.getByTestId('export-done')).toBeVisible();
  return { name: d.suggestedFilename(), bytes: readFileSync(path) };
}

test('MP3 320 kbps decodificable con la mezcla correcta', async ({ page }, info) => {
  await setup(page);
  await page.getByTestId('open-export').click();
  await page.getByTestId('fmt-mp3').click();
  await page.getByRole('button', { name: '44.1 kHz' }).click();
  const { name, bytes } = await download(page, info.outputPath('mix.mp3'));
  expect(name).toMatch(/\.mp3$/);
  expect(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0).toBe(true); // sincronía de trama MPEG
  expect(bytes.length).toBeGreaterThan(3 * 320_000 / 8 * 0.8); // ~320 kbps
  // el navegador decodifica el MP3 y contiene ambos tonos
  const res = await page.evaluate(async (b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const buf = await ctx.decodeAudioData(raw.buffer);
    return { dur: buf.duration, sr: buf.sampleRate, data: Array.from(buf.getChannelData(0).subarray(44100, 88200)) };
  }, bytes.toString('base64'));
  expect(res.dur).toBeGreaterThan(2.9);
  const x = Float32Array.from(res.data);
  expect(toneAmplitude(x, res.sr, 220, 0, 0.9)).toBeCloseTo(0.4, 1);
  expect(toneAmplitude(x, res.sr, 660, 0, 0.9)).toBeCloseTo(0.4, 1);
});

test('stems: ZIP con un WAV por pista, cada uno sólo con su audio', async ({ page }, info) => {
  await setup(page);
  // un efecto en el master NO debe aplicarse a los stems
  await page.evaluate(() => (window as any).__sonora.project.getState().apply((d: any) => ({ ...d, masterVolume: 0.25 })));
  await page.getByTestId('open-export').click();
  await page.getByRole('button', { name: '32 float' }).click();
  await page.getByRole('button', { name: '44.1 kHz' }).click();
  await page.getByTestId('stems').check();
  const { name, bytes } = await download(page, info.outputPath('stems.zip'));
  expect(name).toMatch(/\(pistas\)\.zip$/);
  const entries = readZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer);
  expect(entries.map((e) => e.name)).toEqual(['01 Grave.wav', '02 Agudo.wav']);
  const grave = decodeWav(entries[0].data.slice().buffer);
  const agudo = decodeWav(entries[1].data.slice().buffer);
  expect(toneAmplitude(grave.channels[0], 44100, 220, 1, 2)).toBeCloseTo(0.4, 2);
  expect(toneAmplitude(grave.channels[0], 44100, 660, 1, 2)).toBeLessThan(0.001);
  expect(toneAmplitude(agudo.channels[0], 44100, 660, 1, 2)).toBeCloseTo(0.4, 2);
  expect(toneAmplitude(agudo.channels[0], 44100, 220, 1, 2)).toBeLessThan(0.001);
});

test('exportar sólo la región del bucle', async ({ page }, info) => {
  await setup(page);
  await page.evaluate(() => (window as any).__sonora.project.getState().apply((d: any) => ({ ...d, loop: { enabled: false, start: 1, end: 2.5 } })));
  expect((await doc(page)).clips).toHaveLength(2);
  await page.getByTestId('open-export').click();
  await page.getByRole('button', { name: '32 float' }).click();
  await page.getByRole('button', { name: '44.1 kHz' }).click();
  await page.getByTestId('range-loop').click();
  const { bytes } = await download(page, info.outputPath('loop.wav'));
  const w = decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer);
  const dur = w.channels[0].length / 44100;
  expect(dur).toBeGreaterThanOrEqual(1.5);
  expect(dur).toBeLessThan(1.6);
});
