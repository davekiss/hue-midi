import { EventEmitter } from 'events';
import { HueBridgeController } from '../hue/HueBridgeController';

// Effect types that our custom engine handles
export type CustomEffectType =
  | 'strobe'
  | 'police'
  | 'ambulance'
  | 'lightning'
  | 'color_flash'
  | 'breathe_smooth'
  | 'chase'
  | 'desert'      // Warm dusty colors, slow drift like heat shimmer
  | 'tv_flicker'; // Cool TV glow through window/blinds

export interface EffectOptions {
  // Speed as BPM (beats per minute) - how fast the effect cycles
  speed?: number;  // Default: 120 BPM
  // Primary color (XY)
  color1?: { x: number; y: number };
  // Secondary color (XY) - for alternating effects
  color2?: { x: number; y: number };
  // Brightness 0-254
  brightness?: number;
  // For lightning: intensity variance
  intensity?: number;
}

interface RunningEffect {
  lightId: string;
  effectType: CustomEffectType;
  options: EffectOptions;
  intervalId: NodeJS.Timeout;
  state: {
    phase: number;  // Current phase of the effect cycle
    lastUpdate: number;
    isGradient?: boolean;  // Whether this light supports gradients
  };
}

// Predefined colors in XY format
const COLORS = {
  RED: { x: 0.675, y: 0.322 },
  BLUE: { x: 0.168, y: 0.041 },
  WHITE: { x: 0.3127, y: 0.329 },
  YELLOW: { x: 0.4317, y: 0.4996 },
  GREEN: { x: 0.17, y: 0.7 },
  ORANGE: { x: 0.5614, y: 0.4156 },
  PURPLE: { x: 0.25, y: 0.1 },
  // Desert/warm tones
  DUSTY_ORANGE: { x: 0.55, y: 0.40 },
  SAND: { x: 0.44, y: 0.42 },
  SAGE: { x: 0.38, y: 0.48 },
  TERRACOTTA: { x: 0.58, y: 0.35 },
  WARM_WHITE: { x: 0.45, y: 0.41 },
  // TV/cool tones (actual cool blue-white, not purple)
  TV_BLUE: { x: 0.25, y: 0.28 },      // Cool blue-ish white
  TV_WHITE: { x: 0.31, y: 0.33 },     // Neutral white
  COOL_BLUE: { x: 0.22, y: 0.26 },    // Slightly more blue
  TV_DIM: { x: 0.28, y: 0.30 },       // Dimmer scene
};

export class CustomEffectsEngine extends EventEmitter {
  private bridgeController: HueBridgeController;
  private runningEffects: Map<string, RunningEffect> = new Map();

  constructor(bridgeController: HueBridgeController) {
    super();
    this.bridgeController = bridgeController;
  }

  /**
   * Start a custom effect on a light
   */
  async startEffect(
    lightId: string,
    effectType: CustomEffectType,
    options: EffectOptions = {}
  ): Promise<void> {
    // Stop any existing effect on this light
    await this.stopEffect(lightId);

    const speed = options.speed ?? 120; // Default 120 BPM
    const intervalMs = this.bpmToInterval(speed, effectType);

    // Check if this light supports gradients
    let isGradient = false;
    try {
      isGradient = await this.bridgeController.supportsGradient(lightId);
    } catch (e) {
      // Ignore - assume not gradient capable
    }

    console.log(`[CustomEffects] Starting ${effectType} on light ${lightId} at ${speed} BPM (${intervalMs}ms interval), gradient: ${isGradient}`);

    const effect: RunningEffect = {
      lightId,
      effectType,
      options,
      intervalId: null as any,
      state: {
        phase: 0,
        lastUpdate: Date.now(),
        isGradient,
      },
    };

    // Start the effect loop
    effect.intervalId = setInterval(() => {
      this.runEffectCycle(effect).catch((err) => {
        console.error(`[CustomEffects] Error in effect cycle:`, err);
      });
    }, intervalMs);

    this.runningEffects.set(lightId, effect);

    // Run first cycle immediately
    await this.runEffectCycle(effect);

    this.emit('effectStarted', { lightId, effectType });
  }

  /**
   * Stop effect on a specific light
   */
  async stopEffect(lightId: string): Promise<void> {
    const effect = this.runningEffects.get(lightId);
    if (effect) {
      clearInterval(effect.intervalId);
      this.runningEffects.delete(lightId);
      console.log(`[CustomEffects] Stopped effect on light ${lightId}`);
      this.emit('effectStopped', { lightId });

      // Turn light on at normal brightness
      try {
        await this.bridgeController.setLightState(lightId, {
          on: true,
          brightness: 254,
        });
      } catch (err) {
        // Ignore errors when stopping
      }
    }
  }

