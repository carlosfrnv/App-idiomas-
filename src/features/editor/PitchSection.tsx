import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Search, Wand2 } from 'lucide-react';
import type { Clip } from '@/types/project';
import { NOTE_NAMES, SCALES, hzToMidi, type ScaleId } from '@/audio/pitch/scales';
import { applyAutotune, detectClipKey, restoreOriginal, usePitch } from '@/app/pitch';
import { Button } from '@/components/ui/Button';
import { Knob } from '@/components/ui/Knob';
import { toast } from '@/state/toastStore';

const PRESETS = { natural: { strength: 0.8, speedMs: 120 }, robotic: { strength: 1, speedMs: 0 } };

function PitchGraph({ clipId }: { clipId: string }) {
  const curves = usePitch((s) => s.curves[clipId]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !curves) return;
    const W = c.clientWidth, H = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const midis = [...curves.detected].filter((f) => f > 0).map(hzToMidi);
    if (!midis.length) return;
    const lo = Math.floor(Math.min(...midis)) - 1, hi = Math.ceil(Math.max(...midis)) + 1;
    const y = (m: number) => H - ((m - lo) / (hi - lo)) * H;
    g.strokeStyle = '#1F2733';
    for (let m = lo; m <= hi; m++) { g.beginPath(); g.moveTo(0, y(m)); g.lineTo(W, y(m)); g.stroke(); }
    const draw = (arr: Float32Array, color: string, w: number) => {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      let pen = false;
      for (let i = 0; i < arr.length; i++) {
        const x = (i / arr.length) * W;
        if (arr[i] > 0) { const yy = y(hzToMidi(arr[i])); if (pen) g.lineTo(x, yy); else g.moveTo(x, yy); pen = true; } else pen = false;
      }
      g.stroke();
    };
    draw(curves.detected, '#6B7686', 1);
    draw(curves.corrected, '#A78BFA', 2);
  }, [curves]);
  if (!curves) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-dim">Afinación detectada (gris) y corregida (violeta)</span>
      <canvas ref={ref} className="h-24 w-full rounded-md border border-line bg-[#0D1118]" data-testid="pitch-graph" />
    </div>
  );
}

export function PitchSection({ clip, locked }: { clip: Clip; locked: boolean }) {
  const busy = usePitch((s) => s.busy === clip.id);
  const progress = usePitch((s) => s.progress);
  const [key, setKey] = useState(clip.pitch?.key ?? 0);
  const [scale, setScale] = useState<ScaleId>((clip.pitch?.scale as ScaleId) ?? 'minor');
  const [strength, setStrength] = useState(clip.pitch?.strength ?? PRESETS.natural.strength);
  const [speedMs, setSpeed] = useState(clip.pitch?.speedMs ?? PRESETS.natural.speedMs);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => { if (clip.pitch) { setKey(clip.pitch.key); setScale(clip.pitch.scale as ScaleId); setStrength(clip.pitch.strength); setSpeed(clip.pitch.speedMs); } }, [clip.id, clip.pitch]);

  const run = async () => {
    try { await applyAutotune(clip.id, { key, scale, strength, speedMs }); toast.success('Voz afinada', `${NOTE_NAMES[key]} ${SCALES[scale].name} · ${speedMs === 0 ? 'robótico' : `${speedMs} ms`}`); }
    catch (e) { toast.error('No se pudo afinar', (e as Error).message); }
  };
  const detect = async () => {
    setDetecting(true);
    try {
      const r = await detectClipKey(clip.id);
      if (!r) toast.warning('No se detectó tonalidad', 'El clip tiene muy pocas notas cantadas.');
      else { setKey(r.key); setScale(r.scale); toast.info('Tonalidad estimada', `${NOTE_NAMES[r.key]} ${r.scale === 'major' ? 'mayor' : 'menor'}`); }
    } catch (e) { toast.error('Error', (e as Error).message); } finally { setDetecting(false); }
  };
  const isRobotic = speedMs === 0 && strength >= 0.99;
  const isNatural = speedMs === PRESETS.natural.speedMs && strength === PRESETS.natural.strength;

  return (
    <div className="flex min-w-[320px] max-w-[520px] flex-1 flex-col gap-2.5 rounded-lg border border-line bg-surface/30 p-3" data-testid="pitch-section">
      <div className="flex items-center gap-2">
        <Wand2 size={14} className="text-primary" />
        <span className="text-[13px] font-semibold">Corrección de tono</span>
        {clip.pitch && <span className="rounded bg-ok/15 px-1.5 text-[10px] font-semibold text-ok">Aplicada</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1"><span className="label-xs">Tonalidad</span>
          <select aria-label="Tonalidad" value={key} onChange={(e) => setKey(Number(e.target.value))} className="h-8 rounded-md border border-line bg-bg px-1.5 text-xs" data-testid="pitch-key">{NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1"><span className="label-xs">Escala</span>
          <select aria-label="Escala" value={scale} onChange={(e) => setScale(e.target.value as ScaleId)} className="h-8 rounded-md border border-line bg-bg px-1.5 text-xs" data-testid="pitch-scale">{Object.entries(SCALES).map(([id, s]) => <option key={id} value={id}>{s.name}</option>)}</select>
        </label>
        <Button size="sm" icon={detecting ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} onClick={() => void detect()} disabled={detecting || busy}>Detectar</Button>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => { setStrength(PRESETS.natural.strength); setSpeed(PRESETS.natural.speedMs); }} className={`h-8 flex-1 rounded-md border text-xs font-medium ${isNatural ? 'border-primary bg-primary/15' : 'border-line text-muted'}`} data-testid="pitch-natural">Natural</button>
        <button onClick={() => { setStrength(1); setSpeed(0); }} className={`h-8 flex-1 rounded-md border text-xs font-medium ${isRobotic ? 'border-primary bg-primary/15' : 'border-line text-muted'}`} data-testid="pitch-robotic">Robótico (trap)</button>
      </div>
      <div className="flex items-start gap-5">
        <Knob label="Intensidad" value={strength} min={0} max={1} defaultValue={0.8} format={(v) => `${Math.round(v * 100)}%`} onChange={setStrength} size={44} />
        <Knob label="Velocidad" value={speedMs} min={0} max={400} defaultValue={120} format={(v) => (v < 1 ? 'Instant.' : `${Math.round(v)} ms`)} onChange={(v) => setSpeed(v < 1 ? 0 : Math.round(v))} size={44} />
        <div className="flex flex-1 flex-col gap-1.5 self-center">
          <Button size="sm" variant="primary" disabled={busy || locked} onClick={() => void run()} icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} data-testid="pitch-apply">{busy ? `Procesando ${Math.round(progress * 100)}%` : clip.pitch ? 'Volver a afinar' : 'Afinar voz'}</Button>
          {clip.pitch && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => restoreOriginal(clip.id)} disabled={busy || locked} data-testid="pitch-restore">Restaurar original</Button>}
        </div>
      </div>
      <PitchGraph clipId={clip.id} />
      <p className="text-[10px] leading-snug text-dim">Procesa la toma (no en directo): detecta la nota de cada instante y la lleva a la escala elegida conservando el timbre. Funciona mejor con voz sola y seca. La monitorización en tiempo real aún no está disponible.</p>
    </div>
  );
}
