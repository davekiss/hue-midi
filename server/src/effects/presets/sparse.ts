/**
 * Sparse Effect
 *
 * Scattered light points with darkness between:
 * - Random segments lit, others dark/dim
 * - Slowly shifts which segments are active
 * - Creates depth and visual interest
 * - Like stars or scattered fairy lights
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface SparseSegment {
  brightness: number;     // Current brightness 0-1
  targetBright: number;   // Target brightness
  hueOffset: number;      // Color variation
}

interface SparseState {
  /** Per-segment state */
  segments: SparseSegment[];
  /** Global phase for color shifting */
  colorPhase: number;
  /** Time until next segment change */
  changeTimer: number;
  /** Global brightness pulse */
  pulsePhase: number;
}

export const sparse: EffectPreset = {
  id: 'sparse',
  name: 'Sparse',
  description: 'Scattered light points with darkness between',
  category: 'ambient',

  defaultOptions: {
    speed: 30,
    brightness: 200,
    intensity: 0.5,
    color1: { x: 0.3127, y: 0.329 }, // White default
  },

  getInterval(): number {
    return 40; // 25fps
  },

  init(): SparseState {
    return {
      segments: [],
      colorPhase: Math.random() * Math.PI * 2,
      changeTimer: 0,
      pulsePhase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as SparseState;
    const speed = options.speed ?? 30;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;
    const baseColor = options.color1
      ? ColorUtils.xyToRgb(options.color1, 254)
      : [255, 255, 255] as RGB;

    const rate = speed / 800;

    // Update phases
    custom.colorPhase += rate * 0.3;
    custom.pulsePhase += rate * 0.5;

    // Initialize segments if needed
    if (custom.segments.length !== segmentCount) {
      custom.segments = [];
      for (let i = 0; i < segmentCount; i++) {
        // Randomly decide if this segment starts lit (~30% lit)
        const isLit = Math.random() < 0.3;
        custom.segments.push({
          brightness: isLit ? 0.6 + Math.random() * 0.4 : 0,
          targetBright: isLit ? 0.6 + Math.random() * 0.4 : 0,
          hueOffset: Math.random() * 30 - 15, // ±15 degree hue variation
        });
      }
    }

    // Periodically change which segments are lit
    custom.changeTimer--;
    if (custom.changeTimer <= 0) {
      // Pick a random segment to toggle
      const idx = Math.floor(Math.random() * segmentCount);
      if (custom.segments[idx]) {
        if (custom.segments[idx].targetBright > 0.1) {
          // Turn it off
          custom.segments[idx].targetBright = 0;
        } else {
          // Turn it on
          custom.segments[idx].targetBright = 0.5 + Math.random() * 0.5;
          custom.segments[idx].hueOffset = Math.random() * 30 - 15;
        }
      }
      custom.changeTimer = Math.floor(15 + Math.random() * 25 / (intensity + 0.1));
    }

    // Global subtle pulse
    const globalPulse = 1 + Math.sin(custom.pulsePhase) * 0.1;

    // For single light mode: show average or dominant
    const avgBrightness = custom.segments.reduce((sum, s) => sum + s.brightness, 0) / Math.max(1, segmentCount);
    const singleBrightness = baseBrightness * avgBrightness * globalPulse;
    const rgb = ColorUtils.scale(baseColor, singleBrightness);

    // For gradient lights: show the sparse pattern
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const seg = custom.segments[i];

        // Smooth transition to target brightness
        seg.brightness += (seg.targetBright - seg.brightness) * 0.08;
        if (Math.abs(seg.brightness - seg.targetBright) < 0.01) {
          seg.brightness = seg.targetBright;
        }

        // Calculate segment color with hue offset
        let segColor = baseColor;
        if (seg.hueOffset !== 0 && seg.brightness > 0.1) {
          // Apply subtle hue shift using HSV
          const r = baseColor[0] / 255;
          const g = baseColor[1] / 255;
          const b = baseColor[2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h = 0;
          const s = max === 0 ? 0 : (max - min) / max;
          const v = max;

          if (max !== min) {
            const d = max - min;
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
          }

          // Apply offset and convert back
          const newH = (h + seg.hueOffset + 360) % 360;
          segColor = ColorUtils.hsvToRgb(newH, Math.min(1, s + 0.1), v);
        }

        // Add subtle twinkle to lit segments
        let segBrightness = seg.brightness;
        if (segBrightness > 0.2) {
          const twinkle = Math.sin(custom.colorPhase * 2 + i * 1.5) * 0.1;
          segBrightness *= (1 + twinkle * intensity);
        }

        const finalBrightness = baseBrightness * segBrightness * globalPulse;
        gradient.push(ColorUtils.scale(segColor, finalBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Scattered - Alias with different defaults (more colorful)
 */
export const scattered: EffectPreset = {
  id: 'scattered',
  name: 'Scattered',
  description: 'Colorful scattered light points',
  category: 'ambient',

  defaultOptions: {
    speed: 35,
    brightness: 220,
    intensity: 0.6,
  },

  getInterval(): number {
    return 40;
  },

  init: sparse.init,

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    // Use sparse logic but with more color variation built in
    const custom = state.custom as SparseState;

    // Override to cycle through colors
    if (!options.color1) {
      const hue = (state.elapsed / 100) % 360;
      const rgb = ColorUtils.hsvToRgb(hue, 0.7, 1);
      return sparse.cycle(state, {
        ...options,
        color1: { x: rgb[0] / 255, y: rgb[1] / 255 }, // Approximate
      });
    }

    return sparse.cycle(state, options);
  },
};
