import { memo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Lock, LockOpen, MoreHorizontal, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Track } from '@/types/project';
import { LetterToggle, IconButton } from '@/components/ui/Button';
import { Knob } from '@/components/ui/Knob';
import { Slider } from '@/components/ui/Slider';
import { Meter } from '@/components/ui/Meter';
import { useMenu } from '@/components/ui/Menu';
import { confirmAction } from '@/components/ui/Confirm';
import { useUi } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { engine } from '@/audio/engine/AudioEngine';
import { duplicateTrack, removeTrack, updateTrack } from '@/app/editing';
import { moveTrack } from '@/state/docOps';
import { TRACK_COLORS } from '@/config/app';
import { faderPosToGain, formatDb, gainToFaderPos } from '@/lib/audioMath';

interface Props { track: Track; index: number; height: number; selected: boolean; compact: boolean; onReorderStart: (e: React.PointerEvent, id: string) => void }

function TrackHeaderImpl({ track, index, height, selected, compact, onReorderStart }: Props) {
  const [editing, setEditing] = useState(false);
  const menu = useMenu();
  const count = useProject((s) => s.doc.tracks.length);
  const set = (patch: Partial<Track>, key?: string) => updateTrack(track.id, patch, key);
  const select = () => useUi.getState().set({ selectedTrackId: track.id, fxTarget: track.id });

  const openMenu = (el: HTMLElement) => menu.openFrom(el, [
    { header: track.name },
    { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
    { label: 'Efectos de la pista', icon: <SlidersHorizontal size={14} />, onSelect: () => useUi.getState().set({ fxTarget: track.id, selectedTrackId: track.id, bottomPanel: 'fx' }) },
    { label: 'Duplicar pista', icon: <Copy size={14} />, onSelect: () => duplicateTrack(track.id) },
    { label: 'Subir', icon: <ArrowUp size={14} />, disabled: index === 0, onSelect: () => useProject.getState().apply((d) => moveTrack(d, track.id, index - 1)) },
    { label: 'Bajar', icon: <ArrowDown size={14} />, disabled: index >= count - 1, onSelect: () => useProject.getState().apply((d) => moveTrack(d, track.id, index + 1)) },
    { header: 'Color' },
    ...TRACK_COLORS.map((c) => ({ label: c === track.color ? 'Color actual' : 'Cambiar color', icon: <span className="block h-3 w-3 rounded-full" style={{ background: c }} />, onSelect: () => set({ color: c }) })),
    'separator',
    {
      label: 'Eliminar pista', icon: <Trash2 size={14} />, danger: true, onSelect: async () => {
        const hasClips = useProject.getState().doc.clips.some((c) => c.trackId === track.id);
        if (!hasClips || (await confirmAction({ title: `¿Eliminar "${track.name}"?`, message: 'Se eliminarán la pista y sus clips. Puedes deshacerlo con Ctrl+Z.', confirmLabel: 'Eliminar', danger: true }))) removeTrack(track.id);
      },
    },
  ]);

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = track.height;
    const scale = useUi.getState().heightScale;
    const move = (ev: PointerEvent) => set({ height: Math.round(Math.max(48, Math.min(260, h0 + (ev.clientY - y0) / scale))) }, 'height');
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const showControls = height >= 84;

  return (
    <div
      data-testid="track-header"
      data-track-id={track.id}
      onPointerDown={select}
      className={`relative flex border-b border-line-soft ${selected ? 'bg-surface' : 'bg-panel hover:bg-[#171d27]'}`}
      style={{ height }}
    >
      <div className="w-1 shrink-0" style={{ background: track.color }} />
      {!compact && (
        <div className="flex w-4 shrink-0 cursor-grab items-start justify-center pt-2.5 text-dim hover:text-muted active:cursor-grabbing touch-none" onPointerDown={(e) => { e.stopPropagation(); onReorderStart(e, track.id); }} aria-label="Arrastrar para reordenar" data-tip="Arrastra para reordenar" data-tip-pos="right">
          <GripVertical size={12} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1.5 pr-2" style={{ paddingLeft: compact ? 8 : 0 }}>
        <div className="flex items-center gap-1">
          {editing ? (
            <input
              autoFocus
              defaultValue={track.name}
              aria-label="Nombre de la pista"
              className="h-6 min-w-0 flex-1 rounded border border-primary bg-bg px-1.5 text-[13px] font-medium outline-none"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== track.name) set({ name: v.slice(0, 60) }); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <button className="min-w-0 flex-1 truncate text-left text-[12.5px] font-bold [font-stretch:112%]" onDoubleClick={() => setEditing(true)} data-tip="Doble clic para renombrar" data-testid="track-name">
              {track.name}
            </button>
          )}
          {!compact && <IconButton label="Opciones de pista" size="sm" onClick={(e) => openMenu(e.currentTarget)} onPointerDown={(e) => e.stopPropagation()}><MoreHorizontal size={15} /></IconButton>}
        </div>
        <div className="flex items-center gap-1">
          <LetterToggle letter="M" label="Silenciar (mute)" active={track.mute} color="#F59E0B" onClick={() => set({ mute: !track.mute })} />
          <LetterToggle letter="S" label="Solo" active={track.solo} color="#38BDF8" onClick={() => set({ solo: !track.solo })} />
          <LetterToggle letter="R" label="Armar para grabar" active={track.armed} color="#EF4444" onClick={() => {
            const doc = useProject.getState().doc;
            // sólo una pista armada a la vez
            useProject.getState().apply((d) => ({ ...d, tracks: doc.tracks.map((t) => ({ ...t, armed: t.id === track.id ? !track.armed : false })) }));
          }} disabled={track.locked} />
          {!compact && (
            <button
              aria-label="Mostrar automatización"
              aria-pressed={!!track.automationView}
              data-tip="Automatización (volumen / panorama)"
              data-testid="toggle-automation"
              onClick={() => useProject.getState().apply((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === track.id ? { ...t, automationView: t.automationView ? null : 'volume' } : t)) }), { history: false })}
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${track.automationView ? 'bg-ok text-bg' : (track.automation?.volume?.enabled || track.automation?.pan?.enabled) ? 'bg-surface text-ok shadow-[inset_0_0_0_1px_#22C55E]' : 'bg-surface text-muted shadow-[inset_0_0_0_1px_#293241]'}`}
            >A</button>
          )}
          {!compact && (
            <button aria-label={track.locked ? 'Desbloquear pista' : 'Bloquear pista'} aria-pressed={track.locked} data-tip={track.locked ? 'Desbloquear' : 'Bloquear edición'} onClick={() => set({ locked: !track.locked })} onPointerDown={(e) => e.stopPropagation()} className={`flex h-6 w-6 items-center justify-center rounded ${track.locked ? 'bg-muted text-bg' : 'bg-surface text-muted shadow-[inset_0_0_0_1px_#293241]'}`}>
              {track.locked ? <Lock size={11} /> : <LockOpen size={11} />}
            </button>
          )}
          {!compact && (
            <div className="ml-1 flex-1">
              <Meter read={() => engine.readTrackMeter(track.id)} orientation="horizontal" width={84} height={8} />
            </div>
          )}
        </div>
        {showControls && (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Slider label={`Volumen de ${track.name}`} value={gainToFaderPos(track.volume)} min={0} max={1} step={0.001} color={track.color} onChange={(v) => set({ volume: faderPosToGain(v) }, 'vol')} />
              <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted tnum" data-testid="track-volume-db">{formatDb(track.volume)}</span>
            </div>
            {!compact && <Knob size={26} showValue={false} label="Panorama" value={track.pan} min={-1} max={1} defaultValue={0} bipolar color={track.color} format={(v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} onChange={(v) => set({ pan: v }, 'pan')} />}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" onPointerDown={startResize} aria-hidden />
      {menu.element}
    </div>
  );
}

export const TrackHeader = memo(TrackHeaderImpl);
