# PROGRESS — SONORA STUDIO

Última actualización: 2026-11-19

| Fase | Estado |
| --- | --- |
| 1 — Aplicación base funcional | ✅ **Completada y verificada** (20/20 criterios de aceptación automatizados) |
| 2 — Edición y mezcla | ✅ **Completada y verificada** (E2E con análisis numérico del audio exportado) |
| 3 — Plataforma online | 🟡 Preparada (esquema SQL + RLS + interfaz de repositorio). **Bloqueada: requiere proyecto Supabase del usuario** |
| 4 — Producción avanzada | ⏳ Pendiente (corrección de tono planificada, no expuesta como funcional) |
| 5 — Producto comercial | 🟡 Modelo de planes/límites preparado (`src/config/plans.ts`, desactivado) |

## Fase 1 — tareas
- [x] Configuración (Vite 8, React 19, TS estricto, Tailwind 4, Zustand, Vitest, Playwright)
- [x] Modelo de datos y operaciones puras de edición (`docOps.ts`)
- [x] Motor de audio: contexto, canales, master, transporte, medición real
- [x] Importación (validación de tipo/tamaño, decodificación, errores comprensibles)
- [x] Ondas reales multirresolución, timeline virtualizado, zoom y desplazamiento
- [x] Transporte: reproducir, pausar, detener, inicio, bucle, metrónomo, reloj compás/tiempo
- [x] Volumen, panorama, mute, solo, bloqueo por pista
- [x] Grabación por AudioWorklet, selección de dispositivo, ganancia, medidor, saturación, latencia
- [x] Exportación WAV (16/24/32f, 44.1/48/96 kHz) renderizada offline con progreso real
- [x] Persistencia IndexedDB, autoguardado, recuperación tras recargar/cerrar
- [x] Pantalla de proyectos (crear, abrir, renombrar, duplicar, eliminar, miniatura, fecha)

## Fase 2 — tareas
- [x] Edición de clips: mover (también entre pistas), recortar, dividir, duplicar, eliminar, fundidos, ganancia
- [x] Deshacer/rehacer (historial de 200 pasos, gestos continuos agrupados)
- [x] Mezclador: faders en dB, pan, mute/solo, medidores estéreo reales, LED de clip, canal MASTER con FX
- [x] EQ paramétrico de 6 bandas con curva real, puntos arrastrables y analizador de espectro
- [x] Compresor (con curva de transferencia y medidor de reducción reales), reverb, delay (sync BPM), filtros, saturación, noise gate (AudioWorklet)
- [x] 7 presets de EQ vocal y 7 cadenas vocales (rap, trap, reguetón, limpia, radio, ambiental, ad-libs)
- [x] Biblioteca: archivos, instrumentales, grabaciones, pistas, efectos, presets, proyectos, sonidos
- [x] Atajos de teclado (desactivados al escribir), tooltips, tutorial opcional, confirmaciones
- [x] Vista simplificada en móvil, adaptación a tableta

## Pruebas (última ejecución)
- **Vitest**: 53 pruebas unitarias ✅ (WAV, picos, biquad, curva del compresor, saturación, docOps, historial, sincronización de clips, medición, alineación de grabación, IndexedDB)
- **Playwright** (Chromium real, micrófono simulado): 11 pruebas E2E ✅
  - `acceptance.spec.ts` — los 20 pasos de la sección 20, incluido el análisis del WAV exportado
    (tono de la instrumental a 0,500 ± 0,01; energía de la voz presente; con mute desaparece)
  - `phase2-editing.spec.ts` — dividir/mover/recortar/duplicar/eliminar + deshacer/rehacer; pistas
  - `phase2-effects.spec.ts` — EQ (medido vs. curva: error < 0,3 dB), compresor y makeup, reverb, delay, filtro, saturación, preset; pan, ganancia de clip, master, fundidos
  - `robustness.spec.ts` — permiso denegado, archivo inválido, bucle, noise gate, persistencia de efectos

## Defectos encontrados y corregidos durante la verificación
1. Q de pasa-altos/bajos interpretado en dB por Web Audio → conversión explícita (`qForNode`).
2. Tras grabar, el cabezal quedaba al final de la toma → vuelve al inicio para escucharla al instante.
3. Recortar un clip hacía "saltar" el borde al punto de agarre → recorte por desplazamiento relativo.
4. `DynamicsCompressorNode` añade hasta +23 dB de compensación oculta → modelada y anulada.
5. La saturación normalizada a fondo de escala amplificaba señales débiles +24 dB → curva con ganancia unidad a −12 dBFS.
6. Mezclador: el flexbox colapsaba nombre/color del canal; botones de efectos aparecían al pasar el ratón desplazando el contenido.

## Limitaciones conocidas
- La latencia depende del dispositivo; se compensa (automática + manual) pero no se elimina. Recomendado: auriculares.
- MP3 no disponible (requiere codificador con licencia compatible) — opción visible pero deshabilitada.
- Exportar rango / pistas separadas: fase posterior.
- Las pruebas E2E se ejecutan en Chromium; Safari/Firefox no se han probado automáticamente en este entorno.
- Los datos viven en el navegador (IndexedDB) hasta la Fase 3.
- El compresor usa `DynamicsCompressorNode` (detector y rodilla fijados por la especificación).

## Próximos pasos
1. **Decisión del usuario**: crear proyecto Supabase y facilitar URL + anon key → Fase 3.
2. Fase 4: corrección de afinación (YIN + TD-PSOLA en AudioWorklet), automatización de parámetros,
   exportación de stems/rango, MP3 (evaluar `@breezystack/lamejs` LGPL como módulo dinámico o WebCodecs).
3. Pruebas E2E en WebKit y Firefox con Playwright.
