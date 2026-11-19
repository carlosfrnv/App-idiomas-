import { useEffect, useState } from 'react';
import { ChevronLeft, Cloud, CloudOff, Download, HelpCircle, Keyboard, Loader2, Redo2, Settings, Undo2, User, GraduationCap, FolderOpen, Check, AlertCircle, LogIn, LogOut } from 'lucide-react';
import { APP_NAME } from '@/config/app';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { useSettings } from '@/state/settingsStore';
import { Button, IconButton } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { useMenu } from '@/components/ui/Menu';
import { closeProject, saveProjectNow } from '@/app/projects';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cloudConfigured, signOut, useAuth } from '@/cloud/auth';

/** Símbolo de marca: una onda de sonido dentro de un círculo; la barra central lo atraviesa. */
export function BrandMark({ size = 26 }: { size?: number }) {
  const h = [70, 140, 230, 340, 230, 140, 70];
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="bm-ring" gradientUnits="userSpaceOnUse" x1="106" y1="106" x2="406" y2="406"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#38BDF8" /></linearGradient>
        <linearGradient id="bm-bar" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="412"><stop offset="0" stopColor="#A78BFA" /><stop offset="1" stopColor="#7C3AED" /></linearGradient>
      </defs>
      <rect x="8" y="8" width="496" height="496" rx="116" fill="#141922" stroke="#293241" strokeWidth="8" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="url(#bm-ring)" strokeWidth="30" />
      {h.map((v, i) => {
        const x = 256 + (i - 3) * 40;
        return i === 3
          ? <g key={i}><line x1={x} y1={256 - v / 2} x2={x} y2={256 + v / 2} stroke="#141922" strokeWidth="40" strokeLinecap="round" /><line x1={x} y1={256 - v / 2} x2={x} y2={256 + v / 2} stroke="#38BDF8" strokeWidth="24" strokeLinecap="round" /></g>
          : <line key={i} x1={x} y1={256 - v / 2} x2={x} y2={256 + v / 2} stroke="url(#bm-bar)" strokeWidth="24" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label={APP_NAME}>
      <BrandMark size={28} />
      {!compact && (
        <span className="text-[15px] font-extrabold tracking-[-0.01em] [font-stretch:125%]">
          {APP_NAME.replace(/\.com$/, '')}<span className="text-primary">{APP_NAME.endsWith('.com') ? '.com' : ''}</span>
        </span>
      )}
    </div>
  );
}

function SaveStatus() {
  const status = useProject((s) => s.saveStatus);
  const err = useProject((s) => s.saveError);
  const map = {
    saved: { icon: <Check size={13} />, text: 'Guardado', cls: 'text-ok' },
    saving: { icon: <Loader2 size={13} className="animate-spin" />, text: 'Guardando…', cls: 'text-muted' },
    unsaved: { icon: <Cloud size={13} />, text: 'Cambios sin guardar', cls: 'text-warn' },
    error: { icon: <AlertCircle size={13} />, text: 'Error al guardar', cls: 'text-rec' },
    idle: { icon: <CloudOff size={13} />, text: '', cls: 'text-dim' },
  } as const;
  const m = map[status];
  return (
    <button data-testid="save-status" data-status={status} onClick={() => void saveProjectNow()} data-tip={err ?? 'Guardado local en este navegador · Ctrl+S'} className={`hidden items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-medium md:flex ${m.cls} hover:bg-surface`}>
      {m.icon}<span>{m.text}</span>
    </button>
  );
}

export function TopBar() {
  const name = useProject((s) => s.name);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const bpm = useProject((s) => s.doc.bpm);
  const ts = useProject((s) => s.doc.timeSignature);
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const profile = useMenu();

  const user = useAuth((s) => s.user);
  const sync = useAuth((s) => s.sync);
  const openProfile = (el: HTMLElement) => profile.openFrom(el, [
    ...(cloudConfigured
      ? user
        ? [{ header: user.email }, { label: 'Perfil y nube', icon: <User size={14} />, onSelect: () => useAuth.getState().set({ profileOpen: true }) }, { label: 'Cerrar sesión', icon: <LogOut size={14} />, onSelect: () => void signOut() }, 'separator' as const]
        : [{ header: 'Sin sesión · proyectos sólo en este navegador' }, { label: 'Iniciar sesión', icon: <LogIn size={14} />, onSelect: () => useAuth.getState().set({ dialog: 'login' }) }, { label: 'Crear cuenta', icon: <User size={14} />, onSelect: () => useAuth.getState().set({ dialog: 'register' }) }, 'separator' as const]
      : [{ header: 'Modo local · sin cuenta' }]),
    { label: 'Mis proyectos', icon: <FolderOpen size={14} />, onSelect: () => void closeProject() },
    { label: 'Tutorial inicial', icon: <GraduationCap size={14} />, onSelect: () => useSettings.getState().set({ tutorialDone: false }) },
    { label: 'Atajos de teclado', icon: <Keyboard size={14} />, shortcut: '?', onSelect: () => useUi.getState().set({ helpOpen: true }) },
  ]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#0B0E14] bg-panel px-2 shadow-[inset_0_-1px_0_rgb(255_255_255/0.03)] md:gap-3 md:px-3">
      <IconButton label="Volver a mis proyectos" onClick={() => void closeProject()} data-testid="back-projects"><ChevronLeft size={18} /></IconButton>
      <Logo compact={isMobile} />
      <div className="mx-1 hidden h-5 w-px bg-line md:block" />
      <input
        aria-label="Nombre del proyecto"
        data-testid="project-name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const v = draft.trim() || 'Proyecto sin título'; setDraft(v); if (v !== name) useProject.getState().rename(v.slice(0, 80)); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') setDraft(name); (e.target as HTMLInputElement).blur(); } }}
        className="h-8 min-w-0 max-w-[280px] flex-1 truncate rounded-sm border border-transparent bg-transparent px-2 text-[14px] font-semibold [font-stretch:112%] outline-none hover:border-line focus:border-primary focus:bg-bg"
      />
      <SaveStatus />
      <div className="flex-1" />
      {!isMobile && (
        <div className="flex items-center gap-0.5">
          <IconButton label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={() => useProject.getState().undo()} data-testid="undo"><Undo2 size={16} /></IconButton>
          <IconButton label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useProject.getState().redo()} data-testid="redo"><Redo2 size={16} /></IconButton>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <NumberField label="Tempo (BPM)" value={bpm} min={40} max={240} step={1} suffix="BPM" width={44} onChange={(v) => useProject.getState().apply((d) => ({ ...d, bpm: v }), { key: 'bpm' })} />
        {!isMobile && (
          <select
            aria-label="Compás"
            data-tip="Compás"
            value={`${ts[0]}/${ts[1]}`}
            onChange={(e) => { const [a, b] = e.target.value.split('/').map(Number); useProject.getState().apply((d) => ({ ...d, timeSignature: [a, b] })); }}
            className="h-8 rounded-md border border-line bg-bg/70 px-1.5 font-mono text-[13px] font-semibold outline-none focus:border-primary"
          >
            {['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>
      {!isMobile && <>
        <IconButton label="Ayuda y atajos (?)" onClick={() => useUi.getState().set({ helpOpen: true })}><HelpCircle size={17} /></IconButton>
        <IconButton label="Configuración" onClick={() => useUi.getState().set({ settingsOpen: true })} data-testid="open-settings"><Settings size={17} /></IconButton>
      </>}
      <button aria-label="Perfil" data-tip={user ? `${user.name} · ${sync === 'error' ? 'error de sincronización' : sync === 'syncing' ? 'sincronizando…' : 'en la nube'}` : 'Perfil'} onClick={(e) => openProfile(e.currentTarget)} className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-[#0B0E14] bg-gradient-to-br from-primary to-sky text-[12px] font-extrabold uppercase text-white [font-stretch:125%]" data-testid="profile-button">
        {user ? user.name.slice(0, 1) : <User size={15} />}
        {user && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${sync === 'error' ? 'bg-rec' : sync === 'syncing' ? 'bg-warn' : 'bg-ok'}`} />}
      </button>
      <Button variant="primary" icon={<Download size={15} />} onClick={() => useUi.getState().set({ exportOpen: true })} data-testid="open-export">{isMobile ? '' : 'Exportar'}</Button>
      {profile.element}
    </header>
  );
}
