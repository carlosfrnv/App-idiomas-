import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem { label: string; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
export type MenuEntry = MenuItem | 'separator' | { header: string };

/** Menú flotante (desplegable o contextual) posicionado en coordenadas de pantalla. */
export function FloatingMenu({ x, y, items, onClose, minWidth = 200 }: { x: number; y: number; items: MenuEntry[]; onClose: () => void; minWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] rounded-lg border border-line bg-[#111620] p-1 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.9)] animate-pop"
      style={{ left: pos.x, top: pos.y, minWidth }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }}
    >
      {items.map((it, i) => {
        if (it === 'separator') return <div key={i} className="my-1 h-px bg-line" />;
        if ('header' in it) return <div key={i} className="px-2.5 pb-1 pt-2 label-xs">{it.header}</div>;
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { onClose(); it.onSelect(); }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] outline-none disabled:opacity-40 ${it.danger ? 'text-rec hover:bg-rec/10 focus:bg-rec/10' : 'text-fg hover:bg-surface focus:bg-surface'}`}
          >
            <span className="flex w-4 justify-center text-muted">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="font-mono text-[10px] text-dim">{it.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Hook de conveniencia para abrir un menú desde un botón o un clic derecho. */
export function useMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  return {
    open: (x: number, y: number, items: MenuEntry[]) => setState({ x, y, items }),
    openFrom: (el: HTMLElement, items: MenuEntry[]) => { const r = el.getBoundingClientRect(); setState({ x: r.left, y: r.bottom + 4, items }); },
    element: state ? <FloatingMenu {...state} onClose={() => setState(null)} /> : null,
  };
}
