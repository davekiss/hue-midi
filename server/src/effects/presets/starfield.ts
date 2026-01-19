/**
 * Starfield Effect
 *
 * Night sky simulation with:
 * - Dark space background
 * - Twinkling stars of varying brightness
 * - Occasional shooting stars
 * - Subtle cosmic color tints
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface Star {
  brightness: number;  // Current brightness 0-1
  maxBright: number;   // Maximum brightness this star reaches
  phase: number;       // Twinkle phase
  speed: number;       // Twinkle speed
  color: RGB;          // Star color (white, blue-white, or warm)
}

interface StarfieldState {
  /** Per-segment stars for gradient lights */
  stars: Star[];
  /** Shooting star position (-1 = none) */
  shootingStarPos: number;
  /** Shooting star brightness */
  shootingStarBright: number;
  /** Shooting star direction */
  shootingStarDir: number;
  /** Cooldown before next shooting star */
  shootingCooldown: number;
  /** Global twinkle phase for non-gradient mode */
  globalPhase: number;
  /** Global star brightness */
  globalBrightness: number;
}

// Star colors - slight variations from pure white
const STAR_COLORS = {
  white: [255, 255, 255] as RGB,
  blueWhite: [220, 230, 255] as RGB,
  warmWhite: [255, 245, 230] as RGB,
  blue: [180, 200, 255] as RGB,
  yellow: [255, 250, 200] as RGB,
};

// Space background
const SPACE_COLOR: RGB = [5, 5, 15];
const SPACE_TINT: RGB = [10, 8, 20]; // Slight purple tint

function createStar(): Star {
  // Random star type
  const colorRand = Math.random();
  let color: RGB;
  if (colorRand < 0.6) {
    color = STAR_COLORS.white;
  } else if (colorRand < 0.8) {
    color = STAR_COLORS.blueWhite;
  } else if (colorRand < 0.9) {
    color = STAR_COLORS.warmWhite;
  } else {
    color = Math.random() < 0.5 ? STAR_COLORS.blue : STAR_COLORS.yellow;
  }

  return {
    brightness: Math.random() * 0.3,
    maxBright: 0.4 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
    speed: 0.02 + Math.random() * 0.05,
    color,
  };
}

