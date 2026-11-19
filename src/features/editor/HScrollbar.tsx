import { useUi } from '@/state/uiStore';
import { useProject } from '@/state/projectStore';
import { projectEnd } from '@/state/docOps';

export function HScrollbar() {
  const { pxPerSec, scrollTime, viewportWidth } = useUi();
  const end = useProject((s) => projectEnd(s.doc));
  const visible = viewportWidth / pxPerSec;
  const total = Math.max(end + 30, scrollTime + visible, 60);
  const thumbW = Math.max(28, (visible / total) * viewportWidth);
  const thumbX = (scrollTime / total) * viewportWidth;
  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const onThumb = (e.target as HTMLElement).dataset.thumb === '1';
    const x0 = e.clientX, s0 = onThumb ? scrollTime : Math.max(0, ((e.clientX - rect.left - thumbW / 2) / viewportWidth) * total);
    if (!onThumb) useUi.getState().set({ scrollTime: s0 });
    const move = (ev: PointerEvent) => useUi.getState().set({ scrollTime: Math.max(0, s0 + ((ev.clientX - x0) / viewportWidth) * total) });
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div className="relative h-3 touch-none bg-panel" onPointerDown={onPointerDown} role="scrollbar" aria-orientation="horizontal" aria-valuenow={Math.round(scrollTime)} aria-label="Desplazamiento horizontal">
      <div data-thumb="1" className="absolute top-[3px] h-1.5 rounded-full bg-[#2f394b] hover:bg-[#3d4960]" style={{ left: thumbX, width: thumbW }} />
    </div>
  );
}
