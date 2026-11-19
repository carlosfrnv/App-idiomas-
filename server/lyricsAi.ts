/**
 * Asistente de letras con IA (Groq o Google Gemini, planes gratuitos).
 * Se ejecuta SIEMPRE en el servidor: las claves (GROQ_API_KEY / GEMINI_API_KEY) nunca
 * llegan al navegador. Sin dependencias: sólo fetch estándar.
 */

export type LyricsMode = 'verse' | 'chorus' | 'continue' | 'rhymes' | 'improve' | 'ideas';
export type Dialect = 'neutro' | 'espana' | 'latino';

export interface LyricsRequest {
  mode: LyricsMode;
  theme?: string;
  genre?: string;
  mood?: string;
  dialect?: Dialect;
  lines?: number;
  /** Letra actual del proyecto (contexto). */
  lyrics?: string;
  /** Fragmento seleccionado (mejorar) o palabra (rimas). */
  selection?: string;
  bpm?: number;
}

export interface LyricsResult { text: string; provider: 'groq' | 'gemini'; model: string }

export interface LyricsEnv {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_BASE_URL?: string;
  /** 'groq' | 'gemini' — proveedor preferido si ambos están configurados. */
  LYRICS_PROVIDER?: string;
}

export const DEFAULTS = {
  groqModel: 'llama-3.3-70b-versatile',
  groqBase: 'https://api.groq.com/openai/v1',
  geminiModel: 'gemini-2.5-flash',
  geminiBase: 'https://generativelanguage.googleapis.com/v1beta',
};

export const LIMITS = { theme: 300, field: 60, lyrics: 6000, selection: 1500, maxLines: 32 };
const MODES: LyricsMode[] = ['verse', 'chorus', 'continue', 'rhymes', 'improve', 'ideas'];

export class LyricsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n).trim() : undefined);

/** Valida y normaliza la entrada (todo lo que llega del navegador es no confiable). */
export function parseLyricsRequest(body: unknown): LyricsRequest {
  if (!body || typeof body !== 'object') throw new LyricsError(400, 'Petición no válida.');
  const b = body as Record<string, unknown>;
  if (!MODES.includes(b.mode as LyricsMode)) throw new LyricsError(400, 'Modo no válido.');
  const req: LyricsRequest = {
    mode: b.mode as LyricsMode,
    theme: clip(b.theme, LIMITS.theme),
    genre: clip(b.genre, LIMITS.field),
    mood: clip(b.mood, LIMITS.field),
    dialect: (['neutro', 'espana', 'latino'] as const).includes(b.dialect as Dialect) ? (b.dialect as Dialect) : 'neutro',
    lines: typeof b.lines === 'number' && isFinite(b.lines) ? Math.max(2, Math.min(LIMITS.maxLines, Math.round(b.lines))) : undefined,
    lyrics: typeof b.lyrics === 'string' ? b.lyrics.slice(-LIMITS.lyrics) : undefined,
    selection: clip(b.selection, LIMITS.selection),
    bpm: typeof b.bpm === 'number' && b.bpm > 20 && b.bpm < 400 ? Math.round(b.bpm) : undefined,
  };
  if ((req.mode === 'rhymes' || req.mode === 'improve') && !req.selection) {
    throw new LyricsError(400, req.mode === 'rhymes' ? 'Escribe o selecciona una palabra para buscar rimas.' : 'Selecciona el fragmento que quieres mejorar.');
  }
  if (req.mode === 'continue' && !req.lyrics?.trim()) throw new LyricsError(400, 'Escribe algo de letra para poder continuarla.');
  return req;
}

const DIALECT: Record<Dialect, string> = {
  neutro: 'español neutro, entendible en cualquier país',
  espana: 'español de España (puedes usar expresiones coloquiales españolas)',
  latino: 'español latinoamericano/caribeño (puedes usar expresiones urbanas latinas)',
};