  /**
   * Stop all running effects
   */
  async stopAllEffects(): Promise<void> {
    const lightIds = Array.from(this.runningEffects.keys());
    for (const lightId of lightIds) {
      await this.stopEffect(lightId);
    }
  }

  /**
   * Stop effects for lights that were using a specific preset
   */
  async stopEffectsForPreset(preset: number): Promise<void> {
    // This would need preset tracking - for now, stop all
    // In the future, we could track which effects were started for which preset
    console.log(`[CustomEffects] Stopping effects for preset ${preset}`);
  }

  /**
   * Check if an effect is running on a light
   */
  isEffectRunning(lightId: string): boolean {
    return this.runningEffects.has(lightId);
  }

  /**
   * Get info about running effect on a light
   */
  getRunningEffect(lightId: string): { effectType: CustomEffectType; options: EffectOptions } | null {
    const effect = this.runningEffects.get(lightId);
    if (effect) {
      return { effectType: effect.effectType, options: effect.options };
    }
    return null;
  }

  /**
   * Convert BPM to interval in milliseconds based on effect type
   */
  private bpmToInterval(bpm: number, effectType: CustomEffectType): number {
    // Base interval from BPM (ms per beat)
    const msPerBeat = 60000 / bpm;

    switch (effectType) {
      case 'strobe':
        // Strobe: each flash is 1/4 beat (on and off = 1/2 beat)
        return msPerBeat / 4;
      case 'police':
      case 'ambulance':
        // Police/ambulance: each color gets 1/2 beat
        return msPerBeat / 2;
      case 'lightning':
        // Lightning: random timing, base interval is 1 beat
        return msPerBeat;
      case 'color_flash':
        // Color flash: each color gets 1 beat
        return msPerBeat;
      case 'breathe_smooth':
        // Breathe: full cycle is 2 beats, update every 50ms for smoothness
        return 50;
      case 'chase':
        // Chase: each step is 1/2 beat
        return msPerBeat / 2;
      case 'desert':
        // Desert: slow, ambient - update every 100ms for smooth transitions
        return 100;
      case 'tv_flicker':
        // TV: irregular flickering - base interval, randomness added in cycle
        return 80;
      default:
        return msPerBeat;
    }
  }

  /**
   * Run one cycle of the effect
   */
  private async runEffectCycle(effect: RunningEffect): Promise<void> {
    const { lightId, effectType, options, state } = effect;

    try {
      switch (effectType) {
        case 'strobe':
          await this.cycleStrobe(lightId, state, options);
          break;
        case 'police':
          await this.cyclePolice(lightId, state, options);
          break;
        case 'ambulance':
          await this.cycleAmbulance(lightId, state, options);
          break;
        case 'lightning':
          await this.cycleLightning(lightId, state, options);
          break;
        case 'color_flash':
          await this.cycleColorFlash(lightId, state, options);
          break;
        case 'breathe_smooth':
          await this.cycleBreathe(lightId, state, options);
          break;
        case 'chase':
          await this.cycleChase(lightId, state, options);
          break;
        case 'desert':
          await this.cycleDesert(lightId, state, options);
          break;
        case 'tv_flicker':
          await this.cycleTvFlicker(lightId, state, options);
          break;
      }

      state.phase++;
      state.lastUpdate = Date.now();
    } catch (err) {
      console.error(`[CustomEffects] Error in ${effectType} cycle:`, err);
    }
  }

  /**
   * Strobe effect - rapid on/off flashing
   */
  private async cycleStrobe(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const isOn = state.phase % 2 === 0;
    const color = options.color1 || COLORS.WHITE;
    const brightness = options.brightness ?? 254;

    if (isOn) {
      await this.bridgeController.setLightColorV2(
        lightId,
        this.xyToHue(color),
        254,
        brightness
      );
    } else {
      await this.bridgeController.setLightState(lightId, {
        on: true,
        brightness: 1, // Minimum brightness instead of off for faster response
      });
    }
  }

  /**
   * Police lights - alternating red and blue
   */
  private async cyclePolice(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const color1 = options.color1 || COLORS.RED;
    const color2 = options.color2 || COLORS.BLUE;
    const brightness = options.brightness ?? 254;

    // Pattern: RED-RED-BLUE-BLUE for authentic police look
    const pattern = state.phase % 4;
    const color = pattern < 2 ? color1 : color2;

    await this.bridgeController.setLightColorV2(
      lightId,
      this.xyToHue(color),
      254,
      brightness
    );
  }

  /**
   * Ambulance lights - alternating red and white
   */
  private async cycleAmbulance(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const color1 = options.color1 || COLORS.RED;
    const color2 = options.color2 || COLORS.WHITE;
    const brightness = options.brightness ?? 254;

    const isFirstColor = state.phase % 2 === 0;
    const color = isFirstColor ? color1 : color2;

    await this.bridgeController.setLightColorV2(
      lightId,
      this.xyToHue(color),
      254,
      brightness
    );
  }

