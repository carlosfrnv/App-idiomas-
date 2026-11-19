import { useEffect, useState } from 'react';
import { ChevronLeft, Cloud, CloudOff, Download, HelpCircle, Keyboard, Loader2, Redo2, Settings, Undo2, User, GraduationCap, FolderOpen, Check, AlertCircle } from 'lucide-react';
import { APP_NAME } from '@/config/app';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { useSettings } from '@/state/settingsStore';
import { Button, IconButton } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { useMenu } from '@/components/ui/Menu';
import { closeProject, saveProjectNow } from '@/app/projects';
import { useIsMobile } from '@/hooks/useMediaQuery';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label={APP_NAME}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1C2330" />
        <g fill="#8B5CF6"><rect x="6" y="13" width="3" height="6" rx="1.5" /><rect x="11" y="9" width="3" height="14" rx="1.5" /><rect x="16" y="6" width="3" height="20" rx="1.5" fill="#38BDF8" /><rect x="21" y="11" width="3" height="10" rx="1.5" /></g>
      </svg>
      {!compact && <span className="text-[13px] font-bold tracking-[0.14em]">{APP_NAME}</span>}
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

  const openProfile = (el: HTMLElement) => profile.openFrom(el, [
    { header: 'Modo local · sin cuenta' },
    { label: 'Mis proyectos', icon: <FolderOpen size={14} />, onSelect: () => void closeProject() },
    { label: 'Tutorial inicial', icon: <GraduationCap size={14} />, onSelect: () => useSettings.getState().set({ tutorialDone: false }) },
    { label: 'Atajos de teclado', icon: <Keyboard size={14} />, shortcut: '?', onSelect: () => useUi.getState().set({ helpOpen: true }) },
    'separator',
    { label: 'Iniciar sesión · disponible en Fase 3', icon: <User size={14} />, disabled: true, onSelect: () => undefined },
  ]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 md:gap-3 md:px-3">
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
        className="h-8 min-w-0 max-w-[260px] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 text-[14px] font-semibold outline-none hover:border-line focus:border-primary focus:bg-bg"
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
      <button aria-label="Perfil" data-tip="Perfil" onClick={(e) => openProfile(e.currentTarget)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky text-[12px] font-bold text-white">
        <User size={15} />
      </button>
      <Button variant="primary" icon={<Download size={15} />} onClick={() => useUi.getState().set({ exportOpen: true })} data-testid="open-export">{isMobile ? '' : 'Exportar'}</Button>
      {profile.element}
    </header>
  );
}
