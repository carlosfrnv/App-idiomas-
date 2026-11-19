export type EffectType = 'eq' | 'compressor' | 'reverb' | 'delay' | 'filter' | 'saturation' | 'gate';

export type EqBandType = 'highpass' | 'lowshelf' | 'peaking' | 'highshelf' | 'lowpass' | 'notch';

export interface EqBand {
  id: string;
  type: EqBandType;
  frequency: number;
  gain: number;
  q: number;
  enabled: boolean;
}

export interface EqParams { bands: EqBand[]; outputGain: number }
export interface CompressorParams { threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number }
export interface ReverbParams { mix: number; decay: number; preDelay: number; damping: number }
export interface DelayParams { time: number; feedback: number; mix: number; sync: boolean; division: DelayDivision; highCut: number }
export type DelayDivision = '1/4' | '1/8' | '1/8d' | '1/8t' | '1/16' | '1/2' | '1/4d';
export interface FilterParams { mode: 'lowpass' | 'highpass' | 'bandpass'; frequency: number; q: number }
export interface SaturationParams { drive: number; mix: number; tone: number }
export interface GateParams { threshold: number; attack: number; release: number; range: number }

export interface EffectParamsMap {
  eq: EqParams;
  compressor: CompressorParams;
  reverb: ReverbParams;
  delay: DelayParams;
  filter: FilterParams;
  saturation: SaturationParams;
  gate: GateParams;
}

export type EffectSlot = {
  [K in EffectType]: { id: string; type: K; enabled: boolean; params: EffectParamsMap[K] };
}[EffectType];

export type EffectSlotOf<K extends EffectType> = Extract<EffectSlot, { type: K }>;
