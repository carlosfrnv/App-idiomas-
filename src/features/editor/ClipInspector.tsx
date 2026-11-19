import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { updateClip } from '@/state/docOps';
import { Knob } from '@/components/ui/Knob';
import { dbToGain, gainToDb } from '@/lib/audioMath';
import { formatClock } from '@/lib/time';
import { Button } from '@/components/ui/Button';
import { deleteSelection, duplicateSelection, splitAtPlayhead } from '@/app/editing';
import { Copy, Scissors, Trash2 } from 'lucide-react';

export function ClipInspector() {
  const ids = useUi((s) => s.selectedClipIds);
  const clip = useProject((s) => s.doc.clips.find((c) => c.id === ids[0]));
  const locked = useProject((s) => !!s.doc.tracks.find((t) => t.id === clip?.trackId)?.locked);
  if (!clip) return <div className="flex h-full items-center justify-center text-sm text-dim">Selecciona un clip en la línea temporal para editar su ganancia y fundidos.</div>;
  const set = (patch: Parameters<typeof updateClip>[2], key: string) => useProject.getState().apply((d) => updateClip(d, clip.id, patch), { key: `clip:${clip.id}:${key}` });
  const db = gainToDb(clip.gain);
  return (
    <div className="flex h-full flex-wrap items-start gap-8 overflow-y-auto p-4" data-testid="clip-inspector">
      <div className="flex min-w-[220px] flex-col gap-2">
        <span className="label-xs">Clip{ids.length > 1 ? ` (${ids.length} seleccionados)` : ''}</span>
        <input aria-label="Nombre del clip" defaultValue={clip.name} key={clip.id} disabled={locked} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== clip.name) set({ name: v }, 'name'); }} className="h-8 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-primary" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          <dt>Inicio</dt><dd className="text-fg">{formatClock(clip.start)}</dd>
          <dt>Duración</dt><dd className="text-fg">{formatClock(clip.duration)}</dd>
          <dt>Offset fuente</dt><dd className="text-fg">{formatClock(clip.offset)}</dd>
        </dl>
        <div className="mt-1 flex gap-1.5">
          <Button size="sm" icon={<Scissors size={13} />} onClick={splitAtPlayhead} disabled={locked}>Dividir</Button>
          <Button size="sm" icon={<Copy size={13} />} onClick={duplicateSelection} disabled={locked}>Duplicar</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={deleteSelection} disabled={locked}>Eliminar</Button>
        </div>
      </div>
      <Knob label="Ganancia" size={52} value={Math.max(-36, isFinite(db) ? db : -36)} min={-36} max={12} defaultValue={0} disabled={locked} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => set({ gain: v <= -36 ? 0 : dbToGain(v) }, 'gain')} />
      <Knob label="Fade in" size={52} value={clip.fadeIn} min={0} max={Math.max(0.01, clip.duration)} defaultValue={0} disabled={locked} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => set({ fadeIn: v }, 'fi')} color="#38BDF8" />
      <Knob label="Fade out" size={52} value={clip.fadeOut} min={0} max={Math.max(0.01, clip.duration)} defaultValue={0} disabled={locked} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => set({ fadeOut: v }, 'fo')} color="#38BDF8" />
    </div>
  );
}
