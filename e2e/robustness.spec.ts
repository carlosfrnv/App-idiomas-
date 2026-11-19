/** Robustez: permisos, bucle, noise gate, persistencia de efectos y archivos inválidos. */
import { test, expect } from '@playwright/test';
import { doc, exportWav, newProjectWithSine } from './helpers';
import { toneAmplitude } from './fixtures/analysis';

test('permiso de micrófono denegado: mensaje claro, sin romper la app', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await newProjectWithSine(page, 2);
  await page.getByTestId('record').click();
  await expect(page.getByRole('dialog', { name: 'Entrada de grabación' })).toBeVisible();
  await expect(page.getByTestId('input-error')).toContainText('Permiso de micrófono denegado');
  await expect(page.getByTestId('toast-error')).toBeVisible();
  await page.keyboard.press('Escape');
  // la reproducción sigue funcionando
  await page.getByTestId('play').click();
  await expect.poll(() => page.evaluate(() => (window as any).__sonora.engine.getPosition())).toBeGreaterThan(0.3);
  expect(await page.evaluate(() => (window as any).__sonora.transport.getState().recording)).toBe(false);
});

test('archivo no válido: se rechaza con un mensaje comprensible', async ({ page }) => {
  await newProjectWithSine(page, 1);
  await page.getByTestId('file-input').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
  await expect(page.getByTestId('toast-error')).toContainText('no es un formato de audio admitido');
  await page.getByTestId('file-input').setInputFiles({ name: 'roto.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEbasura') });
  await expect(page.getByTestId('toast-error').last()).toContainText('No se pudo decodificar');
  expect((await doc(page)).clips).toHaveLength(1);
});

test('bucle: la reproducción se repite dentro de la región', async ({ page }) => {
  await newProjectWithSine(page, 4);
  await page.evaluate(() => (window as any).__sonora.project.getState().apply((d: any) => ({ ...d, loop: { enabled: true, start: 0.5, end: 1.5 } })));
  await page.getByTestId('play').click();
  const positions: number[] = [];
  for (let i = 0; i < 25; i++) {
    positions.push(await page.evaluate(() => (window as any).__sonora.engine.getPosition()));
    await page.waitForTimeout(100);
  }
  expect(Math.max(...positions)).toBeLessThanOrEqual(1.5);
  expect(Math.min(...positions.slice(3))).toBeGreaterThanOrEqual(0.5);
  // ha dado la vuelta al menos una vez
  expect(positions.some((p, i) => i > 0 && p < positions[i - 1] - 0.5)).toBe(true);
  expect(await page.evaluate(() => (window as any).__sonora.engine.playing)).toBe(true);
});

test('noise gate (AudioWorklet) en tiempo real y en exportación', async ({ page }, info) => {
  await newProjectWithSine(page, 2);
  const t = (await doc(page)).tracks[0];
  await page.getByTestId('tab-fx').click();
  await page.getByTestId('fx-add').click();
  await page.getByRole('menuitem', { name: 'Noise Gate' }).click();
  const g = (await doc(page)).tracks[0].effects[0];
  // umbral por debajo de la señal (-6 dBFS) → pasa
  await page.evaluate(({ t, g }) => (window as any).__sonora.fx.updateEffect(t, g, { threshold: -20, range: -80 }), { t: t.id, g: g.id });
  const open = await exportWav(page, info.outputPath('gate-open.wav'));
  expect(toneAmplitude(open.channels[0], 44100, 220, 0.5, 1.5)).toBeCloseTo(0.5, 1);
  // umbral por encima → la puerta se cierra (rango -80 dB)
  await page.evaluate(({ t, g }) => (window as any).__sonora.fx.updateEffect(t, g, { threshold: -1 }), { t: t.id, g: g.id });
  const closed = await exportWav(page, info.outputPath('gate-closed.wav'));
  expect(toneAmplitude(closed.channels[0], 44100, 220, 0.5, 1.5)).toBeLessThan(0.001);
});

test('los efectos y la mezcla persisten tras recargar', async ({ page }) => {
  await newProjectWithSine(page, 2);
  await page.getByRole('button', { name: 'Presets', exact: true }).click();
  await page.getByTestId('preset-trap').click();
  await page.evaluate(() => (window as any).__sonora.project.getState().apply((d: any) => ({ ...d, bpm: 128, masterVolume: 0.7 })));
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const before = await doc(page);
  await page.reload();
  await expect(page.getByTestId('clip')).toHaveCount(1);
  const after = await doc(page);
  expect(after.tracks[0].effects).toEqual(before.tracks[0].effects);
  expect(after.bpm).toBe(128);
  expect((after as any).masterVolume).toBeCloseTo(0.7);
});
