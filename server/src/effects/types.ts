/**
 * Effect System Types
 *
 * Defines the interface for streaming-compatible light effects.
 */

/** RGB color tuple [r, g, b] with values 0-255 */
export type RGB = [number, number, number];

/** XY color coordinates used by Hue API */
export interface XYColor {
  x: number;
  y: number;
}

/** Effect state passed to each cycle */
export interface EffectState {
  /** Time elapsed since effect started (ms) */
  elapsed: number;
  /** Custom state storage for the effect (set by init()) */
  custom: any;
}

/** Options passed when starting an effect */
export interface EffectOptions {
  /** Speed in BPM (beats per minute) */
  speed?: number;
  /** Primary color */
  color1?: XYColor;
  /** Secondary color */
  color2?: XYColor;
  /** Brightness 0-254 */
  brightness?: number;
  /** Effect intensity 0-1 */
  intensity?: number;
  /** Number of segments for gradient lights (set by engine) */
  segmentCount?: number;
  /** Whether this light supports gradients (set by engine) */
  isGradient?: boolean;
}

/** Output from an effect cycle - what color to set */
export interface EffectOutput {
  /** RGB color to display (for single-color or fallback) */
  rgb: RGB;
  /** Gradient colors for multi-segment lights (optional) */
  gradient?: RGB[];
}

/**
 * Effect preset definition
 * Each effect implements this interface
 */
export interface EffectPreset {
  /** Unique identifier for this effect */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the effect looks like */
  description: string;
  /** Category for UI grouping */
  category: 'ambient' | 'dynamic' | 'nature' | 'chase' | 'alert';
  /** Default options for this effect */
  defaultOptions: Partial<EffectOptions>;
  /**
   * Get the interval in ms between effect cycles
   * Can be dynamic based on speed/options
   */
  getInterval(options: EffectOptions): number;
  /**
   * Initialize custom state when effect starts
   * Returns the initial custom state object
   */
  init(): any;
  /**
   * Run one cycle of the effect
   * Returns the RGB color to display
   */
  cycle(state: EffectState, options: EffectOptions): EffectOutput;
}

/**
 * Color utilities for effects
 */
export const ColorUtils = {
  /** Convert XY + brightness to RGB */
  xyToRgb(xy: XYColor, brightness: number = 254): RGB {
    const z = 1.0 - xy.x - xy.y;
    const Y = brightness / 254;
    const X = (Y / xy.y) * xy.x;
    const Z = (Y / xy.y) * z;

    let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    r = Math.pow(Math.max(0, Math.min(1, r)), 0.45) * 255;
    g = Math.pow(Math.max(0, Math.min(1, g)), 0.45) * 255;
    b = Math.pow(Math.max(0, Math.min(1, b)), 0.45) * 255;

    return [Math.round(r), Math.round(g), Math.round(b)];
  },

  /** Convert HSV to RGB */
  hsvToRgb(h: number, s: number, v: number): RGB {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  },

  /** Blend two RGB colors */
  blend(color1: RGB, color2: RGB, t: number): RGB {
    return [
      Math.round(color1[0] * (1 - t) + color2[0] * t),
      Math.round(color1[1] * (1 - t) + color2[1] * t),
      Math.round(color1[2] * (1 - t) + color2[2] * t),
    ];
  },

  /** Scale RGB brightness */
  scale(color: RGB, factor: number): RGB {
    return [
      Math.round(Math.min(255, color[0] * factor)),
      Math.round(Math.min(255, color[1] * factor)),
      Math.round(Math.min(255, color[2] * factor)),
    ];
  },

  /** Add noise to a value */
  noise(value: number, amount: number): number {
    return value + (Math.random() - 0.5) * 2 * amount;
  },
};

/**
 * Predefined color palettes for effects
 */
export const Palettes = {
  // Flame colors (warm to hot)
  flame: {
    ember: [80, 20, 0] as RGB,
    orange: [255, 100, 0] as RGB,
    yellow: [255, 200, 50] as RGB,
    white: [255, 240, 220] as RGB,
  },

  // Candle colors (warmer, softer)
  candle: {
    dim: [120, 50, 10] as RGB,
    warm: [255, 140, 40] as RGB,
    bright: [255, 180, 80] as RGB,
    flicker: [255, 200, 100] as RGB,
  },

  // Ocean colors
  ocean: {
    deep: [0, 30, 80] as RGB,
    mid: [0, 80, 120] as RGB,
    surface: [50, 150, 180] as RGB,
    foam: [180, 220, 240] as RGB,
  },

  // Aurora colors
  aurora: {
    green: [50, 255, 100] as RGB,
    teal: [0, 200, 180] as RGB,
    purple: [150, 50, 255] as RGB,
    pink: [255, 100, 200] as RGB,
  },

  // Sunset colors
  sunset: {
    red: [255, 60, 30] as RGB,
    orange: [255, 120, 40] as RGB,
    pink: [255, 100, 120] as RGB,
    purple: [180, 80, 160] as RGB,
  },

  // Rainbow
  rainbow: [
    [255, 0, 0] as RGB,     // Red
    [255, 127, 0] as RGB,   // Orange
    [255, 255, 0] as RGB,   // Yellow
    [0, 255, 0] as RGB,     // Green
    [0, 0, 255] as RGB,     // Blue
    [75, 0, 130] as RGB,    // Indigo
    [148, 0, 211] as RGB,   // Violet
  ],

  // Police
  police: {
    red: [255, 0, 0] as RGB,
    blue: [0, 0, 255] as RGB,
    white: [255, 255, 255] as RGB,
  },

  // Lava
  lava: {
    black: [20, 5, 0] as RGB,
    darkRed: [80, 10, 0] as RGB,
    red: [180, 30, 0] as RGB,
    orange: [255, 80, 0] as RGB,
    yellow: [255, 160, 20] as RGB,
  },
};
