import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, MoreVertical, Pencil, Plus, Sparkles, Trash2, Mic, SlidersVertical, Download } from 'lucide-react';
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
    <svg viewBox="0 0 96 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      {n ? data!.map((v, i) => { const h = Math.max(1, v * 34); return <rect key={i} x={i * 2} y={20 - h / 2} width={1.3} height={h} rx={0.6} fill={color} opacity={0.85} />; })
        : <line x1="0" x2="96" y1="20" y2="20" stroke="#293241" strokeDasharray="2 2" />}
    </svg>
  );
}

function ProjectCard({ p, onChanged }: { p: ProjectMeta; onChanged: () => void }) {
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
    <div data-testid="project-card" className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-[#3a4558]">
      <button onClick={open} className="h-24 bg-[#0F131B] px-3 py-2" aria-label={`Abrir ${p.name}`}><Thumb data={p.thumbnail} /></button>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input autoFocus defaultValue={p.name} aria-label="Nuevo nombre" className="h-7 w-full rounded border border-primary bg-bg px-1.5 text-sm outline-none"
              onBlur={async (e) => { const v = e.currentTarget.value.trim(); setRenaming(false); if (v && v !== p.name) { const full = await repository.getProject(p.id); if (full) { await repository.saveProject({ ...full, name: v, updatedAt: Date.now() }); onChanged(); } } }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} />
          ) : (
            <button onClick={open} className="block w-full truncate text-left text-[14px] font-semibold">{p.name}</button>
          )}
          <div className="mt-0.5 text-[11px] text-dim">{formatRelativeDate(p.updatedAt)}{p.durationSec ? ` · ${formatDuration(p.durationSec)}` : ''}</div>
        </div>
        <IconButton label="Acciones del proyecto" size="sm" onClick={(e) => actions(e.currentTarget)}><MoreVertical size={15} /></IconButton>
      </div>
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

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
        <Logo />
        <div className="flex-1" />
        {cloudConfigured ? (user
          ? <button onClick={() => useAuth.getState().set({ profileOpen: true })} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs hover:bg-surface"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky text-[11px] font-bold uppercase text-white">{user.name.slice(0, 1)}</span>{user.name} · en la nube</button>
          : <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => useAuth.getState().set({ dialog: 'login' })} data-testid="login-button">Iniciar sesión</Button><Button size="sm" variant="primary" onClick={() => useAuth.getState().set({ dialog: 'register' })}>Crear cuenta</Button></div>)
          : <span className="hidden text-xs text-dim sm:block">Modo local · tus proyectos se guardan en este navegador</span>}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <section className="mb-10 grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Tu estudio, en el navegador.</h1>
            <p className="mt-3 max-w-lg text-[15px] text-muted">Importa tu instrumental, graba tu voz, edita las tomas, mezcla con EQ, compresión y efectos, y exporta tu canción. Sin instalar nada.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" icon={busy === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} onClick={() => void create(false)} disabled={!!busy} data-testid="new-project">Nuevo proyecto</Button>
              <Button variant="subtle" size="lg" icon={busy === 'demo' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} onClick={() => void create(true)} disabled={!!busy} data-testid="demo-project">Probar con un beat de ejemplo</Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{ i: <Mic size={18} />, t: 'Graba', d: 'Sobre tu beat, con compensación de latencia' }, { i: <SlidersVertical size={18} />, t: 'Mezcla', d: 'EQ, compresor, reverb, delay y presets vocales' }, { i: <Download size={18} />, t: 'Exporta', d: 'WAV de alta calidad, 16/24/32-bit' }].map((x) => (
              <div key={x.t} className="rounded-xl border border-line bg-panel p-3">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">{x.i}</div>
                <div className="text-[13px] font-semibold">{x.t}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-dim">{x.d}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Mis proyectos</h2>
            {list && list.length > 0 && <span className="text-xs text-dim">{list.length} proyecto{list.length === 1 ? '' : 's'}</span>}
          </div>
          {list === null ? (
            <div className="flex items-center gap-2 text-sm text-dim"><Loader2 size={15} className="animate-spin" /> Cargando…</div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">Aún no tienes proyectos. Crea uno nuevo o prueba la demo para empezar.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((p) => <ProjectCard key={p.id} p={p} onChanged={refresh} />)}
            </div>
          )}
        </section>
        <footer className="mt-16 text-center text-[11px] text-dim">{APP_NAME} · Recomendado: Chrome, Edge o Firefox en ordenador, con auriculares.</footer>
      </main>
    </div>
  );
}
