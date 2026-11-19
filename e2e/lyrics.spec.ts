/** Asistente de letras: editor, sílabas/rimas, IA vía servidor (clave nunca en el navegador), persistencia. */
import { test, expect } from '@playwright/test';

test('letras con IA: generar, insertar, rimas, mejorar, persistir', async ({ page, request }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.url()} ${JSON.stringify(r.headers())} ${r.postData() ?? ''}`));
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('tab-lyrics').click();
  await expect(page.getByTestId('lyrics-ai')).toContainText('Groq');

  // editor sin IA: sílabas y rimas
  const ed = page.getByTestId('lyrics-editor');
  await ed.fill('Miro al cielo\npisando el suelo');
  const meta = page.getByTestId('lyrics-line-meta');
  await expect(meta.nth(0)).toContainText('-elo');
  await expect(meta.nth(0)).toContainText('4'); // mi-ro_al-cie-lo (sinalefa)
  await expect(meta.nth(1)).toContainText('-elo');

  // estribillo con IA → añadir a la letra
  await page.getByTestId('lyrics-theme').fill('la ciudad de noche');
  await page.getByTestId('lyrics-ai-chorus').click();
  await expect(page.getByTestId('lyrics-ai-result')).toContainText('Brillan las luces');
  const sent = await (await request.get('http://localhost:5199/__last')).json();
  expect(sent.body.messages.at(-1).content).toContain('la ciudad de noche');
  expect(sent.body.messages.at(-1).content).toContain('pisando el suelo');
  await page.getByTestId('lyrics-ai-insert').click();
  await expect(ed).toHaveValue(/\[Estribillo\]\nBrillan las luces de la ciudad/);

  // deshacer quita la inserción
  await page.getByTestId('undo').click();
  await expect(ed).toHaveValue('Miro al cielo\npisando el suelo');
  await page.getByTestId('redo').click();

  // rimas para la palabra seleccionada
  await ed.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(5, 12); el.dispatchEvent(new Event('select', { bubbles: true })); });
  await page.getByTestId('lyrics-ai-rhymes').click();
  await expect(page.getByTestId('lyrics-ai-result')).toContainText('Consonantes');
  expect((await (await request.get('http://localhost:5199/__last')).json()).body.messages.at(-1).content).toContain('"cielo"');

  // mejorar selección → reemplazar
  await ed.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(0, 13); el.dispatchEvent(new Event('select', { bubbles: true })); });
  await page.getByTestId('lyrics-ai-improve').click();
  await page.getByTestId('lyrics-ai-replace').click();
  await expect(ed).toHaveValue(/^Versión mejorada de la línea\npisando el suelo/);

  // límite gratuito agotado → mensaje claro
  await page.getByTestId('lyrics-theme').fill('LIMITE');
  await page.getByTestId('lyrics-ai-verse').click();
  await expect(page.getByTestId('lyrics-ai-error')).toContainText('límite del plan gratuito');

  // persistencia
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await page.getByTestId('tab-lyrics').click();
  await expect(page.getByTestId('lyrics-editor')).toHaveValue(/Versión mejorada[\s\S]*\[Estribillo\]/);
  await expect(page.getByTestId('lyrics-theme')).toHaveValue('LIMITE');

  // la clave del proveedor nunca pasa por el navegador
  expect(seen.some((s) => s.includes('test-key'))).toBe(false);
  expect(seen.some((s) => s.includes('5199'))).toBe(false);
});
