import { useEffect, useState } from 'react';
import { Settings, HardDrive } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUi } from '@/state/uiStore';
import { engine } from '@/audio/engine/AudioEngine';
import { formatBytes } from '@/lib/format';
import { requestPersistentStorage } from '@/persistence/localRepository';
import { APP_NAME } from '@/config/app';

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open) return;
    navigator.storage?.estimate?.().then((e) => setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => undefined);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, [open]);
  const info = engine.hasContext ? engine.latencyInfo() : null;
  return (
    <Modal open={open} onClose={() => useUi.getState().set({ settingsOpen: false })} title="Configuración" icon={<Settings size={18} />} width={520}>
      <div className="flex flex-col gap-4 text-sm">
        <section className="flex flex-col gap-1.5">
          <span className="label-xs">Motor de audio</span>
          <div className="rounded-lg border border-line bg-bg/40 p-3 font-mono text-xs text-muted">
            {info ? <>Frecuencia: {info.sampleRate} Hz · Latencia base: {(info.base * 1000).toFixed(1)} ms · Salida: {(info.output * 1000).toFixed(1)} ms · Estado: {engine.ctx.state}</> : 'Se iniciará con la primera interacción.'}
          </div>
        </section>
        <section className="flex flex-col gap-1.5">
          <span className="label-xs">Almacenamiento local</span>
          <div className="flex items-center gap-3 rounded-lg border border-line bg-bg/40 p-3">
            <HardDrive size={18} className="text-sky" />
            <div className="flex-1 text-xs text-muted">
              {est ? <>Usado {formatBytes(est.usage)} de {formatBytes(est.quota)} disponibles en este navegador.</> : 'Calculando…'}
              <div className="mt-0.5">{persisted ? <span className="text-ok">Almacenamiento persistente concedido.</span> : <span className="text-warn">El navegador podría liberar espacio si escasea.</span>}</div>
            </div>
            {!persisted && <Button size="sm" onClick={async () => setPersisted(await requestPersistentStorage())}>Solicitar</Button>}
          </div>
          <p className="text-[11px] text-dim">Tus proyectos y grabaciones se guardan sólo en este navegador. La sincronización en la nube llegará en la Fase 3.</p>
        </section>
        <section className="text-[11px] text-dim">{APP_NAME} · versión 0.1.0</section>
      </div>
    </Modal>
  );
}
