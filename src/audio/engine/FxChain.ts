import type { EffectSlot } from '@/types/effects';
import { createProcessor, isCompatible, type EffectProcessor, type FxContext } from '@/audio/fx/processors';

/** Cadena de inserción reconciliable: reutiliza procesadores y sólo recablea si cambia la estructura. */
export class FxChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private procs: { id: string; p: EffectProcessor }[] = [];
  private structureKey = '';

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  update(slots: EffectSlot[], fx: FxContext) {
    const key = slots.map((s) => `${s.id}:${s.type}:${s.type === 'eq' ? s.params.bands.length : ''}`).join('|');
    if (key !== this.structureKey) {
      const old = new Map(this.procs.map((x) => [x.id, x.p]));
      const next: { id: string; p: EffectProcessor }[] = [];
      for (const s of slots) {
        const existing = old.get(s.id);
        if (existing && isCompatible(existing, s)) { old.delete(s.id); next.push({ id: s.id, p: existing }); }
        else next.push({ id: s.id, p: createProcessor(this.ctx, s, fx) });
      }
      old.forEach((p) => p.dispose());
      // recablear
      this.input.disconnect();
      for (const x of next) try { x.p.output.disconnect(); } catch { /* noop */ }
      let prev: AudioNode = this.input;
      for (const x of next) { prev.connect(x.p.input); prev = x.p.output; }
      prev.connect(this.output);
      this.procs = next;
      this.structureKey = key;
    }
    slots.forEach((s, i) => this.procs[i].p.update(s, fx));
  }

  get(id: string): EffectProcessor | undefined {
    return this.procs.find((x) => x.id === id)?.p;
  }

  dispose() {
    this.procs.forEach((x) => x.p.dispose());
    this.procs = [];
    try { this.input.disconnect(); this.output.disconnect(); } catch { /* noop */ }
  }
}
