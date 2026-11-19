import { useCallback, useEffect, useState } from 'react';
import { AudioWaveform, Disc3, FileAudio, FolderOpen, Library, Mic, Pause, Play, Plus, Sparkles, SlidersHorizontal, Trash2, Upload, Wand2, Layers, ChevronLeft, Loader2 } from 'lucide-react';
import { useUi, type LibraryTab } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { useAssets } from '@/state/assetStore';
import { useTransport } from '@/state/transportStore';
import { repository } from '@/persistence/localRepository';
import type { AudioAsset, ProjectMeta } from '@/types/project';
import { formatBytes, formatDuration, formatRelativeDate } from '@/lib/format';
import { ASSET_MIME } from '@/features/editor/TimelineContext';
import { importFiles, placeAsset } from '@/app/editing';
import { ensureAssetLoaded } from '@/app/assets';
import { createDemoAsset, openProject, saveProjectNow } from '@/app/projects';
import { DEMO_STYLES, type DemoStyle } from '@/audio/demo/demoBeat';
import { togglePreview, usePreview } from '@/app/preview';
import { EFFECT_LABELS, EFFECT_ORDER } from '@/audio/fx/defaults';
import { CHAIN_PRESETS } from '@/audio/fx/presets';
import { addEffect, replaceChain } from '@/features/fx/fxActions';
import { confirmAction } from '@/components/ui/Confirm';
import { IconButton, LetterToggle, Button } from '@/components/ui/Button';
import { toast } from '@/state/toastStore';
import { updateTrack } from '@/app/editing';

const TABS: { id: LibraryTab; label: string; icon: React.ReactNode }[] = [
  { id: 'files', label: 'Mis archivos', icon: <FileAudio size={16} /> },
  { id: 'beats', label: 'Instrumentales', icon: <Disc3 size={16} /> },
  { id: 'recordings', label: 'Grabaciones', icon: <Mic size={16} /> },
  { id: 'tracks', label: 'Pistas', icon: <Layers size={16} /> },
  { id: 'effects', label: 'Efectos', icon: <SlidersHorizontal size={16} /> },
  { id: 'presets', label: 'Presets', icon: <Wand2 size={16} /> },
  { id: 'projects', label: 'Proyectos', icon: <FolderOpen size={16} /> },
  { id: 'sounds', label: 'Biblioteca de sonidos', icon: <Library size={16} /> },
];

function useAssetList() {
  const version = useAssets((s) => s.version);
  const [list, setList] = useState<AudioAsset[]>([]);
  const refresh = useCallback(() => { repository.listAssets().then(setList).catch(() => setList([])); }, []);
  useEffect(refresh, [version, refresh]);
  return { list, refresh };
}

function AssetRow({ a, onDeleted }: { a: AudioAsset; onDeleted: () => void }) {
  const playing = usePreview((s) => s.playingId === a.id);
  const add = async () => {
    if (!(await ensureAssetLoaded(a.id))) { toast.error('No se pudo cargar el audio'); return; }
    placeAsset(a.id, a.name, a.duration, { at: useTransport.getState().position });
  };
  const del = async () => {
    const projects = await repository.listProjects();
    for (const pm of projects) {
      const p = await repository.getProject(pm.id);
      if (p?.doc.clips.some((c) => c.assetId === a.id) || (pm.id === useProject.getState().projectId && useProject.getState().doc.clips.some((c) => c.assetId === a.id))) {
        toast.warning('Audio en uso', `"${a.name}" se usa en el proyecto "${pm.name}". Elimina antes sus clips.`);
        return;
      }
    }
    if (!(await confirmAction({ title: `¿Eliminar "${a.name}"?`, message: 'El archivo de audio se borrará definitivamente de este navegador.', confirmLabel: 'Eliminar', danger: true }))) return;
    await repository.deleteAsset(a.id);
    onDeleted();
  };
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ id: a.id, name: a.name, duration: a.duration })); e.dataTransfer.effectAllowed = 'copy'; }}
      className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface active:cursor-grabbing"
      data-testid="library-asset"
    >
      <IconButton label={playing ? 'Detener escucha' : 'Escuchar'} size="sm" showTip={false} onClick={() => void togglePreview(a.id)} active={playing}>{playing ? <Pause size={13} /> : <Play size={13} />}</IconButton>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium" title={a.name}>{a.name}</div>
        <div className="font-mono text-[10px] text-dim">{formatDuration(a.duration)} · {formatBytes(a.size)} · {Math.round(a.sampleRate / 100) / 10} kHz</div>
      </div>
      <div className="hidden gap-0.5 group-hover:flex">
        <IconButton label="Añadir al proyecto (en el cabezal)" size="sm" tipPos="left" onClick={() => void add()}><Plus size={14} /></IconButton>
        <IconButton label="Eliminar del navegador" size="sm" tipPos="left" onClick={() => void del()}><Trash2 size={13} /></IconButton>
      </div>
    </div>
  );
}

