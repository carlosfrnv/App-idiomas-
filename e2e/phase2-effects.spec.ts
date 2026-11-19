/**
 * Fase 2 — los efectos y la mezcla modifican REALMENTE el audio exportado.
 * Instrumental de prueba: seno de 220 Hz, amplitud 0.5.
 */
import { test, expect, type Page } from '@playwright/test';
import { doc, exportWav, newProjectWithSine } from './helpers';
import { rms, toneAmplitude } from './fixtures/analysis';
import { biquadCoefs, biquadMagnitude } from '../src/audio/fx/biquadMath';

const SR = 44100;

async function setFx(page: Page, trackId: string, fxId: string, patch: Record<string, unknown>) {
  await page.evaluate(({ trackId, fxId, patch }) => (window as any).__sonora.fx.updateEffect(trackId, fxId, patch), { trackId, fxId, patch });
}

test('EQ: plano es transparente y la atenuación coincide con la curva dibujada', async ({ page }, info) => {
  await newProjectWithSine(page, 3);
  const t = (await doc(page)).tracks[0];
  await page.getByTestId('tab-fx').click();
  await page.getByTestId('fx-add').click();
  await page.getByRole('menuitem', { name: 'Ecualizador' }).click();
  await expect(page.getByTestId('eq-graph')).toBeVisible();
  let d = await doc(page);
  const eq = d.tracks[0].effects[0];
  expect(eq.type).toBe('eq');

  const flat = await exportWav(page, info.outputPath('eq-flat.wav'));
  expect(toneAmplitude(flat.channels[0], SR, 220, 1, 2)).toBeCloseTo(0.5, 2);

  // banda campana a 220 Hz, -9 dB, Q 1.4 → el gráfico predice la misma atenuación que se mide
  const bands = (eq.params.bands as any[]).map((b, i) => (i === 2 ? { ...b, type: 'peaking', frequency: 220, gain: -9, q: 1.4, enabled: true } : b));
  await setFx(page, t.id, eq.id, { bands });
  const cut = await exportWav(page, info.outputPath('eq-cut.wav'));
  const measuredDb = 20 * Math.log10(toneAmplitude(cut.channels[0], SR, 220, 1, 2) / 0.5);
  const predictedDb = (bands as any[]).filter((b) => b.enabled).reduce((acc, b) => acc + 20 * Math.log10(biquadMagnitude(biquadCoefs(b.type, b.frequency, b.q, b.gain, SR), 220, SR)), 0);
  expect(predictedDb).toBeCloseTo(-9, 0);
  expect(Math.abs(measuredDb - predictedDb)).toBeLessThan(0.3);

  // bypass del efecto → vuelve a ser transparente
  await page.locator('[data-testid=fx-slot]').first().getByRole('switch').click();
  const byp = await exportWav(page, info.outputPath('eq-bypass.wav'));
  expect(toneAmplitude(byp.channels[0], SR, 220, 1, 2)).toBeCloseTo(0.5, 2);
  d = await doc(page);
  expect(d.tracks[0].effects[0]).toMatchObject({ enabled: false });
});

