/**
 * Motor de audio de SONORA. Independiente de React:
 *  - mantiene el AudioContext y su ciclo de vida,
 *  - reconcilia el grafo (canales, efectos, master) con el ProjectDoc,
 *  - transporte con programación anticipada (bucle sin cortes, metrónomo),
 *  - caché de AudioBuffers y picos de forma de onda,
 *  - lectura de medidores reales.
 */
import type { ProjectDoc } from '@/types/project';
import type { FxContext } from '@/audio/fx/processors';
import { computePeaks, type Peaks } from '@/audio/waveform/peaks';
import { ensureWorklets } from '@/audio/worklets/loader';
import { isTrackAudible, projectEnd } from '@/state/docOps';
import { MasterBus } from './MasterBus';
import { StereoMeter } from './meter';
import { TrackChannel } from './TrackChannel';
import { scheduleClips, type ScheduledSource } from './scheduleClips';
import { secondsPerBeat } from '@/lib/time';

interface Segment { ctxTime: number; pos: number; endPos: number }

type Listener = () => void;

const LOOKAHEAD = 0.25;
const TICK_MS = 25;
const START_LEAD = 0.06;

export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private master: MasterBus | null = null;
  private masterMeter: StereoMeter | null = null;
  private masterOut: GainNode | null = null;
  private channels = new Map<string, { ch: TrackChannel; meter: StereoMeter }>();
  private buffers = new Map<string, AudioBuffer>();
  private peaks = new Map<string, Peaks>();
  private sources: ScheduledSource[] = [];
  private segments: Segment[] = [];
  private nextLoopCtx = 0;
  private metroNextBeatCtx = 0;
  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private _playing = false;
  private stoppedPos = 0;
  private doc: ProjectDoc | null = null;
  private workletsReady = false;
  private workletPromise: Promise<boolean> | null = null;
  metronome = false;
  /** Detener al final del proyecto (desactivado mientras se graba). */
  autoStop = true;
  private endListeners = new Set<Listener>();
  private stateListeners = new Set<Listener>();

  /** Crea (perezosamente) el AudioContext. Puede quedar 'suspended' hasta un gesto. */
  get ctx(): AudioContext {
    if (!this._ctx) {
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Tu navegador no soporta Web Audio API.');
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this._ctx = ctx;
      this.masterOut = ctx.createGain();
      this.masterOut.connect(ctx.destination);
      this.master = new MasterBus(ctx, this.masterOut);
      this.masterMeter = new StereoMeter(ctx, this.masterOut);
      this.workletPromise = ensureWorklets(ctx).then((ok) => {
        this.workletsReady = ok;
        if (this.doc) this.sync(this.doc, true);
        return ok;
      });
      ctx.onstatechange = () => this.stateListeners.forEach((l) => l());
      if (this.doc) this.sync(this.doc, true);
    }
    return this._ctx;
  }

  get hasContext() { return !!this._ctx; }
  get playing() { return this._playing; }
  get sampleRate() { return this.ctx.sampleRate; }

  async ready(): Promise<boolean> {
    void this.ctx;
    return (await this.workletPromise) ?? false;
  }

  /** Reanuda el contexto (llamar desde un gesto del usuario). */
  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (e) { console.warn('[sonora] resume falló', e); }
    }
  }

  onEnded(l: Listener) { this.endListeners.add(l); return () => this.endListeners.delete(l); }
  onStateChange(l: Listener) { this.stateListeners.add(l); return () => this.stateListeners.delete(l); }

  private fxContext(): FxContext {
    return { bpm: this.doc?.bpm ?? 120, workletsReady: this.workletsReady };
  }

  // ---------------------------------------------------------------- reconciliación

  sync(doc: ProjectDoc, force = false) {
    const prev = this.doc;
    this.doc = doc;
    if (!this._ctx || !this.master) return;
    const fx = this.fxContext();
    const seen = new Set<string>();
    for (const t of doc.tracks) {
      seen.add(t.id);
      let entry = this.channels.get(t.id);
      if (!entry) {
        const ch = new TrackChannel(this._ctx, this.master.input);
        entry = { ch, meter: new StereoMeter(this._ctx, ch.output) };
        this.channels.set(t.id, entry);
      }
      const prevTrack = prev?.tracks.find((x) => x.id === t.id);
      if (force || prevTrack !== t || prev?.bpm !== doc.bpm || prev?.tracks.some((x) => x.solo) !== doc.tracks.some((x) => x.solo)) {
        entry.ch.update(t, isTrackAudible(doc, t), fx);
      }
    }
    for (const [id, e] of this.channels) {
      if (!seen.has(id)) { e.ch.dispose(); e.meter.dispose(); this.channels.delete(id); }
    }
    if (force || !prev || prev.masterVolume !== doc.masterVolume || prev.masterEffects !== doc.masterEffects || prev.bpm !== doc.bpm) {
      this.master.update(doc.masterVolume, doc.masterEffects, fx);
    }
    // si cambian clips o bucle mientras suena, reprogramar desde la posición actual
    const autoChanged = !!prev && doc.tracks.some((t) => prev.tracks.find((x) => x.id === t.id)?.automation !== t.automation);
    if (this._playing && prev && (prev.clips !== doc.clips || prev.loop !== doc.loop || prev.tracks.length !== doc.tracks.length || autoChanged)) {
      this.restartFrom(this.getPosition());
    } else if (!this._playing) {
      this.holdAutomation(this.stoppedPos);
    }
  }

  // ---------------------------------------------------------------- assets

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return await this.ctx.decodeAudioData(data);
  }

  addBuffer(assetId: string, buf: AudioBuffer) {
    this.buffers.set(assetId, buf);
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    this.peaks.set(assetId, computePeaks(chans, buf.sampleRate));
  }

  getBuffer(assetId: string) { return this.buffers.get(assetId); }
  getPeaks(assetId: string) { return this.peaks.get(assetId); }
  hasBuffer(assetId: string) { return this.buffers.has(assetId); }
  buffersSnapshot(): Map<string, AudioBuffer> { return new Map(this.buffers); }

  dropUnusedBuffers(keep: Set<string>) {
    for (const id of [...this.buffers.keys()]) if (!keep.has(id)) { this.buffers.delete(id); this.peaks.delete(id); }
  }

  // ---------------------------------------------------------------- transporte

  getPosition(): number {
    if (!this._playing || !this._ctx) return this.stoppedPos;
    const now = this._ctx.currentTime;
    let seg = this.segments[0];
    for (const s of this.segments) if (s.ctxTime <= now) seg = s;
    if (!seg) return this.stoppedPos;
    const pos = seg.pos + Math.max(0, now - seg.ctxTime);
    return Math.min(pos, seg.endPos);
  }

  /** Convierte un instante del AudioContext a posición en la canción. */
  positionAtCtxTime(t: number): number {
    let seg = this.segments[0];
    for (const s of this.segments) if (s.ctxTime <= t) seg = s;
    if (!seg) return this.stoppedPos;
    return seg.pos + (t - seg.ctxTime);
  }

  async play(from?: number) {
    await this.resume();
    if (!this.doc) return;
    const pos = from ?? this.stoppedPos;
    this.startAt(pos);
  }

  private loopActive(): boolean {
    const l = this.doc?.loop;
    return !!l && l.enabled && l.end - l.start > 0.05 && this.autoStop;
  }

  private startAt(pos: number) {
    const ctx = this.ctx;
    this.stopSources();
    const loop = this.doc!.loop;
    let startPos = pos;
    if (this.loopActive() && (pos >= loop.end || pos < loop.start)) startPos = loop.start;
    const t0 = ctx.currentTime + START_LEAD;
    this._playing = true;
    this.segments = [];
    const endPos = this.loopActive() ? loop.end : Number.POSITIVE_INFINITY;
    this.scheduleSegment(startPos, t0, endPos, true);
    this.nextLoopCtx = this.loopActive() ? t0 + (loop.end - startPos) : 0;
    this.metroNextBeatCtx = 0;
    if (!this.schedulerId) this.schedulerId = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private restartFrom(pos: number) {
    if (!this._playing) return;
    this.startAt(pos);
  }

  private holdAutomation(pos: number) {
    if (!this.doc) return;
    for (const t of this.doc.tracks) this.channels.get(t.id)?.ch.holdAutomation(t, pos);
  }

  private scheduleSegment(pos: number, ctxTime: number, endPos: number, reset = false) {
    const doc = this.doc!;
    for (const t of doc.tracks) this.channels.get(t.id)?.ch.scheduleAutomation(t, pos, ctxTime, endPos, reset);
    this.segments.push({ ctxTime, pos, endPos });
    if (this.segments.length > 4) this.segments.shift();
    const srcs = scheduleClips(
      this.ctx,
      doc.clips,
      (id) => this.buffers.get(id),
      (trackId) => this.channels.get(trackId)?.ch.input,
      pos,
      ctxTime,
      endPos,
    );
    this.sources.push(...srcs);
    srcs.forEach((s) => {
      s.source.onended = () => {
        const i = this.sources.indexOf(s);
        if (i >= 0) this.sources.splice(i, 1);
        try { s.gain.disconnect(); } catch { /* noop */ }
      };
    });
  }

  private tick() {
    if (!this._playing || !this._ctx || !this.doc) return;
    const now = this._ctx.currentTime;
    const loop = this.doc.loop;
    if (this.loopActive() && this.nextLoopCtx > 0 && this.nextLoopCtx - now < LOOKAHEAD) {
      this.scheduleSegment(loop.start, this.nextLoopCtx, loop.end);
      this.nextLoopCtx += loop.end - loop.start;
    }
    if (this.metronome) this.scheduleMetronome(now);
    if (!this.loopActive() && this.autoStop) {
      const end = projectEnd(this.doc);
      if (this.getPosition() > end + 0.25) {
        this.pause();
        this.stoppedPos = end > 0 ? end : 0;
        this.endListeners.forEach((l) => l());
      }
    }
  }

  private scheduleMetronome(now: number) {
    const doc = this.doc!;
    const beat = secondsPerBeat(doc.bpm) * (4 / doc.timeSignature[1]);
    const horizon = now + LOOKAHEAD;
    for (const seg of this.segments) {
      const segEndCtx = seg.ctxTime + (seg.endPos - seg.pos);
      const from = Math.max(seg.ctxTime, now, this.metroNextBeatCtx);
      const to = Math.min(horizon, segEndCtx);
      if (to <= from) continue;
      const posFrom = seg.pos + (from - seg.ctxTime);
      let k = Math.ceil(posFrom / beat - 1e-6);
      for (;;) {
        const bpos = k * beat;
        const t = seg.ctxTime + (bpos - seg.pos);
        if (t >= to) break;
        if (t >= from - 1e-4) this.click(t, k % doc.timeSignature[0] === 0);
        this.metroNextBeatCtx = t + 1e-3;
        k++;
      }
    }
  }

  private click(t: number, accent: boolean) {
    const ctx = this._ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    // el metrónomo va directo a la salida: no se graba ni se exporta
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
    osc.onended = () => g.disconnect();
  }

  pause() {
    if (!this._playing) return;
    this.stoppedPos = this.getPosition();
    this._playing = false;
    this.stopSources();
    this.segments = [];
    if (this.schedulerId) { clearInterval(this.schedulerId); this.schedulerId = null; }
    this.holdAutomation(this.stoppedPos);
  }

  stop(rewindTo = 0) {
    this.pause();
    this.stoppedPos = rewindTo;
    this.holdAutomation(rewindTo);
  }

  seek(pos: number) {
    const p = Math.max(0, pos);
    if (this._playing) this.startAt(p);
    else { this.stoppedPos = p; this.holdAutomation(p); }
  }

  private stopSources() {
    for (const s of this.sources) {
      s.source.onended = null;
      try { s.source.stop(); } catch { /* noop */ }
      try { s.gain.disconnect(); } catch { /* noop */ }
    }
    this.sources = [];
  }

  // ---------------------------------------------------------------- medición

  readTrackMeter(trackId: string) {
    return this.channels.get(trackId)?.meter.read() ?? null;
  }
  trackClipped(trackId: string) { return this.channels.get(trackId)?.meter.clipped ?? false; }
  resetTrackClip(trackId: string) { const e = this.channels.get(trackId); if (e) e.meter.clipped = false; }
  readMasterMeter() { return this.masterMeter?.read() ?? null; }
  masterClipped() { return this.masterMeter?.clipped ?? false; }
  resetMasterClip() { if (this.masterMeter) this.masterMeter.clipped = false; }

  readSpectrum(target: string | 'master', out: Float32Array<ArrayBuffer>): boolean {
    const m = target === 'master' ? this.masterMeter : this.channels.get(target)?.meter;
    if (!m || out.length !== m.binCount) return false;
    m.readSpectrum(out);
    return true;
  }

  effectReduction(target: string | 'master', fxId: string): number | null {
    const chain = target === 'master' ? this.master?.fx : this.channels.get(target)?.ch.fx;
    const p = chain?.get(fxId);
    return p?.reduction ? p.reduction() : null;
  }

  /** Nodo de salida (para monitorización de entrada). */
  get monitorDestination(): AudioNode { return this.masterOut ?? this.ctx.destination; }

  latencyInfo() {
    const ctx = this._ctx;
    return {
      base: ctx?.baseLatency ?? 0,
      output: (ctx as AudioContext & { outputLatency?: number })?.outputLatency ?? 0,
      sampleRate: ctx?.sampleRate ?? 0,
    };
  }

  async close() {
    this.pause();
    this.channels.forEach((e) => { e.ch.dispose(); e.meter.dispose(); });
    this.channels.clear();
    if (this._ctx) await this._ctx.close();
    this._ctx = null;
    this.master = null;
  }
}

export const engine = new AudioEngine();
