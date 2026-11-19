# SONORA STUDIO — Plan de implementación

DAW (estación de trabajo de audio digital) en el navegador: grabar, editar, mezclar y exportar.
El nombre del producto es configurable con `VITE_APP_NAME` (ver `src/config/app.ts`).

## 1. Estado inicial del entorno

- Repositorio vacío (sin commits previos): no hay código que conservar.
- Node 22, npm 10, Chromium + Playwright 1.63 disponibles para pruebas E2E reales
  (incluido micrófono falso de Chromium para automatizar la grabación).

## 2. Decisiones de arquitectura

| Área | Elección | Motivo |
| --- | --- | --- |
| Build | **Vite 8** | SPA pura: el DAW es 100 % cliente (audio en el navegador). Next.js aporta SSR/rutas de servidor que aquí no se usan y complica AudioWorklet. El backend será Supabase (fase 3). |
| UI | **React 19 + TypeScript estricto** | Ecosistema, tipado de un modelo de datos complejo. |
| Estilos | **Tailwind CSS 4** con tokens de diseño en `@theme` | Paleta definida una vez (`src/styles/index.css`). |
| Estado | **Zustand** | Store fuera de React: el motor de audio se suscribe sin re-render. |
| Iconos | `lucide-react` (ISC) | Licencia permisiva, iconos originales (no propietarios de otros DAW). |
| Fuentes | Inter / JetBrains Mono (OFL) | Autoalojadas con `@fontsource`. |
| Persistencia local | **IndexedDB** (wrapper propio, sin dependencias) | Guarda **los Blobs de audio reales**, no `blob:` URLs. |
| Audio | **Web Audio API**, **AudioWorklet** (grabación, medición), **OfflineAudioContext** (exportación) | Nativo, sin licencias. |
| Pruebas | **Vitest** (unidad) + **Playwright** (E2E en Chromium real con micrófono falso) | |

### 2.1 Separación motor / UI

```
React (componentes)  ──acciones──▶  Zustand projectStore (documento + undo/redo)
        ▲                                   │ subscribe
        │ rAF (cabezal, medidores)          ▼
        └──────────── AudioEngine ◀── reconcilia grafo (pistas, efectos, mezcla)
                         │
                AudioContext / OfflineAudioContext (mismo código de grafo)
```

- El **documento del proyecto** (`ProjectDoc`) es la única fuente de verdad: pistas, clips (en
  segundos), efectos, BPM, compás, bucle. Es JSON serializable.
- El **AudioEngine** no depende de React. Se suscribe al store y reconcilia el grafo
  (`TrackChannel` por pista: entrada → cadena FX → volumen → pan → medidor → master).
- **Mismo constructor de grafo** para tiempo real y para exportación offline
  (`buildTrackChain` sobre `BaseAudioContext`): lo que se oye es lo que se exporta.
- React nunca toca muestras. Cabezal y medidores se pintan con `requestAnimationFrame`
  leyendo el motor directamente (refs/canvas), sin pasar por el estado de React.
- Los medidores leen `AnalyserNode` reales (pico + RMS sobre la señal post-fader).

### 2.2 Modelo temporal

- Posiciones de clips en **segundos** (independientes del BPM); la rejilla de compases se
  deriva de BPM y compás para mostrar y para el *snap*.
- Clip = `{ assetId, start, offset, duration, gain }`. La posición en píxeles es
  `(start - scrollTime) * pxPerSecond`, misma función para ondas, clips y cabezal → sin
  desincronización con zoom/scroll.
- Timeline virtualizado: sólo se dibuja la porción visible de cada clip (canvas del tamaño
  de la vista), evitando el límite de ancho de canvas en canciones largas.

### 2.3 Grabación

- `getUserMedia` con `echoCancellation/noiseSuppression/autoGainControl` desactivados
  (voz limpia para producción), selección de dispositivo, ganancia de entrada software.
- `AudioWorklet` captura bloques Float32 y reporta el `currentFrame` exacto del inicio →
  posición en la canción calculada con precisión de muestra.
- **Compensación de latencia**: `outputLatency + baseLatency + latencia de entrada` del
  navegador + **offset manual de calibración** (ms) configurable. No se promete latencia cero.
- Cada toma se guarda como WAV (float32) en IndexedDB y se convierte en clip editable.

### 2.4 Exportación

- `OfflineAudioContext` reconstruye el grafo completo (efectos, volumen, pan, mute/solo).
- Progreso real con `suspend()` incremental del contexto offline.
- Codificador WAV propio (16/24-bit PCM, 32-bit float). MP3: pendiente (ver §5).

## 3. Limitaciones reales del navegador

- **Latencia**: depende de SO/driver/navegador. Se compensa, no se elimina. Se recomiendan auriculares.
- **Autoplay**: el `AudioContext` sólo arranca tras un gesto del usuario (se reanuda en el primer clic/tecla).
- **Safari / iOS**: requiere gesto para audio; `navigator.audioSession` se pone en
  `play-and-record` al grabar (Safari ≥ 16.4); IndexedDB puede ser purgado por ITP si el
  sitio no se usa en 7 días → se pide `navigator.storage.persist()`.
- **Firefox**: no admite conectar un `MediaStream` con frecuencia distinta a la del contexto;
  se detecta y se informa.
- **Memoria**: los `AudioBuffer` decodificados viven en RAM (≈ 23 MB por 1 min estéreo 48 kHz float).
- **MP3**: los navegadores no exponen codificador MP3 nativo.

## 4. Fases

- **Fase 1 — base funcional**: UI oscura profesional, editor multipista, importación, ondas,
  reproducción sincronizada, transporte, volumen/mute/solo, grabación, exportación WAV,
  guardado/recuperación local. Criterios de aceptación automatizados en `e2e/acceptance.spec.ts`.
- **Fase 2 — edición y mezcla**: edición avanzada de clips, undo/redo, mezclador completo,
  EQ paramétrico con gráfico real, compresor, reverb, delay, filtros, saturación, noise gate, presets.
- **Fase 3 — plataforma online**: Supabase (Auth + Postgres + Storage con RLS). Interfaz
  `ProjectRepository` ya abstraída; esquema SQL en `supabase/migrations`.
- **Fase 4 — producción avanzada**: corrección de afinación (detección F0 YIN/pYIN +
  PSOLA/phase-vocoder en AudioWorklet/WASM), automatización, MP3, stems.
- **Fase 5 — comercial**: planes, límites (`src/config/plans.ts`), admin, métricas, despliegue.

## 5. Corrección de tono (Fase 4) — evaluación

No se simula. Requiere:
1. Detección de F0 robusta (YIN / pYIN / MPM) por ventanas.
2. Cuantización a la escala elegida con *retune speed* (suavizado) e intensidad.
3. Desplazamiento de tono **preservando formantes** y sin artefactos: TD-PSOLA (voz
   monofónica, baja latencia) o phase vocoder con bloqueo de fase.

Opciones evaluadas: implementación propia TD-PSOLA + YIN en AudioWorklet (sin licencias,
preferida); Rubber Band (GPL/comercial — incompatible salvo licencia comercial);
SoundTouch (LGPL — posible vía WASM como módulo dinámico separado). El módulo se expondrá
como un efecto más (`type: 'pitchCorrection'`) en la cadena; la UI lo muestra como
"En desarrollo" y no es seleccionable hasta que funcione.

## 6. Tareas (verificables)

Ver `PROGRESS.md` para el estado de cada tarea.