test('compresor, reverb, delay, filtro, saturación y preset modifican el audio', async ({ page }, info) => {
  await newProjectWithSine(page, 2);
  const t = (await doc(page)).tracks[0];
  const add = async (label: string) => {
    await page.getByTestId('fx-add').click();
    await page.getByRole('menuitem', { name: label }).click();
    const d = await doc(page);
    return d.tracks[0].effects.at(-1)!;
  };
  await page.getByTestId('tab-fx').click();

  // compresor: la salida sigue la curva estática (sin la compensación interna del nodo, que
  // SONORA anula). Seno 0.5 (-6 dBFS pico) con umbral -30 dB y ratio 10, rodilla dura.
  const comp = await add('Compresor');
  await setFx(page, t.id, comp.id, { threshold: -30, ratio: 10, makeup: 0, knee: 0, attack: 0.001, release: 0.05 });
  const c = await exportWav(page, info.outputPath('comp.wav'));
  const compDb = 20 * Math.log10(toneAmplitude(c.channels[0], SR, 220, 1, 1.9) / 0.5);
  expect(compDb).toBeLessThan(-12);
  // el makeup añade exactamente su ganancia
  await setFx(page, t.id, comp.id, { makeup: 6 });
  const c6 = await exportWav(page, info.outputPath('comp6.wav'));
  expect(20 * Math.log10(toneAmplitude(c6.channels[0], SR, 220, 1, 1.9) / toneAmplitude(c.channels[0], SR, 220, 1, 1.9))).toBeCloseTo(6, 0);
  await page.locator('[data-testid=fx-slot]').first().getByRole('switch').click(); // bypass

  // reverb → cola de energía tras el final del audio (2 s)
  const rev = await add('Reverb');
  await setFx(page, t.id, rev.id, { mix: 0.6, decay: 2 });
  const r = await exportWav(page, info.outputPath('rev.wav'));
  expect(r.channels[0].length / SR).toBeGreaterThan(3.5);
  expect(rms(r.channels[0], SR, 2.2, 2.8)).toBeGreaterThan(0.005);
  await page.locator('[data-testid=fx-slot]').nth(1).getByRole('switch').click();

  // delay → ecos tras el final
  const dl = await add('Delay');
  await setFx(page, t.id, dl.id, { sync: false, time: 0.3, feedback: 0.5, mix: 0.5 });
  const de = await exportWav(page, info.outputPath('delay.wav'));
  expect(rms(de.channels[0], SR, 2.05, 2.5)).toBeGreaterThan(0.02);
  await page.locator('[data-testid=fx-slot]').nth(2).getByRole('switch').click();

  // filtro pasa-altos a 2 kHz → el seno de 220 Hz casi desaparece
  const fl = await add('Filtro');
  await setFx(page, t.id, fl.id, { mode: 'highpass', frequency: 2000, q: 0.707 });
  const f = await exportWav(page, info.outputPath('filter.wav'));
  expect(toneAmplitude(f.channels[0], SR, 220, 1, 1.9)).toBeLessThan(0.01);
  await page.locator('[data-testid=fx-slot]').nth(3).getByRole('switch').click();

  // saturación → aparecen armónicos (660 Hz) que no existían
  const sat = await add('Saturación');
  await setFx(page, t.id, sat.id, { drive: 0.8, mix: 1, tone: 1 });
  const s = await exportWav(page, info.outputPath('sat.wav'));
  expect(toneAmplitude(s.channels[0], SR, 660, 1, 1.9)).toBeGreaterThan(0.02);

  // preset "Voz de radio" (desde la biblioteca) sustituye la cadena por un pasa-banda a 1,6 kHz
  await page.getByRole('button', { name: 'Presets', exact: true }).click();
  await page.getByTestId('preset-radio').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
  const d = await doc(page);
  expect(d.tracks[0].effects.map((e) => e.type)).toEqual(['filter', 'saturation', 'compressor']);
  const radio = await exportWav(page, info.outputPath('radio.wav'));
  expect(toneAmplitude(radio.channels[0], SR, 220, 1, 1.9)).toBeLessThan(0.25); // > 6 dB menos graves
  // ningún preset debe saturar la salida con una señal a -6 dBFS
  let peak = 0; for (const v of radio.channels[0]) peak = Math.max(peak, Math.abs(v));
  expect(peak).toBeLessThan(1);
});

test('mezcla: panorama, ganancia de clip, volumen master y fundidos', async ({ page }, info) => {
  await newProjectWithSine(page, 2);
  const d0 = await doc(page);
  const t = d0.tracks[0];
  const clip = d0.clips[0];
  await page.evaluate(({ tid, cid }) => {
    const s = (window as any).__sonora.project.getState();
    s.apply((d: any) => ({ ...d, tracks: d.tracks.map((x: any) => (x.id === tid ? { ...x, pan: -1 } : x)), clips: d.clips.map((c: any) => (c.id === cid ? { ...c, gain: 0.5, fadeIn: 0.5 } : c)), masterVolume: 0.5 }));
  }, { tid: t.id, cid: clip.id });
  const w = await exportWav(page, info.outputPath('mix.wav'));
  const L = toneAmplitude(w.channels[0], SR, 220, 1, 1.9);
  const R = toneAmplitude(w.channels[1], SR, 220, 1, 1.9);
  // StereoPanner con entrada estéreo a la izquierda: L = l + r·cos(0) = 2·0.5·0.5·0.5 = 0.25, R = 0
  expect(L).toBeCloseTo(0.25, 2);
  expect(R).toBeLessThan(0.001);
  // fundido de entrada lineal de 0,5 s → a 0,25 s la amplitud es la mitad
  expect(toneAmplitude(w.channels[0], SR, 220, 0.2, 0.3)).toBeCloseTo(0.125, 1);
});
