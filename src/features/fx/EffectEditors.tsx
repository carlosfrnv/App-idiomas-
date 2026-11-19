import { useRef } from 'react';
import type { DelayDivision, EffectSlot, EffectSlotOf } from '@/types/effects';
import { Knob } from '@/components/ui/Knob';
import { Switch } from '@/components/ui/Switch';
import { engine } from '@/audio/engine/AudioEngine';
import { useFrame } from '@/hooks/useFrame';
import { useProject } from '@/state/projectStore';
import { delaySeconds, DELAY_DIVISION_BEATS } from '@/audio/fx/defaults';
import { updateEffect, type FxTarget } from './fxActions';
import { EqEditor } from './EqEditor';

const ms = (v: number) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dB = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-6">{children}</div>;
}

/** Medidor de reducción de ganancia leído del nodo real (DynamicsCompressorNode.reduction / gate). */
function GainReduction({ target, fxId }: { target: FxTarget; fxId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const r = engine.effectReduction(target, fxId) ?? 0;
    const v = Math.min(24, Math.max(0, -r));
    if (bar.current) bar.current.style.height = `${(v / 24) * 100}%`;
    if (txt.current) txt.current.textContent = v > 0.05 ? `-${v.toFixed(1)}` : '0.0';
  });
  return (
    <div className="flex flex-col items-center gap-1" data-tip="Reducción de ganancia (señal real)">
      <span className="label-xs">GR</span>
      <div className="relative h-[86px] w-3 overflow-hidden rounded-sm bg-bg shadow-[inset_0_0_0_1px_#293241]">
        <div ref={bar} className="absolute inset-x-0 top-0 bg-warn" style={{ height: 0 }} />
      </div>
      <span ref={txt} className="font-mono text-[10px] text-muted">0.0</span>
    </div>
  );
}

function TransferCurve({ threshold, ratio, knee }: { threshold: number; ratio: number; knee: number }) {
  const S = 96;
  const map = (db: number) => ((db + 60) / 60) * S;
  const out = (x: number) => {
    const over = x - threshold;
    if (2 * over < -knee) return x;
    if (2 * Math.abs(over) <= knee) return x + ((1 / ratio - 1) * (over + knee / 2) ** 2) / (2 * Math.max(knee, 0.001));
    return threshold + over / ratio;
  };
  let d = '';
  for (let x = -60; x <= 0; x += 1) d += `${x === -60 ? 'M' : 'L'}${map(x)} ${S - map(out(x))} `;
  return (
    <svg width={S} height={S} className="rounded-md border border-line bg-[#0D1118]" aria-label="Curva de transferencia">
      <path d={`M0 ${S} L${S} 0`} stroke="#293241" strokeDasharray="3 3" />
      <line x1={map(threshold)} x2={map(threshold)} y1={0} y2={S} stroke="#F59E0B55" />
      <path d={d} stroke="#C4B5FD" strokeWidth={2} fill="none" />
    </svg>
  );
}

