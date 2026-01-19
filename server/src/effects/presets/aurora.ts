/**
 * Aurora Effect
 *
 * Northern lights simulation with:
 * - Green/teal/purple/pink color waves
 * - Slow undulating movement
 * - Intensity surges
 * - Ethereal glow
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface AuroraState {
  /** Primary color wave */
  colorPhase: number;
  /** Secondary blend wave */
  blendPhase: number;
  /** Intensity surge */
  intensityPhase: number;
  /** Current dominant color index */
  colorIndex: number;
  /** Next color index */
  nextColorIndex: number;
  /** Transition progress */
  transition: number;
}

export const aurora: EffectPreset = {
  id: 'aurora',
  name: 'Aurora',
  description: 'Northern lights with flowing colors',
  category: 'nature',

  defaultOptions: {
    speed: 25,
    brightness: 200,
    intensity: 0.6,
  },

  getInterval(): number {
    return 40; // 25fps for smooth flowing
  },

  init(): AuroraState {
    return {
      colorPhase: 0,
      blendPhase: Math.PI,
      intensityPhase: 0,
      colorIndex: 0,
      nextColorIndex: 1,
      transition: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as AuroraState;
    const speed = options.speed ?? 25;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const colors = [
      Palettes.aurora.green,
      Palettes.aurora.teal,
      Palettes.aurora.purple,
      Palettes.aurora.pink,
    ];

    // Update phases
    const rate = speed / 800;
    custom.colorPhase += rate * 0.5;
    custom.blendPhase += rate * 0.3;
    custom.intensityPhase += rate * 0.7;

    // Transition between colors
    custom.transition += rate * 0.15;
    if (custom.transition >= 1) {
      custom.transition = 0;
      custom.colorIndex = custom.nextColorIndex;
      // Pick next color (prefer adjacent for smooth transitions)
      if (Math.random() < 0.7) {
        custom.nextColorIndex = (custom.colorIndex + 1) % colors.length;
      } else {
        custom.nextColorIndex = Math.floor(Math.random() * colors.length);
      }
    }

    // Smooth color blend
    const easeT = custom.transition * custom.transition * (3 - 2 * custom.transition); // Smoothstep
    const currentColor = colors[custom.colorIndex];
    const nextColor = colors[custom.nextColorIndex];
    const blendedColor = ColorUtils.blend(currentColor, nextColor, easeT);

    // Intensity surges (aurora waves)
    const surge = Math.sin(custom.intensityPhase) * 0.3 + 0.7;
    const wave = Math.sin(custom.colorPhase * 2) * 0.15 + 0.85;

    // Final brightness with ethereal variations
    const brightness = baseBrightness * surge * wave * (0.7 + intensity * 0.3);

    const rgb = ColorUtils.scale(blendedColor, brightness);

    // For gradient lights: create flowing aurora bands across segments
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];
      for (let i = 0; i < segmentCount; i++) {
        // Each segment has a phase offset to create flowing bands
        const segmentPhase = custom.colorPhase + (i / segmentCount) * Math.PI * 2;

        // Calculate which colors this segment blends between
        const colorPosition = ((Math.sin(segmentPhase * 0.5) + 1) / 2) * (colors.length - 1);
        const segColorIdx = Math.floor(colorPosition);
        const segNextColorIdx = Math.min(segColorIdx + 1, colors.length - 1);
        const segBlend = colorPosition - segColorIdx;

        const segColor = ColorUtils.blend(
          colors[segColorIdx],
          colors[segNextColorIdx],
          segBlend
        );

        // Per-segment intensity variation (creates wave effect)
        const segWave = Math.sin(custom.intensityPhase + (i / segmentCount) * Math.PI) * 0.3 + 0.7;
        const segBrightness = baseBrightness * segWave * (0.7 + intensity * 0.3);

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