function AssetList({ filter, empty }: { filter: (a: AudioAsset) => boolean; empty: string }) {
  const { list, refresh } = useAssetList();
  const items = list.filter(filter);
  return items.length ? <div className="flex flex-col">{items.map((a) => <AssetRow key={a.id} a={a} onDeleted={refresh} />)}</div> : <p className="px-2 py-4 text-xs text-dim">{empty}</p>;
}

function DropZone({ onImport }: { onImport: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void importFiles([...e.dataTransfer.files]); }}
      onClick={onImport}
      role="button"
      tabIndex={0}
      className={`mb-2 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${over ? 'border-primary bg-primary/10' : 'border-line hover:border-[#3a4558]'}`}
    >
      <Upload size={18} className="text-primary" />
      <span className="text-[12px] font-medium">Importar audio</span>
      <span className="text-[10px] text-dim">Arrastra archivos o haz clic · WAV, MP3, FLAC, OGG, M4A</span>
    </div>
  );
}

function SoundsTab() {
  const [busy, setBusy] = useState<DemoStyle | null>(null);
  const gen = async (s: DemoStyle) => {
    setBusy(s);
    try {
      const { asset } = await createDemoAsset(s);
      placeAsset(asset.id, asset.name, asset.duration, { at: 0 });
      useProject.getState().apply((d) => ({ ...d, bpm: DEMO_STYLES[s].bpm }));
      toast.success('Instrumental añadida', `${asset.name} · tempo ajustado a ${DEMO_STYLES[s].bpm} BPM`);
    } catch (e) {
      toast.error('No se pudo generar', (e as Error).message);
    } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] text-dim">Instrumentales sintetizadas en tu navegador. Libres de derechos: úsalas como quieras.</p>
      {(Object.keys(DEMO_STYLES) as DemoStyle[]).map((s) => (
        <div key={s} className="flex items-center gap-2 rounded-lg border border-line bg-surface/40 p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky/15 text-sky"><AudioWaveform size={17} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold">{DEMO_STYLES[s].name}</div>
            <div className="truncate text-[10px] text-dim">{DEMO_STYLES[s].description}</div>
          </div>
          <IconButton label="Generar y añadir" size="sm" tipPos="left" onClick={() => void gen(s)} disabled={!!busy} data-testid={`gen-${s}`}>{busy === s ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}</IconButton>
        </div>
      ))}
    </div>
  );
}

