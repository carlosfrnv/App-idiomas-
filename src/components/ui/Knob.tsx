import { useRef } from 'react';
import { clamp } from '@/lib/audioMath';

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  label?: string;
  format?: (v: number) => string;
  size?: number;
  color?: string;
  /** Escala logarítmica (frecuencias, tiempos). */
  log?: boolean;
  bipolar?: boolean;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
}

/** Potenciómetro rotativo: arrastrar vertical, rueda, doble clic = valor por defecto, flechas. */
export function Knob({ value, min, max, defaultValue, onChange, onCommit, label, format, size = 40, color = '#8B5CF6', log, bipolar, step, disabled, showValue = true }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const toNorm = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromNorm = (n: number) => {
    const c = clamp(n, 0, 1);
    let v = log ? min * Math.pow(max / min, c) : min + c * (max - min);
    if (step) v = Math.round(v / step) * step;
    return clamp(v, min, max);
  };
  const norm = clamp(toNorm(value), 0, 1);
  const a0 = -135, a1 = 135;
  const ang = a0 + norm * (a1 - a0);
  const r = size / 2 - 3;
  const arc = (from: number, to: number) => {
    const p = (deg: number) => { const rad = ((deg - 90) * Math.PI) / 180; return [size / 2 + r * Math.cos(rad), size / 2 + r * Math.sin(rad)]; };
    const [x0, y0] = p(from), [x1, y1] = p(to);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${x1} ${y1}`;
  };
  const center = bipolar ? 0 : a0;
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startN = norm;
    const move = (ev: PointerEvent) => {
      const sens = ev.shiftKey ? 600 : 160;
      onChange(fromNorm(startN + (startY - ev.clientY) / sens));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); onCommit?.(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const text = format ? format(value) : value.toFixed(1);
  return (
    <div className={`flex flex-col items-center gap-1 select-none ${disabled ? 'opacity-40' : ''}`}>
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={text}
        data-tip={label ? `${label}: ${text}` : text}
        data-tip-pos="top"
        onPointerDown={onPointerDown}
        onDoubleClick={() => { if (defaultValue != null && !disabled) { onChange(defaultValue); onCommit?.(); } }}
        onWheel={(e) => { if (disabled) return; e.stopPropagation(); onChange(fromNorm(norm - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02))); }}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (d) { e.preventDefault(); onChange(fromNorm(norm + d * (e.shiftKey ? 0.005 : 0.02))); onCommit?.(); }
        }}
        className="cursor-ns-resize rounded-full touch-none"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r - 4} fill="#1C2330" stroke="#0B0E14" strokeWidth={1} />
          <path d={arc(a0, a1)} stroke="#2a3344" strokeWidth={3} fill="none" strokeLinecap="round" />
          {Math.abs(ang - center) > 0.5 && <path d={ang > center ? arc(center, ang) : arc(ang, center)} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />}
          <line
            x1={size / 2} y1={size / 2}
            x2={size / 2 + (r - 7) * Math.cos(((ang - 90) * Math.PI) / 180)}
            y2={size / 2 + (r - 7) * Math.sin(((ang - 90) * Math.PI) / 180)}
            stroke="#F5F7FA" strokeWidth={2} strokeLinecap="round"
          />
        </svg>
      </div>
      {label && showValue && <div className="text-[10px] font-semibold uppercase tracking-wider text-dim leading-none">{label}</div>}
      {showValue && <div className="font-mono text-[10px] text-muted tnum leading-none">{text}</div>}
    </div>
  );
}
