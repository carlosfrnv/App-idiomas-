import type { Track } from '@/types/project';
import type { FxContext } from '@/audio/fx/processors';
import { FxChain } from './FxChain';
import { activeLane, scheduleLane, valueAt } from './automation';

/**
 * Tira de canal: input → FX → volumen → pan → mute/solo → salida.
 * Funciona sobre cualquier BaseAudioContext (tiempo real y offline).
 */
export class TrackChannel {
  readonly input: GainNode;
  readonly fx: FxChain;
  readonly volume: GainNode;
  readonly panner: StereoPannerNode;
  readonly audible: GainNode;

  constructor(private ctx: BaseAudioContext, destination: AudioNode) {
    this.input = ctx.createGain();
    this.fx = new FxChain(ctx);
    this.volume = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.audible = ctx.createGain();
    this.input.connect(this.fx.input);
    this.fx.output.connect(this.volume).connect(this.panner).connect(this.audible).connect(destination);
  }

  get output(): AudioNode { return this.audible; }

  update(track: Track, audible: boolean, fx: FxContext, immediate = false) {
    const t = this.ctx.currentTime;
    const smooth = !immediate && this.ctx instanceof AudioContext;
    const setp = (p: AudioParam, v: number) => (smooth ? p.setTargetAtTime(v, t, 0.012) : (p.value = v));
    // con automatización activa, el parámetro lo gobierna la curva (modo "lectura")
    if (!activeLane(track, 'volume')) setp(this.volume.gain, track.volume);
    if (!activeLane(track, 'pan')) setp(this.panner.pan, Math.max(-1, Math.min(1, track.pan)));
    setp(this.audible.gain, audible ? 1 : 0);
    this.fx.update(track.effects, fx);
  }

  /** Programa la automatización para un tramo de reproducción. `reset` borra lo programado antes. */
  scheduleAutomation(track: Track, segPos: number, segCtx: number, segEnd: number, reset: boolean) {
    for (const [param, node] of [['volume', this.volume.gain], ['pan', this.panner.pan]] as const) {
      const lane = activeLane(track, param);
      if (!lane) continue;
      if (reset) node.cancelScheduledValues(0);
      scheduleLane(node, lane.points, segPos, segCtx, segEnd);
    }
  }

  /** Valor estático de la automatización en una posición (transporte parado). */
  holdAutomation(track: Track, pos: number) {
    for (const [param, node] of [['volume', this.volume.gain], ['pan', this.panner.pan]] as const) {
      const lane = activeLane(track, param);
      if (!lane) continue;
      node.cancelScheduledValues(0);
      node.value = valueAt(lane.points, pos);
    }
  }

  dispose() {
    this.fx.dispose();
    [this.input, this.volume, this.panner, this.audible].forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
  }
}
