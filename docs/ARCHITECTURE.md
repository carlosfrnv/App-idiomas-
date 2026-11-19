# Arquitectura de SONORA STUDIO

## Capas

```
src/
├─ config/        Marca (APP_NAME), límites de importación, planes (Fase 5)
├─ types/         Modelo de datos (ProjectDoc, Clip, Track, EffectSlot…)
├─ lib/           Utilidades puras (dB, tiempo musical, formato, rAF compartido)
├─ audio/         MOTOR — sin React
│  ├─ engine/     AudioEngine (contexto, transporte, sync), TrackChannel, MasterBus,
│  │              FxChain, scheduleClips (compartido tiempo real/offline), medidores
│  ├─ fx/         Procesadores DSP, biquad (RBJ), curva del compresor, presets
│  ├─ worklets/   AudioWorklet: grabadora y noise gate
│  ├─ recording/  Recorder (getUserMedia → worklet), alineación por latencia
│  ├─ export/     renderMix (OfflineAudioContext), codificador WAV
│  ├─ waveform/   Picos multirresolución
│  └─ demo/       Instrumentales sintetizadas (libres de derechos)
├─ state/         Zustand: projectStore (doc + undo/redo), ui, transport, assets, ajustes
│                 docOps.ts: TODAS las ediciones como funciones puras
├─ persistence/   ProjectRepository (interfaz) + LocalRepository (IndexedDB)
├─ app/           Servicios: proyectos, assets, transporte, grabación, edición, exportación
├─ features/      UI por dominio: editor, transport, topbar, library, mixer, fx, export…
├─ components/ui/ Primitivas: Button, Knob, Fader, Meter, Modal, Menu, Slider…
└─ hooks/         Atajos, rAF, tamaños, media queries
```

## Decisiones (ADR resumidos)

1. **Vite SPA en lugar de Next.js.** Todo el trabajo pesado ocurre en el navegador; no hay
   páginas que renderizar en servidor. El backend previsto (Supabase) se consume con su SDK.
2. **Documento único serializable.** `ProjectDoc` describe todo el proyecto; el motor lo
   reconcilia (como un "virtual DOM" de audio). Deshacer/rehacer = pila de documentos
   inmutables (compartición estructural → barato). Los cambios continuos (faders) se agrupan
   por clave en un único paso de historial.
3. **El motor no conoce React.** React nunca toca muestras ni se re-renderiza a 60 fps:
   cabezal, reloj y medidores se pintan en un único `requestAnimationFrame` compartido.
4. **Mismo grafo para escuchar y exportar.** `TrackChannel`, `MasterBus`, `FxChain` y
   `scheduleClips` reciben un `BaseAudioContext`; la exportación construye el grafo en un
   `OfflineAudioContext`. Las pruebas E2E verifican numéricamente el WAV exportado.
5. **Tiempo en segundos.** Los clips viven en segundos; compases/tiempos son una vista
   derivada del BPM. Cambiar el BPM no mueve el audio (comportamiento esperado en voz grabada).
6. **Transporte con programación anticipada** (lookahead 250 ms, tick 25 ms): bucles sin
   cortes y metrónomo preciso, independientes de la cadencia de la UI.
7. **Grabación por AudioWorklet** (no MediaRecorder): PCM sin compresión y el frame exacto
   de inicio, lo que permite alinear la toma con precisión de muestra y compensar la latencia
   (`baseLatency + outputLatency + latencia de entrada + ajuste manual`).
8. **Q lineal en el modelo.** `BiquadFilterNode` interpreta Q en dB para LP/HP; el modelo
   guarda Q lineal y `qForNode` convierte. La curva del EQ usa las fórmulas RBJ que define
   la especificación → el gráfico es la respuesta real (verificado en E2E con < 0,3 dB de error).
9. **Compresor sin "makeup" oculto.** `DynamicsCompressorNode` aplica una compensación
   automática `(1/G(0 dBFS))^0.6`. `compressorCurve.ts` modela la curva de la especificación
   (validada contra mediciones reales) y la anula; el control Makeup es la única compensación.
10. **Persistencia real.** IndexedDB guarda los `Blob` de audio originales (importaciones) o
    WAV float32 (grabaciones). Nunca se guardan `blob:` URLs. Los audios son inmutables y se
    comparten entre proyectos duplicados; al borrar un proyecto sólo se eliminan los huérfanos.

## Sincronización visual

Una única función de mapeo `x = (t − scrollTime) · pxPerSec` para clips, ondas, regla,
rejilla y cabezal. El timeline está virtualizado: cada clip dibuja en un canvas del tamaño de
su porción visible, por lo que no hay límite práctico de duración ni desincronización por zoom.
