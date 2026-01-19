/**
 * Ocean Effect
 *
 * Underwater/ocean waves with:
 * - Deep blue to teal color shifts
 * - Wave-like brightness patterns
 * - Occasional surface light bursts
 * - Depth variation
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface OceanState {
  /** Wave oscillators */
  wave1: number;
  wave2: number;
  wave3: number;
  /** Depth oscillator phase */
  depthPhase: number;
  /** Surface light burst */
  surfaceLight: number;
}

export const ocean: EffectPreset = {
  id: 'ocean',
  name: 'Ocean',
  description: 'Deep underwater waves and light',
  category: 'nature',

  defaultOptions: {
    speed: 30,
    brightness: 180,
    intensity: 0.5,
  },

  getInterval(): number {
    return 40; // 25fps
  },

  init(): OceanState {
    return {
      wave1: 0,
      wave2: Math.PI / 3,
      wave3: Math.PI * 2 / 3,
      depthPhase: Math.random() * Math.PI * 2,
      surfaceLight: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as OceanState;
    const speed = options.speed ?? 30;
    const baseBrightness = (options.brightness ?? 180) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Update wave oscillators
    const rate = speed / 600;
    custom.wave1 += rate * 0.8;
    custom.wave2 += rate * 0.5;
    custom.wave3 += rate * 0.3;
    custom.depthPhase += rate * 0.15; // Slow depth oscillation

    // Smoothly vary depth using oscillator (no random flicker)
    const depth = 0.5 + Math.sin(custom.depthPhase) * 0.25 + Math.sin(custom.depthPhase * 0.7) * 0.1;

    // Occasional surface light breakthrough
    if (custom.surfaceLight > 0) {
      custom.surfaceLight *= 0.92;
    } else if (Math.random() < 0.01 * intensity) {
      custom.surfaceLight = 0.5 + Math.random() * 0.5;
    }

    // Helper to get ocean color based on depth
    const getOceanColor = (depth: number): RGB => {
      if (depth < 0.4) {
        return ColorUtils.blend(Palettes.ocean.deep, Palettes.ocean.mid, depth / 0.4);
      } else if (depth < 0.7) {
        const t = (depth - 0.4) / 0.3;
        return ColorUtils.blend(Palettes.ocean.mid, Palettes.ocean.surface, t);
      } else {
        const t = (depth - 0.7) / 0.3;
        return ColorUtils.blend(Palettes.ocean.surface, Palettes.ocean.foam, t);
      }
    };

    // Combine waves for organic movement
    const waveMotion = (
      Math.sin(custom.wave1) * 0.4 +
      Math.sin(custom.wave2) * 0.35 +
      Math.sin(custom.wave3) * 0.25
    );

    let color = getOceanColor(depth);

    // Surface light adds brightness and shifts toward white
    if (custom.surfaceLight > 0.1) {
      color = ColorUtils.blend(color, Palettes.ocean.foam, custom.surfaceLight * 0.6);
    }

    // Calculate brightness with wave motion
    const brightness = baseBrightness * (0.6 + waveMotion * 0.25 + custom.surfaceLight * 0.4);
    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: show waves traveling across segments with depth variation
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Waves travel across the strip
        const segWave = (
          Math.sin(custom.wave1 + segmentPos * Math.PI * 2) * 0.4 +
          Math.sin(custom.wave2 + segmentPos * Math.PI * 1.5) * 0.35 +
          Math.sin(custom.wave3 + segmentPos * Math.PI) * 0.25
        );

        // Depth varies along the strip (one end deeper, other shallower)
        const segDepth = Math.max(0.1, Math.min(0.9,
          depth + (segmentPos - 0.5) * 0.4 + segWave * 0.15
        ));

        let segColor = getOceanColor(segDepth);

        // Surface light affects segments differently (travels across)
        const lightPos = (custom.surfaceLight > 0.1)
          ? Math.sin(custom.wave1 * 0.5 + segmentPos * Math.PI)
          : 0;
        if (lightPos > 0 && custom.surfaceLight > 0.1) {
          segColor = ColorUtils.blend(segColor, Palettes.ocean.foam, custom.surfaceLight * lightPos * 0.5);
        }

        const segBrightness = baseBrightness * (0.5 + (segWave + 1) / 2 * 0.35);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Underwater Effect
 * Alias for ocean (matches Hue's naming)
 */
export const underwater: EffectPreset = {
  ...ocean,
  id: 'underwater',
  name: 'Underwater',
};