  /**
   * Lightning effect - random bright flashes
   */
  private async cycleLightning(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const intensity = options.intensity ?? 0.7;

    // Random chance of flash (higher intensity = more flashes)
    const flashChance = intensity * 0.4;

    if (Math.random() < flashChance) {
      // Flash! Bright white
      const flashBrightness = 200 + Math.floor(Math.random() * 55);
      await this.bridgeController.setLightColorV2(
        lightId,
        this.xyToHue(COLORS.WHITE),
        254,
        flashBrightness
      );

      // Quick double-flash sometimes
      if (Math.random() < 0.3) {
        await this.delay(50);
        await this.bridgeController.setLightState(lightId, { on: true, brightness: 20 });
        await this.delay(50);
        await this.bridgeController.setLightColorV2(
          lightId,
          this.xyToHue(COLORS.WHITE),
          254,
          flashBrightness
        );
      }
    } else {
      // Dark/dim state between flashes
      const dimLevel = 5 + Math.floor(Math.random() * 15);
      await this.bridgeController.setLightState(lightId, {
        on: true,
        brightness: dimLevel,
      });
    }
  }

  /**
   * Color flash - alternate between two colors
   */
  private async cycleColorFlash(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const color1 = options.color1 || COLORS.RED;
    const color2 = options.color2 || COLORS.BLUE;
    const brightness = options.brightness ?? 254;

    const isFirstColor = state.phase % 2 === 0;
    const color = isFirstColor ? color1 : color2;

    await this.bridgeController.setLightColorV2(
      lightId,
      this.xyToHue(color),
      254,
      brightness
    );
  }

  /**
   * Smooth breathing effect using sine wave
   */
  private async cycleBreathe(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const speed = options.speed ?? 120;
    const maxBrightness = options.brightness ?? 254;
    const minBrightness = 10;
    const color = options.color1;

    // Calculate position in breathing cycle
    // Full cycle takes about 2 seconds at 120 BPM
    const cycleMs = (60000 / speed) * 2;
    const cyclePosition = (state.phase * 50) % cycleMs; // 50ms per update
    const normalizedPosition = cyclePosition / cycleMs;

    // Sine wave for smooth breathing (0 to 1 to 0)
    const sineValue = Math.sin(normalizedPosition * Math.PI * 2);
    const brightness = Math.round(
      minBrightness + ((sineValue + 1) / 2) * (maxBrightness - minBrightness)
    );

    if (color) {
      await this.bridgeController.setLightColorV2(
        lightId,
        this.xyToHue(color),
        254,
        brightness
      );
    } else {
      await this.bridgeController.setLightState(lightId, {
        on: true,
        brightness,
      });
    }
  }

  /**
   * Chase effect - for gradient lights, cycle colors through positions
   * For regular lights, just cycle through colors
   */
  private async cycleChase(
    lightId: string,
    state: { phase: number; isGradient?: boolean },
    options: EffectOptions
  ): Promise<void> {
    const colors = [
      options.color1 || COLORS.RED,
      options.color2 || COLORS.BLUE,
      COLORS.GREEN,
      COLORS.YELLOW,
      COLORS.PURPLE,
    ];
    const brightness = options.brightness ?? 254;

    // For gradient lights: rotate colors along the strip
    if (state.isGradient) {
      const offset = state.phase % colors.length;
      const rotatedColors = [
        ...colors.slice(offset),
        ...colors.slice(0, offset),
      ].slice(0, 5);

      // Use transition for smooth chase movement
      const transitionMs = 200;

      await this.bridgeController.setGradient(
        lightId,
        rotatedColors,
        'interpolated_palette',
        transitionMs
      );
    } else {
      // For non-gradient lights: cycle through colors with transition
      const colorIndex = state.phase % colors.length;
      const color = colors[colorIndex];

      await this.bridgeController.setLightColorXY(
        lightId,
        color,
        brightness,
        100 // Smooth transition between colors
      );
    }
  }

