import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileAudio, Magnet, Maximize2, Mic, Music2, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { gridForZoom, secondsPerBar, secondsPerBeat, snapTime } from '@/lib/time';
import { projectEnd, moveTrack } from '@/state/docOps';
import { seek } from '@/app/transport';
import { addEmptyTrack, importFiles, placeAsset } from '@/app/editing';
import { ensureAssetLoaded } from '@/app/assets';
import { startRecording } from '@/app/recording';
import { IconButton, Button } from '@/components/ui/Button';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { TimelineCtx, type TimelineApi, RULER_H, HEADER_W, HEADER_W_MOBILE, ASSET_MIME } from './TimelineContext';
import { TrackHeader } from './TrackHeader';
import { ClipView } from './ClipView';
import { Ruler } from './Ruler';
import { Playhead } from './Playhead';
import { HScrollbar } from './HScrollbar';
import { toast } from '@/state/toastStore';

export function Timeline({ onImportClick }: { onImportClick: () => void }) {
  const tracks = useProject((s) => s.doc.tracks);
  const clips = useProject((s) => s.doc.clips);
  const bpm = useProject((s) => s.doc.bpm);
  const ts = useProject((s) => s.doc.timeSignature);
  const { pxPerSec, scrollTime, viewportWidth, heightScale, selectedClipIds, selectedTrackId, snap } = useUi();
  const isMobile = useIsMobile();
  const headerW = isMobile ? HEADER_W_MOBILE : HEADER_W;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [reorder, setReorder] = useState<{ id: string; y: number } | null>(null);

  // medir el ancho visible de las pistas
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => useUi.getState().set({ viewportWidth: Math.max(100, Math.floor(e.contentRect.width)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowHeights = useMemo(() => tracks.map((t) => Math.round(t.height * heightScale)), [tracks, heightScale]);

  const api: TimelineApi = useMemo(() => ({
    timeAtClientX: (x) => {
      const r = lanesRef.current!.getBoundingClientRect();
      const u = useUi.getState();
      return Math.max(0, u.scrollTime + (x - r.left) / u.pxPerSec);
    },
    trackAtClientY: (y) => {
      const r = lanesRef.current!.getBoundingClientRect();
      let acc = r.top;
      for (let i = 0; i < tracks.length; i++) {
        acc += rowHeights[i];
        if (y < acc) return tracks[i].id;
      }
      return null;
    },
    snap: (t, e) => {
      const u = useUi.getState();
      if (!u.snap || e?.shiftKey || e?.altKey) return Math.max(0, t);
      const d = useProject.getState().doc;
      const grid = gridForZoom(u.pxPerSec, d.bpm, d.timeSignature);
      return Math.max(0, snapTime(t, d.bpm, d.timeSignature, grid));
    },
  }), [tracks, rowHeights]);

  // rueda: Ctrl/Cmd = zoom anclado al puntero; Shift o horizontal = desplazamiento temporal
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const u = useUi.getState();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = lanesRef.current!.getBoundingClientRect();
        const px = e.clientX - r.left;
        u.zoomBy(Math.exp(-e.deltaY * 0.0025), u.scrollTime + px / u.pxPerSec, px);
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        u.set({ scrollTime: Math.max(0, u.scrollTime + d / u.pxPerSec) });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const fit = useCallback(() => {
    const end = projectEnd(useProject.getState().doc);
    const u = useUi.getState();
    u.set({ pxPerSec: Math.max(2, Math.min(400, (u.viewportWidth * 0.95) / Math.max(4, end))), scrollTime: 0 });
  }, []);

  // ajustar zoom al cargar un proyecto con audio
  const projectId = useProject((s) => s.projectId);
  useEffect(() => { if (projectEnd(useProject.getState().doc) > 0) setTimeout(fit, 0); }, [projectId, fit]);

  const onLanePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = api.snap(api.timeAtClientX(e.clientX), e);
    const tid = api.trackAtClientY(e.clientY);
    useUi.getState().set({ selectedClipIds: [], ...(tid ? { selectedTrackId: tid, fxTarget: tid } : {}) });
    seek(t);
  };

  const onDragOver = (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes('Files') && !types.includes(ASSET_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const tid = api.trackAtClientY(e.clientY);
    setDropHint(tid ?? 'new');
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const at = api.snap(api.timeAtClientX(e.clientX), e);
    const tid = api.trackAtClientY(e.clientY) ?? undefined;
    const raw = e.dataTransfer.getData(ASSET_MIME);
    if (raw) {
      try {
        const a = JSON.parse(raw) as { id: string; name: string; duration: number };
        const ok = await ensureAssetLoaded(a.id);
        if (!ok) { toast.error('No se pudo cargar el audio'); return; }
        placeAsset(a.id, a.name, a.duration, { trackId: tid, at });
      } catch { /* datos inválidos */ }
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) await importFiles(files, { trackId: tid, at });
  };

  const onReorderStart = (e: React.PointerEvent, id: string) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setReorder({ id, y: e.clientY });
    const move = (ev: PointerEvent) => setReorder({ id, y: ev.clientY });
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setReorder(null);
      const r = lanesRef.current!.getBoundingClientRect();
      let acc = r.top, idx = tracks.length;
      for (let i = 0; i < tracks.length; i++) { if (ev.clientY < acc + rowHeights[i] / 2) { idx = i; break; } acc += rowHeights[i]; }
      const from = tracks.findIndex((t) => t.id === id);
      const to = idx > from ? idx - 1 : idx;
      if (to !== from) useProject.getState().apply((d) => moveTrack(d, id, to));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // rejilla de compases como fondo CSS (alineada con la regla)
  const barPx = secondsPerBar(bpm, ts) * pxPerSec;
  const beatPx = secondsPerBeat(bpm) * (4 / ts[1]) * pxPerSec;
  const offset = -scrollTime * pxPerSec;
  const gridBg = {
    backgroundImage: [
      'linear-gradient(to right, rgba(75,86,104,0.55) 1px, transparent 1px)',
      beatPx >= 10 ? 'linear-gradient(to right, rgba(41,50,65,0.65) 1px, transparent 1px)' : null,
    ].filter(Boolean).join(','),
    backgroundSize: [`${barPx}px 100%`, beatPx >= 10 ? `${beatPx}px 100%` : null].filter(Boolean).join(','),
    backgroundPosition: [`${offset}px 0`, beatPx >= 10 ? `${offset}px 0` : null].filter(Boolean).join(','),
  };

  const clipsByTrack = useMemo(() => {
    const m = new Map<string, typeof clips>();
    for (const c of clips) { const a = m.get(c.trackId) ?? []; a.push(c); m.set(c.trackId, a); }
    return m;
  }, [clips]);

  const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);
  const zoom = (f: number) => { const u = useUi.getState(); u.zoomBy(f, u.scrollTime + u.viewportWidth / 2 / u.pxPerSec, u.viewportWidth / 2); };

  return (
    <TimelineCtx.Provider value={api}>
      <div className="relative flex min-h-0 flex-1 flex-col bg-bg" data-testid="timeline">
        <div className="flex shrink-0 border-b border-line" style={{ height: RULER_H }}>
          <div className="flex shrink-0 items-center gap-0.5 border-r border-line bg-panel px-1.5" style={{ width: headerW }}>
            <IconButton label="Añadir pista" size="sm" onClick={() => addEmptyTrack()} data-testid="add-track"><Plus size={15} /></IconButton>
            {!isMobile && <>
              <IconButton label="Alejar (−)" size="sm" onClick={() => zoom(1 / 1.5)}><ZoomOut size={14} /></IconButton>
              <IconButton label="Acercar (+)" size="sm" onClick={() => zoom(1.5)}><ZoomIn size={14} /></IconButton>
              <IconButton label="Ajustar a la ventana" size="sm" onClick={fit}><Maximize2 size={13} /></IconButton>
              <IconButton label={snap ? 'Ajuste a rejilla activado (Mayús para ignorar)' : 'Ajuste a rejilla desactivado'} size="sm" active={snap} onClick={() => useUi.getState().set({ snap: !snap })}><Magnet size={14} /></IconButton>
            </>}
            <div className="ml-auto flex items-center gap-1 pr-1">
              <button aria-label="Altura de pistas" data-tip="Altura de pistas" className="rounded px-1 font-mono text-[10px] text-dim hover:text-fg" onClick={() => useUi.getState().set({ heightScale: heightScale >= 1.5 ? 0.75 : heightScale + 0.25 })}>{Math.round(heightScale * 100)}%</button>
            </div>
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden"><Ruler /></div>
        </div>

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setDropHint(null); }} onDrop={onDrop}>
          <div className="flex min-h-full">
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-panel" style={{ width: headerW }}>
              {tracks.map((t, i) => (
                <TrackHeader key={t.id} track={t} index={i} height={rowHeights[i]} selected={t.id === selectedTrackId} compact={isMobile} onReorderStart={onReorderStart} />
              ))}
              {tracks.length > 0 && (
                <button onClick={() => addEmptyTrack()} className="flex h-10 w-full items-center gap-2 px-3 text-xs text-dim hover:bg-surface hover:text-fg"><Plus size={14} /> Nueva pista</button>
              )}
            </div>
            <div ref={lanesRef} className="relative min-w-0 flex-1 overflow-hidden" style={gridBg} onPointerDown={onLanePointerDown} data-testid="lanes">
              {tracks.map((t, i) => (
                <div key={t.id} data-testid="lane" data-track-id={t.id} className={`relative border-b border-line-soft ${t.id === selectedTrackId ? 'bg-white/[0.018]' : ''} ${dropHint === t.id ? 'bg-primary/10' : ''} ${t.mute || (tracks.some((x) => x.solo) && !t.solo) ? 'opacity-45' : ''}`} style={{ height: rowHeights[i] }}>
                  {(clipsByTrack.get(t.id) ?? []).map((c) => (
                    <ClipView key={c.id} clip={c} track={t} height={rowHeights[i]} pxPerSec={pxPerSec} scrollTime={scrollTime} viewportWidth={viewportWidth} selected={selectedSet.has(c.id)} />
                  ))}
                </div>
              ))}
              {dropHint === 'new' && <div className="flex h-16 items-center justify-center border-2 border-dashed border-primary/50 bg-primary/5 text-xs text-primary">Suelta para crear una pista nueva</div>}
            </div>
          </div>

          {tracks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6" style={{ left: headerW }}>
              <div className="max-w-md rounded-2xl border border-dashed border-line bg-panel/60 p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Music2 size={26} /></div>
                <h3 className="text-base font-semibold">Empieza tu canción</h3>
                <p className="mt-1.5 text-sm text-muted">Arrastra aquí una instrumental (WAV, MP3, FLAC…) o impórtala. Después pulsa grabar para añadir tu voz.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon={<FileAudio size={15} />} onClick={onImportClick} data-testid="empty-import">Importar instrumental</Button>
                  <Button variant="subtle" icon={<Mic size={15} />} onClick={() => void startRecording()}>Grabar voz</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 border-t border-line">
          <div className="shrink-0 border-r border-line bg-panel" style={{ width: headerW }} />
          <div className="min-w-0 flex-1"><HScrollbar /></div>
        </div>

        <div className="pointer-events-none absolute bottom-3 top-0 overflow-hidden" style={{ left: headerW, width: viewportWidth }}>
          <Playhead />
        </div>

        {reorder && <div className="pointer-events-none fixed z-40 h-0.5 bg-primary" style={{ left: 0, width: headerW, top: reorder.y }} />}
      </div>
    </TimelineCtx.Provider>
  );
}
