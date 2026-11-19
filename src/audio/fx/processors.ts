/**
 * Procesadores de efectos sobre BaseAudioContext → funcionan igual en AudioContext
 * (tiempo real) y en OfflineAudioContext (exportación). Lo que se oye es lo que se exporta.
 */
import type { EffectSlot, EffectSlotOf, EffectType } from '@/types/effects';
import { dbToGain } from '@/lib/audioMath';
import { delaySeconds } from './defaults';
import { GATE_PROCESSOR } from '@/audio/worklets/names';
import { compressorCurve } from './compressorCurve';

export interface FxContext { bpm: number; workletsReady: boolean }

export interface EffectProcessor {
  readonly type: EffectType;
  readonly input: AudioNode;
  readonly output: AudioNode;
  update(slot: EffectSlot, fx: FxContext): void;
  dispose(): void;
  /** Reducción de ganancia en dB (compresor / gate), si aplica. */
  reduction?(): number;
}

const SMOOTH = 0.015;

/** El modelo guarda Q lineal; BiquadFilterNode interpreta Q en dB para lowpass/highpass. */
export function qForNode(type: BiquadFilterType, q: number): number {
  const lin = Math.max(0.0001, q);
  return type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(lin) : lin;
}

function setParam(p: AudioParam, v: number, ctx: BaseAudioContext) {
  if (!isFinite(v)) return;
  if (ctx instanceof AudioContext && ctx.state === 'running') p.setTargetAtTime(v, ctx.currentTime, SMOOTH);
  else p.value = v;
}

/** Base con bypass: input → (dry) → output y input → [proc] → (wet) → output. */
abstract class BypassableEffect<K extends EffectType> implements EffectProcessor {
  readonly input: GainNode;
  readonly output: GainNode;
  protected readonly dry: GainNode;
  protected readonly wet: GainNode;
  abstract readonly type: K;
  constructor(protected ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
    this.dry.gain.value = 0;
  }
  protected setEnabled(on: boolean) {
    setParam(this.dry.gain, on ? 0 : 1, this.ctx);
    setParam(this.wet.gain, on ? 1 : 0, this.ctx);
  }
  abstract apply(slot: EffectSlotOf<K>, fx: FxContext): void;
  update(slot: EffectSlot, fx: FxContext) {
    this.setEnabled(slot.enabled);
    this.apply(slot as EffectSlotOf<K>, fx);
  }
  dispose() {
    try { this.input.disconnect(); this.output.disconnect(); this.dry.disconnect(); this.wet.disconnect(); } catch { /* noop */ }
  }
}

export class EqProcessor extends BypassableEffect<'eq'> {
  readonly type = 'eq' as const;
  private filters: BiquadFilterNode[] = [];
  private out: GainNode;
  constructor(ctx: BaseAudioContext, bands: number) {
    super(ctx);
    this.out = ctx.createGain();
    let prev: AudioNode = this.input;
    for (let i = 0; i < bands; i++) {
      const f = ctx.createBiquadFilter();
      prev.connect(f);
      prev = f;
      this.filters.push(f);
    }
    prev.connect(this.out).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'eq'>) {
    const { bands, outputGain } = slot.params;
    this.filters.forEach((f, i) => {
      const b = bands[i];
      if (!b || !b.enabled) {
        // pico con 0 dB = identidad exacta
        f.type = 'peaking';
        setParam(f.gain, 0, this.ctx);
        return;
      }
      f.type = b.type;
      setParam(f.frequency, b.frequency, this.ctx);
      setParam(f.Q, qForNode(b.type, b.q), this.ctx);
      setParam(f.gain, b.gain, this.ctx);
    });
    setParam(this.out.gain, dbToGain(outputGain), this.ctx);
  }
  get bandCount() { return this.filters.length; }
  dispose() { super.dispose(); this.filters.forEach((f) => f.disconnect()); this.out.disconnect(); }
}

