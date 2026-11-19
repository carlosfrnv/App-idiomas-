import { memo, useRef } from 'react';
import { useElementSize } from '@/hooks/useElementSize';
import { SlidersHorizontal } from 'lucide-react';
import type { Track } from '@/types/project';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { engine } from '@/audio/engine/AudioEngine';
import { Fader } from '@/components/ui/Fader';
import { Knob } from '@/components/ui/Knob';
import { Meter } from '@/components/ui/Meter';
import { LetterToggle } from '@/components/ui/Button';
import { updateTrack } from '@/app/editing';
import { formatDb } from '@/lib/audioMath';
import { useFrame } from '@/hooks/useFrame';
import { EFFECT_LABELS } from '@/audio/fx/defaults';

const DB_SCALE = [6, 0, -6, -12, -24, -48];

function ClipLed({ read, reset }: { read: () => boolean; reset: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useFrame(() => { if (ref.current) ref.current.dataset.on = read() ? '1' : '0'; });
  return (
    <button ref={ref} data-on="0" onClick={reset} aria-label="Indicador de saturación (clic para reiniciar)" data-tip="Saturación · clic para reiniciar" className="h-2 w-full rounded-sm bg-[#2a1416] data-[on=1]:bg-rec data-[on=1]:shadow-[0_0_8px_rgb(239_68_68/0.8)]" />
  );
}

function PeakReadout({ read }: { read: () => ReturnType<typeof engine.readMasterMeter> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  useFrame((now) => {
    if (!ref.current || now - last.current < 120) return;
    last.current = now;
    const r = read();
    const p = r ? Math.max(r[0].hold, r[1].hold) : 0;
    ref.current.textContent = p > 0.00003 ? formatDb(p) : '-∞';
  });
  return <span ref={ref} className="font-mono text-[10px] text-muted tnum">-∞</span>;
}

function Scale({ height }: { height: number }) {
  // misma curva que el fader: posición 0.75 = 0 dB
  const thumb = 30, travel = height - thumb;
  const pos = (db: number) => { const g = Math.pow(10, db / 20); return g >= 1 ? 0.75 + (db / 6) * 0.25 : 0.75 - Math.pow(Math.min(1, -db / 60), 1 / 1.6) * 0.75; };
  return (
    <div className="relative w-5 shrink-0" style={{ height }} aria-hidden>
      {DB_SCALE.reduce<{ db: number; y: number }[]>((acc, db) => {
        const y = thumb / 2 + (1 - pos(db)) * travel;
        if (!acc.length || y - acc[acc.length - 1].y >= 11) acc.push({ db, y });
        return acc;
      }, []).map(({ db, y }) => (
        <span key={db} className="absolute right-0 -translate-y-1/2 font-mono text-[9px] text-dim" style={{ top: y }}>{db > 0 ? `+${db}` : db}</span>
      ))}
    </div>
  );
}

function FaderArea({ children }: { children: (h: number) => React.ReactNode }) {
  const [ref, size] = useElementSize<HTMLDivElement>({ width: 0, height: 120 });
  return <div ref={ref} className="flex min-h-[70px] w-full flex-1 !shrink justify-center">{children(Math.max(70, size.height))}</div>;
}

const ChannelStrip = memo(function ChannelStrip({ track, selected }: { track: Track; selected: boolean }) {
  const fxCount = track.effects.filter((e) => e.enabled).length;
  return (
    <div data-testid="channel-strip" data-track-id={track.id} onPointerDown={() => useUi.getState().set({ selectedTrackId: track.id, fxTarget: track.id })} className={`flex w-[96px] shrink-0 flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2 *:shrink-0 ${selected ? 'border-[#3a4558] bg-surface' : 'border-line bg-panel'}`}>
      <div className="h-1 w-full rounded-full" style={{ background: track.color }} />
      <div className="w-full truncate text-center text-[11px] font-semibold leading-4" title={track.name}>{track.name}</div>
      <button
        onClick={() => useUi.getState().set({ fxTarget: track.id, selectedTrackId: track.id, bottomPanel: 'fx' })}
        className="flex h-6 w-full items-center justify-center gap-1 rounded border border-line bg-bg/60 text-[10px] font-semibold text-muted hover:text-fg"
        data-tip={fxCount ? track.effects.map((e) => EFFECT_LABELS[e.type]).join(' → ') : 'Añadir efectos'}
      >
        <SlidersHorizontal size={11} /> FX {fxCount > 0 && <span className="rounded bg-primary/25 px-1 text-primary">{fxCount}</span>}
      </button>
      <div className="flex items-center gap-2">
        <Knob size={32} value={track.pan} min={-1} max={1} defaultValue={0} bipolar color={track.color} label="Pan" showValue={false} format={(v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} onChange={(v) => updateTrack(track.id, { pan: v }, 'pan')} />
        <div className="flex flex-col gap-1">
          <LetterToggle letter="M" label="Silenciar" active={track.mute} color="#F59E0B" onClick={() => updateTrack(track.id, { mute: !track.mute })} />
          <LetterToggle letter="S" label="Solo" active={track.solo} color="#38BDF8" onClick={() => updateTrack(track.id, { solo: !track.solo })} />
        </div>
      </div>
      <div className="font-mono text-[10px] text-dim">{Math.abs(track.pan) < 0.01 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}</div>
      <div className="w-[64px]"><ClipLed read={() => engine.trackClipped(track.id)} reset={() => engine.resetTrackClip(track.id)} /></div>
      <FaderArea>{(h) => (
        <div className="flex items-start gap-1">
          <Scale height={h} />
          <Fader gain={track.volume} label={`Volumen ${track.name}`} color={track.color} height={h} onChange={(g) => updateTrack(track.id, { volume: g }, 'vol')} />
          <Meter read={() => engine.readTrackMeter(track.id)} width={12} height={h} />
        </div>
      )}</FaderArea>
      <div className="font-mono text-[11px] font-semibold leading-4 tnum" data-testid="strip-db">{formatDb(track.volume)} dB</div>
    </div>
  );
});

function MasterStrip() {
  const vol = useProject((s) => s.doc.masterVolume);
  const fxCount = useProject((s) => s.doc.masterEffects.filter((e) => e.enabled).length);
  return (
    <div data-testid="master-strip" className="flex w-[118px] shrink-0 flex-col items-center gap-1.5 rounded-lg border border-primary/40 bg-gradient-to-b from-primary/10 to-panel px-2 py-2 *:shrink-0">
      <div className="h-1 w-full rounded-full bg-primary" />
      <div className="text-[11px] font-bold leading-4 tracking-[0.16em]">MASTER</div>
      <button onClick={() => useUi.getState().set({ fxTarget: 'master', bottomPanel: 'fx' })} className="flex h-6 w-full items-center justify-center gap-1 rounded border border-line bg-bg/60 text-[10px] font-semibold text-muted hover:text-fg">
        <SlidersHorizontal size={11} /> FX {fxCount > 0 && <span className="rounded bg-primary/25 px-1 text-primary">{fxCount}</span>}
      </button>
      <div className="flex h-[48px] flex-col items-center justify-center gap-1">
        <span className="label-xs">Pico</span>
        <PeakReadout read={() => engine.readMasterMeter()} />
      </div>
      <div className="h-[14px]" />
      <div className="w-[80px]"><ClipLed read={() => engine.masterClipped()} reset={() => engine.resetMasterClip()} /></div>
      <FaderArea>{(h) => (
        <div className="flex items-start gap-1">
          <Scale height={h} />
          <Fader gain={vol} label="Volumen master" height={h} onChange={(g) => useProject.getState().apply((d) => ({ ...d, masterVolume: g }), { key: 'master-vol' })} />
          <Meter read={() => engine.readMasterMeter()} width={22} height={h} />
        </div>
      )}</FaderArea>
      <div className="font-mono text-[11px] font-semibold leading-4 tnum">{formatDb(vol)} dB</div>
    </div>
  );
}

export function Mixer() {
  const tracks = useProject((s) => s.doc.tracks);
  const selected = useUi((s) => s.selectedTrackId);
  return (
    <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden p-2" data-testid="mixer">
      {tracks.map((t) => <ChannelStrip key={t.id} track={t} selected={t.id === selected} />)}
      {tracks.length === 0 && <div className="flex flex-1 items-center justify-center text-sm text-dim">Añade pistas para verlas en el mezclador.</div>}
      <div className="sticky right-0 ml-auto flex shrink-0 pl-2" style={{ background: 'linear-gradient(to right, transparent, #141922 12px)' }}>
        <MasterStrip />
      </div>
    </div>
  );
}
