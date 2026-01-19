/**
 * Thunderstorm Effect
 *
 * Storm simulation with:
 * - Dark blue/purple storm cloud base
 * - Occasional lightning flashes (safety-conscious timing)
 * - Rain-like subtle brightness variation
 * - Distant rumble glow effects
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface ThunderstormState {
  /** Rain phase for subtle movement */
  rainPhase: number;
  /** Lightning flash intensity (0-1) */
  lightning: number;
  /** Cooldown between lightning strikes (safety) */
  lightningCooldown: number;
  /** Distant rumble glow */
  rumbleGlow: number;
  /** Position of lightning strike for gradients (0-1) */
  strikePosition: number;
  /** Cloud darkness oscillator */
  cloudPhase: number;
}

// Storm color palette
const COLORS = {
  darkCloud: [15, 20, 40] as RGB,
  stormCloud: [30, 35, 60] as RGB,
  lightning: [200, 220, 255] as RGB,
  lightningBright: [255, 255, 255] as RGB,
  rumble: [60, 50, 80] as RGB,
};

export const thunderstorm: EffectPreset = {
  id: 'thunderstorm',
  name: 'Thunderstorm',
  description: 'Dark storm clouds with lightning flashes',
  category: 'nature',

  defaultOptions: {
    speed: 40,
    brightness: 180,
    intensity: 0.6,
  },

  getInterval(): number {
    return 33; // 30fps
  },

  init(): ThunderstormState {
    return {
      rainPhase: Math.random() * Math.PI * 2,
      lightning: 0,
      lightningCooldown: 60, // Start with cooldown to prevent immediate flash
      rumbleGlow: 0,
      strikePosition: 0.5,
      cloudPhase: Math.random() * Math.PI * 2,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ThunderstormState;
    const speed = options.speed ?? 40;
    const baseBrightness = (options.brightness ?? 180) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 800;

    // Update rain and cloud phases
    custom.rainPhase += rate * 0.8;
    custom.cloudPhase += rate * 0.3;

    // Handle lightning strikes
    // Safety: Keep strikes infrequent (<2Hz) and use smooth decay
    if (custom.lightningCooldown > 0) {
      custom.lightningCooldown--;
    } else if (Math.random() < 0.008 * intensity) {
      // New lightning strike!
      custom.lightning = 0.8 + Math.random() * 0.2;
      // Minimum 1.5 seconds between strikes (well under 5Hz limit)
      custom.lightningCooldown = 45 + Math.random() * 60;
      // Random strike position for gradients
      custom.strikePosition = Math.random();
      // Trigger distant rumble
      custom.rumbleGlow = 0.4 + Math.random() * 0.3;
    }

    // Smooth lightning decay (>100ms transition)
    custom.lightning *= 0.88;
    if (custom.lightning < 0.02) custom.lightning = 0;

    // Rumble glow decays slower
    custom.rumbleGlow *= 0.96;
    if (custom.rumbleGlow < 0.02) custom.rumbleGlow = 0;

    // Cloud darkness with subtle variation
    const cloudDarkness = 0.8 + Math.sin(custom.cloudPhase) * 0.15;

    // Rain-like brightness variation
    const rainEffect = (
      Math.sin(custom.rainPhase) * 0.08 +
      Math.sin(custom.rainPhase * 2.3) * 0.05
    );

    // Calculate base storm color
    const stormBrightness = baseBrightness * cloudDarkness * (0.3 + rainEffect);
    let baseColor = ColorUtils.blend(COLORS.darkCloud, COLORS.stormCloud, 0.3 + rainEffect);

    // Add rumble glow
    if (custom.rumbleGlow > 0.05) {
      baseColor = ColorUtils.blend(baseColor, COLORS.rumble, custom.rumbleGlow * 0.5);
    }

    // Add lightning flash
    let color = baseColor;
    let brightness = stormBrightness;
    if (custom.lightning > 0.1) {
      const flashColor = custom.lightning > 0.5 ? COLORS.lightningBright : COLORS.lightning;
      color = ColorUtils.blend(baseColor, flashColor, custom.lightning * 0.8);
      brightness = Math.min(1, stormBrightness + custom.lightning * 0.7);
    }

    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: lightning travels across with glow spread
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Per-segment rain variation
        const segRain = (
          Math.sin(custom.rainPhase + segmentPos * Math.PI * 2) * 0.1 +
          Math.sin(custom.rainPhase * 1.7 + segmentPos * Math.PI) * 0.06
        );

        // Per-segment cloud darkness
        const segCloud = 0.8 + Math.sin(custom.cloudPhase + segmentPos * Math.PI) * 0.15;

        let segColor = ColorUtils.blend(COLORS.darkCloud, COLORS.stormCloud, 0.3 + segRain);
        let segBrightness = baseBrightness * segCloud * (0.3 + segRain);

        // Add rumble glow (spreads across entire strip)
        if (custom.rumbleGlow > 0.05) {
          const rumbleWave = Math.sin(custom.cloudPhase * 2 + segmentPos * Math.PI * 3) * 0.3 + 0.7;
          segColor = ColorUtils.blend(segColor, COLORS.rumble, custom.rumbleGlow * 0.4 * rumbleWave);
        }

        // Lightning strike with falloff from strike position
        if (custom.lightning > 0.1) {
          const strikeDist = Math.abs(segmentPos - custom.strikePosition);
          const strikeRadius = 0.3 + custom.lightning * 0.2; // Wider when brighter
          const strikeFalloff = Math.max(0, 1 - strikeDist / strikeRadius);

          if (strikeFalloff > 0) {
            const segLightning = custom.lightning * strikeFalloff;
            const flashColor = segLightning > 0.4 ? COLORS.lightningBright : COLORS.lightning;
            segColor = ColorUtils.blend(segColor, flashColor, segLightning * 0.85);
            segBrightness = Math.min(1, segBrightness + segLightning * 0.7);
          }
        }

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Rain Effect - Gentler version without lightning
 */
export const rain: EffectPreset = {
  id: 'rain',
  name: 'Rain',
  description: 'Gentle rain with dark clouds',
  category: 'nature',

  defaultOptions: {
    speed: 35,
    brightness: 150,
    intensity: 0.4,
  },

  getInterval(): number {
    return 40; // 25fps
  },

  init(): ThunderstormState {
    return {
      rainPhase: Math.random() * Math.PI * 2,
      lightning: 0,
      lightningCooldown: 999, // No lightning
      rumbleGlow: 0,
      strikePosition: 0.5,
      cloudPhase: Math.random() * Math.PI * 2,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ThunderstormState;
    const speed = options.speed ?? 35;
    const baseBrightness = (options.brightness ?? 150) / 254;
    const intensity = options.intensity ?? 0.4;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 800;

    // Update phases
    custom.rainPhase += rate * 0.8;
    custom.cloudPhase += rate * 0.2;

    // Cloud variation
    const cloudDarkness = 0.85 + Math.sin(custom.cloudPhase) * 0.1;

    // Rain ripple effect
    const rainEffect = (
      Math.sin(custom.rainPhase) * 0.12 +
      Math.sin(custom.rainPhase * 2.1) * 0.08 +
      Math.sin(custom.rainPhase * 0.7) * 0.05
    );

    // Blue-gray rain color
    const rainColor: RGB = [40, 50, 70];
    const brightness = baseBrightness * cloudDarkness * (0.4 + rainEffect * intensity);

    const rgb = ColorUtils.scale(rainColor, brightness);

    // For gradient lights: rain falling across segments
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Rain drops traveling down (or across)
        const segRain = (
          Math.sin(custom.rainPhase + segmentPos * Math.PI * 3) * 0.15 +
          Math.sin(custom.rainPhase * 1.8 + segmentPos * Math.PI * 2) * 0.1 +
          Math.sin(custom.rainPhase * 0.6 + segmentPos * Math.PI * 4) * 0.08
        );

        const segCloud = 0.85 + Math.sin(custom.cloudPhase + segmentPos * Math.PI * 0.5) * 0.1;
        const segBrightness = baseBrightness * segCloud * (0.4 + segRain * intensity);

        gradient.push(ColorUtils.scale(rainColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
