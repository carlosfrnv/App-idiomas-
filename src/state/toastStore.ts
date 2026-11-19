import { create } from 'zustand';
import { uid } from '@/lib/id';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';
export interface Toast { id: string; kind: ToastKind; title: string; message?: string }

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>, ttl?: number): void;
  dismiss(id: string): void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, ttl = 4500) => {
    const id = uid('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (title: string, message?: string) => useToasts.getState().push({ kind: 'info', title, message }),
  success: (title: string, message?: string) => useToasts.getState().push({ kind: 'success', title, message }),
  warning: (title: string, message?: string) => useToasts.getState().push({ kind: 'warning', title, message }, 7000),
  error: (title: string, message?: string) => useToasts.getState().push({ kind: 'error', title, message }, 9000),
};
