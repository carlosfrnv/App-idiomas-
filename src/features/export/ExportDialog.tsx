import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileAudio } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUi } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { projectEnd } from '@/state/docOps';
import { downloadBlob, exportMixWav } from '@/app/exporter';
import { formatBytes, formatDuration } from '@/lib/format';
import { toast } from '@/state/toastStore';
import type { WavBitDepth } from '@/audio/export/wav';

type Phase = 'idle' | 'rendering' | 'done' | 'error';

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const name = useProject((s) => s.name);
  const end = useProject((s) => projectEnd(s.doc));
  const [fileName, setFileName] = useState(name);
  const [sr, setSr] = useState<44100 | 48000 | 96000>(48000);
  const [bits, setBits] = useState<WavBitDepth>(24);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ size: number; duration: number; fileName: string } | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { if (open) { setFileName(name); setPhase('idle'); setProgress(0); setResult(null); } }, [open, name]);

  const close = () => { abort.current?.abort(); useUi.getState().set({ exportOpen: false }); };

  const run = async () => {
    setPhase('rendering'); setProgress(0); setError('');
    abort.current = new AbortController();
    try {
      const r = await exportMixWav({ fileName, sampleRate: sr, bitDepth: bits, onProgress: setProgress, signal: abort.current.signal });
      downloadBlob(r.blob, r.fileName);
      setResult({ size: r.blob.size, duration: r.duration, fileName: r.fileName });
      setPhase('done');
      toast.success('Exportación completada', r.fileName);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setPhase('idle'); return; }
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const est = Math.round(end * sr * 2 * (bits / 8));
  const opt = (active: boolean) => `h-9 rounded-md border px-3 text-xs font-medium ${active ? 'border-primary bg-primary/15 text-fg' : 'border-line text-muted hover:text-fg'}`;

  return (
    <Modal open={open} onClose={close} title="Exportar canción" subtitle="Renderiza la mezcla completa con todos los efectos, volúmenes y panoramas" icon={<FileAudio size={18} />} width={520}
      footer={phase === 'done'
        ? <><Button variant="ghost" onClick={close}>Cerrar</Button><Button variant="primary" icon={<Download size={14} />} onClick={() => void run()}>Exportar de nuevo</Button></>
        : <><Button variant="ghost" onClick={close}>{phase === 'rendering' ? 'Cancelar' : 'Cerrar'}</Button><Button variant="primary" icon={<Download size={14} />} disabled={phase === 'rendering' || end <= 0} onClick={() => void run()} data-testid="export-run">Exportar WAV</Button></>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Nombre del archivo</span>
          <div className="flex items-center rounded-md border border-line bg-bg focus-within:border-primary">
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" aria-label="Nombre del archivo" />
            <span className="pr-3 font-mono text-xs text-dim">.wav</span>
          </div>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="label-xs">Formato</span>
          <div className="flex gap-2">
            <button className={opt(true)}>WAV</button>
            <button className={`${opt(false)} cursor-not-allowed opacity-50`} disabled data-tip="Requiere codificador MP3 con licencia compatible — previsto en Fase 4">MP3 · próximamente</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Frecuencia de muestreo</span>
            <div className="flex gap-1.5">{([44100, 48000, 96000] as const).map((v) => <button key={v} className={opt(sr === v)} onClick={() => setSr(v)}>{v / 1000} kHz</button>)}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Calidad</span>
            <div className="flex gap-1.5">{([16, 24, 32] as const).map((v) => <button key={v} className={opt(bits === v)} onClick={() => setBits(v)}>{v === 32 ? '32 float' : `${v}-bit`}</button>)}</div>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-bg/50 px-3 py-2.5 text-xs text-muted">
          Duración: <b className="text-fg">{formatDuration(end)}</b> · Tamaño estimado: <b className="text-fg">{formatBytes(est)}</b> · Estéreo
          {bits === 16 && <span className="block text-dim">16-bit incluye dither TPDF.</span>}
          {end <= 0 && <span className="mt-1 block text-warn">El proyecto está vacío: añade audio antes de exportar.</span>}
        </div>
        {phase === 'rendering' && (
          <div className="flex flex-col gap-1.5" data-testid="export-progress">
            <div className="flex justify-between text-xs"><span>Renderizando mezcla…</span><span className="font-mono">{Math.round(progress * 100)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div>
          </div>
        )}
        {phase === 'done' && result && (
          <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2.5 text-xs" data-testid="export-done">
            <CheckCircle2 size={16} className="text-ok" />
            <span><b>{result.fileName}</b> · {formatBytes(result.size)} · {formatDuration(result.duration)} — descargado.</span>
          </div>
        )}
        {phase === 'error' && <div className="rounded-lg border border-rec/30 bg-rec/10 px-3 py-2.5 text-xs text-rec">No se pudo exportar: {error}</div>}
      </div>
    </Modal>
  );
}
