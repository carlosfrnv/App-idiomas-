import { Keyboard } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useUi } from '@/state/uiStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

export const SHORTCUTS: [string, string][] = [
  ['Espacio', 'Reproducir / pausar'],
  ['R', 'Grabar / detener grabación'],
  ['Inicio / Enter', 'Volver al inicio'],
  ['L', 'Activar / desactivar bucle'],
  ['K', 'Metrónomo'],
  ['S', 'Dividir clip en el cabezal'],
  [`${mod}+D`, 'Duplicar selección'],
  ['Supr / Retroceso', 'Eliminar selección'],
  [`${mod}+Z`, 'Deshacer'],
  [`${mod}+Shift+Z`, 'Rehacer'],
  [`${mod}+S`, 'Guardar'],
  [`${mod}+A`, 'Seleccionar todos los clips'],
  ['+ / −', 'Acercar / alejar'],
  [`${mod}+rueda`, 'Zoom en el puntero'],
  ['Shift+rueda', 'Desplazamiento horizontal'],
  ['Shift (arrastrando)', 'Ignorar ajuste a rejilla'],
  ['M / E', 'Mezclador / Efectos'],
  ['B', 'Mostrar / ocultar biblioteca'],
  ['N', 'Nueva pista'],
  ['?', 'Esta ayuda'],
];

export function HelpDialog() {
  const open = useUi((s) => s.helpOpen);
  return (
    <Modal open={open} onClose={() => useUi.getState().set({ helpOpen: false })} title="Atajos de teclado" icon={<Keyboard size={18} />} width={560}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5">
            <span className="text-[13px] text-muted">{v}</span>
            <kbd className="whitespace-nowrap rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-dim">Los atajos no se activan mientras escribes en un campo de texto.</p>
    </Modal>
  );
}
