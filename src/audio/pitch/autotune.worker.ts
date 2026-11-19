/// <reference lib="webworker" />
import { autotune, type AutotuneParams } from './autotune';
import { trackPitch } from './yin';
import { estimateKey } from './scales';

type Msg =
  | { type: 'autotune'; channels: Float32Array[]; sampleRate: number; params: AutotuneParams }
  | { type: 'detect'; channels: Float32Array[]; sampleRate: number };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'detect') {
      const mono = m.channels[0];
      const t = trackPitch(mono, m.sampleRate);
      (self as unknown as Worker).postMessage({ type: 'detected', key: estimateKey(t.f0) });
      return;
    }
    const r = autotune(m.channels, m.sampleRate, m.params, (f) => (self as unknown as Worker).postMessage({ type: 'progress', f }));
    (self as unknown as Worker).postMessage({ type: 'done', channels: r.channels, detected: r.detected, corrected: r.corrected, hopSec: r.hopSec }, [...r.channels.map((c) => c.buffer), r.detected.buffer, r.corrected.buffer] as Transferable[]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: (err as Error).message });
  }
};
