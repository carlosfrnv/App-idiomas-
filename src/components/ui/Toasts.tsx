import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToasts } from '@/state/toastStore';

const icons = { success: CheckCircle2, error: AlertCircle, info: Info, warning: AlertTriangle };
const colors = { success: 'text-ok', error: 'text-rec', info: 'text-sky', warning: 'text-warn' };

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div key={t.id} data-testid={`toast-${t.kind}`} className="pointer-events-auto flex gap-3 rounded-lg border border-line bg-panel/95 p-3 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur animate-pop">
            <Icon size={18} className={`mt-0.5 shrink-0 ${colors[t.kind]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-muted">{t.message}</div>}
            </div>
            <button aria-label="Cerrar aviso" onClick={() => dismiss(t.id)} className="self-start rounded p-0.5 text-dim hover:text-fg"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
