/**
 * Lava Effect
 *
 * Molten lava simulation with:
 * - Slow, thick movement
 * - Black/red/orange/yellow palette
 * - Occasional bright hotspots
 * - Cooling and heating cycles
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, Palettes, ColorUtils } from '../types';

interface LavaState {
  /** Heat level 0-1 */
  heat: number;
  /** Target heat (for smooth transitions) */
  targetHeat: number;
  /** Bubble progress */
  bubble: number;
  /** Time until next bubble */
  bubbleTimer: number;
  /** Slow movement phase */
  flowPhase: number;
}

export const lava: EffectPreset = {
  id: 'lava',
  name: 'Lava',
  description: 'Slow molten lava with bubbling hotspots',
  category: 'nature',

  defaultOptions: {
    speed: 20,
    brightness: 200,
    intensity: 0.6,
  },

  getInterval(): number {
    return 50; // 20fps for slow, thick movement
  },

  init(): LavaState {
    return {
      heat: 0.4,
      targetHeat: 0.4,
      bubble: 0,
      bubbleTimer: 0,
      flowPhase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as LavaState;
    const speed = options.speed ?? 20;
    const baseBrightness = (options.brightness ?? 200) / 254;
    const intensity = options.intensity ?? 0.6;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    // Slow flow phase
    custom.flowPhase += speed / 2000;

    // Randomly shift target heat
    if (Math.random() < 0.02) {
      custom.targetHeat = 0.2 + Math.random() * 0.6;
    }

    // Slowly approach target heat
    custom.heat += (custom.targetHeat - custom.heat) * 0.02;

    // Handle bubbles (bright hotspot bursts)
    if (custom.bubbleTimer > 0) {
      custom.bubbleTimer--;
    } else if (Math.random() < 0.015 * intensity) {
      custom.bubble = 1;
      custom.bubbleTimer = 30 + Math.random() * 50;
    }
    custom.bubble *= 0.93; // Slow bubble decay

    // Helper to get lava color based on heat level
    const getLavaColor = (heat: number): RGB => {
      if (heat < 0.2) {
        return Palettes.lava.black;
      } else if (heat < 0.4) {
        const t = (heat - 0.2) / 0.2;
        return ColorUtils.blend(Palettes.lava.black, Palettes.lava.darkRed, t);
      } else if (heat < 0.6) {
        const t = (heat - 0.4) / 0.2;
        return ColorUtils.blend(Palettes.lava.darkRed, Palettes.lava.red, t);
      } else if (heat < 0.8) {
        const t = (heat - 0.6) / 0.2;
        return ColorUtils.blend(Palettes.lava.red, Palettes.lava.orange, t);
      } else {
        const t = (heat - 0.8) / 0.2;
        return ColorUtils.blend(Palettes.lava.orange, Palettes.lava.yellow, t);
      }
    };

    // Add flowing variation
    const flow = Math.sin(custom.flowPhase) * 0.15;

    // Calculate effective heat
    const effectiveHeat = Math.min(1, custom.heat + flow + custom.bubble * 0.4);

    const color = getLavaColor(effectiveHeat);
    const brightness = baseBrightness * (0.3 + effectiveHeat * 0.7);
    const rgb = ColorUtils.scale(color, brightness);

    // For gradient lights: show flowing lava with hot/cool zones
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);

        // Each segment has offset flow phase for traveling heat waves
        const segFlow = Math.sin(custom.flowPhase + segmentPos * Math.PI * 2) * 0.2;

        // Heat varies along strip with slow waves
        const heatWave = Math.sin(custom.flowPhase * 0.5 + segmentPos * Math.PI * 3) * 0.25;

        // Bubble affects nearby segments (creates traveling hotspot)
        const bubbleCenter = (Math.sin(custom.flowPhase * 0.3) + 1) / 2; // 0-1 position
        const bubbleDistance = Math.abs(segmentPos - bubbleCenter);
        const bubbleEffect = custom.bubble * Math.max(0, 1 - bubbleDistance * 3);

        const segHeat = Math.max(0.05, Math.min(1,
          custom.heat + segFlow + heatWave + bubbleEffect * 0.5
        ));

        const segColor = getLavaColor(segHeat);
        const segBrightness = baseBrightness * (0.2 + segHeat * 0.8);
        gradient.push(ColorUtils.scale(segColor, segBrightness));
      }

      return { rgb, gradient };
    }

    return { rgb };
  },
};
