# estudivo.com

Estación de trabajo de audio digital (DAW) en el navegador: importa una instrumental, graba tu
voz, edita las tomas, mezcla con EQ, compresión y efectos, y exporta tu canción en WAV.

> Nombre provisional anterior: SONORA STUDIO. El nombre es configurable con `VITE_APP_NAME` en `.env.local`.

## Requisitos
- Node.js ≥ 20 y npm
- Navegador recomendado: Chrome/Edge recientes (también Firefox y Safari 16.4+)
- Auriculares para grabar

## Ejecutar

```bash
npm install          # .npmrc usa legacy-peer-deps (peer opcional de Vitest)
npm run dev          # http://localhost:5173
npm run build        # comprobación de tipos + build de producción en dist/
npm run preview      # servir el build
```

## Pruebas

```bash
npm test             # Vitest — pruebas unitarias del motor, DSP, modelo y persistencia
npm run e2e          # Playwright — flujo completo en Chromium con micrófono simulado
```

Si Playwright no encuentra el navegador, instala uno con `npx playwright install chromium`.

## Uso rápido
1. **Nuevo proyecto** o **Probar con un beat de ejemplo** (instrumental sintetizada, libre de derechos).
2. Arrastra tu instrumental a la línea temporal (WAV, MP3, FLAC, OGG, M4A; máx. 200 MB).
3. Pulsa **●** (o `R`) para grabar; la toma aparece en la pista armada (o en una nueva).
4. Mezcla en el panel inferior: **Mezclador**, **Efectos** (presets vocales) y **Clip**.
5. **Exportar** → WAV 16/24/32-bit a 44,1/48/96 kHz.

Atajos: `Espacio` reproducir · `R` grabar · `S` dividir · `Ctrl+Z/Ctrl+Shift+Z` · `Ctrl+D` · `Supr` · `Ctrl+S` · `?` ayuda.

## Documentación
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — arquitectura, limitaciones del navegador, fases
- [PROGRESS.md](PROGRESS.md) — estado, pruebas, limitaciones y próximos pasos
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — capas y decisiones técnicas
- [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md) — puesta en marcha de Supabase (Fase 3)

## Privacidad
En esta versión todo se guarda localmente en tu navegador (IndexedDB). No se envía audio a ningún servidor.
