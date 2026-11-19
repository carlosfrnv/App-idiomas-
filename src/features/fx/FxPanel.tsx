import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Wand2, Power } from 'lucide-react';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { getEffects } from '@/state/docOps';
import { EFFECT_LABELS, EFFECT_ORDER } from '@/audio/fx/defaults';
import { CHAIN_PRESETS } from '@/audio/fx/presets';
import { Button, IconButton } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useMenu } from '@/components/ui/Menu';
import { confirmAction } from '@/components/ui/Confirm';
import { addEffect, moveEffect, removeEffect, replaceChain, toggleEffect } from './fxActions';
import { EffectEditor } from './EffectEditors';

const DESCRIPTIONS: Record<string, string> = {
  eq: 'Moldea el timbre: quita graves, añade presencia o brillo.',
  compressor: 'Controla la dinámica para una voz estable y al frente.',
  reverb: 'Añade espacio y profundidad.',
  delay: 'Ecos, sincronizables con el tempo.',
  filter: 'Filtro resonante pasa-bajos, altos o banda.',
  saturation: 'Calidez armónica y carácter.',
  gate: 'Silencia el ruido de fondo entre frases.',
};

export function FxPanel() {
  const fxTarget = useUi((s) => s.fxTarget);
  const selectedTrackId = useUi((s) => s.selectedTrackId);
  const target = fxTarget ?? selectedTrackId;
  const track = useProject((s) => (target && target !== 'master' ? s.doc.tracks.find((t) => t.id === target) : undefined));
  const effects = useProject((s) => (target ? getEffects(s.doc, target) : []));
  const [selId, setSelId] = useState<string | null>(null);
  const addMenu = useMenu();
  const presetMenu = useMenu();
  useEffect(() => { if (!effects.find((e) => e.id === selId)) setSelId(effects[0]?.id ?? null); }, [effects, selId]);

  if (!target || (target !== 'master' && !track)) {
    return <div className="flex h-full items-center justify-center text-sm text-dim">Selecciona una pista para ver sus efectos.</div>;
  }
  const name = target === 'master' ? 'MASTER' : track!.name;
  const color = target === 'master' ? '#8B5CF6' : track!.color;
  const sel = effects.find((e) => e.id === selId);

  const openAdd = (el: HTMLElement) => addMenu.openFrom(el, [
    { header: 'Añadir efecto' },
    ...EFFECT_ORDER.map((t) => ({ label: EFFECT_LABELS[t], onSelect: () => setSelId(addEffect(target, t)) })),
  ]);
  const openPresets = (el: HTMLElement) => presetMenu.openFrom(el, [
    { header: 'Cadenas vocales' },
    ...CHAIN_PRESETS.map((p) => ({
      label: p.name, shortcut: '', icon: <Sparkles size={13} />,
      onSelect: async () => {
        if (effects.length && !(await confirmAction({ title: `Aplicar "${p.name}"`, message: 'Se sustituirá la cadena de efectos actual de esta pista. Puedes deshacerlo con Ctrl+Z.', confirmLabel: 'Aplicar' }))) return;
        const slots = p.build();
        replaceChain(target, slots);
        setSelId(slots[0]?.id ?? null);
      },
    })),
  ]);

  return (
    <div className="flex h-full min-h-0" data-testid="fx-panel">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-line">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="truncate text-[13px] font-semibold">{name}</span>
          <div className="flex-1" />
          <IconButton label="Presets de cadena" size="sm" onClick={(e) => openPresets(e.currentTarget)} data-testid="fx-presets"><Wand2 size={14} /></IconButton>
          <IconButton label="Añadir efecto" size="sm" onClick={(e) => openAdd(e.currentTarget)} data-testid="fx-add"><Plus size={15} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {effects.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
              <p className="text-xs text-muted">Esta pista no tiene efectos. Empieza con un preset vocal o añade efectos uno a uno.</p>
              <Button size="sm" variant="primary" icon={<Wand2 size={13} />} onClick={(e) => openPresets(e.currentTarget)}>Preset vocal</Button>
              <Button size="sm" icon={<Plus size={13} />} onClick={(e) => openAdd(e.currentTarget)}>Añadir efecto</Button>
            </div>
          )}
          <ol className="flex flex-col gap-1">
            {effects.map((e, i) => (
              <li key={e.id}>
                <div
                  role="button"
                  tabIndex={0}
                  data-testid="fx-slot"
                  onClick={() => setSelId(e.id)}
                  onKeyDown={(k) => { if (k.key === 'Enter') setSelId(e.id); }}
                  className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 ${e.id === selId ? 'border-primary/60 bg-primary/10' : 'border-line bg-surface/50 hover:bg-surface'}`}
                >
                  <span className="w-4 text-center font-mono text-[10px] text-dim">{i + 1}</span>
                  <span className={`flex-1 truncate text-[12px] font-medium ${e.enabled ? '' : 'text-dim line-through'}`}>{EFFECT_LABELS[e.type]}</span>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <IconButton label="Subir" size="sm" showTip={false} disabled={i === 0} onClick={(ev) => { ev.stopPropagation(); moveEffect(target, e.id, -1); }}><ArrowUp size={12} /></IconButton>
                    <IconButton label="Bajar" size="sm" showTip={false} disabled={i === effects.length - 1} onClick={(ev) => { ev.stopPropagation(); moveEffect(target, e.id, 1); }}><ArrowDown size={12} /></IconButton>
                    <IconButton label="Quitar" size="sm" showTip={false} onClick={(ev) => { ev.stopPropagation(); removeEffect(target, e.id); }}><Trash2 size={12} /></IconButton>
                  </div>
                  <Switch size="sm" label={`Activar ${EFFECT_LABELS[e.type]}`} checked={e.enabled} onChange={() => toggleEffect(target, e.id)} />
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-md border border-dashed border-line p-2.5" data-testid="pitch-roadmap">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted"><Power size={12} /> Corrección de tono</div>
            <p className="mt-1 text-[11px] leading-snug text-dim">Selecciona un clip de voz y abre la pestaña <button className="text-primary underline" onClick={() => useUi.getState().set({ bottomPanel: 'clip' })}>Clip</button> para afinarlo (natural o robótico).</p>
          </div>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
        {sel ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">{EFFECT_LABELS[sel.type]}</h3>
              <span className="text-xs text-dim">{DESCRIPTIONS[sel.type]}</span>
              <div className="flex-1" />
              <label className="flex items-center gap-2 text-xs text-muted">{sel.enabled ? 'Activo' : 'Bypass'} <Switch label="Activar efecto" checked={sel.enabled} onChange={() => toggleEffect(target, sel.id)} /></label>
            </div>
            <div className={`min-h-0 flex-1 ${sel.enabled ? '' : 'opacity-60'}`}><EffectEditor target={target} slot={sel} /></div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-dim">Añade un efecto para editarlo aquí.</div>
        )}
      </section>
      {addMenu.element}
      {presetMenu.element}
    </div>
  );
}