export const starfield: EffectPreset = {
  id: 'starfield',
  name: 'Starfield',
  description: 'Twinkling stars in the night sky',
  category: 'nature',

  defaultOptions: {
    speed: 30,
    brightness: 150,
    intensity: 0.6,
  },

  getInterval(): number {
    return 40; // 25fps
  },

  init(): StarfieldState {
    return {
      stars: [],
      shootingStarPos: -1,
      shootingStarBright: 0,
      shootingStarDir: 1,
      shootingCooldown: 60,
      globalPhase: Math.random() * Math.PI * 2,
      globalBrightness: 0.3,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as StarfieldState;
    const speed = options.speed ?? 30;
    const baseBrightness = (options.brightness ?? 150) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 800;

    // Update global twinkle
    custom.globalPhase += rate * 0.8;
    const twinkle = (Math.sin(custom.globalPhase) + 1) / 2;
    custom.globalBrightness = 0.2 + twinkle * 0.4 * intensity;

    // Handle shooting stars
    if (custom.shootingStarPos >= 0) {
      // Move shooting star
      custom.shootingStarPos += custom.shootingStarDir * 0.12;
      custom.shootingStarBright *= 0.9;

      // Check if off screen or faded
      if (custom.shootingStarPos < -0.2 || custom.shootingStarPos > 1.2 || custom.shootingStarBright < 0.05) {
        custom.shootingStarPos = -1;
        custom.shootingCooldown = 80 + Math.random() * 120;
      }
    } else if (custom.shootingCooldown > 0) {
      custom.shootingCooldown--;
    } else if (Math.random() < 0.01 * intensity) {
      // New shooting star!
      custom.shootingStarDir = Math.random() < 0.5 ? 1 : -1;
      custom.shootingStarPos = custom.shootingStarDir > 0 ? -0.1 : 1.1;
      custom.shootingStarBright = 0.8 + Math.random() * 0.2;
    }

    // Non-gradient mode: single twinkling star effect
    const starColor = ColorUtils.blend(SPACE_COLOR, STAR_COLORS.white, custom.globalBrightness);
    const brightness = baseBrightness * (0.1 + custom.globalBrightness * 0.5);
    const rgb = ColorUtils.scale(starColor, brightness);

    // For gradient lights: multiple independent twinkling stars
    if (isGradient && segmentCount > 1) {
      // Initialize stars if needed
      if (custom.stars.length !== segmentCount) {
        custom.stars = [];
        for (let i = 0; i < segmentCount; i++) {
          custom.stars.push(createStar());
        }
      }

      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);
        const star = custom.stars[i];

        // Update star twinkle
        star.phase += star.speed;
        const starTwinkle = (Math.sin(star.phase) + 1) / 2;
        star.brightness = starTwinkle * star.maxBright * intensity;

        // Random chance to "reset" star (create variety)
        if (Math.random() < 0.001) {
          star.maxBright = 0.4 + Math.random() * 0.6;
          star.speed = 0.02 + Math.random() * 0.05;
        }

        // Start with space background
        let segColor = SPACE_TINT;
        let segBrightness = baseBrightness * 0.08;

        // Add star brightness
        if (star.brightness > 0.1) {
          segColor = ColorUtils.blend(SPACE_TINT, star.color, star.brightness);
          segBrightness = baseBrightness * (0.08 + star.brightness * 0.5);
        }

        // Shooting star effect
        if (custom.shootingStarPos >= 0) {
          const shootDist = Math.abs(segmentPos - custom.shootingStarPos);
          const trailLength = 0.15;

          if (shootDist < 0.05) {
            // Head of shooting star
            const headBright = custom.shootingStarBright * (1 - shootDist / 0.05);
            segColor = ColorUtils.blend(segColor, STAR_COLORS.white, headBright * 0.9);
            segBrightness = Math.min(1, segBrightness + headBright * 0.7);
          } else {
            // Check if in trail
            const behindDist = (segmentPos - custom.shootingStarPos) * -custom.shootingStarDir;
            if (behindDist > 0 && behindDist < trailLength) {
              const trailBright = custom.shootingStarBright * (1 - behindDist / trailLength) * 0.6;
              // Trail fades to warm color
              const trailColor = ColorUtils.blend(STAR_COLORS.white, STAR_COLORS.warmWhite, behindDist / trailLength);
              segColor = ColorUtils.blend(segColor, trailColor, trailBright);
              segBrightness = Math.min(1, segBrightness + trailBright * 0.4);
            }
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
 * Galaxy Effect - More colorful space variant
 */
export const galaxy: EffectPreset = {
  id: 'galaxy',
  name: 'Galaxy',
  description: 'Colorful cosmic nebula with stars',
  category: 'nature',

  defaultOptions: {
    speed: 20,
    brightness: 160,
    intensity: 0.5,
  },

  getInterval(): number {
    return 40;
  },

  init(): StarfieldState {
    return {
      stars: [],
      shootingStarPos: -1,
      shootingStarBright: 0,
      shootingStarDir: 1,
      shootingCooldown: 100,
      globalPhase: Math.random() * Math.PI * 2,
      globalBrightness: 0.3,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as StarfieldState;
    const speed = options.speed ?? 20;
    const baseBrightness = (options.brightness ?? 160) / 254;
    const intensity = options.intensity ?? 0.5;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    const rate = speed / 1000;

    // Update phase for color shifting
    custom.globalPhase += rate * 0.5;

    // Nebula colors
    const nebulaPurple: RGB = [60, 20, 80];
    const nebulaBlue: RGB = [20, 40, 100];
    const nebulaPink: RGB = [100, 30, 70];
    const nebulaOrange: RGB = [80, 40, 20];

    // Shift between nebula colors
    const colorPhase = (Math.sin(custom.globalPhase) + 1) / 2;
    const colorPhase2 = (Math.sin(custom.globalPhase * 0.7) + 1) / 2;

    let nebulaColor = ColorUtils.blend(nebulaPurple, nebulaBlue, colorPhase * 0.6);
    nebulaColor = ColorUtils.blend(nebulaColor, nebulaPink, colorPhase2 * 0.3);

    // Star twinkle overlay
    const twinkle = (Math.sin(custom.globalPhase * 3) + 1) / 2;
    const starOverlay = twinkle * 0.25 * intensity;

    const color = ColorUtils.blend(nebulaColor, STAR_COLORS.white, starOverlay);
    const brightness = baseBrightness * (0.3 + colorPhase * 0.2);
    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: nebula bands with twinkling stars
    if (isGradient && segmentCount > 1) {
      // Initialize stars if needed
      if (custom.stars.length !== segmentCount) {
        custom.stars = [];
        for (let i = 0; i < segmentCount; i++) {
          custom.stars.push(createStar());
        }
      }

      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);
        const star = custom.stars[i];

        // Update star
        star.phase += star.speed;
        const starTwinkle = (Math.sin(star.phase) + 1) / 2;
        star.brightness = starTwinkle * star.maxBright * intensity * 0.7;

        // Nebula color varies by position
        const segColorPhase = (Math.sin(custom.globalPhase + segmentPos * Math.PI * 2) + 1) / 2;
        const segColorPhase2 = (Math.sin(custom.globalPhase * 0.7 + segmentPos * Math.PI * 1.5) + 1) / 2;

        let segNebula = ColorUtils.blend(nebulaPurple, nebulaBlue, segColorPhase * 0.7);

        // Add pink/orange accents based on position
        if (segColorPhase2 > 0.5) {
          const accentColor = segmentPos < 0.5 ? nebulaPink : nebulaOrange;
          segNebula = ColorUtils.blend(segNebula, accentColor, (segColorPhase2 - 0.5) * 0.5);
        }

        // Add star twinkle
        let segColor = segNebula;
        if (star.brightness > 0.15) {
          segColor = ColorUtils.blend(segNebula, star.color, star.brightness * 0.8);
        }

        const segBrightness = baseBrightness * (0.25 + segColorPhase * 0.2 + star.brightness * 0.3);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