export class CompressorProcessor extends BypassableEffect<'compressor'> {
  readonly type = 'compressor' as const;
  private comp: DynamicsCompressorNode;
  private makeup: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.comp = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.input.connect(this.comp).connect(this.makeup).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'compressor'>) {
    const p = slot.params;
    setParam(this.comp.threshold, p.threshold, this.ctx);
    setParam(this.comp.ratio, Math.min(20, Math.max(1, p.ratio)), this.ctx);
    setParam(this.comp.attack, p.attack, this.ctx);
    setParam(this.comp.release, p.release, this.ctx);
    setParam(this.comp.knee, p.knee, this.ctx);
    // anula la compensación automática interna del nodo: el Makeup del usuario es la única
    const internal = compressorCurve(p.threshold, p.knee, Math.min(20, Math.max(1, p.ratio))).internalMakeupDb;
    setParam(this.makeup.gain, dbToGain(p.makeup - internal), this.ctx);
  }
  reduction() { return this.comp.reduction; }
  dispose() { super.dispose(); this.comp.disconnect(); this.makeup.disconnect(); }
}

export class FilterProcessor extends BypassableEffect<'filter'> {
  readonly type = 'filter' as const;
  private f: BiquadFilterNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.f = ctx.createBiquadFilter();
    this.input.connect(this.f).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'filter'>) {
    this.f.type = slot.params.mode;
    setParam(this.f.frequency, slot.params.frequency, this.ctx);
    setParam(this.f.Q, qForNode(slot.params.mode, slot.params.q), this.ctx);
  }
  dispose() { super.dispose(); this.f.disconnect(); }
}

/**
 * Curva de saturación tanh con ganancia unidad a -12 dBFS (amplitud 0.25):
 * por debajo realza ligeramente, por encima comprime suavemente; la salida nunca supera
 * ~0.25/tanh(0.25·k) ≤ 1, así que "más drive" = más armónicos, no más volumen.
 */
export const SAT_REF = 0.25;
export function saturationCurve(drive: number, n = 2048): Float32Array<ArrayBuffer> {
  const k = 1 + Math.max(0, Math.min(1, drive)) * 24;
  const g = (k * SAT_REF) / Math.tanh(k * SAT_REF);
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = (g * Math.tanh(k * x)) / k;
  }
  return curve;
}

export class SaturationProcessor extends BypassableEffect<'saturation'> {
  readonly type = 'saturation' as const;
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private wetMix: GainNode;
  private dryMix: GainNode;
  private trim: GainNode;
  private lastDrive = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.wetMix = ctx.createGain();
    this.dryMix = ctx.createGain();
    this.trim = ctx.createGain();
    this.input.connect(this.trim).connect(this.shaper).connect(this.tone).connect(this.wetMix).connect(this.wet);
    this.input.connect(this.dryMix).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'saturation'>) {
    const p = slot.params;
    if (Math.abs(p.drive - this.lastDrive) > 0.001) {
      this.shaper.curve = saturationCurve(p.drive);
      this.lastDrive = p.drive;
    }
    setParam(this.tone.frequency, 1500 * Math.pow(12, p.tone), this.ctx);
    setParam(this.wetMix.gain, p.mix, this.ctx);
    setParam(this.dryMix.gain, 1 - p.mix, this.ctx);
  }
  dispose() { super.dispose(); [this.shaper, this.tone, this.wetMix, this.dryMix, this.trim].forEach((n) => n.disconnect()); }
}

export class DelayProcessor extends BypassableEffect<'delay'> {
  readonly type = 'delay' as const;
  private delay: DelayNode;
  private fb: GainNode;
  private hc: BiquadFilterNode;
  private wetMix: GainNode;
  private dryMix: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = ctx.createDelay(4);
    this.fb = ctx.createGain();
    this.hc = ctx.createBiquadFilter();
    this.hc.type = 'lowpass';
    this.wetMix = ctx.createGain();
    this.dryMix = ctx.createGain();
    this.input.connect(this.dryMix).connect(this.wet);
    this.input.connect(this.delay);
    this.delay.connect(this.hc).connect(this.fb).connect(this.delay);
    this.hc.connect(this.wetMix).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'delay'>, fx: FxContext) {
    const p = slot.params;
    setParam(this.delay.delayTime, Math.min(3.9, Math.max(0.001, delaySeconds(p, fx.bpm))), this.ctx);
    setParam(this.fb.gain, Math.min(0.95, Math.max(0, p.feedback)), this.ctx);
    setParam(this.hc.frequency, p.highCut, this.ctx);
    setParam(this.wetMix.gain, p.mix, this.ctx);
    setParam(this.dryMix.gain, 1 - p.mix * 0.5, this.ctx);
  }
  dispose() { super.dispose(); [this.delay, this.fb, this.hc, this.wetMix, this.dryMix].forEach((n) => n.disconnect()); }
}

