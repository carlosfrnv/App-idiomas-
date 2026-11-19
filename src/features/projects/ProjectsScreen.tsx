import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, MoreVertical, Pencil, Plus, Sparkles, Trash2, Mic, SlidersVertical, Download, PenLine } from 'lucide-react';
import { repository } from '@/persistence/localRepository';
import type { ProjectMeta } from '@/types/project';
import { createProject, openProject } from '@/app/projects';
import { formatDuration, formatRelativeDate } from '@/lib/format';
import { Button, IconButton } from '@/components/ui/Button';
import { useMenu } from '@/components/ui/Menu';
import { confirmAction } from '@/components/ui/Confirm';
import { Logo } from '@/features/topbar/TopBar';
import { APP_NAME } from '@/config/app';
import { toast } from '@/state/toastStore';
import { engine } from '@/audio/engine/AudioEngine';
import { cloudConfigured, useAuth } from '@/cloud/auth';

function Thumb({ data, color = '#8B5CF6' }: { data?: number[]; color?: string }) {
  const n = data?.length ?? 0;
  return (
    <svg viewBox="0 0 96 24" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      {n ? data!.map((v, i) => { const h = Math.max(1, v * 22); return <rect key={i} x={i * 2} y={12 - h / 2} width={1.2} height={h} fill={color} />; })
        : <line x1="0" x2="96" y1="12" y2="12" stroke="#293241" strokeDasharray="2 2" />}
    </svg>
  );
}

/** Franja de onda decorativa (determinista) con cabezal animado. */
function HeroWave() {
  const bars = Array.from({ length: 160 }, (_, i) => {
    const t = i / 160;
    const env = Math.pow(Math.sin(Math.PI * t), 0.6);
    const v = env * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.31) + 0.4 * Math.sin(i * 0.11)));
    return Math.min(1, v);
  });
  return (
    <div className="relative h-28 w-full overflow-hidden border-y border-line bg-[#0D1118]" aria-hidden>
      <svg viewBox="0 0 640 112" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs><linearGradient id="hw-g" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#38BDF8" /></linearGradient></defs>
        {bars.map((v, i) => <rect key={i} x={i * 4} y={56 - v * 50} width={2.4} height={Math.max(1, v * 100)} fill="url(#hw-g)" opacity={0.9} />)}
      </svg>
      <div className="absolute inset-y-0 w-[2px] bg-fg shadow-[0_0_14px_rgba(245,247,250,0.7)] [animation:hero-scan_7s_linear_infinite]" />
      <div className="absolute inset-x-0 top-0 flex justify-between px-3 pt-1.5 font-mono text-[9px] text-dim">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => <span key={b}>{b}</span>)}</div>
    </div>
  );
}

