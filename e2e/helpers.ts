import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/audio/export/wav';
import { makeSineWav } from './fixtures/makeFixture';

export type Doc = {
  bpm: number;
  tracks: { id: string; name: string; volume: number; pan: number; mute: boolean; effects: { id: string; type: string; params: Record<string, unknown> }[] }[];
  clips: { id: string; trackId: string; assetId: string; start: number; duration: number; offset: number; gain: number; recorded?: boolean }[];
};

export async function doc(page: Page): Promise<Doc> {
  return page.evaluate(() => (window as any).__sonora.project.getState().doc);
}

export async function newProjectWithSine(page: Page, seconds = 4) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('studio')).toBeVisible();
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('file-input').setInputFiles({ name: 'beat.wav', mimeType: 'audio/wav', buffer: makeSineWav(seconds) });
  await expect(page.getByTestId('clip')).toHaveCount(1);
}

export async function exportWav(page: Page, path: string) {
  await page.getByTestId('open-export').click();
  await page.getByRole('button', { name: '32 float' }).click();
  await page.getByRole('button', { name: '44.1 kHz' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await download.saveAs(path);
  await expect(page.getByTestId('export-done')).toBeVisible();
  await page.keyboard.press('Escape');
  return decodeWav(readFileSync(path).buffer as ArrayBuffer);
}
