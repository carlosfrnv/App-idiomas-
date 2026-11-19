import { create } from 'zustand';

export type BottomPanel = 'fx' | 'mixer' | 'clip' | 'lyrics' | null;
export type LibraryTab = 'files' | 'beats' | 'recordings' | 'tracks' | 'effects' | 'presets' | 'projects' | 'sounds';

export interface UiState {
  pxPerSec: number;
  scrollTime: number;
  viewportWidth: number;
  heightScale: number;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  fxTarget: string | 'master' | null;
  snap: boolean;
  bottomPanel: BottomPanel;
  bottomHeight: number;
  libraryOpen: boolean;
  libraryTab: LibraryTab;
  exportOpen: boolean;
  settingsOpen: boolean;
  recordSetupOpen: boolean;
  helpOpen: boolean;
  set(p: Partial<UiState>): void;
  selectClips(ids: string[], additive?: boolean): void;
  zoomBy(factor: number, anchorTime?: number, anchorPx?: number): void;
}

export const MIN_PX_PER_SEC = 2;
export const MAX_PX_PER_SEC = 2000;

export const useUi = create<UiState>((set, get) => ({
  pxPerSec: 40,
  scrollTime: 0,
  viewportWidth: 800,
  heightScale: 1,
  selectedClipIds: [],
  selectedTrackId: null,
  fxTarget: null,
  snap: true,
  bottomPanel: 'mixer',
  bottomHeight: 360,
  libraryOpen: true,
  libraryTab: 'files',
  exportOpen: false,
  settingsOpen: false,
  recordSetupOpen: false,
  helpOpen: false,
  set: (p) => set(p),
  selectClips: (ids, additive = false) =>
    set((s) => ({ selectedClipIds: additive ? [...new Set([...s.selectedClipIds, ...ids])] : ids })),
  zoomBy: (factor, anchorTime, anchorPx) => {
    const s = get();
    const px = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, s.pxPerSec * factor));
    if (anchorTime == null || anchorPx == null) {
      set({ pxPerSec: px });
      return;
    }
    // mantiene fijo el instante bajo el puntero
    set({ pxPerSec: px, scrollTime: Math.max(0, anchorTime - anchorPx / px) });
  },
}));
