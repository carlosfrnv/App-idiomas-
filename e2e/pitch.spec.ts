/** Corrección de tono desde la interfaz, verificada analizando el audio exportado. */
import { test, expect } from '@playwright/test';
import { encodeWav } from '../src/audio/export/wav';
import { trackPitch } from '../src/audio/pitch/yin';
import { doc, exportWav } from './helpers';

function voiceWav(hz: number, seconds: number) {
  const sr = 44100, n = seconds * sr, x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { ph += (2 * Math.PI * hz) / sr; let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(h * ph) / h; x[i] = 0.3 * v; }
  return Buffer.from(encodeWav({ sampleRate: sr, channels: [x] }, 16));
}
const median = (x: Float32Array, sr: number) => {
  const t = trackPitch(x, sr);
  const v = [...t.f0].filter((f) => f > 0).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

test('afinar una voz desafinada a La 440 (Do mayor, robótico) y restaurarla', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('file-input').setInputFiles({ name: 'Voz desafinada.wav', mimeType: 'audio/wav', buffer: voiceWav(450, 2) });
  await page.getByTestId('clip').click({ position: { x: 40, y: 40 } });
  await page.getByTestId('tab-clip').click();
  await page.getByTestId('pitch-key').selectOption('0');
  await page.getByTestId('pitch-scale').selectOption('major');
  await page.getByTestId('pitch-robotic').click();
  await page.getByTestId('pitch-apply').click();
  await expect(page.getByTestId('pitch-graph')).toBeVisible({ timeout: 30_000 });
  const d = await doc(page);
  expect(d.clips[0]).toMatchObject({ pitch: { key: 0, scale: 'major', strength: 1, speedMs: 0 } });

  const tuned = await exportWav(page, info.outputPath('tuned.wav'));
  expect(median(tuned.channels[0], 44100) / 440).toBeCloseTo(1, 2);

  // no destructivo: restaurar devuelve el audio original
  await page.getByTestId('pitch-restore').click();
  const orig = await exportWav(page, info.outputPath('orig.wav'));
  expect(median(orig.channels[0], 44100) / 450).toBeCloseTo(1, 2);
  // y deshacer vuelve a la versión afinada
  await page.getByTestId('undo').click();
  expect((await doc(page)).clips[0].assetId).toBe(d.clips[0].assetId);

  // persiste tras recargar (el audio procesado se guarda en IndexedDB)
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('clip')).toHaveCount(1);
  const again = await exportWav(page, info.outputPath('tuned-reload.wav'));
  expect(median(again.channels[0], 44100) / 440).toBeCloseTo(1, 2);
});
