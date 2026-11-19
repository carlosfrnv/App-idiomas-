import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileAudio } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUi } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { projectEnd } from '@/state/docOps';
import { downloadBlob, exportProject, type ExportFormat, type ExportRange } from '@/app/exporter';
import { formatBytes, formatDuration } from '@/lib/format';
import { toast } from '@/state/toastStore';
import type { WavBitDepth } from '@/audio/export/wav';
import type { Mp3Bitrate } from '@/audio/export/mp3';

type Phase = 'idle' | 'rendering' | 'done' | 'error';

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const name = useProject((s) => s.name);
  const end = useProject((s) => projectEnd(s.doc));
  const loop = useProject((s) => s.doc.loop);
  const trackCount = useProject((s) => s.doc.tracks.filter((t) => s.doc.clips.some((c) => c.trackId === t.id)).length);
  const [fileName, setFileName] = useState(name);
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [sr, setSr] = useState<44100 | 48000 | 96000>(48000);
  const [bits, setBits] = useState<WavBitDepth>(24);
  const [kbps, setKbps] = useState<Mp3Bitrate>(320);
  const [range, setRange] = useState<ExportRange>('all');
  const [stems, setStems] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ f: 0, label: '' });
  const [result, setResult] = useState<{ size: number; duration: number; fileName: string; files: number } | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { if (open) { setFileName(name); setPhase('idle'); setResult(null); } }, [open, name]);
  useEffect(() => { if (format === 'mp3' && sr === 96000) setSr(48000); }, [format, sr]);

  const close = () => { abort.current?.abort(); useUi.getState().set({ exportOpen: false }); };
  const run = async () => {
    setPhase('rendering'); setProgress({ f: 0, label: 'Preparando…' }); setError('');
    abort.current = new AbortController();
    try {
      const r = await exportProject({ fileName, format, sampleRate: sr, bitDepth: bits, kbps, range, stems, signal: abort.current.signal, onProgress: (f, label) => setProgress((p) => ({ f, label: label ?? p.label })) });
      downloadBlob(r.blob, r.fileName);
      setResult({ size: r.blob.size, duration: r.duration, fileName: r.fileName, files: r.files });
      setPhase('done');
      toast.success('Exportación completada', r.fileName);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setPhase('idle'); return; }
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const dur = range === 'loop' ? Math.max(0, loop.end - loop.start) : end;
  const perFile = format === 'mp3' ? (dur * kbps * 1000) / 8 : dur * sr * 2 * (bits / 8);
  const est = Math.round(perFile * (stems ? Math.max(1, trackCount) : 1));
  const opt = (active: boolean) => `h-9 rounded-md border px-3 text-xs font-medium disabled:opacity-40 ${active ? 'border-primary bg-primary/15 text-fg' : 'border-line text-muted hover:text-fg'}`;
  const ext = stems ? '.zip' : format === 'mp3' ? '.mp3' : '.wav';

  return (
    <Modal open={open} onClose={close} title="Exportar canción" subtitle="Renderiza con todos los efectos, volúmenes, panoramas y automatizaciones" icon={<FileAudio size={18} />} width={560}
      footer={<><Button variant="ghost" onClick={close}>{phase === 'rendering' ? 'Cancelar' : 'Cerrar'}</Button><Button variant="primary" icon={<Download size={14} />} disabled={phase === 'rendering' || dur <= 0} onClick={() => void run()} data-testid="export-run">{phase === 'done' ? 'Exportar de nuevo' : 'Exportar'}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs">Nombre del archivo</span>
          <div className="flex items-center rounded-md border border-line bg-bg focus-within:border-primary">
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" aria-label="Nombre del archivo" />
            <span className="pr-3 font-mono text-xs text-dim">{ext}</span>
          </div>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Formato</span>
            <div className="flex gap-1.5"><button className={opt(format === 'wav')} onClick={() => setFormat('wav')}>WAV</button><button className={opt(format === 'mp3')} onClick={() => setFormat('mp3')} data-testid="fmt-mp3">MP3</button></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Qué exportar</span>
            <div className="flex gap-1.5">
              <button className={opt(range === 'all')} onClick={() => setRange('all')}>Todo</button>
              <button className={opt(range === 'loop')} onClick={() => setRange('loop')} disabled={loop.end - loop.start < 0.05} data-testid="range-loop" data-tip="La región marcada en la franja superior de la regla">Región del bucle</button>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={stems} onChange={(e) => setStems(e.target.checked)} data-testid="stems" className="accent-[#8B5CF6]" />
          Pistas separadas (stems) en un ZIP <span className="text-[11px] text-dim">· cada pista con sus efectos, sin el master</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Frecuencia de muestreo</span>
            <div className="flex gap-1.5">{([44100, 48000, 96000] as const).map((v) => <button key={v} className={opt(sr === v)} disabled={format === 'mp3' && v === 96000} onClick={() => setSr(v)}>{v / 1000} kHz</button>)}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-xs">Calidad</span>
            {format === 'wav'
              ? <div className="flex gap-1.5">{([16, 24, 32] as const).map((v) => <button key={v} className={opt(bits === v)} onClick={() => setBits(v)}>{v === 32 ? '32 float' : `${v}-bit`}</button>)}</div>
              : <div className="flex gap-1.5">{([128, 192, 256, 320] as const).map((v) => <button key={v} className={opt(kbps === v)} onClick={() => setKbps(v)}>{v}</button>)}<span className="self-center text-[10px] text-dim">kbps</span></div>}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-bg/50 px-3 py-2.5 text-xs text-muted">
          Duración: <b className="text-fg">{formatDuration(dur)}</b> · Tamaño estimado: <b className="text-fg">{formatBytes(est)}</b>{stems && <> · {trackCount} archivos</>}
          {dur <= 0 && <span className="mt-1 block text-warn">No hay audio que exportar.</span>}
        </div>
        {phase === 'rendering' && (
          <div className="flex flex-col gap-1.5" data-testid="export-progress">
            <div className="flex justify-between text-xs"><span>{progress.label}</span><span className="font-mono">{Math.round(progress.f * 100)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(3, progress.f * 100)}%` }} /></div>
          </div>
        )}
        {phase === 'done' && result && (
          <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2.5 text-xs" data-testid="export-done">
            <CheckCircle2 size={16} className="text-ok" />
            <span><b>{result.fileName}</b> · {formatBytes(result.size)} · {formatDuration(result.duration)}{result.files > 1 ? ` · ${result.files} pistas` : ''} — descargado.</span>
          </div>
        )}
        {phase === 'error' && <div className="rounded-lg border border-rec/30 bg-rec/10 px-3 py-2.5 text-xs text-rec">No se pudo exportar: {error}</div>}
      </div>
    </Modal>
  );
}
