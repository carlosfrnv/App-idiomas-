import { useEffect, useMemo, useRef, useState } from 'react';
import type { EffectSlotOf, EqBand, EqBandType } from '@/types/effects';
import { biquadCoefs, biquadMagnitude, logFrequencies } from '@/audio/fx/biquadMath';
import { EQ_PRESETS } from '@/audio/fx/presets';
import { engine } from '@/audio/engine/AudioEngine';
import { useFrame } from '@/hooks/useFrame';
import { Knob } from '@/components/ui/Knob';
import { Switch } from '@/components/ui/Switch';
import { updateEffect, type FxTarget } from './fxActions';

const BAND_COLORS = ['#F59E0B', '#22C55E', '#38BDF8', '#EC4899', '#A78BFA', '#F97316', '#14B8A6', '#EF4444'];
const FMIN = 20, FMAX = 20000, GMAX = 18;
const TYPE_LABEL: Record<EqBandType, string> = { highpass: 'Pasa-altos', lowshelf: 'Shelf grave', peaking: 'Campana', highshelf: 'Shelf agudo', lowpass: 'Pasa-bajos', notch: 'Notch' };
const usesGain = (t: EqBandType) => t === 'peaking' || t === 'lowshelf' || t === 'highshelf';
const usesQ = (t: EqBandType) => t !== 'lowshelf' && t !== 'highshelf';

