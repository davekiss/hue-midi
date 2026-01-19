/**
 * Opal Effect
 *
 * Soft pastel color shifts with:
 * - Gentle iridescent color changes
 * - Low saturation pastels
 * - Slow, dreamy transitions
 * - Subtle brightness waves
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface OpalState {
  /** Hue oscillator */
  huePhase: number;
  /** Saturation oscillator */
  satPhase: number;
  /** Brightness wave */
  brightPhase: number;
}

export const opal: EffectPreset = {
  id: 'opal',
  name: 'Opal',
  description: 'Soft iridescent pastel shifts',
  category: 'ambient',

  defaultOptions: {
    speed: 20,
    brightness: 220,
    intensity: 0.4,
  },

  getInterval(): number {
    return 40; // 25fps for smooth, slow transitions
  },

  init(): OpalState {
    return {
      huePhase: Math.random() * Math.PI * 2,
      satPhase: Math.random() * Math.PI * 2,
      brightPhase: Math.random() * Math.PI * 2,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as OpalState;
    const speed = options.speed ?? 20;
    const baseBrightness = (options.brightness ?? 220) / 254;
    const intensity = options.intensity ?? 0.4;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Slow oscillations
    const rate = speed / 1000;
    custom.huePhase += rate * 0.7;
    custom.satPhase += rate * 0.4;
    custom.brightPhase += rate * 0.3;

    // Calculate hue with multiple sine waves for organic feel
    const hue = (
      180 + // Center around cyan/pink
      Math.sin(custom.huePhase) * 60 +
      Math.sin(custom.huePhase * 1.7) * 30 +
      Math.sin(custom.huePhase * 0.3) * 20
    ) % 360;

    // Low saturation for pastel look
    const saturation = 0.25 + Math.sin(custom.satPhase) * 0.15 * intensity;

    // Subtle brightness variation
    const brightnessWave = 0.85 + Math.sin(custom.brightPhase) * 0.15;
    const brightness = baseBrightness * brightnessWave;

    const rgb = ColorUtils.hsvToRgb(hue, saturation, brightness);

    // For gradient lights: create flowing iridescent waves across segments
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Each segment has a phase offset for traveling color waves
        const segHueOffset = segmentPos * Math.PI * 2;

        // Multiple waves at different frequencies create iridescent shimmer
        const segHue = (
          180 +
          Math.sin(custom.huePhase + segHueOffset) * 60 +
          Math.sin(custom.huePhase * 1.7 + segHueOffset * 0.7) * 30 +
          Math.sin(custom.huePhase * 0.3 + segHueOffset * 1.5) * 20
        ) % 360;

        // Saturation varies slightly across segments for depth
        const segSatOffset = Math.sin(custom.satPhase + segmentPos * Math.PI) * 0.08;
        const segSaturation = Math.max(0.1, Math.min(0.5,
          saturation + segSatOffset * intensity
        ));

        // Brightness waves travel across the strip
        const segBrightWave = 0.85 + Math.sin(custom.brightPhase + segmentPos * Math.PI * 1.5) * 0.15;
        const segBrightness = baseBrightness * segBrightWave;

        gradient.push(ColorUtils.hsvToRgb(segHue, segSaturation, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
