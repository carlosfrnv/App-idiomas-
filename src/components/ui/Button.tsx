import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'hw-primary text-white',
  ghost: 'text-muted hover:text-fg hover:bg-white/[0.04]',
  subtle: 'hw text-fg',
  danger: 'bg-rec text-white border border-[#b91c1c] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:brightness-110',
  outline: 'border border-line text-fg hover:bg-white/[0.04]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  tip?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'subtle', size = 'md', icon, tip, className = '', children, ...rest }, ref) {
  // rótulos de tecla: mayúsculas anchas con espaciado, como serigrafía
  const sz = size === 'sm' ? 'h-7 px-2.5 text-[10px] gap-1.5' : size === 'lg' ? 'h-11 px-5 text-[12px] gap-2' : 'h-8 px-3 text-[11px] gap-2';
  return (
    <button ref={ref} type="button" data-tip={tip} className={`inline-flex items-center justify-center rounded-sm font-bold uppercase tracking-[0.1em] [font-stretch:112%] transition-[background,transform,box-shadow] duration-100 disabled:opacity-40 ${sz} ${variants[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  activeClass?: string;
  size?: 'sm' | 'md' | 'lg';
  tipPos?: 'top' | 'right' | 'left';
  showTip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, active, activeClass = 'bg-primary/20 text-primary', size = 'md', tipPos, showTip = true, className = '', children, ...rest }, ref) {
  const sz = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tip={showTip ? label : undefined}
      data-tip-pos={tipPos}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-35 ${sz} ${active ? activeClass : 'text-muted hover:text-fg hover:bg-surface'} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Botón compacto de letra (M / S / R) para pistas y canales. */
export function LetterToggle({ letter, label, active, color, onClick, disabled }: { letter: string; label: string; active: boolean; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative h-6 w-6 shrink-0 rounded-sm text-[10px] font-extrabold [font-stretch:125%] transition-[transform] active:translate-y-px disabled:opacity-40"
      style={active
        ? { background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 75%, #000))`, color: '#0B0E14', boxShadow: `inset 0 1px 0 rgb(255 255 255 / .35), 0 0 10px -2px ${color}` }
        : { background: 'linear-gradient(180deg,#252D3B,#1B212C)', color: '#9BA7B7', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / .06), inset 0 0 0 1px #2E3747, 0 1px 0 rgb(0 0 0 / .5)' }}
    >
      {letter}
    </button>
  );
}
