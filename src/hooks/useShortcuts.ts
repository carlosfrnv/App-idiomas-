import { useEffect } from 'react';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { rewind, setMetronome, toggleLoop, togglePlay } from '@/app/transport';
import { toggleRecord } from '@/app/recording';
import { addEmptyTrack, deleteSelection, duplicateSelection, splitAtPlayhead } from '@/app/editing';
import { saveProjectNow } from '@/app/projects';
import { useTransport } from '@/state/transportStore';

/** ¿El foco está en un campo de texto? (los atajos no deben dispararse) */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (el.isContentEditable) return true;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }
  return false;
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const ui = useUi.getState();
      const run = (fn: () => unknown) => { e.preventDefault(); void fn(); };
      if (mod && k === 'z' && e.shiftKey) return run(() => useProject.getState().redo());
      if (mod && k === 'y') return run(() => useProject.getState().redo());
      if (mod && k === 'z') return run(() => useProject.getState().undo());
      if (mod && k === 's') return run(saveProjectNow);
      if (mod && k === 'd') return run(duplicateSelection);
      if (mod && k === 'a') return run(() => ui.selectClips(useProject.getState().doc.clips.map((c) => c.id)));
      if (mod) return;
      if (e.altKey) return;
      switch (e.key) {
        case ' ':
          // evitar que la barra active el botón con foco
          return run(togglePlay);
        case 'Home':
        case 'Enter':
          return run(rewind);
        case 'Delete':
        case 'Backspace':
          return run(deleteSelection);
        case '+':
        case '=':
          return run(() => ui.zoomBy(1.4, ui.scrollTime + ui.viewportWidth / 2 / ui.pxPerSec, ui.viewportWidth / 2));
        case '-':
          return run(() => ui.zoomBy(1 / 1.4, ui.scrollTime + ui.viewportWidth / 2 / ui.pxPerSec, ui.viewportWidth / 2));
        case '?':
          return run(() => ui.set({ helpOpen: true }));
        case 'Escape':
          return run(() => ui.set({ selectedClipIds: [] }));
      }
      if (e.repeat) return;
      switch (k) {
        case 'r': return run(toggleRecord);
        case 'l': return run(toggleLoop);
        case 'k': return run(() => setMetronome(!useTransport.getState().metronome));
        case 's': return run(splitAtPlayhead);
        case 'n': return run(() => addEmptyTrack());
        case 'b': return run(() => ui.set({ libraryOpen: !ui.libraryOpen }));
        case 'm': return run(() => ui.set({ bottomPanel: ui.bottomPanel === 'mixer' ? null : 'mixer' }));
        case 'e': return run(() => ui.set({ bottomPanel: ui.bottomPanel === 'fx' ? null : 'fx' }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
