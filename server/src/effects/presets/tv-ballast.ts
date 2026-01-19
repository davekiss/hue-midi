/**
 * TV Ballast Effect
 *
 * Old CRT/fluorescent TV warming up simulation:
 * - Characteristic startup flicker
 * - Color temperature instability (shifts between cool/warm)
 * - Occasional brightness dips like bad ballast
 * - Hum/buzz frequency oscillation
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface TVBallastState {
  /** Main flicker phase */
  flickerPhase: number;
  /** Secondary wobble */
  wobblePhase: number;
  /** Color temperature shift phase */
  tempPhase: number;
  /** Ballast buzz intensity */
  buzzIntensity: number;
  /** Warmup progress (0-1, affects stability) */
  warmup: number;
  /** Bad connection flicker */
  glitchIntensity: number;
  /** Glitch cooldown */
  glitchCooldown: number;
}

// TV color temperatures
const COLORS = {
  coldBlue: [180, 200, 255] as RGB,      // Cold CRT blue
  neutral: [220, 225, 255] as RGB,       // Neutral TV white
  warmTint: [255, 245, 220] as RGB,      // Warm drift
  greenTint: [200, 255, 220] as RGB,     // Old TV green drift
  flickerDark: [40, 50, 80] as RGB,      // Near-off flicker
};

