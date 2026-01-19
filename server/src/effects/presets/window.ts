/**
 * Window View Effects
 *
 * Looking through a house window from outside:
 * - Cozy warm interior light
 * - Occasional movement shadows
 * - TV glow variations
 * - Party lights version
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface WindowState {
  /** Ambient light phase */
  ambientPhase: number;
  /** TV flicker phase */
  tvPhase: number;
  /** Shadow passing intensity */
  shadowIntensity: number;
  /** Shadow position for gradients */
  shadowPosition: number;
  /** Shadow cooldown */
  shadowCooldown: number;
  /** Room activity level */
  activityPhase: number;
}

// Cozy interior colors
const COZY_COLORS = {
  warmLight: [255, 180, 100] as RGB,      // Warm lamp light
  dimWarm: [180, 120, 60] as RGB,         // Dimmer warm
  tvBlue: [150, 180, 220] as RGB,         // TV glow
  tvFlicker: [180, 200, 240] as RGB,      // TV bright moment
  shadow: [60, 40, 25] as RGB,            // Shadow passing
  candleWarm: [255, 150, 50] as RGB,      // Extra warm accent
};

export const cozyWindow: EffectPreset = {
  id: 'cozy_window',
  name: 'Cozy Window',
  description: 'Warm interior light seen through a window at night',
  category: 'ambient',

  defaultOptions: {
    speed: 30,
    brightness: 180,
    intensity: 0.5,
  },

  getInterval(): number {
    return 40; // 25fps
  },

  init(): WindowState {
    return {
      ambientPhase: Math.random() * Math.PI * 2,
      tvPhase: Math.random() * Math.PI * 2,
      shadowIntensity: 0,
      shadowPosition: 0,
      shadowCooldown: 50,
      activityPhase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as WindowState;
    const speed = options.speed ?? 30;
    const baseBrightness = (options.brightness ?? 180) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 800;

    // Update phases
    custom.ambientPhase += rate * 0.3;
    custom.tvPhase += rate * 2.5; // TV flickers faster
    custom.activityPhase += rate * 0.15;

    // Handle passing shadows (someone walking by window)
    if (custom.shadowCooldown > 0) {
      custom.shadowCooldown--;
    } else if (Math.random() < 0.004 * intensity) {
      custom.shadowIntensity = 0.4 + Math.random() * 0.4;
      custom.shadowPosition = Math.random(); // Where shadow starts
      custom.shadowCooldown = 80 + Math.random() * 120;
    }

    // Shadow moves across and fades
    if (custom.shadowIntensity > 0.02) {
      custom.shadowPosition += 0.03;
      custom.shadowIntensity *= 0.94;
    }

    // Base warm ambient light with subtle variation
    const ambientWave = Math.sin(custom.ambientPhase) * 0.08 + Math.sin(custom.ambientPhase * 0.4) * 0.04;

    // TV flicker contribution (subtle, like reflected light)
    const tvFlicker = (
      Math.sin(custom.tvPhase) * 0.06 +
      Math.sin(custom.tvPhase * 2.3) * 0.04 +
      Math.sin(custom.tvPhase * 0.7) * 0.03
    ) * intensity;

    // Mix warm ambient with occasional TV blue tint
    const tvMix = (Math.sin(custom.activityPhase) + 1) / 2 * 0.25; // How much TV vs lamp
    let baseColor = ColorUtils.blend(COZY_COLORS.warmLight, COZY_COLORS.tvBlue, tvMix * intensity);

    // Add ambient variation
    if (ambientWave > 0) {
      baseColor = ColorUtils.blend(baseColor, COZY_COLORS.candleWarm, ambientWave * 0.3);
    } else {
      baseColor = ColorUtils.blend(baseColor, COZY_COLORS.dimWarm, -ambientWave * 0.2);
    }

    // Apply shadow dimming
    if (custom.shadowIntensity > 0.1) {
      baseColor = ColorUtils.blend(baseColor, COZY_COLORS.shadow, custom.shadowIntensity * 0.4);
    }

    // Calculate brightness
    let brightness = baseBrightness * (0.7 + ambientWave + tvFlicker);
    brightness = Math.max(0.15, Math.min(1, brightness * (1 - custom.shadowIntensity * 0.3)));

    const rgb = ColorUtils.scale(baseColor, brightness);

    // For gradient lights: window panes with different light sources
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Different parts of window show different light sources
        // Left side more TV, right side more lamp (or vice versa based on phase)
        const lampSide = (Math.sin(custom.activityPhase * 0.5) + 1) / 2;
        const segTvMix = segmentPos < lampSide ? 0.4 : 0.1;

        // Per-segment ambient variation
        const segAmbient = Math.sin(custom.ambientPhase + segmentPos * Math.PI * 0.5) * 0.1;

        // Per-segment TV flicker (slight offset per pane)
        const segTvFlicker = (
          Math.sin(custom.tvPhase + segmentPos * 0.5) * 0.05 +
          Math.sin(custom.tvPhase * 2.3 + segmentPos) * 0.03
        ) * intensity;

        let segColor = ColorUtils.blend(COZY_COLORS.warmLight, COZY_COLORS.tvBlue, segTvMix * intensity);

        if (segAmbient > 0) {
          segColor = ColorUtils.blend(segColor, COZY_COLORS.candleWarm, segAmbient * 0.4);
        }

        // Shadow passes across segments
        if (custom.shadowIntensity > 0.05) {
          const shadowDist = Math.abs(segmentPos - custom.shadowPosition);
          const shadowWidth = 0.3;
          if (shadowDist < shadowWidth) {
            const shadowStrength = (1 - shadowDist / shadowWidth) * custom.shadowIntensity;
            segColor = ColorUtils.blend(segColor, COZY_COLORS.shadow, shadowStrength * 0.5);
          }
        }

        const segBrightness = Math.max(0.1, Math.min(1,
          baseBrightness * (0.65 + segAmbient + segTvFlicker)
        ));

        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Party Window - Colorful party lights through window
 */

interface PartyWindowState {
  /** Color rotation phase */
  colorPhase: number;
  /** Beat/pulse phase */
  beatPhase: number;
  /** Flash intensity */
  flashIntensity: number;
  /** Flash cooldown */
  flashCooldown: number;
  /** Per-segment color offsets */
  segmentHues: number[];
}

const PARTY_COLORS = [
  [255, 50, 100] as RGB,   // Pink
  [100, 50, 255] as RGB,   // Purple
  [50, 150, 255] as RGB,   // Blue
  [50, 255, 150] as RGB,   // Cyan/green
  [255, 200, 50] as RGB,   // Yellow
  [255, 100, 50] as RGB,   // Orange
];

export const partyWindow: EffectPreset = {
  id: 'party_window',
  name: 'Party Window',
  description: 'Colorful party lights seen through a window',
  category: 'dynamic',

  defaultOptions: {
    speed: 70,
    brightness: 200,
    intensity: 0.7,
  },

  getInterval(): number {
    return 33; // 30fps
  },

  init(): PartyWindowState {
    return {
      colorPhase: 0,
      beatPhase: 0,
      flashIntensity: 0,
      flashCooldown: 20,
      segmentHues: [],
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as PartyWindowState;
    const speed = options.speed ?? 70;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.7;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 500;

    // Update phases
    custom.colorPhase += rate * 0.8;
    custom.beatPhase += rate * 1.5;

    // Occasional bright flash (like strobe through window, but subdued)
    if (custom.flashCooldown > 0) {
      custom.flashCooldown--;
    } else if (Math.random() < 0.02 * intensity) {
      custom.flashIntensity = 0.5 + Math.random() * 0.3;
      custom.flashCooldown = 15 + Math.random() * 25;
    }
    custom.flashIntensity *= 0.88;

    // Color cycling
    const colorIndex = Math.floor(custom.colorPhase) % PARTY_COLORS.length;
    const nextColorIndex = (colorIndex + 1) % PARTY_COLORS.length;
    const colorBlend = custom.colorPhase % 1;

    const baseColor = ColorUtils.blend(
      PARTY_COLORS[colorIndex],
      PARTY_COLORS[nextColorIndex],
      colorBlend
    );

    // Beat pulse
    const beat = (Math.sin(custom.beatPhase) + 1) / 2;
    const beatPulse = 0.6 + beat * 0.4 * intensity;

    // Flash adds white
    let color = baseColor;
    if (custom.flashIntensity > 0.1) {
      color = ColorUtils.blend(baseColor, [255, 255, 255], custom.flashIntensity * 0.5);
    }

    const brightness = baseBrightness * beatPulse * (1 + custom.flashIntensity * 0.3);
    const rgb = ColorUtils.scale(color, Math.min(1, brightness));

    // For gradient: different colors in different window panes
    if (isGradient && segmentCount > 1) {
      // Initialize segment hues
      if (custom.segmentHues.length !== segmentCount) {
        custom.segmentHues = [];
        for (let i = 0; i < segmentCount; i++) {
          custom.segmentHues.push(Math.random() * PARTY_COLORS.length);
        }
      }

      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        // Each segment has its own color offset
        const segColorPhase = custom.colorPhase + custom.segmentHues[i];
        const segColorIndex = Math.floor(segColorPhase) % PARTY_COLORS.length;
        const segNextIndex = (segColorIndex + 1) % PARTY_COLORS.length;
        const segBlend = segColorPhase % 1;

        let segColor = ColorUtils.blend(
          PARTY_COLORS[segColorIndex],
          PARTY_COLORS[segNextIndex],
          segBlend
        );

        // Per-segment beat offset
        const segBeat = (Math.sin(custom.beatPhase + i * 0.5) + 1) / 2;
        const segPulse = 0.5 + segBeat * 0.5 * intensity;

        // Flash affects all segments
        if (custom.flashIntensity > 0.1) {
          segColor = ColorUtils.blend(segColor, [255, 255, 255], custom.flashIntensity * 0.4);
        }

        const segBrightness = Math.min(1, baseBrightness * segPulse * (1 + custom.flashIntensity * 0.2));
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};

/**
 * Evening Window - Quieter, more subtle version
 */
export const eveningWindow: EffectPreset = {
  id: 'evening_window',
  name: 'Evening Window',
  description: 'Quiet evening lamp light through window',
  category: 'ambient',

  defaultOptions: {
    speed: 20,
    brightness: 150,
    intensity: 0.3,
  },

  getInterval(): number {
    return 50; // 20fps, slower updates
  },

  init(): WindowState {
    return {
      ambientPhase: Math.random() * Math.PI * 2,
      tvPhase: 0,
      shadowIntensity: 0,
      shadowPosition: 0,
      shadowCooldown: 200,
      activityPhase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as WindowState;
    const speed = options.speed ?? 20;
    const baseBrightness = (options.brightness ?? 150) / 254;
    const intensity = options.intensity ?? 0.3;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 1200;

    // Very slow ambient variation
    custom.ambientPhase += rate * 0.2;

    // Rare shadows
    if (custom.shadowCooldown > 0) {
      custom.shadowCooldown--;
    } else if (Math.random() < 0.002 * intensity) {
      custom.shadowIntensity = 0.2 + Math.random() * 0.2;
      custom.shadowPosition = Math.random();
      custom.shadowCooldown = 150 + Math.random() * 200;
    }

    if (custom.shadowIntensity > 0.01) {
      custom.shadowPosition += 0.02;
      custom.shadowIntensity *= 0.96;
    }

    // Gentle warm light
    const ambientWave = Math.sin(custom.ambientPhase) * 0.05;
    let color = COZY_COLORS.warmLight;

    if (ambientWave < 0) {
      color = ColorUtils.blend(color, COZY_COLORS.dimWarm, -ambientWave * 0.3);
    }

    const brightness = baseBrightness * (0.75 + ambientWave) * (1 - custom.shadowIntensity * 0.2);
    const rgb = ColorUtils.scale(color, brightness);

    // Gradient: subtle variation across window
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        const segAmbient = Math.sin(custom.ambientPhase + segmentPos * Math.PI * 0.3) * 0.06;
        let segColor = COZY_COLORS.warmLight;

        if (segAmbient < 0) {
          segColor = ColorUtils.blend(segColor, COZY_COLORS.dimWarm, -segAmbient * 0.4);
        }

        // Shadow
        let shadowEffect = 0;
        if (custom.shadowIntensity > 0.03) {
          const shadowDist = Math.abs(segmentPos - custom.shadowPosition);
          if (shadowDist < 0.35) {
            shadowEffect = (1 - shadowDist / 0.35) * custom.shadowIntensity;
            segColor = ColorUtils.blend(segColor, COZY_COLORS.shadow, shadowEffect * 0.3);
          }
        }

        const segBrightness = baseBrightness * (0.7 + segAmbient) * (1 - shadowEffect * 0.15);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
