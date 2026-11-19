/** Interruptor de palanca rectangular con LED. */
export function Switch({ checked, onChange, label, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label: string; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 26 : 32, h = size === 'sm' ? 14 : 16;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative shrink-0 rounded-[2px] border border-[#0B0E14] transition-colors"
      style={{ width: w, height: h, background: checked ? 'linear-gradient(180deg,#6D3FE0,#8B5CF6)' : '#141922', boxShadow: 'inset 0 1px 3px rgb(0 0 0 / .7)' }}
    >
      <span
        className="absolute top-[1px] rounded-[1px] transition-transform duration-150"
        style={{ width: h - 4, height: h - 4, left: 1, transform: `translateX(${checked ? w - h : 0}px)`, background: 'linear-gradient(180deg,#F5F7FA,#9BA7B7)', boxShadow: '0 1px 2px rgb(0 0 0 / .6)' }}
      />
    </button>
  );
}
