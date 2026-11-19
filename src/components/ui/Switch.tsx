export function Switch({ checked, onChange, label, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label: string; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 26 : 32, h = size === 'sm' ? 14 : 18;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative shrink-0 rounded-full transition-colors"
      style={{ width: w, height: h, background: checked ? '#8B5CF6' : '#2a3344' }}
    >
      <span className="absolute top-0.5 rounded-full bg-white shadow transition-transform" style={{ width: h - 4, height: h - 4, left: 2, transform: `translateX(${checked ? w - h : 0}px)` }} />
    </button>
  );
}
