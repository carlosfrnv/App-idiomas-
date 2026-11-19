/**
 * Modelo de planes (Fase 5). Durante el desarrollo inicial NO se bloquea nada:
 * `ENFORCE_PLAN_LIMITS` está desactivado. El modelo existe para que el backend y la UI
 * puedan consultar límites cuando se activen los pagos.
 */
export type PlanId = 'free' | 'pro';

export interface PlanLimits {
  maxProjects: number;
  maxStorageBytes: number;
  advancedEffects: boolean;
  proPresets: boolean;
  exportFormats: Array<'wav16' | 'wav24' | 'wav32f' | 'mp3'>;
  pitchCorrection: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxProjects: 5,
    maxStorageBytes: 500 * 1024 * 1024,
    advancedEffects: false,
    proPresets: false,
    exportFormats: ['wav16'],
    pitchCorrection: false,
  },
  pro: {
    maxProjects: 500,
    maxStorageBytes: 50 * 1024 * 1024 * 1024,
    advancedEffects: true,
    proPresets: true,
    exportFormats: ['wav16', 'wav24', 'wav32f', 'mp3'],
    pitchCorrection: true,
  },
};

export const ENFORCE_PLAN_LIMITS = false;

export function canUse<K extends keyof PlanLimits>(plan: PlanId, key: K): PlanLimits[K] | true {
  return ENFORCE_PLAN_LIMITS ? PLANS[plan][key] : true;
}