function ProjectsTab() {
  const [list, setList] = useState<ProjectMeta[]>([]);
  const current = useProject((s) => s.projectId);
  useEffect(() => { repository.listProjects().then(setList).catch(() => undefined); }, [current]);
  return (
    <div className="flex flex-col">
      {list.map((p) => (
        <button key={p.id} onClick={async () => { if (p.id === current) return; await saveProjectNow(); await openProject(p.id); }} className={`flex flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-surface ${p.id === current ? 'bg-surface' : ''}`}>
          <span className="w-full truncate text-[12px] font-medium">{p.name}{p.id === current && <span className="ml-1.5 text-[10px] text-primary">· abierto</span>}</span>
          <span className="text-[10px] text-dim">{formatRelativeDate(p.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}

function TracksTab() {
  const tracks = useProject((s) => s.doc.tracks);
  const sel = useUi((s) => s.selectedTrackId);
  return tracks.length ? (
    <div className="flex flex-col">
      {tracks.map((t) => (
        <div key={t.id} onClick={() => useUi.getState().set({ selectedTrackId: t.id, fxTarget: t.id })} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface ${t.id === sel ? 'bg-surface' : ''}`}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
          <span className="min-w-0 flex-1 truncate text-[12px]">{t.name}</span>
          <LetterToggle letter="M" label="Silenciar" active={t.mute} color="#F59E0B" onClick={() => updateTrack(t.id, { mute: !t.mute })} />
          <LetterToggle letter="S" label="Solo" active={t.solo} color="#38BDF8" onClick={() => updateTrack(t.id, { solo: !t.solo })} />
        </div>
      ))}
    </div>
  ) : <p className="px-2 py-4 text-xs text-dim">Todavía no hay pistas.</p>;
}

function EffectsTab() {
  const target = useUi((s) => s.fxTarget ?? s.selectedTrackId);
  const name = useProject((s) => (target === 'master' ? 'MASTER' : s.doc.tracks.find((t) => t.id === target)?.name));
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 pb-1 text-[11px] text-dim">{name ? <>Clic para añadir a <b className="text-muted">{name}</b></> : 'Selecciona una pista primero.'}</p>
      {EFFECT_ORDER.map((t) => (
        <button key={t} disabled={!name} onClick={() => { addEffect(target!, t); useUi.getState().set({ bottomPanel: 'fx' }); }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface disabled:opacity-40">
          <SlidersHorizontal size={13} className="text-primary" />{EFFECT_LABELS[t]}
        </button>
      ))}
      <div className="mt-2 rounded-md border border-dashed border-line px-2 py-1.5 text-[11px] text-dim">Corrección de tono: selecciona un clip de voz → pestaña Clip.</div>
    </div>
  );
}

function PresetsTab() {
  const target = useUi((s) => s.fxTarget ?? s.selectedTrackId);
  const name = useProject((s) => (target === 'master' ? 'MASTER' : s.doc.tracks.find((t) => t.id === target)?.name));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[11px] text-dim">{name ? <>Cadenas vocales para <b className="text-muted">{name}</b></> : 'Selecciona una pista primero.'}</p>
      {CHAIN_PRESETS.map((p) => (
        <button key={p.id} disabled={!name} data-testid={`preset-${p.id}`} onClick={async () => {
          const has = useProject.getState().doc.tracks.find((t) => t.id === target)?.effects.length;
          if (has && !(await confirmAction({ title: `Aplicar "${p.name}"`, message: 'Se sustituirá la cadena de efectos actual de la pista.', confirmLabel: 'Aplicar' }))) return;
          replaceChain(target!, p.build());
          useUi.getState().set({ bottomPanel: 'fx' });
          toast.success(`Preset "${p.name}" aplicado`);
        }} className="flex items-start gap-2 rounded-md border border-line bg-surface/40 px-2.5 py-2 text-left hover:border-[#3a4558] disabled:opacity-40">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
          <div><div className="text-[12px] font-semibold">{p.name}</div><div className="text-[10px] text-dim">{p.description}</div></div>
        </button>
      ))}
    </div>
  );
}

export function LibraryPanel({ onImport }: { onImport: () => void }) {
  const tab = useUi((s) => s.libraryTab);
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <aside className="flex w-[300px] shrink-0 border-r border-line bg-panel" data-testid="library">
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line py-2" aria-label="Biblioteca">
        {TABS.map((t) => (
          <IconButton key={t.id} label={t.label} tipPos="right" active={tab === t.id} onClick={() => useUi.getState().set({ libraryTab: t.id })}>{t.icon}</IconButton>
        ))}
        <div className="flex-1" />
        <IconButton label="Ocultar biblioteca" tipPos="right" onClick={() => useUi.getState().set({ libraryOpen: false })}><ChevronLeft size={16} /></IconButton>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grooves silk flex h-10 shrink-0 items-center border-b border-line px-3 text-[10px] text-muted">{current.label}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tab === 'files' && <><DropZone onImport={onImport} /><AssetList filter={() => true} empty="Aún no has importado audio." /></>}
          {tab === 'beats' && <><DropZone onImport={onImport} /><AssetList filter={(a) => a.kind !== 'recording'} empty="Importa una instrumental o genera una en la Biblioteca de sonidos." /><div className="mt-3"><Button size="sm" variant="ghost" icon={<Library size={13} />} onClick={() => useUi.getState().set({ libraryTab: 'sounds' })}>Ver instrumentales de ejemplo</Button></div></>}
          {tab === 'recordings' && <AssetList filter={(a) => a.kind === 'recording'} empty="Tus tomas grabadas aparecerán aquí." />}
          {tab === 'tracks' && <TracksTab />}
          {tab === 'effects' && <EffectsTab />}
          {tab === 'presets' && <PresetsTab />}
          {tab === 'projects' && <ProjectsTab />}
          {tab === 'sounds' && <SoundsTab />}
        </div>
      </div>
    </aside>
  );
}
