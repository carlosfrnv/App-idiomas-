/** Un único requestAnimationFrame compartido por cabezal, relojes y medidores. */
type Fn = (now: number) => void;
const subs = new Set<Fn>();
let raf = 0;

function loop(now: number) {
  subs.forEach((f) => { try { f(now); } catch (e) { console.error(e); } });
  raf = subs.size ? requestAnimationFrame(loop) : 0;
}

export function onFrame(fn: Fn): () => void {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => { subs.delete(fn); };
}
