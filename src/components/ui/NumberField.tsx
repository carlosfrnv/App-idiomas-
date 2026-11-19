import { useEffect, useState } from 'react';
import { clamp } from '@/lib/audioMath';

/** Campo numérico: escribir, arrastrar vertical o rueda. */
export function NumberField({ value, min, max, step = 1, onChange, label, suffix, width = 56, decimals = 0 }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string; width?: number; decimals?: number }) {
  const [text, setText] = useState(value.toFixed(decimals));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value.toFixed(decimals)); }, [value, focused, decimals]);
  const commit = (v: number) => onChange(clamp(Math.round(v / step) * step, min, max));
  return (
    <div className="flex items-center rounded-md border border-line bg-bg/70 pr-2 focus-within:border-primary" data-tip={`${label} — arrastra o escribe`}>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocused(false); const v = parseFloat(text.replace(',', '.')); if (isFinite(v)) commit(v); else setText(value.toFixed(decimals)); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit(value + (e.key === 'ArrowUp' ? step : -step)); }
        }}
        onPointerDown={(e) => {
          if (document.activeElement === e.currentTarget) return;
          const el = e.currentTarget;
          const y0 = e.clientY, v0 = value;
          let dragged = false;
          const move = (ev: PointerEvent) => {
            if (Math.abs(ev.clientY - y0) > 3) dragged = true;
            if (dragged) commit(v0 + Math.round((y0 - ev.clientY) / 4) * step);
          };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!dragged) el.focus(); };
          e.preventDefault();
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        className="h-7 cursor-ns-resize bg-transparent px-2 text-right font-mono text-[13px] font-semibold text-fg outline-none tnum focus:cursor-text"
        style={{ width }}
      />
      {suffix && <span className="text-[10px] font-semibold text-dim">{suffix}</span>}
    </div>
  );
}