/** PRNG determinista: la IR de la reverb es idéntica en tiempo real y en exportación. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildImpulseResponse(ctx: BaseAudioContext, decay: number, damping: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * Math.min(8, Math.max(0.1, decay))));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = mulberry32(1234 + ch * 777);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // filtro paso bajo progresivo: las colas se oscurecen con el tiempo (damping)
      const coef = Math.min(0.98, damping * t * 0.95);
      const n = rnd() * 2 - 1;
      lp = lp * coef + n * (1 - coef);
      data[i] = lp * Math.pow(1 - t, 2.2) * Math.exp(-t * 3);
    }
  }
  return buf;
}

export class ReverbProcessor extends BypassableEffect<'reverb'> {
  readonly type = 'reverb' as const;
  private conv: ConvolverNode;
  private pre: DelayNode;
  private wetMix: GainNode;
  private dryMix: GainNode;
  private irKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.conv = ctx.createConvolver();
    this.pre = ctx.createDelay(1);
    this.wetMix = ctx.createGain();
    this.dryMix = ctx.createGain();
    this.input.connect(this.dryMix).connect(this.wet);
    this.input.connect(this.pre).connect(this.conv).connect(this.wetMix).connect(this.wet);
  }
  apply(slot: EffectSlotOf<'reverb'>) {
    const p = slot.params;
    const key = `${p.decay.toFixed(2)}|${p.damping.toFixed(2)}`;
    if (key !== this.irKey) {
      this.conv.buffer = buildImpulseResponse(this.ctx, p.decay, p.damping);
      this.irKey = key;
    }
    setParam(this.pre.delayTime, Math.min(0.5, Math.max(0, p.preDelay)), this.ctx);
    setParam(this.wetMix.gain, p.mix * 1.4, this.ctx);
    setParam(this.dryMix.gain, 1 - p.mix * 0.6, this.ctx);
  }
  dispose() { super.dispose(); [this.conv, this.pre, this.wetMix, this.dryMix].forEach((n) => n.disconnect()); }
}

export class GateProcessor extends BypassableEffect<'gate'> {
  readonly type = 'gate' as const;
  private node: AudioWorkletNode | null = null;
  private lastReduction = 0;
  constructor(ctx: BaseAudioContext, workletsReady: boolean) {
    super(ctx);
    if (workletsReady) {
      try {
        this.node = new AudioWorkletNode(ctx, GATE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        this.input.connect(this.node).connect(this.wet);
        this.node.port.onmessage = (e) => { this.lastReduction = e.data as number; };
      } catch {
        this.node = null;
      }
    }
    if (!this.node) this.input.connect(this.wet); // sin worklet: pasa la señal sin procesar
  }
  get available() { return !!this.node; }
  apply(slot: EffectSlotOf<'gate'>) {
    if (!this.node) return;
    const p = slot.params;
    const get = (n: string) => this.node!.parameters.get(n)!;
    setParam(get('threshold'), p.threshold, this.ctx);
    setParam(get('attack'), p.attack, this.ctx);
    setParam(get('release'), p.release, this.ctx);
    setParam(get('range'), p.range, this.ctx);
  }
  reduction() { return this.lastReduction; }
  dispose() { super.dispose(); this.node?.disconnect(); if (this.node) this.node.port.onmessage = null; }
}

export function createProcessor(ctx: BaseAudioContext, slot: EffectSlot, fx: FxContext): EffectProcessor {
  let p: EffectProcessor;
  switch (slot.type) {
    case 'eq': p = new EqProcessor(ctx, slot.params.bands.length); break;
    case 'compressor': p = new CompressorProcessor(ctx); break;
    case 'filter': p = new FilterProcessor(ctx); break;
    case 'saturation': p = new SaturationProcessor(ctx); break;
    case 'delay': p = new DelayProcessor(ctx); break;
    case 'reverb': p = new ReverbProcessor(ctx); break;
    case 'gate': p = new GateProcessor(ctx, fx.workletsReady); break;
  }
  p.update(slot, fx);
  return p;
}

/** ¿Puede reutilizarse el procesador existente para este slot? */
export function isCompatible(p: EffectProcessor, slot: EffectSlot): boolean {
  if (p.type !== slot.type) return false;
  if (p instanceof EqProcessor && slot.type === 'eq') return p.bandCount === slot.params.bands.length;
  return true;
}
