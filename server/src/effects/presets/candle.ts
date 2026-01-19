/**
 * Candle Effect
 *
 * Realistic candle flame simulation with:
 * - Soft warm glow as base
 * - Gentle random flickering
 * - Occasional "gust" effects where flame dips
 * - Subtle color temperature shifts
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface CandleState {
  /** Current flicker intensity */
  flickerIntensity: number;
  /** Target flicker intensity (smoothing) */
  targetFlicker: number;
  /** Gust cooldown timer */
  gustCooldown: number;
  /** Is currently in a gust */
  inGust: boolean;
  /** Gust progress 0-1 */
  gustProgress: number;
}

export const candle: EffectPreset = {
  id: 'candle',
  name: 'Candle',
  description: 'Soft flickering candle flame with occasional gusts',
  category: 'nature',

  defaultOptions: {
    speed: 60,
    brightness: 200,
    intensity: 0.5,
  },

  getInterval(): number {
    // 30fps for smooth flickering
    return 33;
  },

  init(): CandleState {
    return {
      flickerIntensity: 0.5,
      targetFlicker: 0.5,
      gustCooldown: 0,
      inGust: false,
      gustProgress: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as CandleState;
    const intensity = options.intensity ?? 0.5;
    const baseBrightness = options.brightness ?? 200;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Speed controls flicker tempo: 50 = normal, 25 = half speed, 100 = double
    const speed = options.speed ?? 60;
    const speedMultiplier = Math.max(0.2, speed / 50);

    // Update flicker target randomly (speed affects how often target changes)
    if (Math.random() < 0.1 * speedMultiplier) {
      custom.targetFlicker = 0.3 + Math.random() * 0.7;
    }

    // Smooth flicker transitions (speed affects transition rate)
    custom.flickerIntensity += (custom.targetFlicker - custom.flickerIntensity) * 0.15 * speedMultiplier;

    // Handle gusts (occasional dips in flame)
    if (custom.gustCooldown > 0) {
      custom.gustCooldown--;
    } else if (!custom.inGust && Math.random() < 0.005 * intensity) {
      // Start a gust
      custom.inGust = true;
      custom.gustProgress = 0;
    }

    let gustFactor = 1;
    if (custom.inGust) {
      custom.gustProgress += 0.08 * speedMultiplier;
      if (custom.gustProgress >= 1) {
        custom.inGust = false;
        custom.gustCooldown = 60; // ~2 seconds cooldown
      } else {
        // Gust shape: quick dip, slow recovery
        const gustCurve = Math.sin(custom.gustProgress * Math.PI);
        gustFactor = 1 - gustCurve * 0.6;
      }
    }

    // Helper to get candle color based on brightness level
    const getCandleColor = (bright: number): RGB => {
      if (bright < 0.4) {
        return Palettes.candle.dim;
      } else if (bright < 0.6) {
        return ColorUtils.blend(Palettes.candle.dim, Palettes.candle.warm, (bright - 0.4) / 0.2);
      } else if (bright < 0.8) {
        return ColorUtils.blend(Palettes.candle.warm, Palettes.candle.bright, (bright - 0.6) / 0.2);
      } else {
        return ColorUtils.blend(Palettes.candle.bright, Palettes.candle.flicker, (bright - 0.8) / 0.2);
      }
    };

    // Calculate brightness with flicker and gust
    const flickerAmount = (custom.flickerIntensity - 0.5) * 0.3 * intensity;
    const brightness = Math.max(0.1, Math.min(1,
      (baseBrightness / 254) * (0.7 + flickerAmount) * gustFactor
    ));

    const color = getCandleColor(brightness);

    // Add micro-flicker noise
    const noise = 1 + (Math.random() - 0.5) * 0.1 * intensity;
    const rgb = ColorUtils.scale(color, brightness * noise);

    // For gradient lights: simulate flame shape (warm glow at base, flickering tip)
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Position 0 = base (warm steady glow), 1 = tip (flickering flame)
        const segmentPos = i / (segmentCount - 1);

        // Base is more stable, tip is more dynamic
        const baseStability = 1 - segmentPos * 0.6; // Base = 1.0, tip = 0.4
        const tipFlicker = segmentPos * 0.4; // Base = 0, tip = 0.4

        // Per-segment flicker variation (speed affects flicker rate)
        const segFlickerOffset = Math.sin(state.elapsed * speedMultiplier / 100 + i * 1.5) * tipFlicker;

        // Gust affects tip more than base
        const segGustFactor = 1 - (1 - gustFactor) * segmentPos;

        // Calculate segment brightness
        const segBrightness = Math.max(0.1, Math.min(1,
          (baseBrightness / 254) *
          (0.6 + flickerAmount * (1 - baseStability) + segFlickerOffset) *
          segGustFactor
        ));

        // Tip is hotter (more yellow/white), base is warmer (more orange)
        const heatBoost = segmentPos * 0.15;
        const segColor = getCandleColor(Math.min(1, segBrightness + heatBoost));

        // Per-segment noise
        const segNoise = 1 + (Math.random() - 0.5) * 0.08 * intensity * (1 + segmentPos);

        gradient.push(ColorUtils.scale(segColor, segBrightness * segNoise));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
