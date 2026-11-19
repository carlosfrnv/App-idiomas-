/// <reference path="./worklet-env.d.ts" />
/**
 * Noise gate con detector de pico, histéresis, attack/release y rango.
 */
class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.002, minValue: 0.0001, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.12, minValue: 0.001, maxValue: 3, automationRate: 'k-rate' },
      { name: 'range', defaultValue: -60, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
    ];
  }

  private env = 0;
  private gain = 0;
  private open = false;
  private hold = 0;
  private reportCounter = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    const thr = Math.pow(10, params.threshold[0] / 20);
    const closeThr = thr * 0.7; // histéresis ~3 dB
    const floor = Math.pow(10, params.range[0] / 20);
    const att = Math.exp(-1 / (params.attack[0] * sampleRate));
    const rel = Math.exp(-1 / (params.release[0] * sampleRate));
    const envRel = Math.exp(-1 / (0.01 * sampleRate));
    const holdSamples = Math.floor(0.03 * sampleRate);
    const frames = output[0]?.length ?? 128;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      if (input && input.length) {
        for (let c = 0; c < input.length; c++) {
          const v = Math.abs(input[c][i]);
          if (v > peak) peak = v;
        }
      }
      this.env = peak > this.env ? peak : this.env * envRel + peak * (1 - envRel);
      if (this.env >= thr) { this.open = true; this.hold = holdSamples; }
      else if (this.env < closeThr) {
        if (this.hold > 0) this.hold--; else this.open = false;
      }
      const target = this.open ? 1 : floor;
      const coef = target > this.gain ? att : rel;
      this.gain = target + (this.gain - target) * coef;
      for (let c = 0; c < output.length; c++) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null;
        output[c][i] = src ? src[i] * this.gain : 0;
      }
    }
    if (++this.reportCounter >= 16) {
      this.reportCounter = 0;
      this.port.postMessage(20 * Math.log10(Math.max(this.gain, 1e-5)));
    }
    return true;
  }
}

registerProcessor('sonora-gate', GateProcessor);
