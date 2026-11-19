import { clamp, faderPosToGain, gainToFaderPos, formatDb } from '@/lib/audioMath';

/** Fader vertical con escala en dB (posición 0.75 = 0 dB). */
export function Fader({ gain, onChange, onCommit, height = 180, label, color = '#8B5CF6' }: { gain: number; onChange: (g: number) => void; onCommit?: () => void; height?: number; label: string; color?: string }) {
  const pos = gainToFaderPos(gain);
  const thumbH = 30;
  const travel = height - thumbH;
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const startY = e.clientY;
    const target = e.target as HTMLElement;
    const onThumb = target.dataset.thumb === '1';
    const startPos = onThumb ? pos : clamp(1 - (e.clientY - rect.top - thumbH / 2) / travel, 0, 1);
    if (!onThumb) onChange(faderPosToGain(startPos));
    const move = (ev: PointerEvent) => {
      const sens = ev.shiftKey ? 0.25 : 1;
      onChange(faderPosToGain(clamp(startPos - ((ev.clientY - startY) / travel) * sens, 0, 1)));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); onCommit?.(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const marks = [6, 0, -6, -12, -24, -48];
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={`${formatDb(gain)} dB`}
      aria-valuenow={Number(pos.toFixed(3))}
      aria-valuemin={0}
      aria-valuemax={1}
      onPointerDown={onPointerDown}
      onDoubleClick={() => { onChange(1); onCommit?.(); }}
      onWheel={(e) => { e.stopPropagation(); onChange(faderPosToGain(clamp(pos - Math.sign(e.deltaY) * 0.01, 0, 1))); }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        if (d) { e.preventDefault(); onChange(faderPosToGain(clamp(pos + d * 0.01, 0, 1))); onCommit?.(); }
      }}
      className="relative w-9 cursor-ns-resize touch-none"
      style={{ height }}
    >
      <div className="absolute left-1/2 top-[15px] bottom-[15px] w-1 -translate-x-1/2 rounded-full bg-[#0B0E14] shadow-[inset_0_0_0_1px_#293241]" />
      <div className="absolute left-1/2 bottom-[15px] w-1 -translate-x-1/2 rounded-full" style={{ height: pos * travel, background: color, opacity: 0.6 }} />
      {marks.map((db) => {
        const p = gainToFaderPos(Math.pow(10, db / 20));
        return <div key={db} className="pointer-events-none absolute left-0 right-0 h-px bg-line" style={{ top: thumbH / 2 + (1 - p) * travel }} />;
      })}
      <div
        data-thumb="1"
        className="absolute left-0 right-0 rounded-[5px] border border-[#3a4558] bg-gradient-to-b from-[#3a4456] to-[#232b39] shadow-[0_2px_6px_rgb(0_0_0/0.6)]"
        style={{ top: (1 - pos) * travel, height: thumbH }}
      >
        <div data-thumb="1" className="absolute left-1.5 right-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded bg-fg/80" />
      </div>
    </div>
  );
}
