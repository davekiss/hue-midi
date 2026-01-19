/**
 * Sparkle Effect
 *
 * Random bright sparkle flashes with:
 * - Configurable base color
 * - Random timing and intensity sparkles
 * - Quick attack, medium decay
 * - Multiple simultaneous sparkles possible
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface SparkleState {
  /** Current sparkle brightness (0-1) */
  sparkle: number;
  /** Base color brightness */
  baseBrightness: number;
  /** Sparkle decay rate */
  decayRate: number;
  /** Frames until next sparkle opportunity */
  cooldown: number;
  /** Per-segment sparkle states for gradient lights */
  segmentSparkles: number[];
  /** Per-segment cooldowns */
  segmentCooldowns: number[];
}

export const sparkle: EffectPreset = {
  id: 'sparkle',
  name: 'Sparkle',
  description: 'Random glittering sparkle flashes',
  category: 'dynamic',

  defaultOptions: {
    speed: 120,
    brightness: 200,
    intensity: 0.6,
    color1: { x: 0.3127, y: 0.329 }, // White
  },

  getInterval(options: EffectOptions): number {
    const speed = options.speed ?? 120;
    // Faster speed = more frequent updates
    return Math.max(20, Math.round(2000 / speed));
  },

  init(): SparkleState {
    return {
      sparkle: 0,
      baseBrightness: 0.3,
      decayRate: 0.15,
      cooldown: 0,
      segmentSparkles: [],
      segmentCooldowns: [],
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as SparkleState;
    const intensity = options.intensity ?? 0.6;
    const maxBrightness = (options.brightness ?? 200) / 254;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;
    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [255, 255, 255] as RGB;

    // Decay existing sparkle
    custom.sparkle *= (1 - custom.decayRate);
    if (custom.sparkle < 0.01) custom.sparkle = 0;

    // Cooldown between sparkles
    if (custom.cooldown > 0) {
      custom.cooldown--;
    } else {
      // Chance to sparkle
      const sparkleChance = 0.08 * intensity;
      if (Math.random() < sparkleChance) {
        // New sparkle!
        custom.sparkle = 0.7 + Math.random() * 0.3;
        custom.cooldown = Math.floor(3 + Math.random() * 5);
        // Vary decay rate for organic feel
        custom.decayRate = 0.1 + Math.random() * 0.15;
      }
    }

    // Helper to calculate sparkle color
    const getSparkleColor = (sparkleLevel: number): RGB => {
      if (sparkleLevel > 0.3) {
        const whiteBlend = (sparkleLevel - 0.3) / 0.7;
        return ColorUtils.blend(baseColor, [255, 255, 255], whiteBlend * 0.7);
      }
      return baseColor;
    };

    // Calculate final brightness
    const baseLevelNoise = 0.25 + Math.random() * 0.1;
    const totalBrightness = Math.min(1,
      baseLevelNoise + custom.sparkle * 0.75
    ) * maxBrightness;

    const color = getSparkleColor(custom.sparkle);
    const rgb = ColorUtils.scale(color, totalBrightness);

    // For gradient lights: independent sparkles across segments
    if (isGradient && segmentCount > 1) {
      // Initialize segment arrays if needed
      if (custom.segmentSparkles.length !== segmentCount) {
        custom.segmentSparkles = new Array(segmentCount).fill(0);
        custom.segmentCooldowns = new Array(segmentCount).fill(0);
      }

      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Decay this segment's sparkle
        custom.segmentSparkles[i] *= (1 - 0.12);
        if (custom.segmentSparkles[i] < 0.01) custom.segmentSparkles[i] = 0;

        // Cooldown for this segment
        if (custom.segmentCooldowns[i] > 0) {
          custom.segmentCooldowns[i]--;
        } else {
          // Independent chance to sparkle for each segment
          // Lower chance per segment so total sparkles feel balanced
          const segSparkleChance = 0.03 * intensity;
          if (Math.random() < segSparkleChance) {
            custom.segmentSparkles[i] = 0.7 + Math.random() * 0.3;
            custom.segmentCooldowns[i] = Math.floor(5 + Math.random() * 10);
          }
        }

        // Calculate segment brightness with subtle variation
        const segNoise = 0.2 + Math.random() * 0.15;
        const segBrightness = Math.min(1,
          segNoise + custom.segmentSparkles[i] * 0.8
        ) * maxBrightness;

        const segColor = getSparkleColor(custom.segmentSparkles[i]);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
