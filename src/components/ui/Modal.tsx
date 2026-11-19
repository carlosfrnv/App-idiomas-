import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, subtitle, children, footer, width = 520, icon }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; width?: number; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[autofocus], input, select, button:not([data-close])')?.focus(), 0);
    return () => { window.removeEventListener('keydown', k, true); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_80px_-20px_rgb(0_0_0/0.9)] animate-pop" style={{ maxWidth: width }}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon && <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-primary">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button data-close type="button" aria-label="Cerrar" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-bg/40 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
