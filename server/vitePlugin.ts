import type { Plugin, Connect } from 'vite';
import { loadEnv } from 'vite';
import { createRateLimiter, handleLyricsHttp, type LyricsEnv } from './lyricsAi';

/**
 * Monta /api/lyrics en `vite dev` y `vite preview`. Lee las claves con loadEnv(prefix '') en
 * Node: NO se exponen al cliente (Vite sólo inyecta variables VITE_*).
 */
export function lyricsApiPlugin(): Plugin {
  let env: LyricsEnv = {};
  const limiter = createRateLimiter();
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/lyrics')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    const response = await handleLyricsHttp(request, env, { limiter, clientKey: req.socket.remoteAddress ?? 'local' });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  };
  return {
    name: 'estudivo-lyrics-api',
    configResolved(config) {
      const all = { ...loadEnv(config.mode, config.envDir || process.cwd(), ''), ...process.env };
      env = {
        GROQ_API_KEY: all.GROQ_API_KEY, GROQ_MODEL: all.GROQ_MODEL, GROQ_BASE_URL: all.GROQ_BASE_URL,
        GEMINI_API_KEY: all.GEMINI_API_KEY, GEMINI_MODEL: all.GEMINI_MODEL, GEMINI_BASE_URL: all.GEMINI_BASE_URL,
        LYRICS_PROVIDER: all.LYRICS_PROVIDER,
      };
    },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
