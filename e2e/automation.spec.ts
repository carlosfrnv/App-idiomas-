/** Automatización dibujada en el carril: se aplica al reproducir y al exportar. */
import { test, expect } from '@playwright/test';
import { doc, exportWav, newProjectWithSine } from './helpers';
import { toneAmplitude } from './fixtures/analysis';
import { valueAt } from '../src/audio/engine/automation';

test('curva de volumen dibujada con el ratón', async ({ page }, info) => {
  await newProjectWithSine(page, 4);
  await page.getByTestId('toggle-automation').click();
  const lane = page.getByTestId('automation-lane');
  await expect(lane).toBeVisible();
  const box = (await lane.boundingBox())!;
  const u = await page.evaluate(() => { const s = (window as any).__sonora.ui.getState(); return { pps: s.pxPerSec, scroll: s.scrollTime }; });
  const x = (t: number) => box.x + (t - u.scroll) * u.pps;
  await page.keyboard.down('Shift'); // sin ajuste a rejilla
  await page.mouse.click(x(1), box.y + box.height - 12); // volumen bajo
  await page.mouse.click(x(2), box.y + 6 + (1 - 0.75) * (box.height - 12)); // ≈ 0 dB
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('automation-point')).toHaveCount(2);
  const pts = (await doc(page)).tracks[0] as any;
  const points = pts.automation.volume.points as { t: number; v: number }[];
  expect(pts.automation.volume.enabled).toBe(true);
  expect(points[0].t).toBeCloseTo(1, 1);
  expect(points[0].v).toBeLessThan(0.1);
  expect(points[1].v).toBeGreaterThan(0.9);

  // reproducción: el medidor real sigue la curva
  await page.getByTestId('play').click();
  const level = async (from: number, to: number) => page.evaluate(async ({ from, to }) => {
    const e = (window as any).__sonora.engine;
    const id = (window as any).__sonora.project.getState().doc.tracks[0].id;
    let max = 0;
    while (e.getPosition() < to) {
      if (e.getPosition() > from) { const r = e.readTrackMeter(id); if (r) max = Math.max(max, r[0].level); }
      await new Promise((r) => setTimeout(r, 20));
    }
    return max;
  }, { from, to });
  const early = await level(0.3, 0.8);
  const late = await level(2.4, 3.0);
  expect(early).toBeLessThan(0.1);
  expect(late).toBeGreaterThan(0.4);
  await page.getByTestId('play').click();

  // exportación: amplitud = 0.5 × curva
  const w = await exportWav(page, info.outputPath('auto.wav'));
  for (const [a, b] of [[0.2, 0.8], [2.3, 2.9]]) {
    const expected = 0.5 * valueAt(points, (a + b) / 2);
    expect(toneAmplitude(w.channels[0], 44100, 220, a, b)).toBeCloseTo(expected, 2);
  }
  // en la rampa, el valor intermedio
  expect(toneAmplitude(w.channels[0], 44100, 220, 1.45, 1.55)).toBeCloseTo(0.5 * valueAt(points, 1.5), 1);

  // desactivar la lectura devuelve el control al fader
  await page.getByTestId('automation-header').getByRole('switch').click();
  const off = await exportWav(page, info.outputPath('auto-off.wav'));
  expect(toneAmplitude(off.channels[0], 44100, 220, 0.2, 0.8)).toBeCloseTo(0.5, 2);

  // doble clic borra un punto
  await page.getByTestId('automation-point').first().dblclick();
  await expect(page.getByTestId('automation-point')).toHaveCount(1);
});
