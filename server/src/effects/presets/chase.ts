/**
 * Chase Effects
 *
 * Various chase/cycling effects:
 * - Rainbow chase
 * - Two-color chase
 * - Wave patterns
 * - Bounce (bi-directional)
 * - Comet (trailing fade)
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface ChaseState {
  /** Current position in the cycle */
  position: number;
  /** Direction for bounce mode */
  direction: number;
  /** Trail values for comet */
  trail: number[];
}

/**
 * Rainbow Chase
 * Cycles through full rainbow spectrum
 * For gradient lights: shows multiple colors moving across segments
 */
export const rainbowChase: EffectPreset = {
  id: 'rainbow_chase',
  name: 'Rainbow Chase',
  description: 'Cycling through rainbow colors',
  category: 'chase',

  defaultOptions: {
    speed: 60,
    brightness: 254,
    intensity: 0.7,
  },

  getInterval(options: EffectOptions): number {
    const speed = options.speed ?? 60;
    return Math.max(30, Math.round(3000 / speed));
  },

  init(): ChaseState {
    return { position: 0, direction: 1, trail: [] };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const speed = options.speed ?? 60;
    const brightness = (options.brightness ?? 254) / 254;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Move through rainbow
    custom.position = (custom.position + speed / 100) % Palettes.rainbow.length;

    // Get current and next color for smooth blend
    const idx = Math.floor(custom.position);
    const nextIdx = (idx + 1) % Palettes.rainbow.length;
    const blend = custom.position - idx;

    const color = ColorUtils.blend(
      Palettes.rainbow[idx],
      Palettes.rainbow[nextIdx],
      blend
    );

    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: create a rainbow spread across segments
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];
      for (let i = 0; i < segmentCount; i++) {
        // Offset each segment's position in the rainbow
        const segmentOffset = (i / segmentCount) * Palettes.rainbow.length;
        const segmentPosition = (custom.position + segmentOffset) % Palettes.rainbow.length;

        const segIdx = Math.floor(segmentPosition);
        const segNextIdx = (segIdx + 1) % Palettes.rainbow.length;
        const segBlend = segmentPosition - segIdx;

        const segColor = ColorUtils.blend(
          Palettes.rainbow[segIdx],
          Palettes.rainbow[segNextIdx],
          segBlend
        );

        gradient.push(ColorUtils.scale(segColor, brightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Two Color Chase
 * Alternates between two colors
 */
export const twoColorChase: EffectPreset = {
  id: 'two_color_chase',
  name: 'Two Color Chase',
  description: 'Alternating between two colors',
  category: 'chase',

  defaultOptions: {
    speed: 120,
    brightness: 254,
    color1: { x: 0.675, y: 0.322 }, // Red
    color2: { x: 0.168, y: 0.041 }, // Blue
  },

  getInterval(options: EffectOptions): number {
    const speed = options.speed ?? 120;
    return Math.max(50, Math.round(6000 / speed));
  },

  init(): ChaseState {
    return { position: 0, direction: 1, trail: [] };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const brightness = (options.brightness ?? 254) / 254;

    custom.position = (custom.position + 0.1) % 2;

    const color1 = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : Palettes.police.red;
    const color2 = options.color2
      ? ColorUtils.xyToRgb(options.color2, 254)
      : Palettes.police.blue;

    // Smooth blend between colors
    const blend = (Math.sin(custom.position * Math.PI) + 1) / 2;
    const color = ColorUtils.blend(color1, color2, blend);

    return {
      rgb: ColorUtils.scale(color, brightness),
    };
  },
};

/**
 * Wave Chase
 * Sine wave brightness pattern through colors
 */
export const waveChase: EffectPreset = {
  id: 'wave_chase',
  name: 'Wave',
  description: 'Flowing wave pattern',
  category: 'chase',

  defaultOptions: {
    speed: 40,
    brightness: 254,
    intensity: 0.7,
    color1: { x: 0.168, y: 0.041 }, // Blue
  },

  getInterval(): number {
    return 33; // 30fps for smooth waves
  },

  init(): ChaseState {
    return { position: 0, direction: 1, trail: [] };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const speed = options.speed ?? 40;
    const maxBrightness = (options.brightness ?? 254) / 254;
    const intensity = options.intensity ?? 0.7;

    custom.position += speed / 500;

    // Multiple sine waves for complex pattern
    const wave = (
      Math.sin(custom.position) * 0.5 +
      Math.sin(custom.position * 2.3) * 0.3 +
      Math.sin(custom.position * 0.7) * 0.2
    );

    const brightness = maxBrightness * (0.3 + (wave + 1) / 2 * 0.7 * intensity);

    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [0, 100, 255] as RGB;

    return {
      rgb: ColorUtils.scale(baseColor, brightness),
    };
  },
};

/**
 * Bounce Chase
 * Goes back and forth through colors
 */
export const bounceChase: EffectPreset = {
  id: 'bounce_chase',
  name: 'Bounce',
  description: 'Colors bouncing back and forth',
  category: 'chase',

  defaultOptions: {
    speed: 80,
    brightness: 254,
  },

  getInterval(options: EffectOptions): number {
    const speed = options.speed ?? 80;
    return Math.max(40, Math.round(4000 / speed));
  },

  init(): ChaseState {
    return { position: 0, direction: 1, trail: [] };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const brightness = (options.brightness ?? 254) / 254;

    // Move position
    custom.position += 0.15 * custom.direction;

    // Bounce at ends
    if (custom.position >= Palettes.rainbow.length - 1) {
      custom.position = Palettes.rainbow.length - 1;
      custom.direction = -1;
    } else if (custom.position <= 0) {
      custom.position = 0;
      custom.direction = 1;
    }

    // Get interpolated color
    const idx = Math.floor(custom.position);
    const nextIdx = Math.min(idx + 1, Palettes.rainbow.length - 1);
    const blend = custom.position - idx;

    const color = ColorUtils.blend(
      Palettes.rainbow[idx],
      Palettes.rainbow[nextIdx],
      blend
    );

    return {
      rgb: ColorUtils.scale(color, brightness),
    };
  },
};

/**
 * Comet Chase
 * Color with fading trail
 * For gradient lights: shows actual comet traveling with fade trail
 */
export const cometChase: EffectPreset = {
  id: 'comet_chase',
  name: 'Comet',
  description: 'Bright head with fading trail',
  category: 'chase',

  defaultOptions: {
    speed: 100,
    brightness: 254,
    color1: { x: 0.3127, y: 0.329 }, // White
  },

  getInterval(options: EffectOptions): number {
    const speed = options.speed ?? 100;
    return Math.max(25, Math.round(2500 / speed));
  },

  init(): ChaseState {
    return {
      position: 0,
      direction: 1,
      trail: [1, 0.7, 0.4, 0.2, 0.1, 0.05], // Fade trail
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const maxBrightness = (options.brightness ?? 254) / 254;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [255, 255, 255] as RGB;

    // For gradient lights: show actual comet traveling across strip
    if (isGradient && segmentCount > 1) {
      // Move comet head position along the strip
      const speed = options.speed ?? 100;
      custom.position = (custom.position + speed / 500) % (segmentCount + 4); // Extra space for trail to exit

      const gradient: RGB[] = [];
      const tailLength = 4; // How many segments the tail spans

      for (let i = 0; i < segmentCount; i++) {
        // Distance from comet head (negative = ahead, positive = behind/trail)
        const distFromHead = custom.position - i;

        let segBrightness = 0;
        let segColor = baseColor;

        if (distFromHead >= 0 && distFromHead < 1) {
          // This is the head - brightest
          segBrightness = maxBrightness;
        } else if (distFromHead >= 1 && distFromHead < tailLength + 1) {
          // This is the trail - fading
          const trailPos = (distFromHead - 1) / tailLength;
          segBrightness = maxBrightness * Math.pow(1 - trailPos, 2); // Exponential fade

          // Shift tail color warmer
          const warmShift = trailPos * 0.4;
          segColor = ColorUtils.blend(baseColor, [255, 120, 30] as RGB, warmShift);
        } else {
          // Not part of comet - dark
          segBrightness = 0;
        }

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      // For single color output, use head position
      const headIdx = Math.floor(custom.position);
      const rgb = headIdx >= 0 && headIdx < segmentCount
        ? ColorUtils.scale(baseColor, maxBrightness)
        : [0, 0, 0] as RGB;

      return { rgb, gradient };
    }

    // Non-gradient: cycle through trail brightness positions
    custom.position = (custom.position + 1) % custom.trail.length;

    // Head is brightest
    const trailBrightness = custom.trail[Math.floor(custom.position)];
    const brightness = maxBrightness * trailBrightness;

    // Shift color slightly based on position (warmer at tail)
    let color = baseColor;
    if (trailBrightness < 0.5) {
      // Tail shifts toward warm
      const warmShift = (0.5 - trailBrightness) * 0.3;
      color = ColorUtils.blend(baseColor, [255, 150, 50] as RGB, warmShift);
    }

    return {
      rgb: ColorUtils.scale(color, brightness),
    };
  },
};

/**
 * Pulse Chase
 * Rhythmic pulsing effect
 */
export const pulseChase: EffectPreset = {
  id: 'pulse',
  name: 'Pulse',
  description: 'Rhythmic brightness pulsing',
  category: 'chase',

  defaultOptions: {
    speed: 120, // BPM-like
    brightness: 254,
    color1: { x: 0.3127, y: 0.329 },
  },

  getInterval(): number {
    return 20; // 50fps for smooth pulses
  },

  init(): ChaseState {
    return { position: 0, direction: 1, trail: [] };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as ChaseState;
    const speed = options.speed ?? 120;
    const maxBrightness = (options.brightness ?? 254) / 254;

    // Speed in BPM - how fast we complete a pulse cycle
    const msPerBeat = 60000 / speed;
    const cycleProgress = (state.elapsed % msPerBeat) / msPerBeat;

    // Sharp attack, smooth decay pulse shape
    let pulse: number;
    if (cycleProgress < 0.1) {
      // Quick attack
      pulse = cycleProgress / 0.1;
    } else {
      // Smooth decay
      pulse = 1 - ((cycleProgress - 0.1) / 0.9);
      pulse = pulse * pulse; // Exponential decay
    }

    const brightness = maxBrightness * (0.1 + pulse * 0.9);

    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [255, 255, 255] as RGB;

    return {
      rgb: ColorUtils.scale(baseColor, brightness),
    };
  },
};
