import recorderUrl from './recorder.worklet.ts?worker&url';
import gateUrl from './gate.worklet.ts?worker&url';

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

/** Carga los módulos AudioWorklet en un contexto (tiempo real u offline). */
export function ensureWorklets(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    p = (async () => {
      if (!ctx.audioWorklet) return false;
      try {
        await ctx.audioWorklet.addModule(recorderUrl);
        await ctx.audioWorklet.addModule(gateUrl);
        return true;
      } catch (err) {
        console.warn('[sonora] AudioWorklet no disponible', err);
        return false;
      }
    })();
    loaded.set(ctx, p);
  }
  return p;
}
