/**
 * Instrumentales de demostración sintetizadas en el navegador (sin muestras de terceros:
 * libres de derechos). Cada estilo tiene su patrón de batería, bajo y acordes.
 */
export type DemoStyle = 'trap' | 'boombap' | 'dembow';

export const DEMO_STYLES: Record<DemoStyle, { name: string; bpm: number; bars: number; description: string }> = {
  trap: { name: 'Beat Trap 140 BPM', bpm: 140, bars: 8, description: '808, hi-hats en semicorcheas con redobles' },
  boombap: { name: 'Beat Boom Bap 90 BPM', bpm: 90, bars: 4, description: 'Bombo y caja clásicos, swing' },
  dembow: { name: 'Beat Dembow 95 BPM', bpm: 95, bars: 4, description: 'Patrón dembow de reguetón' },
};

export async function renderDemoBeat(sampleRate = 44100, style: DemoStyle = 'trap'): Promise<AudioBuffer> {
  const { bpm, bars } = DEMO_STYLES[style];
  const beat = 60 / bpm;
  const len = Math.ceil(bars * 4 * beat * sampleRate);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate });
  const bus = ctx.createGain();
  bus.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 3;
  bus.connect(comp).connect(ctx.destination);

  const noise = ctx.createBuffer(1, sampleRate, sampleRate);
  const nd = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < nd.length; i++) { seed = (seed * 16807) % 2147483647; nd[i] = (seed / 2147483647) * 2 - 1; }

  const kick808 = (t: number, note: number, len808 = 0.9) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x); }
    sat.curve = curve;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    o.frequency.setValueAtTime(f * 3.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
    g.gain.setTargetAtTime(0.0001, t + 0.1, len808 / 4);
    o.connect(sat).connect(g).connect(bus);
    o.start(t); o.stop(t + len808 + 0.2);
  };
  const snare = (t: number) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(hp).connect(g).connect(bus);
    s.start(t, 0.1, 0.25);
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.1);
    og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.15);
  };
  const hat = (t: number, vel: number, pan: number) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.gain.setValueAtTime(0.22 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    s.connect(hp).connect(g).connect(p).connect(bus);
    s.start(t, Math.random() * 0.5, 0.06);
  };
  const pad = (t: number, notes: number[], dur: number) => {
    for (const n of notes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = ctx.createGain();
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.3);
      g.gain.setValueAtTime(0.035, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
    }
  };

  const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  const bass = [33, 29, 31, 28];
  const s16 = beat / 4;
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4 * beat;
    const root = bass[bar % 4];
    pad(b0, chords[bar % 4], 4 * beat);
    if (style === 'trap') {
      kick808(b0, root);
      kick808(b0 + 1.5 * beat, root, 0.4);
      kick808(b0 + 2.75 * beat, root + (bar % 2 ? 3 : 0), 0.7);
      snare(b0 + 2 * beat);
      for (let i = 0; i < 16; i++) {
        const roll = bar % 2 === 1 && i >= 12;
        if (roll) { for (let r = 0; r < 2; r++) hat(b0 + (i + r / 2) * s16, 0.7, 0.2); }
        else hat(b0 + i * s16, i % 4 === 0 ? 1 : 0.6, i % 2 ? 0.25 : -0.25);
      }
    } else if (style === 'boombap') {
      const swing = s16 * 0.18;
      kick808(b0, root + 12, 0.35);
      kick808(b0 + 1.75 * beat, root + 12, 0.3);
      kick808(b0 + 2.5 * beat, root + 12, 0.3);
      snare(b0 + beat);
      snare(b0 + 3 * beat);
      for (let i = 0; i < 8; i++) hat(b0 + i * 2 * s16 + (i % 2 ? swing : 0), i % 2 ? 0.55 : 0.9, i % 2 ? 0.2 : -0.2);
    } else {
      // dembow: bombo en negras, caja en 3/16 y 4/4 de cada tiempo (tresillo característico)
      for (let q = 0; q < 4; q++) {
        kick808(b0 + q * beat, root + 12, 0.25);
        snare(b0 + q * beat + 3 * s16);
        if (q % 2 === 1) snare(b0 + q * beat + 2 * s16);
      }
      for (let i = 0; i < 8; i++) hat(b0 + i * 2 * s16 + s16, 0.7, i % 2 ? 0.3 : -0.3);
    }
  }
  return await ctx.startRendering();
}
