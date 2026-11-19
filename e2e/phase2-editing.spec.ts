/** Fase 2 — edición de clips y deshacer/rehacer a través de la interfaz. */
import { test, expect, type Page } from '@playwright/test';
import { doc, newProjectWithSine } from './helpers';

async function ui(page: Page) {
  return page.evaluate(() => { const u = (window as any).__sonora.ui.getState(); return { pps: u.pxPerSec, scroll: u.scrollTime }; });
}

/** Coordenada de pantalla de un instante en la línea temporal. */
async function xAt(page: Page, t: number) {
  const box = (await page.getByTestId('lanes').boundingBox())!;
  const u = await ui(page);
  return box.x + (t - u.scroll) * u.pps;
}

test('dividir, mover, recortar, duplicar, eliminar, deshacer y rehacer', async ({ page }) => {
  await newProjectWithSine(page, 4);
  const ruler = (await page.getByTestId('ruler').boundingBox())!;

  // colocar el cabezal en 2 s (Mayús = sin ajuste a rejilla) y dividir con S
  await page.keyboard.down('Shift');
  await page.mouse.click(await xAt(page, 2), ruler.y + 28);
  await page.keyboard.up('Shift');
  await expect.poll(async () => page.evaluate(() => (window as any).__sonora.transport.getState().position)).toBeCloseTo(2, 1);
  await page.getByTestId('clip').first().click({ position: { x: 20, y: 40 } });
  await page.keyboard.press('s');
  await expect(page.getByTestId('clip')).toHaveCount(2);
  let d = await doc(page);
  const [a, b] = [...d.clips].sort((x, y) => x.start - y.start);
  expect(a.duration + b.duration).toBeCloseTo(4, 3);
  expect(b.offset).toBeCloseTo(b.start, 6); // continuidad: el audio sigue donde se cortó

  // deshacer / rehacer (atajos y botones)
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('clip')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('clip')).toHaveCount(2);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('clip')).toHaveCount(1);
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('clip')).toHaveCount(2);

  // mover el segundo clip 1 s a la derecha arrastrando (Mayús = sin rejilla)
  d = await doc(page);
  const right = [...d.clips].sort((x, y) => x.start - y.start)[1];
  const el = page.locator(`[data-clip-id="${right.id}"]`);
  const box = (await el.boundingBox())!;
  const { pps } = await ui(page);
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pps * 0.5, box.y + 40, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + pps * 1, box.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  d = await doc(page);
  const moved = d.clips.find((c) => c.id === right.id)!;
  expect(moved.start).toBeCloseTo(right.start + 1, 1);
  expect(moved.offset).toBeCloseTo(right.offset, 6);
  // el movimiento completo se deshace en un solo paso
  await page.keyboard.press('Control+z');
  expect((await doc(page)).clips.find((c) => c.id === right.id)!.start).toBeCloseTo(right.start, 6);
  await page.keyboard.press('Control+Shift+z');

  // recortar el final del primer clip 0,5 s arrastrando su borde derecho
  const left = [...(await doc(page)).clips].sort((x, y) => x.start - y.start)[0];
  const lb = (await page.locator(`[data-clip-id="${left.id}"]`).boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(lb.x + lb.width - 3, lb.y + 40);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width - 3 - pps * 0.5, lb.y + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const trimmed = (await doc(page)).clips.find((c) => c.id === left.id)!;
  expect(trimmed.duration).toBeCloseTo(left.duration - 0.5, 1);
  expect(trimmed.start).toBeCloseTo(left.start, 6);

  // duplicar (Ctrl+D) y eliminar (Supr)
  await page.locator(`[data-clip-id="${left.id}"]`).click({ position: { x: 30, y: 40 } });
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('clip')).toHaveCount(3);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('clip')).toHaveCount(2);

  // los atajos no se disparan mientras se escribe
  await page.getByTestId('project-name').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' s');
  await expect(page.getByTestId('clip')).toHaveCount(2);
  await expect(page.getByTestId('project-name')).toHaveValue(/ s$/);
});

test('pistas: crear, renombrar, solo, duplicar y eliminar', async ({ page }) => {
  await newProjectWithSine(page, 2);
  await page.getByTestId('add-track').click();
  expect((await doc(page)).tracks).toHaveLength(2);
  const name = page.getByTestId('track-name').nth(1);
  await name.dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Coros');
  await page.keyboard.press('Enter');
  expect((await doc(page)).tracks[1].name).toBe('Coros');
  // solo en la pista 2 → la 1 deja de ser audible
  await page.locator('[data-testid=track-header]').nth(1).getByRole('button', { name: 'Solo' }).click();
  expect((await doc(page)).tracks[1]).toMatchObject({ name: 'Coros' });
  await expect(page.getByTestId('lane').nth(0)).toHaveClass(/opacity-45/);
  // duplicar pista desde su menú
  await page.locator('[data-testid=track-header]').nth(0).getByRole('button', { name: 'Opciones de pista' }).click();
  await page.getByRole('menuitem', { name: 'Duplicar pista' }).click();
  const d = await doc(page);
  expect(d.tracks).toHaveLength(3);
  expect(d.clips).toHaveLength(2);
  // eliminar pista con clips pide confirmación
  await page.locator('[data-testid=track-header]').nth(1).getByRole('button', { name: 'Opciones de pista' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar pista' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  expect((await doc(page)).tracks).toHaveLength(2);
});
