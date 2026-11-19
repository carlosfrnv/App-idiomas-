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

function Clock({ compact = false }: { compact?: boolean }) {
  const clock = useRef<HTMLSpanElement>(null);
  const bars = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const pos = engine.playing ? engine.getPosition() : useTransport.getState().position;
    const d = useProject.getState().doc;
    if (clock.current) clock.current.textContent = formatClock(pos);
    if (bars.current) bars.current.textContent = formatBars(pos, d.bpm, d.timeSignature);
  });
  const cell = (ref: React.RefObject<HTMLSpanElement | null>, ghost: string, initial: string, label: string, color: string, testid: string, hidden = false) => (
    <div className={`flex-col items-end leading-none ${hidden ? 'hidden' : 'flex'}`}>
      <span className={`relative font-mono font-medium tnum [font-stretch:112%] ${compact ? 'text-[13px]' : 'text-[18px]'}`}>
        <span className="absolute right-0 top-0 whitespace-nowrap text-white/[0.05]" aria-hidden>{ghost}</span>
        <span ref={ref} data-testid={testid} className="relative lcd-glow" style={{ color }}>{initial}</span>
      </span>
      <span className="mt-1 label-xs !text-[8px]">{label}</span>
    </div>
  );
  return (
    <div className={`lcd flex items-center gap-4 rounded-sm py-1.5 ${compact ? 'px-2' : 'px-3.5'}`} aria-label="Posición">
      {cell(bars, '88.8.888', '1.1.000', 'Compás', '#C4B5FD', 'clock-bars', compact)}
      {!compact && <div className="h-7 w-px bg-white/10" />}
      {cell(clock, '88:88.888', '00:00.000', 'Tiempo', '#7DD3FC', 'clock-time')}
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
    <div className="grooves flex h-14 shrink-0 items-center gap-2 border-b border-[#0B0E14] bg-[#11161E] px-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] md:gap-4 md:px-3" role="toolbar" aria-label="Transporte">
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
          className={`relative flex h-11 w-12 items-center justify-center rounded-sm ${playing ? 'border border-[#15803d] bg-gradient-to-b from-[#34d36e] to-[#16a34a] text-bg shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_0_18px_-4px_#22C55E]' : 'hw text-fg'}`}
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
          className={`relative flex h-11 w-12 items-center justify-center rounded-sm ${recording ? 'border border-[#b91c1c] bg-gradient-to-b from-[#f87171] to-[#dc2626] text-white animate-rec-pulse' : 'hw text-rec'}`}
        >
          <Circle size={16} fill="currentColor" />
        </button>
      </div>

      {!isMobile && <div className="h-8 w-px bg-line" />}
      <div className="flex items-center gap-1">
        <IconButton label="Bucle (L)" active={loop} onClick={toggleLoop} data-testid="loop"><Repeat size={17} /></IconButton>
        {!isMobile && <IconButton label="Metrónomo (K)" active={metronome} onClick={() => setMetronome(!metronome)} data-testid="metronome"><Timer size={17} /></IconButton>}
        {!isMobile && <IconButton label="Seguir cabezal" active={follow} onClick={() => useTransport.getState().set({ follow: !follow })}><MoveRight size={17} /></IconButton>}
      </div>

      <Clock compact={isMobile} />

      {recording && (
        <div className="silk flex items-center gap-2 rounded-sm border border-rec/40 bg-rec/10 px-2.5 py-1 text-[10px] text-rec" data-testid="rec-indicator">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rec" /> GRABANDO
        </div>
      )}

      <div className="flex-1" />

      {!isMobile && (
        <button onClick={() => useUi.getState().set({ recordSetupOpen: true })} className="hw flex items-center gap-2.5 rounded-sm px-2.5 py-1.5" data-tip="Configurar entrada de micrófono" data-testid="open-record-setup">
          <Mic size={15} className={inputOpen ? 'text-ok' : 'text-dim'} />
          <div className="flex flex-col items-start leading-tight">
            <span className="max-w-[160px] truncate text-[11px] font-medium">{inputOpen ? label || 'Micrófono' : 'Entrada de micrófono'}</span>
            <span className="whitespace-nowrap text-[10px] text-dim">{inputOpen ? 'Activa' : 'Clic para configurar'}</span>
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
