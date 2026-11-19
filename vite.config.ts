import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { lyricsApiPlugin } from './server/vitePlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), lyricsApiPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
