/** Cuentas y nube contra un Supabase simulado: registro, sincronización y otro dispositivo. */
import { test, expect } from '@playwright/test';
import { createFakeDb, installFakeSupabase } from './fixtures/fakeSupabase';
import { makeSineWav } from './fixtures/makeFixture';

test('registro → proyecto en la nube → abrirlo en otro dispositivo → cerrar sesión', async ({ browser }) => {
  const db = createFakeDb();
  const errors: string[] = [];

  // --- dispositivo 1
  const ctx1 = await browser.newContext();
  await installFakeSupabase(ctx1, db);
  const p1 = await ctx1.newPage();
  p1.on('pageerror', (e) => errors.push(e.message));
  await p1.goto('/');
  await p1.getByTestId('login-button').click();
  await p1.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await p1.getByLabel('Nombre').fill('Lúa');
  await p1.getByLabel('Correo').fill('lua@example.com');
  await p1.getByLabel('Contraseña').fill('contraseña-segura');
  await p1.getByTestId('auth-form').getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(p1.getByText('Lúa · en la nube')).toBeVisible();

  await p1.getByTestId('new-project').click();
  await p1.getByTestId('tutorial-skip').click();
  await p1.getByTestId('project-name').fill('Tema en la nube');
  await p1.getByTestId('project-name').press('Enter');
  await p1.getByTestId('file-input').setInputFiles({ name: 'beat.wav', mimeType: 'audio/wav', buffer: makeSineWav(2) });
  await expect(p1.getByTestId('clip')).toHaveCount(1);
  await p1.keyboard.press('Control+s');
  await expect(p1.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await expect.poll(() => db.tables.projects.find((p) => p.name === 'Tema en la nube')?.owner_id).toBe('user-1');
  await expect.poll(() => db.objects.size).toBe(1);
  expect([...db.objects.keys()][0]).toMatch(/^user-1\/ast_.*\.wav$/);
  expect(db.tables.assets).toHaveLength(1);
  expect(db.tables.project_assets).toHaveLength(1);
  await expect(p1.getByTestId('profile-button')).toHaveText('L');

  // --- dispositivo 2: navegador limpio (sin IndexedDB ni sesión)
  const ctx2 = await browser.newContext();
  await installFakeSupabase(ctx2, db);
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto('/');
  await expect(p2.getByText('Aún no tienes proyectos')).toBeVisible();
  await p2.getByTestId('login-button').click();
  await p2.getByLabel('Correo').fill('lua@example.com');
  await p2.getByLabel('Contraseña').fill('mala');
  await p2.getByTestId('auth-form').getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(p2.getByText('Correo o contraseña incorrectos.')).toBeVisible();
  await p2.getByLabel('Contraseña').fill('contraseña-segura');
  await p2.getByTestId('auth-form').getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(p2.getByTestId('project-card')).toHaveCount(1);
  await p2.getByRole('button', { name: 'Abrir Tema en la nube' }).click();
  await expect(p2.getByTestId('clip')).toHaveCount(1);
  const assetId = db.tables.assets[0].id as string;
  await expect.poll(() => p2.evaluate((id) => !!(window as any).__sonora.engine.getBuffer(id), assetId)).toBe(true);

  // --- otro usuario no ve nada (RLS)
  const ctx3 = await browser.newContext();
  await installFakeSupabase(ctx3, db);
  const p3 = await ctx3.newPage();
  await p3.goto('/');
  await p3.getByTestId('login-button').click();
  await p3.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await p3.getByLabel('Correo').fill('otra@example.com');
  await p3.getByLabel('Contraseña').fill('otra-contraseña');
  await p3.getByTestId('auth-form').getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(p3.getByText('· en la nube')).toBeVisible();
  await expect(p3.getByTestId('project-card')).toHaveCount(0);

  // --- cerrar sesión en el dispositivo 1
  await p1.getByTestId('profile-button').click();
  await p1.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await p1.getByTestId('back-projects').click();
  await expect(p1.getByTestId('login-button')).toBeVisible();

  expect(db.unhandled).toEqual([]);
  expect(errors).toEqual([]);
  await Promise.all([ctx1.close(), ctx2.close(), ctx3.close()]);
});
