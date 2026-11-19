import { beforeEach, describe, expect, it } from 'vitest';
import { useProject } from './projectStore';
import { emptyDoc } from './docOps';

describe('historial deshacer/rehacer', () => {
  beforeEach(() => useProject.getState().load({ id: 'p', name: 'x', createdAt: 0, doc: emptyDoc() }));

  it('deshace y rehace', () => {
    const s = useProject.getState();
    s.apply((d) => ({ ...d, bpm: 100 }));
    s.apply((d) => ({ ...d, bpm: 110 }));
    useProject.getState().undo();
    expect(useProject.getState().doc.bpm).toBe(100);
    useProject.getState().undo();
    expect(useProject.getState().doc.bpm).toBe(90);
    useProject.getState().redo();
    expect(useProject.getState().doc.bpm).toBe(100);
  });
  it('agrupa cambios continuos con la misma clave', () => {
    const s = useProject.getState();
    for (let i = 0; i < 10; i++) s.apply((d) => ({ ...d, masterVolume: i / 10 }), { key: 'fader' });
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().doc.masterVolume).toBe(1);
  });
  it('un cambio nuevo borra el futuro', () => {
    const s = useProject.getState();
    s.apply((d) => ({ ...d, bpm: 100 }));
    useProject.getState().undo();
    useProject.getState().apply((d) => ({ ...d, bpm: 120 }));
    expect(useProject.getState().future).toHaveLength(0);
  });
  it('cambios sin historial no se registran', () => {
    useProject.getState().apply((d) => ({ ...d, bpm: 100 }), { history: false });
    expect(useProject.getState().past).toHaveLength(0);
    expect(useProject.getState().saveStatus).toBe('unsaved');
  });
});
