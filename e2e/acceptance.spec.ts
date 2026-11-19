/**
 * Criterios de aceptación de la FASE 1 (sección 20 del encargo), automatizados de
 * principio a fin en Chromium real con micrófono simulado.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeSineWav } from './fixtures/makeFixture';
import { rms, residualRms, toneAmplitude } from './fixtures/analysis';
import { decodeWav } from '../src/audio/export/wav';

type Sonora = {
  engine: {
    playing: boolean;
    getPosition(): number;
    readMasterMeter(): [{ level: number }, { level: number }] | null;
    readTrackMeter(id: string): [{ level: number }, { level: number }] | null;
    getBuffer(id: string): AudioBuffer | undefined;
  };
  project: { getState(): { doc: { tracks: { id: string; name: string; volume: number; mute: boolean }[]; clips: { id: string; trackId: string; assetId: string; start: number; duration: number; recorded?: boolean }[] }; saveStatus: string; projectId: string } };
};


async function doc(page: Page) {
  return page.evaluate(() => (window as unknown as { __sonora: Sonora }).__sonora.project.getState().doc);
}

/** Muestrea el nivel de un medidor real durante `ms` y devuelve el máximo. */
async function maxLevel(page: Page, which: 'master' | string, ms = 900): Promise<number> {
  return page.evaluate(async ({ which, ms }) => {
    const e = (window as unknown as { __sonora: Sonora }).__sonora.engine;
    let max = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const r = which === 'master' ? e.readMasterMeter() : e.readTrackMeter(which);
      if (r) max = Math.max(max, r[0].level, r[1].level);
      await new Promise((res) => setTimeout(res, 30));
    }
    return max;
  }, { which, ms });
}

