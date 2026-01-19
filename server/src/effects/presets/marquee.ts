/**
 * Marquee Effect
 *
 * Classic theater/casino marquee lights:
 * - Bulbs chasing in sequence
 * - On/off pattern traveling around
 * - Warm incandescent bulb colors
 * - Optional alternating pattern
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface MarqueeState {
  /** Current position in the chase */
  position: number;
  /** Bulb glow phase (warm-up/cool-down simulation) */
  glowPhases: number[];
}

// Warm incandescent bulb colors
const BULB_COLORS = {
  off: [20, 10, 5] as RGB,           // Dim warm when off
  warming: [180, 80, 20] as RGB,     // Warming up orange
  on: [255, 200, 100] as RGB,        // Full warm white
  bright: [255, 230, 180] as RGB,    // Extra bright peak
};

export const marquee: EffectPreset = {
  id: 'marquee',
  name: 'Marquee',
  description: 'Classic theater marquee lights chasing',
  category: 'chase',

  defaultOptions: {
    speed: 60,
    brightness: 254,
    intensity: 0.7,
  },

  getInterval(): number {
    return 33; // 30fps
  },

  init(): MarqueeState {
    return {
      position: 0,
      glowPhases: [],
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as MarqueeState;
    const speed = options.speed ?? 60;
    const baseBrightness = (options.brightness ?? 254) / 254;
    const intensity = options.intensity ?? 0.7;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Move the chase position
    const chaseSpeed = speed / 400;
    custom.position = (custom.position + chaseSpeed) % segmentCount;

    // Pattern: every other bulb or every third, depending on segment count
    const patternSize = segmentCount > 6 ? 3 : 2;
    const litBulbs = Math.ceil(segmentCount / patternSize);

    // Initialize glow phases if needed
    if (custom.glowPhases.length !== segmentCount) {
      custom.glowPhases = new Array(segmentCount).fill(0);
    }

    // Helper to calculate bulb state based on chase position
    const getBulbState = (segmentIndex: number): number => {
      // Calculate which "wave" this segment belongs to
      const wavePosition = (custom.position + segmentIndex) % patternSize;

      // Bulb is "on" when wave position is near 0
      if (wavePosition < 1) {
        return 1 - wavePosition; // Fading out
      } else if (wavePosition > patternSize - 1) {
        return wavePosition - (patternSize - 1); // Fading in
      }
      return 0; // Off
    };

    // For single light: pulse with the chase
    const singlePulse = (Math.sin(custom.position * Math.PI * 2 / patternSize) + 1) / 2;
    const singleColor = ColorUtils.blend(BULB_COLORS.off, BULB_COLORS.on, singlePulse);
    const rgb = ColorUtils.scale(singleColor, baseBrightness * (0.3 + singlePulse * 0.7));

    // For gradient lights: show the actual marquee pattern
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Get this bulb's state (0 = off, 1 = on)
        const bulbState = getBulbState(i);

        // Update glow phase for smooth transitions (incandescent warm-up/cool-down)
        const targetGlow = bulbState;
        custom.glowPhases[i] += (targetGlow - custom.glowPhases[i]) * 0.2;

        const glow = custom.glowPhases[i];

        // Calculate bulb color based on glow level
        let bulbColor: RGB;
        if (glow < 0.1) {
          // Off - very dim warm
          bulbColor = BULB_COLORS.off;
        } else if (glow < 0.4) {
          // Warming up - orange glow
          const t = (glow - 0.1) / 0.3;
          bulbColor = ColorUtils.blend(BULB_COLORS.off, BULB_COLORS.warming, t);
        } else if (glow < 0.8) {
          // Getting bright
          const t = (glow - 0.4) / 0.4;
          bulbColor = ColorUtils.blend(BULB_COLORS.warming, BULB_COLORS.on, t);
        } else {
          // Full brightness with slight peak
          const t = (glow - 0.8) / 0.2;
          bulbColor = ColorUtils.blend(BULB_COLORS.on, BULB_COLORS.bright, t * intensity);
        }

        // Calculate brightness
        const bulbBrightness = baseBrightness * (0.05 + glow * 0.95);

        gradient.push(ColorUtils.scale(bulbColor, bulbBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Marquee Classic - Alternating on/off pattern (no chase)
 */
export const marqueeAlternate: EffectPreset = {
  id: 'marquee_alternate',
  name: 'Marquee Alternate',
  description: 'Alternating bulbs blinking on and off',
  category: 'chase',

  defaultOptions: {
    speed: 80,
    brightness: 254,
    intensity: 0.6,
  },

  getInterval(): number {
    return 33;
  },

  init(): MarqueeState {
    return {
      position: 0,
      glowPhases: [],
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as MarqueeState;
    const speed = options.speed ?? 80;
    const baseBrightness = (options.brightness ?? 254) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Slower alternation
    const rate = speed / 1500;
    custom.position += rate;

    // Smooth sine wave for alternation (avoids harsh flicker)
    const altPhase = Math.sin(custom.position * Math.PI);
    const altState = (altPhase + 1) / 2; // 0-1

    // Initialize glow phases
    if (custom.glowPhases.length !== segmentCount) {
      custom.glowPhases = new Array(segmentCount).fill(0);
    }

    // Single light: pulse
    const singleColor = ColorUtils.blend(BULB_COLORS.off, BULB_COLORS.on, altState);
    const rgb = ColorUtils.scale(singleColor, baseBrightness * (0.2 + altState * 0.8));

    // Gradient: alternating pattern
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Even segments follow altState, odd segments are inverted
        const isEven = i % 2 === 0;
        const targetGlow = isEven ? altState : (1 - altState);

        // Smooth transition
        custom.glowPhases[i] += (targetGlow - custom.glowPhases[i]) * 0.15;
        const glow = custom.glowPhases[i];

        // Calculate color
        let bulbColor: RGB;
        if (glow < 0.3) {
          bulbColor = ColorUtils.blend(BULB_COLORS.off, BULB_COLORS.warming, glow / 0.3);
        } else {
          bulbColor = ColorUtils.blend(BULB_COLORS.warming, BULB_COLORS.on, (glow - 0.3) / 0.7);
        }

        const bulbBrightness = baseBrightness * (0.08 + glow * 0.92);
        gradient.push(ColorUtils.scale(bulbColor, bulbBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Theater - Slower, more elegant marquee
 */
export const theater: EffectPreset = {
  id: 'theater',
  name: 'Theater',
  description: 'Elegant slow-moving theater lights',
  category: 'chase',

  defaultOptions: {
    speed: 30,
    brightness: 240,
    intensity: 0.5,
  },

  getInterval(): number {
    return 40;
  },

  init: marquee.init,

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    return marquee.cycle(state, {
      ...options,
      speed: (options.speed ?? 30) * 0.6, // Slower
    });
  },
};
