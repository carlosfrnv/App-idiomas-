/** Cliente del asistente de letras. Habla sólo con NUESTRO servidor (/api/lyrics), nunca con el proveedor. */
import type { LyricsMode } from '../../server/lyricsAi';
import type { LyricsDoc } from '@/types/project';

export type { LyricsMode };

export interface AiStatus { configured: boolean; providers: string[] }
export interface AiResult { text: string; provider: string; model: string }

export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const r = await fetch('/api/lyrics', { headers: { accept: 'application/json' } });
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null;
    return (await r.json()) as AiStatus;
  } catch {
    return null;
  }
}

export async function requestLyrics(
  mode: LyricsMode,
  lyrics: LyricsDoc,
  extra: { selection?: string; lines?: number; bpm?: number },
  signal?: AbortSignal,
): Promise<AiResult> {
  let r: Response;
  try {
    r = await fetch('/api/lyrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, theme: lyrics.theme, genre: lyrics.genre, mood: lyrics.mood, dialect: lyrics.dialect, lyrics: lyrics.text, ...extra }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Sin conexión con el servidor del asistente.');
  }
  const data = (await r.json().catch(() => ({}))) as Partial<AiResult> & { error?: string };
  if (!r.ok || !data.text) throw new Error(data.error ?? `Error ${r.status} del asistente.`);
  return data as AiResult;
}