export const tvBallast: EffectPreset = {
  id: 'tv_ballast',
  name: 'TV Ballast',
  description: 'Old CRT/fluorescent TV warming up with characteristic flicker',
  category: 'ambient',

  defaultOptions: {
    speed: 50,
    brightness: 200,
    intensity: 0.6,
  },

  getInterval(): number {
    return 25; // 40fps for responsive flicker
  },

  init(): TVBallastState {
    return {
      flickerPhase: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      tempPhase: Math.random() * Math.PI * 2,
      buzzIntensity: 0.3,
      warmup: 0,
      glitchIntensity: 0,
      glitchCooldown: 30,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as TVBallastState;
    const speed = options.speed ?? 50;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 600;

    // Update phases
    custom.flickerPhase += rate * 3.5; // 60Hz-ish flicker
    custom.wobblePhase += rate * 0.8;
    custom.tempPhase += rate * 0.2;

    // Warmup progression (TV stabilizing over time)
    custom.warmup = Math.min(1, custom.warmup + 0.0005);
    const stability = 0.4 + custom.warmup * 0.6; // More stable as it warms up

    // Ballast buzz - characteristic 60Hz hum with harmonics
    const buzz = (
      Math.sin(custom.flickerPhase) * 0.15 +
      Math.sin(custom.flickerPhase * 2) * 0.08 +  // 120Hz harmonic
      Math.sin(custom.flickerPhase * 0.5) * 0.05  // Sub-harmonic
    ) * (1 - stability * 0.7);

    // Handle glitches (bad connection moments)
    if (custom.glitchCooldown > 0) {
      custom.glitchCooldown--;
    } else if (Math.random() < 0.008 * intensity * (1 - stability)) {
      custom.glitchIntensity = 0.6 + Math.random() * 0.4;
      custom.glitchCooldown = 20 + Math.random() * 40;
    }
    custom.glitchIntensity *= 0.85;

    // Color temperature drift (old TVs shift color)
    const tempDrift = Math.sin(custom.tempPhase) * 0.4 + Math.sin(custom.tempPhase * 0.3) * 0.2;

    // Base color shifts between cold blue and occasional warm/green drift
    let baseColor: RGB;
    if (tempDrift < -0.3) {
      // Cold blue phase
      const t = (-tempDrift - 0.3) / 0.7;
      baseColor = ColorUtils.blend(COLORS.neutral, COLORS.coldBlue, t * 0.5);
    } else if (tempDrift > 0.3) {
      // Warm/green drift
      const t = (tempDrift - 0.3) / 0.7;
      const driftColor = Math.sin(custom.tempPhase * 2) > 0 ? COLORS.warmTint : COLORS.greenTint;
      baseColor = ColorUtils.blend(COLORS.neutral, driftColor, t * 0.3);
    } else {
      baseColor = COLORS.neutral;
    }

    // Calculate brightness with buzz and glitch
    const buzzEffect = 1 + buzz * intensity;
    const glitchDim = 1 - custom.glitchIntensity * 0.7;
    const wobble = Math.sin(custom.wobblePhase) * 0.05 * (1 - stability);

    let brightness = baseBrightness * buzzEffect * glitchDim * (0.85 + wobble);
    brightness = Math.max(0.1, Math.min(1, brightness));

    // During glitch, shift toward dark flicker color
    let color = baseColor;
    if (custom.glitchIntensity > 0.2) {
      color = ColorUtils.blend(baseColor, COLORS.flickerDark, custom.glitchIntensity * 0.5);
    }

    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: slightly different phase per segment (like scan lines)
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Scan line effect - brightness varies across segments
        const scanOffset = segmentPos * Math.PI * 2;
        const segBuzz = (
          Math.sin(custom.flickerPhase + scanOffset * 0.5) * 0.12 +
          Math.sin(custom.flickerPhase * 2 + scanOffset) * 0.06
        ) * (1 - stability * 0.7);

        // Slight color variation per segment
        const segTempOffset = Math.sin(custom.tempPhase + segmentPos * Math.PI) * 0.1;
        let segColor = baseColor;
        if (segTempOffset > 0.05) {
          segColor = ColorUtils.blend(baseColor, COLORS.warmTint, segTempOffset);
        } else if (segTempOffset < -0.05) {
          segColor = ColorUtils.blend(baseColor, COLORS.coldBlue, -segTempOffset);
        }

        // Glitch affects segments differently (rolling)
        const segGlitch = custom.glitchIntensity * Math.max(0, Math.sin(custom.flickerPhase * 0.3 + segmentPos * Math.PI * 3));
        if (segGlitch > 0.1) {
          segColor = ColorUtils.blend(segColor, COLORS.flickerDark, segGlitch * 0.6);
        }

        const segBrightness = Math.max(0.1, Math.min(1,
          baseBrightness * (1 + segBuzz) * (1 - segGlitch * 0.5) * glitchDim
        ));

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Fluorescent - Similar but more green/white, steadier
 */
export const fluorescent: EffectPreset = {
  id: 'fluorescent',
  name: 'Fluorescent',
  description: 'Fluorescent tube light with subtle flicker',
  category: 'ambient',

  defaultOptions: {
    speed: 40,
    brightness: 220,
    intensity: 0.4,
  },

  getInterval(): number {
    return 25;
  },

  init(): TVBallastState {
    return {
      flickerPhase: 0,
      wobblePhase: 0,
      tempPhase: 0,
      buzzIntensity: 0.2,
      warmup: 0.8, // Mostly warmed up
      glitchIntensity: 0,
      glitchCooldown: 60,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as TVBallastState;
    const speed = options.speed ?? 40;
    const baseBrightness = (options.brightness ?? 220) / 254;
    const intensity = options.intensity ?? 0.4;

    const rate = speed / 600;
    custom.flickerPhase += rate * 3.0;

    // Subtle 60Hz buzz
    const buzz = Math.sin(custom.flickerPhase) * 0.06 + Math.sin(custom.flickerPhase * 2) * 0.03;

    // Occasional flicker
    if (custom.glitchCooldown > 0) {
      custom.glitchCooldown--;
    } else if (Math.random() < 0.003 * intensity) {
      custom.glitchIntensity = 0.3 + Math.random() * 0.3;
      custom.glitchCooldown = 40 + Math.random() * 80;
    }
    custom.glitchIntensity *= 0.9;

    // Cool white with slight green tint (fluorescent characteristic)
    const baseColor: RGB = [240, 255, 250];

    const brightness = Math.max(0.2, baseBrightness * (1 + buzz * intensity) * (1 - custom.glitchIntensity * 0.4));

    return { rgb: ColorUtils.scale(baseColor, brightness) };
  },
};
