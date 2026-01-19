/**
 * Prism Effect
 *
 * Smooth rainbow color cycling with:
 * - Continuous hue rotation
 * - Adjustable speed
 * - Optional shimmer overlay
 * - Full saturation colors
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface PrismState {
  /** Current hue position 0-360 */
  hue: number;
  /** Shimmer overlay value */
  shimmer: number;
}

export const prism: EffectPreset = {
  id: 'prism',
  name: 'Prism',
  description: 'Smooth rainbow color cycling',
  category: 'dynamic',

  defaultOptions: {
    speed: 30, // Slow rainbow cycle
    brightness: 254,
    intensity: 0.5,
  },

  getInterval(): number {
    // 30fps for smooth transitions
    return 33;
  },

  init(): PrismState {
    return {
      hue: 0,
      shimmer: 1,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as PrismState;
    const speed = options.speed ?? 30;
    const brightness = (options.brightness ?? 254) / 254;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Rotate hue based on speed
    // speed 30 = full rotation in ~12 seconds
    const hueStep = (speed / 30) * 0.5;
    custom.hue = (custom.hue + hueStep) % 360;

    // Convert HSV to RGB (full saturation, no shimmer for smooth cycling)
    const color = ColorUtils.hsvToRgb(custom.hue, 1, brightness);

    // For gradient lights: show full spectrum spread across segments
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Spread rainbow across segments, all rotating together
        const segHue = (custom.hue + segmentPos * 360) % 360;

        gradient.push(ColorUtils.hsvToRgb(segHue, 1, brightness));
      }

      return { rgb: color, gradient };
    }

    return { rgb: color };
  },
};

/**
 * Colorloop Effect
 * Alias for prism with slightly different defaults
 */
export const colorloop: EffectPreset = {
  id: 'colorloop',
  name: 'Color Loop',
  description: 'Classic color cycling effect',
  category: 'dynamic',

  defaultOptions: {
    speed: 20, // Slower than prism
    brightness: 254,
    intensity: 0.3,
  },

  getInterval: prism.getInterval,
  init: prism.init,
  cycle: prism.cycle,
};
