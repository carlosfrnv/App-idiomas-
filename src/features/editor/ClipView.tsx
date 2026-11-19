import { memo, useEffect, useRef } from 'react';
import { Copy, Scissors, Trash2, Volume1, Volume2, VolumeX } from 'lucide-react';
import type { Clip, Track } from '@/types/project';
import { useUi } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { useAssets } from '@/state/assetStore';
import { engine } from '@/audio/engine/AudioEngine';
import * as ops from '@/state/docOps';
import { drawClipWaveform } from './waveformDraw';
import { useTimelineApi } from './TimelineContext';
import { useMenu } from '@/components/ui/Menu';
import { deleteSelection, duplicateSelection, splitAtPlayhead } from '@/app/editing';
import { formatDb } from '@/lib/audioMath';

interface Props {
  clip: Clip;
  track: Track;
  height: number;
  pxPerSec: number;
  scrollTime: number;
  viewportWidth: number;
  selected: boolean;
}

const EDGE = 7;
const HEADER = 16;

function ClipViewImpl({ clip, track, height, pxPerSec, scrollTime, viewportWidth, selected }: Props) {
  const api = useTimelineApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useAssets((s) => s.status[clip.assetId]);
  const version = useAssets((s) => s.version);
  const menu = useMenu();

  const left = (clip.start - scrollTime) * pxPerSec;
  const width = Math.max(2, clip.duration * pxPerSec);
  const visL = Math.max(0, left);
  const visR = Math.min(viewportWidth, left + width);
  const visW = Math.max(0, visR - visL);
  const waveH = Math.max(4, height - HEADER - 6);

  useEffect(() => {
    const c = canvasRef.current;
    const buf = engine.getBuffer(clip.assetId);
    const pk = engine.getPeaks(clip.assetId);
    if (!c || !buf || !pk || visW <= 0) return;
    drawClipWaveform({ canvas: c, width: visW, height: waveH, buffer: buf, peaks: pk, clip, pxPerSec, startTime: scrollTime + visL / pxPerSec, color: track.color });
  }, [clip, pxPerSec, scrollTime, visL, visW, waveH, track.color, status, version]);

  if (visR <= 0 || left >= viewportWidth) return null;

  const locked = track.locked;

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'trim-start' | 'trim-end' | 'fade-in' | 'fade-out') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const ui = useUi.getState();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) ui.selectClips(selected ? ui.selectedClipIds.filter((id) => id !== clip.id) : [clip.id], !selected);
    else if (!selected) ui.selectClips([clip.id]);
    ui.set({ selectedTrackId: track.id, fxTarget: track.id });
    if (locked) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const startX = e.clientX;
    const doc0 = useProject.getState().doc;
    const selIds = mode === 'move' ? (additive ? useUi.getState().selectedClipIds : selected ? ui.selectedClipIds : [clip.id]) : [clip.id];
    const origins = new Map(selIds.map((id) => [id, doc0.clips.find((c) => c.id === id)]).filter((x): x is [string, Clip] => !!x[1]));
    const srcDur = engine.getBuffer(clip.assetId)?.duration ?? clip.offset + clip.duration;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3 && mode === 'move') {
        if (Math.abs(ev.clientY - e.clientY) < 6) return;
      }
      if (!moved) { useProject.getState().checkpoint(); moved = true; }
      const P = useProject.getState();
      if (mode === 'move') {
        const o = origins.get(clip.id) ?? clip;
        const snapped = api.snap(o.start + dx / pxPerSec, ev);
        const delta = snapped - o.start;
        const targetTrack = origins.size === 1 ? api.trackAtClientY(ev.clientY) : null;
        const tt = targetTrack ? P.doc.tracks.find((t) => t.id === targetTrack) : null;
        P.apply((d) => {
          let nd = d;
          for (const [id, oc] of origins) {
            nd = ops.moveClip(nd, id, oc.start + delta, tt && !tt.locked ? tt.id : undefined);
          }
          return nd;
        }, { history: false });
      } else if (mode === 'trim-start' || mode === 'trim-end') {
        // desplazamiento relativo al punto de agarre: el borde no salta al pulsar
        const o = origins.get(clip.id)!;
        const edge0 = mode === 'trim-start' ? o.start : o.start + o.duration;
        const t = api.snap(edge0 + dx / pxPerSec, ev);
        P.apply((d) => ops.trimClip({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? origins.get(clip.id)! : c)) }, clip.id, mode === 'trim-start' ? 'start' : 'end', t, srcDur), { history: false });
      } else {
        const o = origins.get(clip.id)!;
        const f0 = mode === 'fade-in' ? o.fadeIn : o.fadeOut;
        const v = mode === 'fade-in' ? f0 + dx / pxPerSec : f0 - dx / pxPerSec;
        const fade = Math.max(0, Math.min(o.duration, v));
        P.apply((d) => ops.updateClip(d, clip.id, mode === 'fade-in' ? { fadeIn: fade } : { fadeOut: fade }), { history: false });
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const setGain = (g: number) => useProject.getState().apply((d) => ops.updateClip(d, clip.id, { gain: g }));

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected) useUi.getState().selectClips([clip.id]);
    menu.open(e.clientX, e.clientY, [
      { header: clip.name },
      { label: 'Dividir en el cabezal', icon: <Scissors size={14} />, shortcut: 'S', onSelect: splitAtPlayhead, disabled: locked },
      { label: 'Duplicar', icon: <Copy size={14} />, shortcut: 'Ctrl+D', onSelect: duplicateSelection, disabled: locked },
      'separator',
      { label: 'Ganancia +3 dB', icon: <Volume2 size={14} />, onSelect: () => setGain(Math.min(4, clip.gain * 1.4125)), disabled: locked },
      { label: 'Ganancia −3 dB', icon: <Volume1 size={14} />, onSelect: () => setGain(clip.gain / 1.4125), disabled: locked },
      { label: 'Restablecer ganancia', icon: <VolumeX size={14} />, onSelect: () => setGain(1), disabled: locked || clip.gain === 1 },
      { label: 'Quitar fundidos', onSelect: () => useProject.getState().apply((d) => ops.updateClip(d, clip.id, { fadeIn: 0, fadeOut: 0 })), disabled: locked || (!clip.fadeIn && !clip.fadeOut) },
      'separator',
      { label: 'Eliminar', icon: <Trash2 size={14} />, shortcut: 'Supr', danger: true, onSelect: deleteSelection, disabled: locked },
    ]);
  };

  const fadeInW = clip.fadeIn * pxPerSec;
  const fadeOutW = clip.fadeOut * pxPerSec;
  const gainLabel = Math.abs(clip.gain - 1) > 0.001 ? `${formatDb(clip.gain)} dB` : '';

  return (
    <div
      data-testid="clip"
      data-clip-id={clip.id}
      className={`group absolute top-[3px] overflow-hidden rounded-[5px] ${locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        left,
        width,
        height: height - 6,
        background: `color-mix(in srgb, ${track.color} ${selected ? 26 : 16}%, #0F131B)`,
        boxShadow: selected ? `0 0 0 1.5px ${track.color}, 0 4px 14px -6px ${track.color}` : `inset 0 0 0 1px color-mix(in srgb, ${track.color} 45%, transparent)`,
      }}
      onPointerDown={(e) => startDrag(e, 'move')}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-none flex h-4 items-center gap-1.5 px-1.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${track.color} ${selected ? 55 : 35}%, transparent)`, marginLeft: Math.max(0, -left), maxWidth: visW }}>
        <span className="truncate text-fg/95">{clip.name}</span>
        {gainLabel && <span className="shrink-0 font-mono text-fg/70">{gainLabel}</span>}
      </div>
      {status === 'ready' || engine.hasBuffer(clip.assetId) ? (
        <canvas ref={canvasRef} className="pointer-events-none absolute" style={{ left: visL - left, top: HEADER + 1, width: visW, height: waveH }} />
      ) : (
        <div className="absolute inset-x-0 bottom-0 top-4 flex items-center justify-center text-[10px] text-muted" style={{ paddingLeft: Math.max(0, -left) }}>
          {status === 'loading' || !status ? 'Cargando audio…' : status === 'missing' ? 'Audio no encontrado' : 'Error de audio'}
        </div>
      )}
      {fadeInW > 1 && (
        <svg className="pointer-events-none absolute left-0" style={{ top: HEADER, width: fadeInW, height: height - 6 - HEADER }} preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 100 L100 0 L0 0 Z" fill="rgba(11,14,20,0.45)" /><path d="M0 100 L100 0" stroke="rgba(245,247,250,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" fill="none" />
        </svg>
      )}
      {fadeOutW > 1 && (
        <svg className="pointer-events-none absolute right-0" style={{ top: HEADER, width: fadeOutW, height: height - 6 - HEADER }} preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 0 L100 100 L100 0 Z" fill="rgba(11,14,20,0.45)" /><path d="M0 0 L100 100" stroke="rgba(245,247,250,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" fill="none" />
        </svg>
      )}
      {!locked && width > 24 && (
        <>
          <div aria-label="Recortar inicio" className="absolute inset-y-0 left-0 z-10 cursor-ew-resize hover:bg-white/15" style={{ width: EDGE }} onPointerDown={(e) => startDrag(e, 'trim-start')} />
          <div aria-label="Recortar final" className="absolute inset-y-0 right-0 z-10 cursor-ew-resize hover:bg-white/15" style={{ width: EDGE }} onPointerDown={(e) => startDrag(e, 'trim-end')} />
          <div data-tip="Fundido de entrada" className="absolute top-0 z-20 h-2.5 w-2.5 cursor-ew-resize rounded-sm border border-white/70 bg-bg opacity-0 group-hover:opacity-100" style={{ left: Math.max(EDGE, fadeInW - 5) }} onPointerDown={(e) => startDrag(e, 'fade-in')} />
          <div data-tip="Fundido de salida" className="absolute top-0 z-20 h-2.5 w-2.5 cursor-ew-resize rounded-sm border border-white/70 bg-bg opacity-0 group-hover:opacity-100" style={{ right: Math.max(EDGE, fadeOutW - 5) }} onPointerDown={(e) => startDrag(e, 'fade-out')} />
        </>
      )}
      {menu.element}
    </div>
  );
}

export const ClipView = memo(ClipViewImpl);
