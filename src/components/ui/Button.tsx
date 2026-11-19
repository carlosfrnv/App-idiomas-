import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong shadow-[0_1px_0_0_rgb(255_255_255/0.15)_inset]',
  ghost: 'text-muted hover:text-fg hover:bg-surface',
  subtle: 'bg-surface text-fg hover:bg-surface-2 border border-line',
  danger: 'bg-rec/90 text-white hover:bg-rec',
  outline: 'border border-line text-fg hover:bg-surface',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  tip?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'subtle', size = 'md', icon, tip, className = '', children, ...rest }, ref) {
  const sz = size === 'sm' ? 'h-7 px-2.5 text-xs gap-1.5' : size === 'lg' ? 'h-11 px-5 text-sm gap-2' : 'h-8 px-3 text-[13px] gap-2';
  return (
    <button ref={ref} type="button" data-tip={tip} className={`inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 disabled:opacity-40 ${sz} ${variants[variant]} ${className}`} {...rest}>
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
      className="h-6 w-6 shrink-0 rounded text-[11px] font-bold transition-colors disabled:opacity-40"
      style={active ? { background: color, color: '#0B0E14' } : { background: '#1C2330', color: '#9BA7B7', boxShadow: 'inset 0 0 0 1px #293241' }}
    >
      {letter}
    </button>
  );
}
