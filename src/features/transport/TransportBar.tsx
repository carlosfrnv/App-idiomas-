import { useRef } from 'react';
import { Circle, Mic, Pause, Play, Repeat, SkipBack, Square, Timer, MoveRight } from 'lucide-react';
import { useTransport } from '@/state/transportStore';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { engine } from '@/audio/engine/AudioEngine';
import { useFrame } from '@/hooks/useFrame';
import { formatBars, formatClock } from '@/lib/time';
import { rewind, setMetronome, stop, toggleLoop, togglePlay } from '@/app/transport';
import { recorder, toggleRecord, useRecState } from '@/app/recording';
import { IconButton } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { useIsMobile } from '@/hooks/useMediaQuery';

function Clock() {
  const clock = useRef<HTMLSpanElement>(null);
  const bars = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const pos = engine.playing ? engine.getPosition() : useTransport.getState().position;
    const d = useProject.getState().doc;
    if (clock.current) clock.current.textContent = formatClock(pos);
    if (bars.current) bars.current.textContent = formatBars(pos, d.bpm, d.timeSignature);
  });
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-1 shadow-[inset_0_1px_8px_rgb(0_0_0/0.4)]" aria-label="Posición">
      <div className="flex flex-col items-end leading-none">
        <span ref={bars} data-testid="clock-bars" className="font-mono text-[17px] font-semibold text-fg tnum">1.1.000</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-dim">Compás</span>
      </div>
      <div className="h-6 w-px bg-line" />
      <div className="flex flex-col items-end leading-none">
        <span ref={clock} data-testid="clock-time" className="font-mono text-[17px] font-semibold text-sky tnum">00:00.000</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-dim">Tiempo</span>
      </div>
    </div>
  );
}

export function TransportBar() {
  const { playing, recording, metronome, follow } = useTransport();
  const loop = useProject((s) => s.doc.loop.enabled);
  const inputOpen = useRecState((s) => s.inputOpen);
  const label = useRecState((s) => s.label);
  const busy = useRecState((s) => s.busy);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-[#11161E] px-2 md:gap-4 md:px-3" role="toolbar" aria-label="Transporte">
      <div className="flex items-center gap-1">
        <IconButton label="Volver al inicio (Inicio)" size="lg" onClick={rewind}><SkipBack size={18} /></IconButton>
        <IconButton label="Detener" size="lg" onClick={() => void stop()} data-testid="stop"><Square size={16} fill="currentColor" /></IconButton>
        <button
          type="button"
          aria-label={playing && !recording ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          data-tip={playing && !recording ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          data-testid="play"
          data-playing={playing ? '1' : '0'}
          onClick={() => void togglePlay()}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${playing ? 'bg-ok text-bg' : 'bg-fg text-bg hover:bg-white'}`}
        >
          {playing && !recording ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          type="button"
          aria-label={recording ? 'Detener grabación (R)' : 'Grabar (R)'}
          data-tip={recording ? 'Detener grabación (R)' : 'Grabar (R)'}
          data-testid="record"
          data-recording={recording ? '1' : '0'}
          disabled={busy}
          onClick={() => void toggleRecord()}
          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${recording ? 'border-rec bg-rec text-white animate-rec-pulse' : 'border-rec/60 bg-transparent text-rec hover:bg-rec/10'}`}
        >
          <Circle size={16} fill="currentColor" />
        </button>
      </div>

      {!isMobile && <div className="h-8 w-px bg-line" />}
      <div className="flex items-center gap-1">
        <IconButton label="Bucle (L)" active={loop} onClick={toggleLoop} data-testid="loop"><Repeat size={17} /></IconButton>
        <IconButton label="Metrónomo (K)" active={metronome} onClick={() => setMetronome(!metronome)} data-testid="metronome"><Timer size={17} /></IconButton>
        {!isMobile && <IconButton label="Seguir cabezal" active={follow} onClick={() => useTransport.getState().set({ follow: !follow })}><MoveRight size={17} /></IconButton>}
      </div>

      <Clock />

      {recording && (
        <div className="flex items-center gap-2 rounded-md bg-rec/15 px-2.5 py-1 text-[11px] font-bold tracking-wider text-rec" data-testid="rec-indicator">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rec" /> GRABANDO
        </div>
      )}

      <div className="flex-1" />

      {!isMobile && (
        <button onClick={() => useUi.getState().set({ recordSetupOpen: true })} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 hover:border-[#3a4558]" data-tip="Configurar entrada de micrófono" data-testid="open-record-setup">
          <Mic size={15} className={inputOpen ? 'text-ok' : 'text-dim'} />
          <div className="flex flex-col items-start leading-tight">
            <span className="max-w-[160px] truncate text-[11px] font-medium">{inputOpen ? label || 'Micrófono' : 'Entrada de micrófono'}</span>
            <span className="text-[10px] text-dim">{inputOpen ? 'Activa' : 'Sin abrir — clic para configurar'}</span>
          </div>
          <Meter read={() => (inputOpen ? [recorder.readLevel()] : null)} channels={1} orientation="horizontal" width={70} height={6} />
        </button>
      )}
      {!isMobile && (
        <div className="flex items-center gap-2" data-tip="Salida master" data-tip-pos="left">
          <span className="label-xs">Master</span>
          <Meter read={() => engine.readMasterMeter()} orientation="horizontal" width={110} height={12} />
        </div>
      )}
    </div>
  );
}
