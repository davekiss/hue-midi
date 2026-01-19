/**
 * Fire Effect
 *
 * Realistic fire/fireplace simulation with:
 * - Intense flickering with multiple frequencies
 * - Red/orange/yellow color palette
 * - Crackling bursts of brightness
 * - Ember glow undertones
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface FireState {
  /** Multiple flicker oscillators at different frequencies */
  flicker1: number;
  flicker2: number;
  flicker3: number;
  /** Crackle intensity */
  crackle: number;
  /** Time until next crackle */
  crackleTimer: number;
  /** Ember glow base */
  emberGlow: number;
}

export const fire: EffectPreset = {
  id: 'fire',
  name: 'Fire',
  description: 'Intense crackling fire with ember glow',
  category: 'nature',

  defaultOptions: {
    speed: 80,
    brightness: 254,
    intensity: 0.7,
  },

  getInterval(): number {
    // 40fps for intense flickering
    return 25;
  },

  init(): FireState {
    return {
      flicker1: Math.random(),
      flicker2: Math.random(),
      flicker3: Math.random(),
      crackle: 0,
      crackleTimer: 0,
      emberGlow: 0.3,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as FireState;
    const intensity = options.intensity ?? 0.7;
    const baseBrightness = (options.brightness ?? 254) / 254;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Speed controls flicker tempo: 50 = normal, 25 = half speed, 100 = double
    const speed = options.speed ?? 80;
    const speedMultiplier = Math.max(0.2, speed / 50);

    // Update multiple flicker oscillators at different speeds
    custom.flicker1 += (0.15 + Math.random() * 0.1) * speedMultiplier;
    custom.flicker2 += (0.08 + Math.random() * 0.05) * speedMultiplier;
    custom.flicker3 += (0.03 + Math.random() * 0.02) * speedMultiplier;

    // Combine flickers with different weights
    const flicker = (
      Math.sin(custom.flicker1) * 0.4 +
      Math.sin(custom.flicker2) * 0.35 +
      Math.sin(custom.flicker3) * 0.25
    );

    // Handle crackle (sudden bright pops)
    if (custom.crackleTimer <= 0) {
      if (Math.random() < 0.03 * intensity) {
        custom.crackle = 0.8 + Math.random() * 0.2;
        custom.crackleTimer = 3 + Math.random() * 5;
      }
    } else {
      custom.crackleTimer--;
      custom.crackle *= 0.7; // Decay crackle
    }

    // Ember glow slowly shifts
    custom.emberGlow += (Math.random() - 0.5) * 0.02;
    custom.emberGlow = Math.max(0.2, Math.min(0.4, custom.emberGlow));

    // Calculate final brightness
    const flickerContrib = (flicker + 1) / 2; // 0-1
    const brightness = Math.max(0.1, Math.min(1,
      custom.emberGlow +
      flickerContrib * 0.5 * intensity +
      custom.crackle * 0.4
    )) * baseBrightness;

    // Helper to get fire color based on heat level
    const getFireColor = (heat: number): RGB => {
      if (heat < 0.25) {
        return Palettes.flame.ember;
      } else if (heat < 0.5) {
        const t = (heat - 0.25) / 0.25;
        return ColorUtils.blend(Palettes.flame.ember, Palettes.flame.orange, t);
      } else if (heat < 0.75) {
        const t = (heat - 0.5) / 0.25;
        return ColorUtils.blend(Palettes.flame.orange, Palettes.flame.yellow, t);
      } else {
        const t = (heat - 0.75) / 0.25;
        return ColorUtils.blend(Palettes.flame.yellow, Palettes.flame.white, t * 0.5);
      }
    };

    const color = getFireColor(brightness);
    const noise = 1 + (Math.random() - 0.5) * 0.15 * intensity;
    const rgb = ColorUtils.scale(color, brightness * noise);

    // For gradient lights: simulate flame height with embers at base, flames above
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Position 0 = base (embers), 1 = tip (flames)
        const segmentPos = i / (segmentCount - 1);

        // Each segment has its own flicker offset (using already speed-scaled oscillators)
        const segFlicker = Math.sin(custom.flicker1 + i * 0.7) * 0.3 +
                          Math.sin(custom.flicker2 + i * 1.3) * 0.2;

        // Base is more ember, tip is more flame
        // Crackle affects upper segments more
        const crackleEffect = custom.crackle * segmentPos * 0.5;
        const segHeat = Math.max(0.1, Math.min(1,
          custom.emberGlow * (1 - segmentPos * 0.5) + // More ember glow at base
          (segFlicker + 1) / 2 * 0.4 * intensity +
          segmentPos * 0.3 + // Higher = hotter flames
          crackleEffect
        ));

        const segColor = getFireColor(segHeat);
        const segNoise = 1 + (Math.random() - 0.5) * 0.2 * intensity;
        gradient.push(ColorUtils.scale(segColor, segHeat * baseBrightness * segNoise));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Fireplace Effect
 * Alias for fire (matches Hue naming)
 */
export const fireplace: EffectPreset = {
  ...fire,
  id: 'fireplace',
  name: 'Fireplace',
};
