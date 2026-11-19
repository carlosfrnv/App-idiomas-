import type { EffectSlot } from '@/types/effects';
import type { FxContext } from '@/audio/fx/processors';
import { FxChain } from './FxChain';

export class MasterBus {
  readonly input: GainNode;
  readonly fx: FxChain;
  readonly volume: GainNode;

  constructor(private ctx: BaseAudioContext, destination: AudioNode) {
    this.input = ctx.createGain();
    this.fx = new FxChain(ctx);
    this.volume = ctx.createGain();
    this.input.connect(this.fx.input);
    this.fx.output.connect(this.volume).connect(destination);
  }

  update(volume: number, effects: EffectSlot[], fx: FxContext) {
    if (this.ctx instanceof AudioContext) this.volume.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.012);
    else this.volume.gain.value = volume;
    this.fx.update(effects, fx);
  }
}
