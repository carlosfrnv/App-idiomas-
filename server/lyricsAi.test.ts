import { describe, expect, it, vi } from 'vitest';
import { buildUserPrompt, generateLyrics, handleLyricsHttp, LyricsError, lyricsStatus, parseLyricsRequest, createRateLimiter, cleanOutput } from './lyricsAi';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const groqBody = (t: string) => ({ choices: [{ message: { content: t } }] });
const geminiBody = (t: string) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });

describe('validación', () => {
  it('rechaza modos desconocidos y recorta campos', () => {
    expect(() => parseLyricsRequest({ mode: 'hack' })).toThrow(LyricsError);
    const r = parseLyricsRequest({ mode: 'verse', theme: 'x'.repeat(1000), lines: 999, dialect: 'klingon' });
    expect(r.theme).toHaveLength(300);
    expect(r.lines).toBe(32);
    expect(r.dialect).toBe('neutro');
  });
  it('exige selección para rimas/mejorar y letra para continuar', () => {
    expect(() => parseLyricsRequest({ mode: 'rhymes' })).toThrow(/palabra/);
    expect(() => parseLyricsRequest({ mode: 'improve' })).toThrow(/fragmento/);
    expect(() => parseLyricsRequest({ mode: 'continue', lyrics: '  ' })).toThrow(/letra/);
  });
});

describe('prompts', () => {
  it('incluye contexto y la letra actual', () => {
    const p = buildUserPrompt(parseLyricsRequest({ mode: 'continue', genre: 'trap', mood: 'melancólico', theme: 'la ciudad de noche', lyrics: 'Línea uno\nLínea dos', bpm: 140, dialect: 'espana' }));
    expect(p).toContain('trap');
    expect(p).toContain('la ciudad de noche');
    expect(p).toContain('140 BPM');
    expect(p).toContain('Línea dos');
    expect(p).toContain('España');
  });
  it('limpia fences de markdown', () => {
    expect(cleanOutput('```\nhola\n```')).toBe('hola');
  });
});

describe('proveedores', () => {
  it('sin claves: 503 claro', async () => {
    await expect(generateLyrics({}, { mode: 'ideas' })).rejects.toMatchObject({ status: 503 });
    expect(lyricsStatus({})).toEqual({ configured: false, providers: [] });
  });
  it('Groq: endpoint compatible OpenAI con Bearer y la clave no aparece en la respuesta', async () => {
    const f = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok(groqBody('Verso nuevo')));
    const out = await generateLyrics({ GROQ_API_KEY: 'gsk_secret' }, { mode: 'verse', theme: 'mar' }, f as unknown as typeof fetch);
    expect(out).toEqual({ text: 'Verso nuevo', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer gsk_secret');
    expect(JSON.stringify(out)).not.toContain('gsk_secret');
  });
  it('Gemini: generateContent con x-goog-api-key y modelo configurable', async () => {
    const f = vi.fn(async () => ok(geminiBody('Estribillo')));
    const out = await generateLyrics({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-x' }, { mode: 'chorus' }, f as unknown as typeof fetch);
    expect(out.provider).toBe('gemini');
    const [url, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toContain('/models/gemini-x:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });
  it('si Groq agota el límite gratuito, usa Gemini como respaldo', async () => {
    const f = vi.fn(async (u: RequestInfo | URL) => (String(u).includes('groq') ? new Response('rate', { status: 429 }) : ok(geminiBody('Respaldo'))));
    const out = await generateLyrics({ GROQ_API_KEY: 'a', GEMINI_API_KEY: 'b' }, { mode: 'ideas' }, f as unknown as typeof fetch);
    expect(out).toMatchObject({ text: 'Respaldo', provider: 'gemini' });
  });
  it('errores comprensibles: límite, clave inválida, modelo retirado', async () => {
    for (const [status, re] of [[429, /límite/], [401, /clave/], [404, /GROQ_MODEL/]] as const) {
      const f = async () => new Response('x', { status });
      await expect(generateLyrics({ GROQ_API_KEY: 'a' }, { mode: 'ideas' }, f as unknown as typeof fetch)).rejects.toThrow(re);
    }
  });
});

describe('HTTP', () => {
  it('GET devuelve el estado, POST genera, límite por IP', async () => {
    const env = { GROQ_API_KEY: 'a' };
    const st = await handleLyricsHttp(new Request('http://x/api/lyrics'), env);
    expect(await st.json()).toEqual({ configured: true, providers: ['groq'] });
    const f = (async () => ok(groqBody('Hola'))) as unknown as typeof fetch;
    const limiter = createRateLimiter(1, 60_000);
    const post = () => new Request('http://x/api/lyrics', { method: 'POST', body: JSON.stringify({ mode: 'ideas' }) });
    const r1 = await handleLyricsHttp(post(), env, { limiter, clientKey: 'ip', fetchImpl: f });
    expect(r1.status).toBe(200);
    const r2 = await handleLyricsHttp(post(), env, { limiter, clientKey: 'ip', fetchImpl: f });
    expect(r2.status).toBe(429);
    const bad = await handleLyricsHttp(new Request('http://x/api/lyrics', { method: 'POST', body: '{' }), env, { fetchImpl: f });
    expect(bad.status).toBe(400);
  });
});
