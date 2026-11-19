import { create } from 'zustand';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmReq { title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void }
const useConfirmStore = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Confirmación de acciones destructivas (promesa). */
export function confirmAction(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const close = (ok: boolean) => { req?.resolve(ok); set(null); };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.title ?? ''}
      width={420}
      icon={req?.danger ? <AlertTriangle size={18} className="text-rec" /> : undefined}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
        <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{req?.confirmLabel ?? 'Confirmar'}</Button>
      </>}
    >
      <p className="text-sm text-muted">{req?.message}</p>
    </Modal>
  );
}