function ProjectRow({ p, index, onChanged }: { p: ProjectMeta; index: number; onChanged: () => void }) {
  const menu = useMenu();
  const [renaming, setRenaming] = useState(false);
  const open = () => { void engine.resume(); void openProject(p.id); };
  const actions = (el: HTMLElement) => menu.openFrom(el, [
    { label: 'Abrir', onSelect: open },
    { label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setRenaming(true) },
    { label: 'Duplicar', icon: <Copy size={14} />, onSelect: async () => { await repository.duplicateProject(p.id, `${p.name} (copia)`); onChanged(); toast.success('Proyecto duplicado'); } },
    'separator',
    { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onSelect: async () => {
      if (!(await confirmAction({ title: `¿Eliminar "${p.name}"?`, message: 'Se borrarán el proyecto y sus grabaciones de este navegador. Esta acción no se puede deshacer.', confirmLabel: 'Eliminar proyecto', danger: true }))) return;
      await repository.deleteProject(p.id); onChanged(); toast.success('Proyecto eliminado');
    } },
  ]);
  return (
    <div data-testid="project-card" className="group grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-line-soft px-2 py-3 transition-colors hover:bg-white/[0.025] md:grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_90px_120px_auto]">
      <span className="font-mono text-[13px] text-dim group-hover:text-primary">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0">
        {renaming ? (
          <input autoFocus defaultValue={p.name} aria-label="Nuevo nombre" className="h-8 w-full rounded-sm border border-primary bg-bg px-2 text-sm outline-none"
            onBlur={async (e) => { const v = e.currentTarget.value.trim(); setRenaming(false); if (v && v !== p.name) { const full = await repository.getProject(p.id); if (full) { await repository.saveProject({ ...full, name: v, updatedAt: Date.now() }); onChanged(); } } }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <button onClick={open} aria-label={`Abrir ${p.name}`} className="block w-full truncate text-left text-[16px] font-bold [font-stretch:112%] hover:text-primary">{p.name}</button>
        )}
      </div>
      <button onClick={open} tabIndex={-1} className="hidden h-7 md:block" aria-hidden><Thumb data={p.thumbnail} /></button>
      <span className="hidden font-mono text-[11px] text-muted md:block">{p.durationSec ? formatDuration(p.durationSec) : '—'}</span>
      <span className="hidden text-[11px] text-dim md:block">{formatRelativeDate(p.updatedAt)}</span>
      <IconButton label="Acciones del proyecto" size="sm" onClick={(e) => actions(e.currentTarget)}><MoreVertical size={15} /></IconButton>
      {menu.element}
    </div>
  );
}

export function ProjectsScreen() {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [busy, setBusy] = useState<'new' | 'demo' | null>(null);
  const refresh = useCallback(() => { repository.listProjects().then(setList).catch((e) => { setList([]); toast.error('No se pudo leer el almacenamiento', (e as Error).message); }); }, []);
  const user = useAuth((s) => s.user);
  useEffect(refresh, [refresh, user]);

  const create = async (demo: boolean) => {
    setBusy(demo ? 'demo' : 'new');
    try {
      await engine.resume();
      await createProject(demo ? 'Demo · Trap 140' : 'Proyecto sin título', demo ? { demo: 'trap' } : {});
    } catch (e) {
      toast.error('No se pudo crear el proyecto', (e as Error).message);
    } finally { setBusy(null); }
  };

  const FEATURES = [
    { i: <Mic size={16} />, t: 'Graba', d: 'Sobre tu beat, con compensación de latencia y tomas ilimitadas.' },
    { i: <SlidersVertical size={16} />, t: 'Mezcla', d: 'EQ, compresor, reverb, delay, automatización y afinación.' },
    { i: <PenLine size={16} />, t: 'Escribe', d: 'Letras con contador de sílabas, rimas y asistente IA.' },
    { i: <Download size={16} />, t: 'Publica', d: 'WAV o MP3, la canción entera o pista por pista.' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[#0B0E14] bg-bg/90 px-4 backdrop-blur md:px-8">
        <Logo />
        <span className="ml-2 hidden items-center gap-1.5 font-mono text-[10px] text-dim md:flex"><span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_6px_#22C55E]" />{user ? 'Sincronizado' : 'Motor de audio listo'}</span>
        <div className="flex-1" />
        {cloudConfigured ? (user
          ? <button onClick={() => useAuth.getState().set({ profileOpen: true })} className="hw flex items-center gap-2 rounded-sm py-1 pl-1 pr-3 text-xs"><span className="flex h-6 w-6 items-center justify-center rounded-sm bg-gradient-to-br from-primary to-sky text-[11px] font-extrabold uppercase text-white">{user.name.slice(0, 1)}</span>{user.name} · en la nube</button>
          : <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => useAuth.getState().set({ dialog: 'login' })} data-testid="login-button">Iniciar sesión</Button><Button size="sm" variant="primary" onClick={() => useAuth.getState().set({ dialog: 'register' })}>Crear cuenta</Button></div>)
          : <span className="hidden text-xs text-dim sm:block">Modo local · tus proyectos se guardan en este navegador</span>}
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-10 pt-10 md:grid-cols-12 md:px-8 md:pt-16">
        <h1 className="display md:col-span-8 text-[clamp(44px,8.5vw,118px)] uppercase">
          Graba.<br />Mezcla.<br /><span className="bg-gradient-to-r from-primary to-sky bg-clip-text text-transparent">Publica.</span>
        </h1>
        <div className="flex flex-col justify-end gap-6 md:col-span-4">
          <p className="text-[15px] leading-relaxed text-muted">Un estudio de grabación completo en el navegador. Sin instalar nada, sin cables raros: tu beat, tu voz y tu canción terminada.</p>
          <div className="flex flex-col gap-2.5">
            <Button variant="primary" size="lg" icon={busy === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} onClick={() => void create(false)} disabled={!!busy} data-testid="new-project">Nuevo proyecto</Button>
            <Button variant="subtle" size="lg" icon={busy === 'demo' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} onClick={() => void create(true)} disabled={!!busy} data-testid="demo-project">Probar con un beat de ejemplo</Button>
          </div>
        </div>
      </section>

      <HeroWave />

      <section className="mx-auto grid max-w-7xl grid-cols-2 border-b border-line md:grid-cols-4">
        {FEATURES.map((f, i) => (
          <div key={f.t} className="flex flex-col gap-2 border-line px-4 py-6 md:px-8 [&:not(:last-child)]:border-r">
            <div className="flex items-center gap-2 text-primary"><span className="font-mono text-[11px] text-dim">0{i + 1}</span>{f.i}</div>
            <div className="silk text-[13px] text-fg">{f.t}</div>
            <p className="text-[12px] leading-snug text-dim">{f.d}</p>
          </div>
        ))}
      </section>

      <main className="mx-auto max-w-7xl px-4 py-10 md:px-8">
        <div className="mb-3 flex items-end justify-between border-b border-line pb-3">
          <h2 className="display text-[28px] uppercase">Mis proyectos</h2>
          {list && list.length > 0 && <span className="font-mono text-[11px] text-dim">{String(list.length).padStart(2, '0')} pistas</span>}
        </div>
        <div className={`hidden grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_90px_120px_auto] gap-4 px-2 pb-2 ${list?.length ? 'md:grid' : ''}`}>
          {['#', 'Título', 'Forma de onda', 'Duración', 'Modificado', ''].map((h) => <span key={h} className="label-xs">{h}</span>)}
        </div>
        {list === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-dim"><Loader2 size={15} className="animate-spin" /> Cargando…</div>
        ) : list.length === 0 ? (
          <div className="border border-dashed border-line px-6 py-12 text-center text-sm text-muted">Aún no tienes proyectos. Crea uno nuevo o prueba la demo para empezar.</div>
        ) : (
          <div>{list.map((p, i) => <ProjectRow key={p.id} p={p} index={i} onChanged={refresh} />)}</div>
        )}
        <footer className="mt-16 flex justify-between border-t border-line pt-4 font-mono text-[10px] text-dim"><span>{APP_NAME}</span><span>Chrome · Edge · Firefox — con auriculares</span></footer>
      </main>
    </div>
  );
}
