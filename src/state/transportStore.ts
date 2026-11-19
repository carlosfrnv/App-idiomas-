import { create } from 'zustand';

export interface TransportState {
  playing: boolean;
  recording: boolean;
  /** Posición del cabezal cuando el transporte está parado (s). */
  position: number;
  metronome: boolean;
  countIn: boolean;
  follow: boolean;
  set(p: Partial<TransportState>): void;
}

export const useTransport = create<TransportState>((set) => ({
  playing: false,
  recording: false,
  position: 0,
  metronome: false,
  countIn: false,
  follow: true,
  set: (p) => set(p),
}));
