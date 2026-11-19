# PROGRESS — SONORA STUDIO

Última actualización: 2026-11-19

| Fase | Estado |
| --- | --- |
| 1 — Aplicación base funcional | ✅ **Completada y verificada** (20/20 criterios de aceptación automatizados) |
| 2 — Edición y mezcla | ✅ **Completada y verificada** (E2E con análisis numérico del audio exportado) |
| 3 — Plataforma online | ✅ Implementada y probada con Supabase simulado (registro, sync, otro dispositivo, RLS). Pendiente: verificación con proyecto real del usuario |
| 4 — Producción avanzada | ✅ Corrección de tono real (YIN + TD-PSOLA), automatización volumen/pan, MP3, stems, exportar región |
| Extra — Asistente de letras IA | ✅ Completado (Groq/Gemini vía servidor, sílabas y rimas offline). Requiere claves gratuitas del usuario para generar texto |
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
- **Vitest**: 101 pruebas unitarias ✅ (última ejecución; ver más abajo el detalle histórico)
- **Playwright**: 18 pruebas E2E ✅ (aceptación, edición, efectos, robustez, letras IA, exportación, automatización, afinación, nube)
- Detalle inicial — **Vitest**: 53 pruebas unitarias ✅ (WAV, picos, biquad, curva del compresor, saturación, docOps, historial, sincronización de clips, medición, alineación de grabación, IndexedDB)
- **Playwright** (Chromium real, micrófono simulado): 11 pruebas E2E ✅
  - `acceptance.spec.ts` — los 20 pasos de la sección 20, incluido el análisis del WAV exportado
    (tono de la instrumental a 0,500 ± 0,01; energía de la voz presente; con mute desaparece)
  - `phase2-editing.spec.ts` — dividir/mover/recortar/duplicar/eliminar + deshacer/rehacer; pistas
  - `phase2-effects.spec.ts` — EQ (medido vs. curva: error < 0,3 dB), compresor y makeup, reverb, delay, filtro, saturación, preset; pan, ganancia de clip, master, fundidos
  - `robustness.spec.ts` — permiso denegado, archivo inválido, bucle, noise gate, persistencia de efectos

## Fase 4 — producción avanzada
- [x] Corrección de tono: YIN (F0), escala con intensidad y velocidad, TD-PSOLA (conserva formantes y duración),
      natural/robótico, 6 escalas, detección de tonalidad, gráfico, Web Worker, no destructivo (restaurar/deshacer).
      60 s de voz estéreo en ~0,8 s. Pendiente: monitorización en tiempo real mientras se graba.
- [x] Automatización de volumen y panorama dibujable por pista (tiempo real, bucles y exportación). Pendiente: automatizar parámetros de efectos.
- [x] Exportación MP3 128–320 kbps (LAME/LGPL, módulo aparte), región del bucle, stems por pista en ZIP.
- Pruebas: algoritmo de afinación (450 Hz → 440 Hz), E2E de afinación, automatización y exportaciones analizando el audio.

## Fase 3 — cuentas y nube
- [x] Supabase Auth (registro, login, recuperar/cambiar contraseña, perfil), repositorio híbrido local+nube, migración de proyectos locales.
- [x] E2E contra Supabase simulado (Auth + PostgREST + Storage con RLS): registro, subida, otro dispositivo, aislamiento entre usuarios.
- Pendiente: probar con un proyecto real (ver docs/PHASE3_SETUP.md).

## Asistente de letras (añadido)
- [x] Editor de letra guardado en el proyecto (deshacer/rehacer, autoguardado), etiquetas de sección
- [x] Sílabas por línea con sinalefa y rimas consonantes/asonantes coloreadas (sin IA, `src/lib/spanishMeter.ts`)
- [x] IA: verso, estribillo, continuar, mejorar selección, rimas, ideas; género, ánimo y variante de español
- [x] Servidor `/api/lyrics` (Groq compatible OpenAI + Gemini `generateContent`), respaldo automático entre proveedores,
      validación y límites de tamaño, limitador por IP, errores comprensibles (límite gratuito, clave, modelo retirado)
- [x] Pruebas: 27 unitarias (servidor + métrica) y E2E completo contra un proveedor simulado; se verifica que la clave nunca pasa por el navegador
- Pendiente de verificación con claves reales (no disponibles en este entorno; los nombres de modelo por defecto son configurables)

## Defectos encontrados y corregidos durante la verificación
1. Q de pasa-altos/bajos interpretado en dB por Web Audio → conversión explícita (`qForNode`).
2. Tras grabar, el cabezal quedaba al final de la toma → vuelve al inicio para escucharla al instante.
3. Recortar un clip hacía "saltar" el borde al punto de agarre → recorte por desplazamiento relativo.
4. `DynamicsCompressorNode` añade hasta +23 dB de compensación oculta → modelada y anulada.
5. La saturación normalizada a fondo de escala amplificaba señales débiles +24 dB → curva con ganancia unidad a −12 dBFS.
6. Mezclador: el flexbox colapsaba nombre/color del canal; botones de efectos aparecían al pasar el ratón desplazando el contenido.

## Limitaciones conocidas
- La latencia depende del dispositivo; se compensa (automática + manual) pero no se elimina. Recomendado: auriculares.
- MP3 usa LAME (LGPL-3.0) como módulo independiente: ver THIRD_PARTY_NOTICES.md.
- Las pruebas E2E se ejecutan en Chromium; Safari/Firefox no se han probado automáticamente en este entorno.
- Sin variables de Supabase la app es 100 % local (IndexedDB).
- El compresor usa `DynamicsCompressorNode` (detector y rodilla fijados por la especificación).

## Próximos pasos
1. **Decisión del usuario**: crear proyecto Supabase y facilitar URL + anon key → Fase 3.
2. Fase 4: corrección de afinación (YIN + TD-PSOLA en AudioWorklet), automatización de parámetros,
   exportación de stems/rango, MP3 (evaluar `@breezystack/lamejs` LGPL como módulo dinámico o WebCodecs).
3. Pruebas E2E en WebKit y Firefox con Playwright.