const fx = (f: number, w: number) => (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * w;
const xf = (x: number, w: number) => FMIN * Math.pow(FMAX / FMIN, Math.min(1, Math.max(0, x / w)));
const gy = (g: number, h: number) => h / 2 - (g / GMAX) * (h / 2 - 10);
const yg = (y: number, h: number) => ((h / 2 - y) / (h / 2 - 10)) * GMAX;

export function bandResponseDb(b: EqBand, f: number, sr: number): number {
  if (!b.enabled) return 0;
  return 20 * Math.log10(biquadMagnitude(biquadCoefs(b.type, b.frequency, b.q, b.gain, sr), f, sr));
}

export function EqEditor({ target, slot }: { target: FxTarget; slot: EffectSlotOf<'eq'> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const spec = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 210 });
  const [sel, setSel] = useState(0);
  const { bands, outputGain } = slot.params;
  const sr = engine.hasContext ? engine.sampleRate : 48000;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: 210 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setBand = (i: number, patch: Partial<EqBand>, key = 'band') => updateEffect<'eq'>(target, slot.id, { bands: bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }, `${key}${i}`);

  const freqs = useMemo(() => logFrequencies(Math.round(size.w), FMIN, FMAX), [size.w]);

  // Curva de respuesta real: suma en dB de los biquads tal como los ejecuta la Web Audio API
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = '10px "JetBrains Mono Variable", monospace';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = Math.round(fx(f, w)) + 0.5;
      g.fillStyle = '#1F2733'; g.fillRect(x, 0, 1, h);
      g.fillStyle = '#6B7686'; g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 3, h - 4);
    }
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = Math.round(gy(db, h)) + 0.5;
      g.fillStyle = db === 0 ? '#2E3747' : '#1F2733'; g.fillRect(0, y, w, 1);
      g.fillStyle = '#6B7686'; g.fillText(`${db > 0 ? '+' : ''}${db}`, 4, y - 3);
    }
    const total = new Float32Array(freqs.length);
    bands.forEach((b, bi) => {
      if (!b.enabled) return;
      g.beginPath();
      for (let i = 0; i < freqs.length; i++) {
        const v = bandResponseDb(b, freqs[i], sr);
        total[i] += v;
        const y = gy(Math.max(-GMAX - 6, Math.min(GMAX + 6, v)), h);
        if (i === 0) g.moveTo(i, y); else g.lineTo(i, y);
      }
      g.strokeStyle = BAND_COLORS[bi % BAND_COLORS.length] + (bi === sel ? 'aa' : '44');
      g.lineWidth = 1;
      g.stroke();
    });
    const og = slot.enabled ? outputGain : 0;
    g.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const y = gy(Math.max(-GMAX - 6, Math.min(GMAX + 6, slot.enabled ? total[i] + og : 0)), h);
      if (i === 0) g.moveTo(i, y); else g.lineTo(i, y);
    }
    g.strokeStyle = slot.enabled ? '#C4B5FD' : '#6B7686';
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(w, gy(0, h)); g.lineTo(0, gy(0, h)); g.closePath();
    g.fillStyle = slot.enabled ? 'rgba(139,92,246,0.14)' : 'rgba(107,118,134,0.08)';
    g.fill();
  }, [bands, outputGain, size, freqs, sel, slot.enabled, sr]);

  // Analizador de espectro de la señal real de la pista (post-fader)
  const specBuf = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smooth = useRef<Float32Array | null>(null);
  useFrame(() => {
    const c = spec.current;
    if (!c || !engine.hasContext || !engine.playing) { if (c && smooth.current) { c.getContext('2d')?.clearRect(0, 0, c.width, c.height); smooth.current = null; } return; }
    if (!specBuf.current) specBuf.current = new Float32Array(new ArrayBuffer(512 * 4));
    if (!engine.readSpectrum(target, specBuf.current)) return;
    const data = specBuf.current;
    if (!smooth.current) smooth.current = new Float32Array(data.length).fill(-120);
    const sm = smooth.current;
    for (let i = 0; i < data.length; i++) sm[i] = Math.max(data[i], sm[i] - 1.5);
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.beginPath();
    g.moveTo(0, h);
    const nyq = engine.sampleRate / 2;
    for (let i = 1; i < sm.length; i++) {
      const f = (i / sm.length) * nyq;
      if (f < FMIN) continue;
      const x = fx(f, w);
      const y = h - Math.max(0, Math.min(1, (sm[i] + 100) / 90)) * h;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = 'rgba(56,189,248,0.10)';
    g.fill();
  });

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = -1, bd = 18;
    bands.forEach((b, i) => {
      const bx = fx(b.frequency, size.w), by = gy(usesGain(b.type) ? b.gain : 0, size.h);
      const d = Math.hypot(bx - x, by - y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    setSel(best);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    if (!bands[best].enabled) setBand(best, { enabled: true });
    const move = (ev: PointerEvent) => {
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const patch: Partial<EqBand> = { frequency: Math.round(xf(px, size.w)) };
      if (usesGain(bands[best].type)) patch.gain = Math.round(Math.max(-GMAX, Math.min(GMAX, yg(py, size.h))) * 10) / 10;
      setBand(best, patch, 'drag');
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const b = bands[sel] ?? bands[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="label-xs">Preset</span>
        <select aria-label="Preset de ecualizador" className="h-7 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-primary" defaultValue="" onChange={(e) => { const p = EQ_PRESETS.find((x) => x.id === e.target.value); if (p) updateEffect<'eq'>(target, slot.id, { bands: p.bands() }); e.currentTarget.value = ''; }}>
          <option value="" disabled>Elegir preset vocal…</option>
          {EQ_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-[11px] text-dim">Arrastra los puntos · rueda = Q · doble clic = activar/desactivar</span>
      </div>
      <div ref={wrap} className="relative w-full shrink-0 overflow-hidden rounded-lg border border-line bg-[#0D1118]" style={{ height: size.h }}>
        <canvas ref={spec} className="pointer-events-none absolute inset-0" style={{ width: size.w, height: size.h }} />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0" style={{ width: size.w, height: size.h }} />
        <div
          className="absolute inset-0 touch-none"
          data-testid="eq-graph"
          onPointerDown={onPointerDown}
          onWheel={(e) => { const bb = bands[sel]; if (bb && usesQ(bb.type)) setBand(sel, { q: Math.max(0.1, Math.min(18, bb.q * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }, 'q'); }}
        >
          {bands.map((band, i) => {
            const x = fx(band.frequency, size.w), y = gy(usesGain(band.type) ? band.gain : 0, size.h);
            return (
              <div
                key={band.id}
                onDoubleClick={() => setBand(i, { enabled: !band.enabled })}
                className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full text-[10px] font-bold"
                style={{ left: x, top: y, background: band.enabled ? BAND_COLORS[i % BAND_COLORS.length] : '#2a3344', color: band.enabled ? '#0B0E14' : '#9BA7B7', boxShadow: i === sel ? '0 0 0 2px #F5F7FA' : '0 1px 4px rgb(0 0 0 / .6)' }}
              >{i + 1}</div>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-0 flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex gap-1">
          {bands.map((band, i) => (
            <button key={band.id} onClick={() => setSel(i)} className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${i === sel ? 'border-fg' : 'border-line'} ${band.enabled ? '' : 'opacity-40'}`} style={{ color: BAND_COLORS[i % BAND_COLORS.length] }} aria-label={`Banda ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
        {b && <>
          <label className="flex flex-col gap-1">
            <span className="label-xs">Tipo</span>
            <select aria-label="Tipo de banda" value={b.type} onChange={(e) => setBand(sel, { type: e.target.value as EqBandType })} className="h-8 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-primary">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="flex flex-col items-center gap-1"><span className="label-xs">Activa</span><Switch label="Activar banda" checked={b.enabled} onChange={(v) => setBand(sel, { enabled: v })} /></div>
          <Knob label="Frec." value={b.frequency} min={20} max={20000} log defaultValue={1000} onChange={(v) => setBand(sel, { frequency: Math.round(v) }, 'f')} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)}`)} color={BAND_COLORS[sel % BAND_COLORS.length]} />
          <Knob label="Gan." value={b.gain} min={-18} max={18} bipolar defaultValue={0} disabled={!usesGain(b.type)} onChange={(v) => setBand(sel, { gain: Math.round(v * 10) / 10 }, 'g')} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} color={BAND_COLORS[sel % BAND_COLORS.length]} />
          <Knob label="Q" value={b.q} min={0.1} max={18} log defaultValue={1} disabled={!usesQ(b.type)} onChange={(v) => setBand(sel, { q: Math.round(v * 100) / 100 }, 'q')} format={(v) => v.toFixed(2)} color={BAND_COLORS[sel % BAND_COLORS.length]} />
        </>}
        <div className="ml-auto"><Knob label="Salida" value={outputGain} min={-18} max={18} bipolar defaultValue={0} onChange={(v) => updateEffect<'eq'>(target, slot.id, { outputGain: Math.round(v * 10) / 10 }, 'out')} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} /></div>
      </div>
    </div>
  );
}