export const SYSTEM_PROMPT = [
  'Eres un letrista profesional de música urbana y pop en español (rap, trap, reguetón, R&B, pop).',
  'Escribes letras ORIGINALES: nunca copies ni parafrasees letras existentes de otros artistas.',
  'Cuidas la métrica para que se pueda cantar o rapear sobre el beat, las rimas (consonantes y asonantes, internas cuando encaje), las imágenes concretas y un gancho memorable.',
  'Evita clichés vacíos y relleno. No uses lenguaje de odio ni contenido sexual explícito.',
  'Responde SOLO con lo que se pide, en texto plano, sin explicaciones, sin títulos de sección salvo que se pidan, sin comillas ni markdown.',
].join(' ');

/** Construye las instrucciones del usuario según el modo. */
export function buildUserPrompt(r: LyricsRequest): string {
  const ctx: string[] = [];
  if (r.genre) ctx.push(`Género: ${r.genre}.`);
  if (r.mood) ctx.push(`Estado de ánimo: ${r.mood}.`);
  if (r.theme) ctx.push(`Tema: ${r.theme}.`);
  if (r.bpm) ctx.push(`Tempo del beat: ${r.bpm} BPM.`);
  ctx.push(`Idioma: ${DIALECT[r.dialect ?? 'neutro']}.`);
  const current = r.lyrics?.trim() ? `\n\nLetra actual de la canción (contexto):\n"""\n${r.lyrics.trim()}\n"""` : '';
  const n = r.lines;
  switch (r.mode) {
    case 'verse':
      return `${ctx.join(' ')}\nEscribe un verso de ${n ?? 16} líneas, con flow constante y rimas al final de cada par de líneas.${current}`;
    case 'chorus':
      return `${ctx.join(' ')}\nEscribe un estribillo pegadizo de ${n ?? 8} líneas, fácil de recordar y de cantar, con una frase gancho que se repita.${current}`;
    case 'continue':
      return `${ctx.join(' ')}\nContinúa la letra donde se quedó con ${n ?? 8} líneas nuevas, manteniendo el mismo tema, voz, métrica aproximada y esquema de rima. No repitas las líneas existentes.${current}`;
    case 'improve':
      return `${ctx.join(' ')}\nReescribe este fragmento manteniendo su sentido y número de líneas aproximado, mejorando las rimas, la métrica y las imágenes:\n"""\n${r.selection}\n"""${current}`;
    case 'rhymes':
      return `Da rimas en español para la palabra "${r.selection}". Formato exacto, sin nada más:\nConsonantes: palabra, palabra, ...\nAsonantes: palabra, palabra, ...\nFrases que riman: frase corta; frase corta; frase corta\nIncluye 8-12 palabras por grupo, ordenadas de más a menos útiles para ${r.genre ?? 'música urbana'}.`;
    case 'ideas':
      return `${ctx.join(' ')}\nPropón 5 ideas de canción. Para cada una, una línea con este formato: Título — concepto en una frase — posible frase gancho.${current}`;
  }
}

/** Limpia la respuesta del modelo (fences, comillas sueltas, espacios). */
export function cleanOutput(s: string): string {
  return s.replace(/^```[a-z]*\n?|```$/gim, '').replace(/^\s*"""|"""\s*$/g, '').trim();
}

type FetchFn = typeof fetch;

async function callGroq(env: LyricsEnv, r: LyricsRequest, f: FetchFn, signal?: AbortSignal): Promise<LyricsResult> {
  const model = env.GROQ_MODEL || DEFAULTS.groqModel;
  const res = await f(`${(env.GROQ_BASE_URL || DEFAULTS.groqBase).replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: r.mode === 'rhymes' ? 0.5 : 0.9,
      max_tokens: 900,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(r) }],
    }),
    signal,
  });
  if (!res.ok) throw await providerError('Groq', res);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new LyricsError(502, 'Groq devolvió una respuesta vacía.');
  return { text: cleanOutput(text), provider: 'groq', model };
}

async function callGemini(env: LyricsEnv, r: LyricsRequest, f: FetchFn, signal?: AbortSignal): Promise<LyricsResult> {
  const model = env.GEMINI_MODEL || DEFAULTS.geminiModel;
  const res = await f(`${(env.GEMINI_BASE_URL || DEFAULTS.geminiBase).replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(r) }] }],
      generationConfig: { temperature: r.mode === 'rhymes' ? 0.5 : 0.9, maxOutputTokens: 1200 },
    }),
    signal,
  });
  if (!res.ok) throw await providerError('Gemini', res);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const c = data.candidates?.[0];
  const text = c?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new LyricsError(502, c?.finishReason === 'SAFETY' ? 'Gemini bloqueó la respuesta por sus filtros de seguridad. Prueba con otro tema.' : 'Gemini devolvió una respuesta vacía.');
  return { text: cleanOutput(text), provider: 'gemini', model };
}

