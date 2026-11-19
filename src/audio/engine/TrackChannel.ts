import type { Track } from '@/types/project';
import type { FxContext } from '@/audio/fx/processors';
import { FxChain } from './FxChain';

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
    setp(this.volume.gain, track.volume);
    setp(this.panner.pan, Math.max(-1, Math.min(1, track.pan)));
    setp(this.audible.gain, audible ? 1 : 0);
    this.fx.update(track.effects, fx);
  }

  dispose() {
    this.fx.dispose();
    [this.input, this.volume, this.panner, this.audible].forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
  }
}