  /**
   * Desert effect - warm dusty colors slowly drifting like heat shimmer
   * Evokes: tumbleweed, desolate sage, waiting for rain
   * For gradient lights: colors slowly chase/rotate along the strip
   * For non-gradient: smooth crossfade between desert colors
   */
  private async cycleDesert(
    lightId: string,
    state: { phase: number; isGradient?: boolean },
    options: EffectOptions
  ): Promise<void> {
    const speed = options.speed ?? 40; // Slow by default
    const baseBrightness = options.brightness ?? 180;

    // Desert color palette
    const desertColors = [
      COLORS.DUSTY_ORANGE,
      COLORS.SAND,
      COLORS.SAGE,
      COLORS.TERRACOTTA,
      COLORS.WARM_WHITE,
    ];

    // For gradient lights: rotate colors along the strip for a chase effect
    if (state.isGradient) {
      // Rotate the palette based on phase
      const offset = state.phase % desertColors.length;
      const rotatedColors = [
        ...desertColors.slice(offset),
        ...desertColors.slice(0, offset),
      ].slice(0, 5); // Gradient supports max 5 points

      // Use a longer transition for smooth movement (half the interval time)
      const transitionMs = 500; // Smooth 500ms transition between states

      await this.bridgeController.setGradient(
        lightId,
        rotatedColors,
        'interpolated_palette',
        transitionMs
      );
    } else {
      // For non-gradient lights: smooth crossfade between colors
      const time = state.phase * 0.1 * (speed / 60);

      // Pick colors based on slow oscillation
      const colorIndex1 = Math.floor((Math.sin(time * 0.3) + 1) * 2.5) % desertColors.length;
      const colorIndex2 = Math.floor((Math.sin(time * 0.3 + 1) + 1) * 2.5) % desertColors.length;

      // Blend between two colors
      const blend = (Math.sin(time * 0.5) + 1) / 2;
      const color1 = desertColors[colorIndex1];
      const color2 = desertColors[colorIndex2];

      const blendedColor = {
        x: color1.x * (1 - blend) + color2.x * blend,
        y: color1.y * (1 - blend) + color2.y * blend,
      };

      // Subtle brightness variation like heat shimmer
      const shimmer = Math.sin(time * 2) * 15;
      const brightness = Math.max(50, Math.min(254, baseBrightness + shimmer));

      // Occasional "tumbleweed" - brief brightness dip
      const tumbleweedChance = Math.sin(time * 0.7);
      const tumbleweedEffect = tumbleweedChance > 0.95 ? -40 : 0;

      // Use smooth transition (80ms matches interval time)
      await this.bridgeController.setLightColorXY(
        lightId,
        blendedColor,
        Math.max(30, brightness + tumbleweedEffect),
        80 // Transition duration matches interval for smooth fading
      );
    }
  }

  /**
   * TV Flicker effect - cool blue/white flickering like TV through window blinds
   * Evokes: watching TV in dark room, light through venetian blinds
   */
  private async cycleTvFlicker(
    lightId: string,
    state: { phase: number },
    options: EffectOptions
  ): Promise<void> {
    const intensity = options.intensity ?? 0.6;
    const baseBrightness = options.brightness ?? 120;

    // Random color selection - mostly cool blue-white tones
    const colorRoll = Math.random();
    let color: { x: number; y: number };
    if (colorRoll < 0.35) {
      color = COLORS.TV_BLUE;       // Cool blue-white (most common)
    } else if (colorRoll < 0.60) {
      color = COLORS.TV_WHITE;      // Neutral white
    } else if (colorRoll < 0.80) {
      color = COLORS.COOL_BLUE;     // Slightly bluer
    } else if (colorRoll < 0.92) {
      color = COLORS.TV_DIM;        // Dim scene
    } else {
      // Occasional warm flash (like a fire/explosion scene on TV)
      color = COLORS.ORANGE;
    }

    // Irregular brightness flickering (like actual TV content changing)
    const flickerBase = Math.random();
    let brightness: number;

    if (flickerBase < 0.1 * intensity) {
      // Dark moment (scene cut or dark scene)
      brightness = 20 + Math.random() * 30;
    } else if (flickerBase < 0.3) {
      // Medium brightness
      brightness = baseBrightness * 0.6 + Math.random() * 40;
    } else if (flickerBase < 0.85) {
      // Normal brightness with variation
      brightness = baseBrightness + (Math.random() - 0.5) * 60;
    } else {
      // Bright flash (action scene, explosion, etc.)
      brightness = baseBrightness * 1.3 + Math.random() * 50;
    }

    // Clamp brightness
    brightness = Math.max(15, Math.min(254, brightness));

    // Simulate "through blinds" effect - occasional dimming like blinds blocking
    if (Math.random() < 0.05) {
      brightness *= 0.3;
    }

    await this.bridgeController.setLightColorV2(
      lightId,
      this.xyToHue(color),
      254,
      Math.round(brightness)
    );
  }

  /**
   * Convert XY color to Hue value (0-65535)
   * This is a simplified conversion
   */
  private xyToHue(xy: { x: number; y: number }): number {
    // Convert XY to RGB first
    const z = 1.0 - xy.x - xy.y;
    const Y = 1.0;
    const X = (Y / xy.y) * xy.x;
    const Z = (Y / xy.y) * z;

    // XYZ to RGB
    let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    // Clamp
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    // RGB to Hue
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (max === min) return 0;

    let hue = 0;
    const d = max - min;

    if (max === r) {
      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      hue = ((b - r) / d + 2) / 6;
    } else {
      hue = ((r - g) / d + 4) / 6;
    }

    return Math.round(hue * 65535);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
