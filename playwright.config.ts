import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    permissions: ['microphone'],
    launchOptions: {
      // nombres de archivo con tildes en las descargas (el contenedor no define locale UTF-8)
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    // proveedor de IA simulado (API compatible con Groq) para probar el asistente de letras
    { command: 'node e2e/fixtures/mockGroq.mjs', port: 5199, reuseExistingServer: true },
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { GROQ_API_KEY: 'test-key', GROQ_BASE_URL: 'http://localhost:5199/openai/v1', GEMINI_API_KEY: '', VITE_SUPABASE_URL: 'http://supabase.test', VITE_SUPABASE_ANON_KEY: 'anon-test-key' },
    },
  ],
});