async function exportWav(page: Page, path: string) {
  await page.getByTestId('open-export').click();
  await page.getByRole('button', { name: '16-bit' }).click();
  await page.getByRole('button', { name: '44.1 kHz' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await download.saveAs(path);
  await expect(page.getByTestId('export-done')).toBeVisible();
  await page.keyboard.press('Escape');
  return decodeWav(readFileSync(path).buffer as ArrayBuffer);
}

test('Fase 1: crear → importar → grabar → mezclar → guardar → recargar → exportar', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1-2. Abrir la aplicación y crear un proyecto
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('studio')).toBeVisible();
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('project-name').fill('Prueba de aceptación');
  await page.getByTestId('project-name').press('Enter');

  // 3. Importar una instrumental
  await page.getByTestId('file-input').setInputFiles({ name: 'instrumental.wav', mimeType: 'audio/wav', buffer: makeSineWav(6) });
  await expect(page.getByTestId('clip')).toHaveCount(1);

  // 4. Visualizar su onda: el canvas del clip contiene píxeles dibujados
  const painted = await page.locator('[data-testid=clip] canvas').first().evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n / (c.width * c.height);
  });
  expect(painted).toBeGreaterThan(0.3); // seno de amplitud 0.5 → ~50 % del alto

  // 5-6. Reproducir y escuchar: el cabezal avanza y el medidor master recibe señal real
  await page.getByTestId('play').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sonora: Sonora }).__sonora.engine.getPosition())).toBeGreaterThan(0.5);
  const masterLvl = await maxLevel(page, 'master');
  expect(masterLvl).toBeGreaterThan(0.3);
  await page.getByTestId('play').click(); // pausa
  await page.getByTestId('stop').click(); // vuelve al inicio
  await page.getByTestId('stop').click();

  // 7-9. Micrófono + grabar voz sobre la instrumental
  await page.getByTestId('record').click();
  await expect(page.getByTestId('rec-indicator')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.getByTestId('record').click();
  await expect(page.getByTestId('rec-indicator')).toHaveCount(0);

  // 10. Visualizar la nueva pista vocal
  await expect(page.getByTestId('clip')).toHaveCount(2);
  let d = await doc(page);
  expect(d.tracks).toHaveLength(2);
  const voice = d.tracks[1];
  const beat = d.tracks[0];
  const vclip = d.clips.find((c) => c.recorded)!;
  expect(vclip).toBeTruthy();
  expect(vclip.trackId).toBe(voice.id);
  expect(vclip.duration).toBeGreaterThan(2);
  expect(vclip.start).toBeLessThan(0.2);
  const recEnergy = await page.evaluate((id) => {
    const b = (window as unknown as { __sonora: Sonora }).__sonora.engine.getBuffer(id)!;
    const x = b.getChannelData(0);
    let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / x.length);
  }, vclip.assetId);
  expect(recEnergy).toBeGreaterThan(0.01);

  // 11. Reproducir ambas pistas sincronizadas: los dos canales tienen señal a la vez
  await page.getByTestId('play').click();
  const [beatLvl, voiceLvl] = await Promise.all([maxLevel(page, beat.id, 1500), maxLevel(page, voice.id, 1500)]);
  expect(beatLvl).toBeGreaterThan(0.2);
  expect(voiceLvl).toBeGreaterThan(0.05);

  // 12. Ajustar el volumen de la voz (fader de la cabecera de pista)
  await page.locator(`[data-testid=track-header][data-track-id="${voice.id}"] input[type=range]`).fill('0.5');
  d = await doc(page);
  expect(d.tracks[1].volume).toBeLessThan(0.5);
  expect(d.tracks[1].volume).toBeGreaterThan(0.01);

  // 13-14. Silenciar la instrumental (el medidor real cae a 0) y reactivarla
  const beatHeader = page.locator(`[data-testid=track-header][data-track-id="${beat.id}"]`);
  await beatHeader.getByRole('button', { name: 'Silenciar (mute)' }).click();
  await page.waitForTimeout(1000); // caída balística del medidor
  expect(await maxLevel(page, beat.id, 500)).toBeLessThan(0.001);
  await beatHeader.getByRole('button', { name: 'Silenciar (mute)' }).click();
  expect(await maxLevel(page, beat.id, 700)).toBeGreaterThan(0.2);
  await page.getByTestId('play').click();

  // 15. Guardar
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const before = await doc(page);

  // 16-17. Recargar y recuperar pistas y archivos de audio
  await page.reload();
  await expect(page.getByTestId('studio')).toBeVisible();
  await expect(page.getByTestId('clip')).toHaveCount(2);
  const after = await doc(page);
  expect(after.tracks.map((t) => t.name)).toEqual(before.tracks.map((t) => t.name));
  expect(after.tracks[1].volume).toBeCloseTo(before.tracks[1].volume, 6);
  expect(after.clips.map((c) => c.start)).toEqual(before.clips.map((c) => c.start));
  await expect.poll(() => page.evaluate((ids) => ids.every((id) => !!(window as unknown as { __sonora: Sonora }).__sonora.engine.getBuffer(id)), after.clips.map((c) => c.assetId))).toBe(true);
  await expect(page.getByTestId('project-name')).toHaveValue('Prueba de aceptación');

  // 18-20. Exportar a WAV, abrirlo y comprobar que contiene la mezcla correcta
  const out = await exportWav(page, info.outputPath('mezcla.wav'));
  expect(out.sampleRate).toBe(44100);
  expect(out.channels).toHaveLength(2);
  const L = out.channels[0];
  const dur = L.length / out.sampleRate;
  expect(dur).toBeGreaterThanOrEqual(6);
  expect(dur).toBeLessThan(7);
  // instrumental presente a su nivel exacto (seno 0.5, fader 0 dB; StereoPanner centrado con
  // entrada estéreo es la identidad) → amplitud 0.5 en ambos canales
  const tone = toneAmplitude(L, out.sampleRate, 220, 4, 5);
  expect(tone).toBeGreaterThan(0.49);
  expect(tone).toBeLessThan(0.51);
  expect(toneAmplitude(out.channels[1], out.sampleRate, 220, 4, 5)).toBeCloseTo(tone, 2);
  // donde hay voz grabada existe energía adicional que no es la instrumental
  const vocalWin: [number, number] = [Math.max(0, vclip.start) + 0.2, vclip.start + vclip.duration - 0.2];
  const residVoice = residualRms(L, out.sampleRate, 220, ...vocalWin);
  const residBeatOnly = residualRms(L, out.sampleRate, 220, 4.2, 5.8);
  expect(residVoice).toBeGreaterThan(0.003);
  expect(residBeatOnly).toBeLessThan(0.002);

  // La exportación refleja el procesado real: con la instrumental silenciada desaparece el tono de 220 Hz
  await page.locator(`[data-testid=track-header][data-track-id="${beat.id}"]`).getByRole('button', { name: 'Silenciar (mute)' }).click();
  const muted = await exportWav(page, info.outputPath('mezcla-mute.wav'));
  expect(toneAmplitude(muted.channels[0], muted.sampleRate, 220, 4, 5)).toBeLessThan(0.001);
  expect(rms(muted.channels[0], muted.sampleRate, ...vocalWin)).toBeGreaterThan(0.003);

  expect(errors).toEqual([]);
});
