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
          {/* marcas de escala serigrafiadas */}
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((a0 + (i / 10) * (a1 - a0) - 90) * Math.PI) / 180;
            const r1 = size / 2 - 1, r2 = size / 2 - (i % 5 === 0 ? 4.5 : 3);
            return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke={i / 10 <= norm + 1e-6 && (!bipolar || true) ? color : '#3A4558'} strokeOpacity={i / 10 <= norm + 1e-6 ? 0.9 : 1} strokeWidth={1} />;
          })}
          {/* capuchón moleteado */}
          <circle cx={size / 2} cy={size / 2} r={r - 5} fill="url(#knob-cap)" stroke="#0B0E14" strokeWidth={1} />
          <defs>
            <radialGradient id="knob-cap" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#3A4456" /><stop offset="0.6" stopColor="#1E2531" /><stop offset="1" stopColor="#141922" /></radialGradient>
          </defs>
          {Math.abs(ang - center) > 0.5 && <path d={ang > center ? arc(center, ang) : arc(ang, center)} stroke={color} strokeWidth={2} fill="none" strokeOpacity={0.55} transform={`scale(${(r - 4.5) / r}) translate(${(size / 2) * (r / (r - 4.5) - 1)} ${(size / 2) * (r / (r - 4.5) - 1)})`} />}
          <line
            x1={size / 2 + (r - 14 > 3 ? 3 : 1) * Math.cos(((ang - 90) * Math.PI) / 180)} y1={size / 2 + (r - 14 > 3 ? 3 : 1) * Math.sin(((ang - 90) * Math.PI) / 180)}
            x2={size / 2 + (r - 7) * Math.cos(((ang - 90) * Math.PI) / 180)}
            y2={size / 2 + (r - 7) * Math.sin(((ang - 90) * Math.PI) / 180)}
            stroke="#F5F7FA" strokeWidth={2} strokeLinecap="square"
          />
        </svg>
      </div>
      {label && showValue && <div className="label-xs leading-none">{label}</div>}
      {showValue && <div className="font-mono text-[9px] text-muted tnum leading-none">{text}</div>}
    </div>
  );
}
