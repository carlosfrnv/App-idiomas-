import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useProject } from '@/state/projectStore';
import { useSettings } from '@/state/settingsStore';
import { engine } from '@/audio/engine/AudioEngine';
import { openProject, startAutosave } from '@/app/projects';
import { Studio } from '@/features/Studio';
import { ProjectsScreen } from '@/features/projects/ProjectsScreen';
import { Toasts } from '@/components/ui/Toasts';
import { ConfirmHost } from '@/components/ui/Confirm';
import { APP_NAME } from '@/config/app';

/** Conecta el motor de audio al documento: cada cambio del store se reconcilia en el grafo. */
function useEngineBinding() {
  useEffect(() => {
    engine.sync(useProject.getState().doc, true);
    return useProject.subscribe((s, prev) => { if (s.doc !== prev.doc) engine.sync(s.doc); });
  }, []);
  // Reanudar el AudioContext en el primer gesto (política de autoplay).
  useEffect(() => {
    const resume = () => { void engine.resume(); };
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });
    return () => { window.removeEventListener('pointerdown', resume, { capture: true }); window.removeEventListener('keydown', resume, { capture: true }); };
  }, []);
}

export function App() {
  useEngineBinding();
  const projectId = useProject((s) => s.projectId);
  const [booting, setBooting] = useState(true);

  useEffect(() => startAutosave(), []);
  useEffect(() => { document.title = projectId ? `${useProject.getState().name} · ${APP_NAME}` : APP_NAME; }, [projectId]);

  // recuperar el último proyecto abierto (tras cerrar o recargar el navegador)
  useEffect(() => {
    const last = useSettings.getState().lastProjectId;
    if (!last) { setBooting(false); return; }
    openProject(last).catch(() => undefined).finally(() => setBooting(false));
  }, []);

  if (typeof window !== 'undefined' && !('AudioContext' in window) && !('webkitAudioContext' in window)) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-muted">Tu navegador no es compatible con Web Audio API. Usa una versión reciente de Chrome, Edge, Firefox o Safari.</div>;
  }

  return (
    <>
      {booting ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Recuperando tu sesión…</div>
      ) : projectId ? <Studio /> : <ProjectsScreen />}
      <Toasts />
      <ConfirmHost />
    </>
  );
}