export function EffectEditor({ target, slot }: { target: FxTarget; slot: EffectSlot }) {
  const bpm = useProject((s) => s.doc.bpm);
  const up = <K extends EffectSlot['type']>(patch: Partial<EffectSlotOf<K>['params']>, key: string) => updateEffect(target, slot.id, patch, key);
  switch (slot.type) {
    case 'eq':
      return <EqEditor target={target} slot={slot} />;
    case 'compressor': {
      const p = slot.params;
      return (
        <Row>
          <TransferCurve threshold={p.threshold} ratio={p.ratio} knee={p.knee} />
          <Knob label="Umbral" value={p.threshold} min={-60} max={0} defaultValue={-18} format={dB} onChange={(v) => up({ threshold: v }, 'thr')} size={48} />
          <Knob label="Ratio" value={p.ratio} min={1} max={20} log defaultValue={3} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => up({ ratio: v }, 'ratio')} size={48} />
          <Knob label="Ataque" value={p.attack} min={0.0005} max={0.2} log defaultValue={0.01} format={ms} onChange={(v) => up({ attack: v }, 'att')} size={48} />
          <Knob label="Release" value={p.release} min={0.02} max={1.5} log defaultValue={0.15} format={ms} onChange={(v) => up({ release: v }, 'rel')} size={48} />
          <Knob label="Knee" value={p.knee} min={0} max={30} defaultValue={6} format={(v) => `${v.toFixed(0)} dB`} onChange={(v) => up({ knee: v }, 'knee')} size={48} />
          <Knob label="Makeup" value={p.makeup} min={0} max={24} defaultValue={0} format={dB} onChange={(v) => up({ makeup: v }, 'mk')} size={48} color="#22C55E" />
          <GainReduction target={target} fxId={slot.id} />
        </Row>
      );
    }
    case 'reverb': {
      const p = slot.params;
      return (
        <Row>
          <Knob label="Mezcla" value={p.mix} min={0} max={1} defaultValue={0.2} format={pct} onChange={(v) => up({ mix: v }, 'mix')} size={48} />
          <Knob label="Decay" value={p.decay} min={0.2} max={8} log defaultValue={1.8} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => up({ decay: Math.round(v * 20) / 20 }, 'decay')} size={48} />
          <Knob label="Pre-delay" value={p.preDelay} min={0} max={0.2} defaultValue={0.02} format={ms} onChange={(v) => up({ preDelay: v }, 'pre')} size={48} />
          <Knob label="Amortig." value={p.damping} min={0} max={1} defaultValue={0.5} format={pct} onChange={(v) => up({ damping: Math.round(v * 20) / 20 }, 'damp')} size={48} />
        </Row>
      );
    }
    case 'delay': {
      const p = slot.params;
      return (
        <Row>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs"><Switch label="Sincronizar con BPM" checked={p.sync} onChange={(v) => up({ sync: v }, 'sync')} /> Sync BPM</label>
            <select aria-label="División" disabled={!p.sync} value={p.division} onChange={(e) => up({ division: e.target.value as DelayDivision }, 'div')} className="h-8 rounded-md border border-line bg-bg px-2 text-xs outline-none disabled:opacity-40">
              {Object.keys(DELAY_DIVISION_BEATS).map((d) => <option key={d} value={d}>{d.replace('d', ' con punto').replace('t', ' tresillo')}</option>)}
            </select>
            <span className="font-mono text-[11px] text-muted">{ms(delaySeconds(p, bpm))}</span>
          </div>
          <Knob label="Tiempo" value={p.time} min={0.01} max={2} log defaultValue={0.375} disabled={p.sync} format={ms} onChange={(v) => up({ time: v }, 'time')} size={48} />
          <Knob label="Feedback" value={p.feedback} min={0} max={0.95} defaultValue={0.3} format={pct} onChange={(v) => up({ feedback: v }, 'fb')} size={48} />
          <Knob label="Mezcla" value={p.mix} min={0} max={1} defaultValue={0.2} format={pct} onChange={(v) => up({ mix: v }, 'mix')} size={48} />
          <Knob label="Corte agudo" value={p.highCut} min={500} max={18000} log defaultValue={6000} format={(v) => `${(v / 1000).toFixed(1)}k`} onChange={(v) => up({ highCut: v }, 'hc')} size={48} />
        </Row>
      );
    }
    case 'filter': {
      const p = slot.params;
      return (
        <Row>
          <div className="flex flex-col gap-1">
            <span className="label-xs">Modo</span>
            <div className="flex gap-1">
              {(['lowpass', 'highpass', 'bandpass'] as const).map((m) => (
                <button key={m} onClick={() => up({ mode: m }, 'mode')} className={`h-8 rounded-md border px-2.5 text-xs font-medium ${p.mode === m ? 'border-primary bg-primary/15 text-fg' : 'border-line text-muted'}`}>{m === 'lowpass' ? 'Pasa-bajos' : m === 'highpass' ? 'Pasa-altos' : 'Pasa-banda'}</button>
              ))}
            </div>
          </div>
          <Knob label="Frecuencia" value={p.frequency} min={20} max={20000} log defaultValue={8000} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)} Hz`)} onChange={(v) => up({ frequency: v }, 'f')} size={48} />
          <Knob label="Resonancia" value={p.q} min={0.1} max={12} log defaultValue={0.7} format={(v) => v.toFixed(2)} onChange={(v) => up({ q: v }, 'q')} size={48} />
        </Row>
      );
    }
    case 'saturation': {
      const p = slot.params;
      return (
        <Row>
          <Knob label="Drive" value={p.drive} min={0} max={1} defaultValue={0.3} format={pct} onChange={(v) => up({ drive: Math.round(v * 100) / 100 }, 'drive')} size={48} color="#F59E0B" />
          <Knob label="Tono" value={p.tone} min={0} max={1} defaultValue={0.5} format={pct} onChange={(v) => up({ tone: v }, 'tone')} size={48} />
          <Knob label="Mezcla" value={p.mix} min={0} max={1} defaultValue={0.5} format={pct} onChange={(v) => up({ mix: v }, 'mix')} size={48} />
        </Row>
      );
    }
    case 'gate': {
      const p = slot.params;
      return (
        <Row>
          <Knob label="Umbral" value={p.threshold} min={-90} max={0} defaultValue={-50} format={dB} onChange={(v) => up({ threshold: v }, 'thr')} size={48} />
          <Knob label="Ataque" value={p.attack} min={0.0005} max={0.05} log defaultValue={0.002} format={ms} onChange={(v) => up({ attack: v }, 'att')} size={48} />
          <Knob label="Release" value={p.release} min={0.01} max={1} log defaultValue={0.12} format={ms} onChange={(v) => up({ release: v }, 'rel')} size={48} />
          <Knob label="Rango" value={p.range} min={-80} max={0} defaultValue={-60} format={dB} onChange={(v) => up({ range: v }, 'range')} size={48} />
          <GainReduction target={target} fxId={slot.id} />
        </Row>
      );
    }
  }
}
