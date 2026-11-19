import { useEffect, useState } from 'react';
import { Headphones, Mic, RefreshCw, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Meter } from '@/components/ui/Meter';
import { useUi } from '@/state/uiStore';
import { useSettings } from '@/state/settingsStore';
import { openInput, recorder, totalLatency, useRecState } from '@/app/recording';
import { Recorder, recordingSupported } from '@/audio/recording/Recorder';
import { engine } from '@/audio/engine/AudioEngine';
import { formatDb } from '@/lib/audioMath';
import { useFrame } from '@/hooks/useFrame';

function LatencyReadout() {
  const [txt, setTxt] = useState('');
  useFrame((now) => { if (Math.floor(now / 500) % 2 === 0) setTxt(`${(totalLatency() * 1000).toFixed(1)} ms`); });
  return <span className="font-mono text-fg">{txt}</span>;
}

export function RecordSetupDialog() {
  const open = useUi((s) => s.recordSetupOpen);
  const { inputDeviceId, inputGain, monitor, latencyOffsetMs, autoLatency, set } = useSettings();
  const { inputOpen, error, label } = useRecState();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const supported = recordingSupported();

  const refresh = async () => setDevices(await Recorder.listInputs());
  useEffect(() => {
    if (!open) return;
    void refresh();
    const h = () => void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', h);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', h);
  }, [open, inputOpen]);

  const info = engine.hasContext ? engine.latencyInfo() : null;

  return (
    <Modal open={open} onClose={() => useUi.getState().set({ recordSetupOpen: false })} title="Entrada de grabación" subtitle="Micrófono, nivel de entrada y compensación de latencia" icon={<Mic size={18} />} width={560}
      footer={<Button variant="primary" onClick={() => useUi.getState().set({ recordSetupOpen: false })}>Listo</Button>}>
      <div className="flex flex-col gap-5">
        {!supported && <div className="flex gap-2 rounded-lg border border-rec/30 bg-rec/10 p-3 text-xs text-rec"><AlertTriangle size={15} /> Tu navegador no permite grabar audio. Usa una versión reciente de Chrome, Edge, Firefox o Safari.</div>}
        {!useSettings.getState().headphonesTipDismissed && (
          <div className="flex items-start gap-3 rounded-lg border border-sky/30 bg-sky/10 p-3">
            <Headphones size={18} className="mt-0.5 shrink-0 text-sky" />
            <div className="flex-1 text-xs text-muted"><b className="text-fg">Usa auriculares.</b> Si la instrumental sale por los altavoces, el micrófono la captura y se mezcla con tu voz.</div>
            <button className="text-[11px] text-dim hover:text-fg" onClick={() => set({ headphonesTipDismissed: true })}>Entendido</button>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="label-xs">Micrófono</span>
          <div className="flex gap-2">
            <select aria-label="Dispositivo de entrada" data-testid="input-device" value={inputDeviceId ?? ''} onChange={(e) => { set({ inputDeviceId: e.target.value || null }); void openInput(e.target.value || null); }} className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-primary">
              <option value="">Predeterminado del sistema</option>
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Micrófono ${i + 1} (concede permiso para ver el nombre)`}</option>)}
            </select>
            <Button icon={<RefreshCw size={14} />} onClick={() => void openInput()} data-testid="open-input">{inputOpen ? 'Reabrir' : 'Activar'}</Button>
          </div>
          {inputOpen && <span className="text-[11px] text-ok">● Activo: {label}</span>}
          {error && <span className="text-[11px] text-rec" data-testid="input-error">{error}</span>}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><span className="label-xs">Nivel de entrada</span><span className="font-mono text-[11px] text-muted">Ganancia {formatDb(inputGain)} dB</span></div>
          <Meter read={() => (inputOpen ? [recorder.readLevel()] : null)} channels={1} orientation="horizontal" width={510} height={14} />
          <Slider label="Ganancia de entrada" value={inputGain} min={0} max={4} step={0.01} onChange={(v) => { set({ inputGain: v }); recorder.setGain(v); }} />
          <p className="text-[11px] text-dim">Canta lo más fuerte que vayas a cantar: el medidor debe quedarse en la zona verde/ámbar sin llegar al rojo. Ganancia digital (no sustituye a la del interfaz/micro).</p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
          <div><div className="text-[13px] font-medium">Monitorizar entrada</div><div className="text-[11px] text-dim">Escuchar el micrófono mientras grabas (sólo con auriculares; puede haber retardo).</div></div>
          <Switch label="Monitorizar entrada" checked={monitor} onChange={(v) => { set({ monitor: v }); recorder.setMonitor(v); }} />
        </label>
        <div className="flex flex-col gap-2 rounded-lg border border-line px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium">Compensación de latencia</div>
            <div className="text-[11px] text-muted">Total aplicada: <LatencyReadout /></div>
          </div>
          <label className="flex items-center justify-between text-xs text-muted">
            <span>Usar latencia informada por el navegador {info && <span className="font-mono text-dim">(salida {((info.base + info.output) * 1000).toFixed(1)} ms · entrada {(recorder.inputLatency() * 1000).toFixed(1)} ms · {info.sampleRate} Hz)</span>}</span>
            <Switch label="Latencia automática" checked={autoLatency} onChange={(v) => set({ autoLatency: v })} size="sm" />
          </label>
          <div className="flex items-center gap-3">
            <span className="w-28 text-xs text-muted">Ajuste manual</span>
            <Slider label="Ajuste manual de latencia" value={latencyOffsetMs} min={-100} max={300} step={1} onChange={(v) => set({ latencyOffsetMs: v })} />
            <span className="w-16 text-right font-mono text-xs">{latencyOffsetMs} ms</span>
          </div>
          <p className="text-[11px] text-dim">Si tus tomas suenan retrasadas respecto al beat, aumenta el ajuste. Prueba: graba palmas siguiendo el metrónomo y alinea. La latencia nunca es cero en un navegador; se compensa.</p>
        </div>
      </div>
    </Modal>
  );
}
