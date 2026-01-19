/**
 * Glisten Effect
 *
 * Subtle shimmering light with:
 * - Gentle brightness waves
 * - Occasional bright glints
 * - Maintains base color
 * - Water-like reflections feel
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface GlistenState {
  /** Wave phases for organic movement */
  wave1: number;
  wave2: number;
  wave3: number;
  /** Glint timer */
  glint: number;
  glintCooldown: number;
  /** Position of traveling glint for gradients (0-1) */
  glintPosition: number;
  /** Direction of glint travel */
  glintDirection: number;
}

export const glisten: EffectPreset = {
  id: 'glisten',
  name: 'Glisten',
  description: 'Gentle shimmering like light on water',
  category: 'ambient',

  defaultOptions: {
    speed: 40,
    brightness: 200,
    intensity: 0.5,
    color1: { x: 0.3127, y: 0.329 }, // White base
  },

  getInterval(): number {
    return 33; // 30fps
  },

  init(): GlistenState {
    return {
      wave1: Math.random() * Math.PI * 2,
      wave2: Math.random() * Math.PI * 2,
      wave3: Math.random() * Math.PI * 2,
      glint: 0,
      glintCooldown: 0,
      glintPosition: Math.random(),
      glintDirection: Math.random() < 0.5 ? 1 : -1,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as GlistenState;
    const speed = options.speed ?? 40;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;
    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [255, 255, 255] as RGB;

    // Update waves
    const rate = speed / 500;
    custom.wave1 += rate * 1.0;
    custom.wave2 += rate * 0.7;
    custom.wave3 += rate * 0.4;

    // Combine waves for shimmer
    const shimmer = (
      Math.sin(custom.wave1) * 0.4 +
      Math.sin(custom.wave2) * 0.35 +
      Math.sin(custom.wave3) * 0.25
    );

    // Handle glints (quick bright flashes)
    if (custom.glintCooldown > 0) {
      custom.glintCooldown--;
    } else if (Math.random() < 0.02 * intensity) {
      custom.glint = 1;
      custom.glintCooldown = 20 + Math.random() * 40;
      // New glint starts at random position with random direction
      custom.glintPosition = Math.random();
      custom.glintDirection = Math.random() < 0.5 ? 1 : -1;
    }
    custom.glint *= 0.85; // Decay glint

    // Move glint position for gradient effect
    if (custom.glint > 0.1) {
      custom.glintPosition += custom.glintDirection * 0.08;
    }

    // Calculate brightness
    const shimmerBrightness = 0.7 + shimmer * 0.25 * intensity;
    const glintBoost = custom.glint * 0.3;
    const brightness = Math.min(1, shimmerBrightness + glintBoost) * baseBrightness;

    // Slight color shift toward white during glints
    let color: RGB;
    if (custom.glint > 0.2) {
      color = ColorUtils.blend(baseColor, [255, 255, 255], custom.glint * 0.4);
    } else {
      color = baseColor;
    }

    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: traveling shimmer waves with moving glints
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Shimmer waves travel across segments
        const segShimmer = (
          Math.sin(custom.wave1 + segmentPos * Math.PI * 2) * 0.4 +
          Math.sin(custom.wave2 + segmentPos * Math.PI * 1.5) * 0.35 +
          Math.sin(custom.wave3 + segmentPos * Math.PI) * 0.25
        );

        // Calculate distance from glint center with smooth falloff
        const glintDist = Math.abs(segmentPos - custom.glintPosition);
        const glintRadius = 0.2; // How wide the glint spreads
        const segGlintBoost = custom.glint * Math.max(0, 1 - glintDist / glintRadius) * 0.4;

        // Calculate segment brightness
        const segShimmerBrightness = 0.7 + segShimmer * 0.25 * intensity;
        const segBrightness = Math.min(1, segShimmerBrightness + segGlintBoost) * baseBrightness;

        // Color shift toward white for segments near the glint
        let segColor: RGB;
        if (segGlintBoost > 0.1) {
          const whiteBlend = segGlintBoost / 0.4;
          segColor = ColorUtils.blend(baseColor, [255, 255, 255], whiteBlend * 0.5);
        } else {
          segColor = baseColor;
        }

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
