export function Slider({ value, min, max, step = 0.01, onChange, onCommit, label, color, className = '' }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: () => void; label: string; color?: string; className?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className={`range ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ['--pct' as string]: `${pct}%`, ['--fill' as string]: color }}
    />
  );
}
