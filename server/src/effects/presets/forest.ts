/**
 * Forest Effect
 *
 * Peaceful forest canopy simulation with:
 * - Various shades of green
 * - Dappled sunlight through leaves
 * - Slow, gentle movement
 * - Occasional bright sun patches
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface ForestState {
  /** Leaf sway phases */
  swayPhase1: number;
  swayPhase2: number;
  /** Sunlight dapple phase */
  sunPhase: number;
  /** Bright sun patch intensity */
  sunPatch: number;
  /** Sun patch position (0-1) */
  sunPatchPos: number;
  /** Cooldown for sun patches */
  sunPatchCooldown: number;
}

// Forest color palette
const COLORS = {
  darkGreen: [20, 60, 25] as RGB,
  leafGreen: [50, 120, 40] as RGB,
  lightGreen: [80, 160, 60] as RGB,
  sunlitGreen: [120, 180, 70] as RGB,
  goldenLight: [180, 160, 80] as RGB,
  sunbeam: [220, 200, 120] as RGB,
};

export const forest: EffectPreset = {
  id: 'forest',
  name: 'Forest',
  description: 'Peaceful forest canopy with dappled sunlight',
  category: 'nature',

  defaultOptions: {
    speed: 25,
    brightness: 180,
    intensity: 0.5,
  },

  getInterval(): number {
    return 40; // 25fps for smooth, slow movement
  },

  init(): ForestState {
    return {
      swayPhase1: Math.random() * Math.PI * 2,
      swayPhase2: Math.random() * Math.PI * 2,
      sunPhase: Math.random() * Math.PI * 2,
      sunPatch: 0,
      sunPatchPos: Math.random(),
      sunPatchCooldown: 30,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ForestState;
    const speed = options.speed ?? 25;
    const baseBrightness = (options.brightness ?? 180) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 1200;

    // Update phases - slow, peaceful movement
    custom.swayPhase1 += rate * 0.6;
    custom.swayPhase2 += rate * 0.4;
    custom.sunPhase += rate * 0.8;

    // Handle sun patches (moments of brighter light)
    if (custom.sunPatchCooldown > 0) {
      custom.sunPatchCooldown--;
    } else if (Math.random() < 0.015 * intensity) {
      custom.sunPatch = 0.6 + Math.random() * 0.4;
      custom.sunPatchCooldown = 40 + Math.random() * 60;
      custom.sunPatchPos = Math.random();
    }
    custom.sunPatch *= 0.97; // Slow decay
    if (custom.sunPatch < 0.02) custom.sunPatch = 0;

    // Leaf sway creates color shifts between greens
    const sway = (
      Math.sin(custom.swayPhase1) * 0.4 +
      Math.sin(custom.swayPhase2 * 1.3) * 0.35 +
      Math.sin(custom.swayPhase1 * 0.7) * 0.25
    );

    // Dappled sunlight variation
    const dapple = (Math.sin(custom.sunPhase) + 1) / 2 * 0.3;

    // Base color shifts between dark and light green based on sway
    const swayNorm = (sway + 1) / 2; // 0-1
    let baseColor = ColorUtils.blend(COLORS.darkGreen, COLORS.leafGreen, swayNorm * 0.6);

    // Add dappled light effect
    if (dapple > 0.1) {
      baseColor = ColorUtils.blend(baseColor, COLORS.lightGreen, dapple);
    }

    // Add sun patch glow
    if (custom.sunPatch > 0.1) {
      const sunColor = ColorUtils.blend(COLORS.sunlitGreen, COLORS.goldenLight, custom.sunPatch * 0.4);
      baseColor = ColorUtils.blend(baseColor, sunColor, custom.sunPatch * 0.5);
    }

    const brightness = baseBrightness * (0.6 + swayNorm * 0.25 + dapple * 0.15);
    const rgb = ColorUtils.scale(baseColor, brightness);

    // For gradient lights: create varied canopy with traveling dappled light
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Per-segment sway offset creates natural leaf movement
        const segSway = (
          Math.sin(custom.swayPhase1 + segmentPos * Math.PI * 1.5) * 0.4 +
          Math.sin(custom.swayPhase2 * 1.3 + segmentPos * Math.PI * 2) * 0.35 +
          Math.sin(custom.swayPhase1 * 0.7 + segmentPos * Math.PI) * 0.25
        );

        // Dappled light travels across segments
        const segDapple = (Math.sin(custom.sunPhase + segmentPos * Math.PI * 3) + 1) / 2 * 0.35;

        const segSwayNorm = (segSway + 1) / 2;

        // Build segment color
        let segColor = ColorUtils.blend(COLORS.darkGreen, COLORS.leafGreen, segSwayNorm * 0.6);

        // Add dappled sunlight
        if (segDapple > 0.15) {
          const lightColor = segDapple > 0.25 ? COLORS.sunlitGreen : COLORS.lightGreen;
          segColor = ColorUtils.blend(segColor, lightColor, segDapple);
        }

        // Sun patch affects nearby segments
        if (custom.sunPatch > 0.1) {
          const patchDist = Math.abs(segmentPos - custom.sunPatchPos);
          const patchRadius = 0.25 + custom.sunPatch * 0.15;
          const patchInfluence = Math.max(0, 1 - patchDist / patchRadius) * custom.sunPatch;

          if (patchInfluence > 0.05) {
            const sunColor = patchInfluence > 0.3
              ? ColorUtils.blend(COLORS.goldenLight, COLORS.sunbeam, (patchInfluence - 0.3) / 0.7)
              : COLORS.sunlitGreen;
            segColor = ColorUtils.blend(segColor, sunColor, patchInfluence * 0.6);
          }
        }

        const segBrightness = baseBrightness * (0.5 + segSwayNorm * 0.3 + segDapple * 0.2);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Meadow Effect - Lighter, more open variant
 */
export const meadow: EffectPreset = {
  id: 'meadow',
  name: 'Meadow',
  description: 'Sunlit meadow with gentle breeze',
  category: 'nature',

  defaultOptions: {
    speed: 30,
    brightness: 200,
    intensity: 0.6,
  },

  getInterval(): number {
    return 40;
  },

  init(): ForestState {
    return {
      swayPhase1: Math.random() * Math.PI * 2,
      swayPhase2: Math.random() * Math.PI * 2,
      sunPhase: Math.random() * Math.PI * 2,
      sunPatch: 0.3, // Start with some sun
      sunPatchPos: 0.5,
      sunPatchCooldown: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ForestState;
    const speed = options.speed ?? 30;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 1000;

    // Update phases
    custom.swayPhase1 += rate * 0.8;
    custom.swayPhase2 += rate * 0.5;
    custom.sunPhase += rate * 0.6;

    // Meadow colors - lighter, more golden
    const meadowGreen: RGB = [100, 150, 60];
    const grassGreen: RGB = [80, 140, 50];
    const sunlitGrass: RGB = [140, 170, 70];
    const goldenHour: RGB = [200, 180, 100];

    // Grass sway
    const sway = (
      Math.sin(custom.swayPhase1) * 0.5 +
      Math.sin(custom.swayPhase2 * 1.5) * 0.3 +
      Math.sin(custom.swayPhase1 * 0.6) * 0.2
    );
    const swayNorm = (sway + 1) / 2;

    // Sunlight variation
    const sunWave = (Math.sin(custom.sunPhase) + 1) / 2;

    let color = ColorUtils.blend(grassGreen, meadowGreen, swayNorm * 0.5);
    color = ColorUtils.blend(color, sunlitGrass, sunWave * 0.4 * intensity);

    // Add golden tint
    if (sunWave > 0.6) {
      color = ColorUtils.blend(color, goldenHour, (sunWave - 0.6) / 0.4 * 0.3);
    }

    const brightness = baseBrightness * (0.7 + swayNorm * 0.2 + sunWave * 0.1);
    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        const segSway = (
          Math.sin(custom.swayPhase1 + segmentPos * Math.PI * 2) * 0.5 +
          Math.sin(custom.swayPhase2 * 1.5 + segmentPos * Math.PI * 1.5) * 0.3
        );
        const segSwayNorm = (segSway + 1) / 2;

        const segSun = (Math.sin(custom.sunPhase + segmentPos * Math.PI * 2.5) + 1) / 2;

        let segColor = ColorUtils.blend(grassGreen, meadowGreen, segSwayNorm * 0.5);
        segColor = ColorUtils.blend(segColor, sunlitGrass, segSun * 0.4 * intensity);

        if (segSun > 0.6) {
          segColor = ColorUtils.blend(segColor, goldenHour, (segSun - 0.6) / 0.4 * 0.35);
        }

        const segBrightness = baseBrightness * (0.7 + segSwayNorm * 0.2 + segSun * 0.1);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
