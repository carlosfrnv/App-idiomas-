import { ChevronDown, ChevronUp, SlidersHorizontal, SlidersVertical, AudioLines, PenLine } from 'lucide-react';
import { LyricsPanel } from '@/features/lyrics/LyricsPanel';
import { useUi, type BottomPanel as Panel } from '@/state/uiStore';
import { Mixer } from '@/features/mixer/Mixer';
import { FxPanel } from '@/features/fx/FxPanel';
import { ClipInspector } from './ClipInspector';
import { IconButton } from '@/components/ui/Button';

const TABS: { id: Exclude<Panel, null>; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'mixer', label: 'Mezclador', icon: <SlidersVertical size={14} />, key: 'M' },
  { id: 'fx', label: 'Efectos', icon: <SlidersHorizontal size={14} />, key: 'E' },
  { id: 'clip', label: 'Clip', icon: <AudioLines size={14} />, key: '' },
  { id: 'lyrics', label: 'Letras', icon: <PenLine size={14} />, key: '' },
];

export function BottomPanel() {
  const { bottomPanel, bottomHeight } = useUi();
  const panel = bottomPanel;
  const startResize = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = bottomHeight;
    const move = (ev: PointerEvent) => useUi.getState().set({ bottomHeight: Math.max(160, Math.min(window.innerHeight * 0.7, h0 - (ev.clientY - y0))) });
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="flex shrink-0 flex-col border-t border-line bg-panel" style={{ height: panel ? bottomHeight : 36 }}>
      {panel && <div className="-mt-1 h-2 cursor-ns-resize touch-none" onPointerDown={startResize} aria-label="Redimensionar panel" />}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => useUi.getState().set({ bottomPanel: panel === t.id ? null : t.id })}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium ${panel === t.id ? 'bg-surface text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
        <div className="flex-1" />
        <IconButton label={panel ? 'Ocultar panel' : 'Mostrar panel'} size="sm" tipPos="left" onClick={() => useUi.getState().set({ bottomPanel: panel ? null : 'mixer' })}>{panel ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</IconButton>
      </div>
      {panel && (
        <div className="min-h-0 flex-1">
          {panel === 'mixer' && <Mixer />}
          {panel === 'fx' && <FxPanel />}
          {panel === 'clip' && <ClipInspector />}
          {panel === 'lyrics' && <LyricsPanel />}
        </div>
      )}
    </div>
  );
}