async function providerError(name: string, res: Response): Promise<LyricsError> {
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* noop */ }
  if (res.status === 429) return new LyricsError(429, `${name}: se ha alcanzado el límite del plan gratuito. Espera un minuto y vuelve a intentarlo.`);
  if (res.status === 401 || res.status === 403) return new LyricsError(502, `${name}: la clave de API no es válida o no tiene permisos.`);
  if (res.status === 404) return new LyricsError(502, `${name}: el modelo configurado no existe o se ha retirado. Cambia ${name === 'Groq' ? 'GROQ_MODEL' : 'GEMINI_MODEL'}.`);
  console.warn(`[lyrics] ${name} ${res.status}: ${detail}`);
  return new LyricsError(502, `${name} no respondió correctamente (${res.status}).`);
}

export function configuredProviders(env: LyricsEnv): ('groq' | 'gemini')[] {
  const list: ('groq' | 'gemini')[] = [];
  if (env.GROQ_API_KEY) list.push('groq');
  if (env.GEMINI_API_KEY) list.push('gemini');
  if (env.LYRICS_PROVIDER === 'gemini') list.sort((a) => (a === 'gemini' ? -1 : 1));
  return list;
}

export function lyricsStatus(env: LyricsEnv) {
  const providers = configuredProviders(env);
  return { configured: providers.length > 0, providers };
}

/** Genera texto con el proveedor preferido; si falla (límite, caída), prueba el otro. */
export async function generateLyrics(env: LyricsEnv, r: LyricsRequest, f: FetchFn = fetch, signal?: AbortSignal): Promise<LyricsResult> {
  const providers = configuredProviders(env);
  if (!providers.length) throw new LyricsError(503, 'La IA no está configurada en el servidor (falta GROQ_API_KEY o GEMINI_API_KEY).');
  let last: unknown;
  for (const p of providers) {
    try {
      return p === 'groq' ? await callGroq(env, r, f, signal) : await callGemini(env, r, f, signal);
    } catch (e) {
      last = e;
      if (signal?.aborted) break;
    }
  }
  if (last instanceof LyricsError) throw last;
  throw new LyricsError(502, 'No se pudo contactar con el servicio de IA.');
}

/** Limitador sencillo en memoria (por IP) para no agotar la cuota gratuita. */
export function createRateLimiter(max = 12, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

/** Manejador HTTP con la firma estándar Request → Response (dev server y despliegue). */
export async function handleLyricsHttp(request: Request, env: LyricsEnv, opts: { limiter?: (k: string) => boolean; clientKey?: string; fetchImpl?: FetchFn } = {}): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (request.method === 'GET') return json(200, lyricsStatus(env));
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  if (opts.limiter && !opts.limiter(opts.clientKey ?? 'anon')) return json(429, { error: 'Demasiadas peticiones seguidas. Espera un minuto.' });
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > 32_000) return json(413, { error: 'Petición demasiado grande.' });
  try {
    const body = await request.json().catch(() => { throw new LyricsError(400, 'JSON no válido.'); });
    const r = parseLyricsRequest(body);
    const out = await generateLyrics(env, r, opts.fetchImpl ?? fetch, AbortSignal.timeout(45_000));
    return json(200, out);
  } catch (e) {
    if (e instanceof LyricsError) return json(e.status, { error: e.message });
    console.error('[lyrics]', e);
    return json(500, { error: 'Error interno del asistente de letras.' });
  }
}
