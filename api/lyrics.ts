/**
 * Función de servidor para despliegue (p. ej. Vercel: carpeta /api, firma web estándar).
 * Variables de entorno del servidor: GROQ_API_KEY y/o GEMINI_API_KEY (+ opcionales *_MODEL).
 */
import { createRateLimiter, handleLyricsHttp, type LyricsEnv } from '../server/lyricsAi';

const limiter = createRateLimiter();
const env = (): LyricsEnv => process.env as LyricsEnv;
const key = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';

export function GET(request: Request) {
  return handleLyricsHttp(request, env());
}

export function POST(request: Request) {
  return handleLyricsHttp(request, env(), { limiter, clientKey: key(request) });
}
