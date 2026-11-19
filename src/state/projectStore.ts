import { create } from 'zustand';
import type { ProjectDoc } from '@/types/project';
import { emptyDoc } from './docOps';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'idle';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export interface ProjectState {
  projectId: string | null;
  name: string;
  createdAt: number;
  doc: ProjectDoc;
  past: ProjectDoc[];
  future: ProjectDoc[];
  /** Se incrementa con cada cambio del documento o del nombre (para el autoguardado). */
  revision: number;
  savedRevision: number;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastKey: string | null;
  lastAt: number;

  load(p: { id: string; name: string; createdAt: number; doc: ProjectDoc }): void;
  close(): void;
  /**
   * Aplica un cambio. `key` agrupa cambios continuos (p. ej. arrastrar un fader) en un solo
   * paso de historial. `history: false` no registra (estado transitorio durante un arrastre).
   */
  apply(fn: (d: ProjectDoc) => ProjectDoc, opts?: { key?: string; history?: boolean }): void;
  /** Registra un punto de historial explícito (p. ej. al empezar a arrastrar un clip). */
  checkpoint(): void;
  undo(): void;
  redo(): void;
  rename(name: string): void;
  markSaved(revision: number): void;
  setSaveStatus(s: SaveStatus, err?: string | null): void;
}

export const useProject = create<ProjectState>((set, get) => ({
  projectId: null,
  name: '',
  createdAt: 0,
  doc: emptyDoc(),
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,
  saveStatus: 'idle',
  saveError: null,
  lastKey: null,
  lastAt: 0,

  load: (p) => set({ projectId: p.id, name: p.name, createdAt: p.createdAt, doc: p.doc, past: [], future: [], revision: 0, savedRevision: 0, saveStatus: 'saved', saveError: null, lastKey: null }),
  close: () => set({ projectId: null, name: '', doc: emptyDoc(), past: [], future: [], revision: 0, savedRevision: 0, saveStatus: 'idle' }),

  apply: (fn, opts = {}) => {
    const s = get();
    const next = fn(s.doc);
    if (next === s.doc) return;
    const now = Date.now();
    const history = opts.history !== false;
    const coalesce = history && opts.key != null && opts.key === s.lastKey && now - s.lastAt < COALESCE_MS;
    set({
      doc: next,
      past: history && !coalesce ? [...s.past, s.doc].slice(-HISTORY_LIMIT) : s.past,
      future: history ? [] : s.future,
      revision: s.revision + 1,
      saveStatus: 'unsaved',
      lastKey: history ? (opts.key ?? null) : s.lastKey,
      lastAt: now,
    });
  },

  checkpoint: () => {
    const s = get();
    set({ past: [...s.past, s.doc].slice(-HISTORY_LIMIT), future: [], lastKey: null });
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], revision: s.revision + 1, saveStatus: 'unsaved', lastKey: null });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), revision: s.revision + 1, saveStatus: 'unsaved', lastKey: null });
  },

  rename: (name) => set((s) => ({ name, revision: s.revision + 1, saveStatus: 'unsaved' })),
  markSaved: (revision) => set((s) => ({ savedRevision: revision, saveStatus: s.revision === revision ? 'saved' : 'unsaved', saveError: null })),
  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
}));
