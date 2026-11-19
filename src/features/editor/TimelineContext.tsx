import { createContext, useContext } from 'react';

export interface TimelineApi {
  timeAtClientX(x: number): number;
  trackAtClientY(y: number): string | null;
  snap(t: number, e?: { shiftKey?: boolean; altKey?: boolean }): number;
}

export const TimelineCtx = createContext<TimelineApi | null>(null);

export function useTimelineApi(): TimelineApi {
  const v = useContext(TimelineCtx);
  if (!v) throw new Error('TimelineCtx ausente');
  return v;
}

export const RULER_H = 36;
export const HEADER_W = 236;
export const HEADER_W_MOBILE = 120;
export const ASSET_MIME = 'application/x-sonora-asset';
