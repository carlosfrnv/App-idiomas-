import { useProject } from '@/state/projectStore';
import { getEffects, setTrackEffects } from '@/state/docOps';
import type { EffectParamsMap, EffectSlot, EffectType } from '@/types/effects';
import { createEffect } from '@/audio/fx/defaults';

export type FxTarget = string | 'master';

export function updateEffect<K extends EffectType>(target: FxTarget, fxId: string, patch: Partial<EffectParamsMap[K]>, key?: string) {
  useProject.getState().apply((d) => setTrackEffects(d, target, getEffects(d, target).map((e) => (e.id === fxId ? ({ ...e, params: { ...e.params, ...patch } } as EffectSlot) : e))), { key: key ? `fx:${fxId}:${key}` : undefined });
}

export function toggleEffect(target: FxTarget, fxId: string) {
  useProject.getState().apply((d) => setTrackEffects(d, target, getEffects(d, target).map((e) => (e.id === fxId ? { ...e, enabled: !e.enabled } : e))));
}

export function addEffect(target: FxTarget, type: EffectType): string {
  const slot = createEffect(type);
  useProject.getState().apply((d) => setTrackEffects(d, target, [...getEffects(d, target), slot]));
  return slot.id;
}

export function removeEffect(target: FxTarget, fxId: string) {
  useProject.getState().apply((d) => setTrackEffects(d, target, getEffects(d, target).filter((e) => e.id !== fxId)));
}

export function moveEffect(target: FxTarget, fxId: string, dir: -1 | 1) {
  useProject.getState().apply((d) => {
    const list = [...getEffects(d, target)];
    const i = list.findIndex((e) => e.id === fxId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]];
    return setTrackEffects(d, target, list);
  });
}

export function replaceChain(target: FxTarget, slots: EffectSlot[]) {
  useProject.getState().apply((d) => setTrackEffects(d, target, slots));
}
