import { repository, requestPersistentStorage } from '@/persistence/localRepository';
import { useProject } from '@/state/projectStore';
import { useSettings } from '@/state/settingsStore';
import { useTransport } from '@/state/transportStore';
import { useUi } from '@/state/uiStore';
import { addClip, addTrack, emptyDoc, makeClip, makeTrack, projectEnd } from '@/state/docOps';
import { engine } from '@/audio/engine/AudioEngine';
import { thumbnail, computePeaks } from '@/audio/waveform/peaks';
import { encodeWav } from '@/audio/export/wav';
import { renderDemoBeat, DEMO_STYLES, type DemoStyle } from '@/audio/demo/demoBeat';
import { loadDocAssets, storeGeneratedAudio } from './assets';
import { toast } from '@/state/toastStore';
import { uid } from '@/lib/id';
import type { ProjectDoc, StoredProject } from '@/types/project';

export async function openProject(id: string): Promise<boolean> {
  const p = await repository.getProject(id);
  if (!p) {
    toast.error('No se encontró el proyecto', 'Puede que se haya eliminado.');
    useSettings.getState().set({ lastProjectId: null });
    return false;
  }
  engine.stop(0);
  useTransport.getState().set({ playing: false, recording: false, position: 0 });
  const doc = migrateDoc(p.doc);
  useProject.getState().load({ id: p.id, name: p.name, createdAt: p.createdAt, doc });
  useUi.getState().set({ selectedClipIds: [], selectedTrackId: doc.tracks[0]?.id ?? null, scrollTime: 0, fxTarget: doc.tracks[0]?.id ?? null });
  useSettings.getState().set({ lastProjectId: p.id });
  const { missing } = await loadDocAssets(doc);
  if (missing > 0) toast.warning('Audio no disponible', `${missing} archivo(s) de audio no se pudieron cargar.`);
  void requestPersistentStorage();
  return true;
}

function migrateDoc(doc: ProjectDoc): ProjectDoc {
  return { ...emptyDoc(), ...doc, loop: doc.loop ?? emptyDoc().loop, masterEffects: doc.masterEffects ?? [], lyrics: { ...emptyDoc().lyrics!, ...(doc.lyrics ?? {}) } };
}

export async function createProject(name = 'Proyecto sin título', opts: { demo?: DemoStyle } = {}): Promise<string> {
  const now = Date.now();
  let doc = emptyDoc();
  if (opts.demo) {
    const style = DEMO_STYLES[opts.demo];
    doc = { ...doc, bpm: style.bpm };
    const { asset } = await createDemoAsset(opts.demo);
    const beat = makeTrack(doc, { name: 'Instrumental', color: '#38BDF8' });
    doc = addTrack(doc, beat);
    doc = addClip(doc, makeClip({ trackId: beat.id, assetId: asset.id, name: asset.name, start: 0, duration: asset.duration }));
    const vox = makeTrack(doc, { name: 'Voz principal', color: '#8B5CF6', armed: true });
    doc = addTrack(doc, vox);
  }
  const p: StoredProject = { id: uid('prj'), name, createdAt: now, updatedAt: now, doc };
  await repository.saveProject(p);
  await openProject(p.id);
  return p.id;
}

export async function createDemoAsset(style: DemoStyle) {
  const def = DEMO_STYLES[style];
  const buf = await renderDemoBeat(44100, style);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  const blob = new Blob([encodeWav({ sampleRate: buf.sampleRate, channels: chans }, 16)], { type: 'audio/wav' });
  // Se registra en el contexto del motor (mismo AudioBuffer offline: compatible con cualquier contexto)
  const asset = await storeGeneratedAudio(buf, blob, def.name, 'demo');
  return { asset, buffer: buf };
}

function projectThumbnail(doc: ProjectDoc): number[] | undefined {
  const end = projectEnd(doc);
  if (end <= 0) return undefined;
  const cols = 48;
  const out = new Array(cols).fill(0);
  for (const c of doc.clips) {
    const buf = engine.getBuffer(c.assetId);
    if (!buf) continue;
    const pk = engine.getPeaks(c.assetId) ?? computePeaks([buf.getChannelData(0)], buf.sampleRate);
    const th = thumbnail(pk, Math.max(1, Math.round((buf.duration / end) * cols)));
    const colDur = end / cols;
    for (let i = 0; i < cols; i++) {
      const t = i * colDur + colDur / 2;
      if (t < c.start || t >= c.start + c.duration) continue;
      const src = c.offset + (t - c.start);
      const j = Math.floor((src / buf.duration) * th.length);
      out[i] = Math.max(out[i], (th[j] ?? 0) * Math.min(1, c.gain));
    }
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

let saving: Promise<void> | null = null;

export async function saveProjectNow(): Promise<void> {
  if (saving) await saving;
  const s = useProject.getState();
  if (!s.projectId) return;
  const revision = s.revision;
  s.setSaveStatus('saving');
  saving = (async () => {
    try {
      await repository.saveProject({
        id: s.projectId!, name: s.name || 'Proyecto sin título', createdAt: s.createdAt, updatedAt: Date.now(),
        doc: s.doc, thumbnail: projectThumbnail(s.doc), durationSec: projectEnd(s.doc),
      });
      useProject.getState().markSaved(revision);
    } catch (e) {
      const msg = (e as Error)?.name === 'QuotaExceededError' ? 'No queda espacio de almacenamiento en el navegador.' : (e as Error)?.message;
      useProject.getState().setSaveStatus('error', msg);
      toast.error('No se pudo guardar', msg);
    }
  })();
  await saving;
  saving = null;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Autoguardado con espera de 1,2 s tras el último cambio. */
export function startAutosave(): () => void {
  const unsub = useProject.subscribe((s, prev) => {
    if (!s.projectId || s.revision === prev.revision || s.revision === s.savedRevision) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { void saveProjectNow(); }, 1200);
  });
  const beforeUnload = (e: BeforeUnloadEvent) => {
    const s = useProject.getState();
    if (s.projectId && s.revision !== s.savedRevision) {
      void saveProjectNow();
      e.preventDefault();
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsub(); window.removeEventListener('beforeunload', beforeUnload); };
}

export async function closeProject() {
  await saveProjectNow();
  engine.stop(0);
  useTransport.getState().set({ playing: false, recording: false, position: 0 });
  useProject.getState().close();
  useSettings.getState().set({ lastProjectId: null });
}
