import { create } from 'zustand';

export type AssetStatus = 'loading' | 'ready' | 'error' | 'missing';

/** Estado de carga/decodificación de audios (los AudioBuffer viven en el motor, no aquí). */
export interface AssetState {
  status: Record<string, AssetStatus>;
  durations: Record<string, number>;
  version: number;
  setStatus(id: string, s: AssetStatus, duration?: number): void;
}

export const useAssets = create<AssetState>((set) => ({
  status: {},
  durations: {},
  version: 0,
  setStatus: (id, s, duration) =>
    set((st) => ({
      status: { ...st.status, [id]: s },
      durations: duration != null ? { ...st.durations, [id]: duration } : st.durations,
      version: st.version + 1,
    })),
}));
