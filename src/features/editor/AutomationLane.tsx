import { memo, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { AutomationParam, AutomationPoint, Track } from '@/types/project';
import { useProject } from '@/state/projectStore';
import { updateTrack } from '@/state/docOps';
import { sortPoints, valueAt } from '@/audio/engine/automation';
import { faderPosToGain, formatDb, gainToFaderPos } from '@/lib/audioMath';
import { useTimelineApi } from './TimelineContext';
import { Switch } from '@/components/ui/Switch';
import { IconButton } from '@/components/ui/Button';

export const AUTO_H = 72;
const PAD = 6;

/** Conversión valor ↔ posición vertical normalizada (0 abajo, 1 arriba). */
export const toNorm = (param: AutomationParam, v: number) => (param === 'volume' ? gainToFaderPos(v) : (v + 1) / 2);
export const fromNorm = (param: AutomationParam, n: number) => (param === 'volume' ? faderPosToGain(Math.max(0, Math.min(1, n))) : Math.max(-1, Math.min(1, n * 2 - 1)));
export const formatAuto = (param: AutomationParam, v: number) => (param === 'volume' ? `${formatDb(v)} dB` : Math.abs(v) < 0.01 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);

function setLane(track: Track, param: AutomationParam, points: AutomationPoint[], history = true, enabled?: boolean) {
  const lane = track.automation?.[param];
  useProject.getState().apply((d) => updateTrack(d, track.id, {
    automation: { ...(d.tracks.find((t) => t.id === track.id)?.automation ?? {}), [param]: { enabled: enabled ?? lane?.enabled ?? true, points } },
  }), { history });
}

export const AutomationHeader = memo(function AutomationHeader({ track, height }: { track: Track; height: number }) {
  const param = track.automationView ?? 'volume';
  const lane = track.automation?.[param];
  return (
    <div className="flex flex-col justify-center gap-1.5 border-b border-line-soft bg-[#11161E] px-2" style={{ height }} data-testid="automation-header">
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded" style={{ background: track.color }} />
        <select aria-label="Parámetro automatizado" value={param} onChange={(e) => useProject.getState().apply((d) => updateTrack(d, track.id, { automationView: e.target.value as AutomationParam }), { history: false })} className="h-6 flex-1 rounded border border-line bg-bg px-1 text-[11px] outline-none">
          <option value="volume">Automatización: Volumen</option>
          <option value="pan">Automatización: Panorama</option>
        </select>
        <IconButton label="Borrar curva" size="sm" disabled={!lane?.points.length} onClick={() => setLane(track, param, [])}><Trash2 size={12} /></IconButton>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-muted">
        <Switch size="sm" label="Leer automatización" checked={!!lane?.enabled} onChange={(v) => setLane(track, param, lane?.points ?? [], true, v)} />
        {lane?.enabled ? 'Activa (la curva manda sobre el fader)' : 'Desactivada'} · {lane?.points.length ?? 0} puntos
      </label>
    </div>
  );
});

export const AutomationLaneView = memo(function AutomationLaneView({ track, height, pxPerSec, scrollTime, viewportWidth }: { track: Track; height: number; pxPerSec: number; scrollTime: number; viewportWidth: number }) {
  const api = useTimelineApi();
  const param = track.automationView ?? 'volume';
  const lane = track.automation?.[param];
  const points = useMemo(() => lane?.points ?? [], [lane]);
  const inner = height - PAD * 2;
  const xOf = (t: number) => (t - scrollTime) * pxPerSec;
  const yOf = (v: number) => PAD + (1 - toNorm(param, v)) * inner;
  const fallback = param === 'volume' ? track.volume : track.pan;
  const path = useMemo(() => {
    if (!points.length) return '';
    const t0 = scrollTime, t1 = scrollTime + viewportWidth / pxPerSec;
    const inView = points.filter((p) => p.t > t0 && p.t < t1);
    const seq = [{ t: t0, v: valueAt(points, t0) }, ...inView, { t: t1, v: valueAt(points, t1) }];
    return seq.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, scrollTime, pxPerSec, viewportWidth, height, param]);

  const valueFromY = (clientY: number, rect: DOMRect) => fromNorm(param, 1 - (clientY - rect.top - PAD) / inner);

  const drag = (e: React.PointerEvent, index: number, base: AutomationPoint[]) => {
    const el = e.currentTarget.closest('svg') as SVGSVGElement;
    const rect = el.getBoundingClientRect();
    const target = e.currentTarget as unknown as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let pts = base;
    const move = (ev: PointerEvent) => {
      const t = api.snap(api.timeAtClientX(ev.clientX), ev);
      const v = valueFromY(ev.clientY, rect);
      pts = sortPoints(base.map((p, i) => (i === index ? { t, v } : p)));
      setLane(track, param, pts, false);
    };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const onBackground = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || track.locked) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const t = api.snap(api.timeAtClientX(e.clientX), e);
    // un clic sobre una curva vacía parte del valor actual del fader
    const v = valueFromY(e.clientY, rect);
    useProject.getState().checkpoint();
    const next = sortPoints([...points, { t, v }]);
    setLane(track, param, next, false, true);
    drag(e, next.findIndex((p) => p.t === t && p.v === v), next);
  };

  return (
    <div className="relative border-b border-line-soft bg-[#0E1219]" style={{ height }} data-testid="automation-lane" data-track-id={track.id}>
      <svg width={viewportWidth} height={height} className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={onBackground}>
        {param === 'volume' && <line x1={0} x2={viewportWidth} y1={yOf(1)} y2={yOf(1)} stroke="#293241" strokeDasharray="3 4" />}
        {param === 'pan' && <line x1={0} x2={viewportWidth} y1={yOf(0)} y2={yOf(0)} stroke="#293241" strokeDasharray="3 4" />}
        {!points.length && <line x1={0} x2={viewportWidth} y1={yOf(fallback)} y2={yOf(fallback)} stroke={track.color} strokeOpacity={0.35} strokeWidth={1.5} />}
        {path && <path d={path} fill="none" stroke={track.color} strokeWidth={2} strokeOpacity={lane?.enabled ? 1 : 0.35} />}
        {points.map((p, i) => {
          const x = xOf(p.t);
          if (x < -8 || x > viewportWidth + 8) return null;
          return (
            <g key={i}>
              <circle
                cx={x} cy={yOf(p.v)} r={5} fill="#0B0E14" stroke={track.color} strokeWidth={2} className="cursor-grab"
                data-testid="automation-point"
                onPointerDown={(e) => { e.stopPropagation(); if (track.locked) return; useProject.getState().checkpoint(); drag(e, i, points); }}
                onDoubleClick={(e) => { e.stopPropagation(); setLane(track, param, points.filter((_, j) => j !== i)); }}
              >
                <title>{formatAuto(param, p.v)}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {!points.length && <span className="pointer-events-none absolute left-2 top-1 text-[10px] text-dim">Clic para añadir puntos · arrastra para moverlos · doble clic para borrar</span>}
    </div>
  );
});
