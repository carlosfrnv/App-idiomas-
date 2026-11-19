import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Almacenamiento seguro: no falla en modo privado o con cookies bloqueadas. */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* noop */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

export interface SettingsState {
  inputDeviceId: string | null;
  inputGain: number;
  monitor: boolean;
  /** Corrección manual de latencia en ms (positiva = adelanta la toma). */
  latencyOffsetMs: number;
  /** Usar la latencia informada por el navegador. */
  autoLatency: boolean;
  lastProjectId: string | null;
  tutorialDone: boolean;
  headphonesTipDismissed: boolean;
  set(p: Partial<SettingsState>): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      inputDeviceId: null,
      inputGain: 1,
      monitor: false,
      latencyOffsetMs: 0,
      autoLatency: true,
      lastProjectId: null,
      tutorialDone: false,
      headphonesTipDismissed: false,
      set: (p) => set(p),
    }),
    { name: 'sonora-settings', storage: createJSONStorage(() => safeStorage), partialize: ({ set: _s, ...rest }) => rest },
  ),
);
