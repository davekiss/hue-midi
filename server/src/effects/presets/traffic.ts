/**
 * Traffic Effect
 *
 * Simulates car traffic at night:
 * - Red tail lights moving one direction
 * - White/yellow headlights moving the other direction
 * - Occasional brake flashes and turn signals
 * - Variable speeds for depth illusion
 */

import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

/** A single "car" in the traffic simulation */
interface Car {
  position: number;      // 0-1 position along the strip
  speed: number;         // Movement speed
  direction: 1 | -1;     // 1 = headlights (toward), -1 = tail lights (away)
  brightness: number;    // Base brightness
  isBraking: boolean;    // Currently braking (brighter red)
  blinkState: number;    // For turn signal effect
}

interface TrafficState {
  cars: Car[];
  lastSpawn: number;
  phase: number;
}

// Traffic color palette
const COLORS = {
  tailLight: [255, 20, 10] as RGB,       // Red tail lights
  brakeLight: [255, 0, 0] as RGB,        // Bright brake lights
  headlight: [255, 250, 245] as RGB,     // Slightly warm white headlights
  headlightBright: [255, 255, 255] as RGB,
  turnSignal: [255, 160, 0] as RGB,      // Amber turn signal
  ambient: [15, 5, 20] as RGB,           // Dark purple-ish night sky ambient
};

export const traffic: EffectPreset = {
  id: 'traffic',
  name: 'Traffic',
  description: 'Night traffic with headlights and tail lights',
  category: 'ambient',

  defaultOptions: {
    speed: 50,
    brightness: 220,
    intensity: 0.7,
  },

  getInterval(): number {
    return 33; // ~30fps for smooth movement
  },

  init(): TrafficState {
    // Start with a few cars
    const cars: Car[] = [];
    for (let i = 0; i < 4; i++) {
      cars.push(createCar(Math.random()));
    }
    return {
      cars,
      lastSpawn: 0,
      phase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as TrafficState;
    const speed = options.speed ?? 50;
    const baseBrightness = (options.brightness ?? 220) / 254;
    const intensity = options.intensity ?? 0.7;
    const segmentCount = options.segmentCount ?? 1;
    const isGradient = options.isGradient ?? false;

    custom.phase += 1;

    // Update car positions
    const speedFactor = speed / 1000;
    for (const car of custom.cars) {
      car.position += car.speed * speedFactor * car.direction;

      // Random braking
      if (Math.random() < 0.01) {
        car.isBraking = !car.isBraking;
      }

      // Update turn signal blink
      car.blinkState = (car.blinkState + 0.15) % (Math.PI * 2);
    }

    // Remove cars that have left the strip
    custom.cars = custom.cars.filter(car => car.position >= -0.2 && car.position <= 1.2);

    // Spawn new cars
    const spawnChance = 0.02 * intensity;
    if (Math.random() < spawnChance && custom.cars.length < 8) {
      // Spawn from either end
      const fromStart = Math.random() < 0.5;
      const car = createCar(fromStart ? -0.1 : 1.1);
      car.direction = fromStart ? 1 : -1;
      custom.cars.push(car);
    }

    // Calculate the main color (blend of nearby cars)
    const mainColor = calculateTrafficColor(custom.cars, 0.5, baseBrightness);

    // For gradient lights: render each segment based on car positions
    if (isGradient && segmentCount > 1) {
      const gradient: RGB[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPos = i / (segmentCount - 1);
        const segmentColor = calculateTrafficColor(custom.cars, segmentPos, baseBrightness);
        gradient.push(segmentColor);
      }

      return { rgb: mainColor, gradient };
    }

    return { rgb: mainColor };
  },
};

/**
 * Create a new car with random properties
 */
function createCar(position: number): Car {
  const isHeadlight = Math.random() < 0.5;
  return {
    position,
    speed: 0.3 + Math.random() * 0.7, // Variable speeds
    direction: isHeadlight ? 1 : -1,
    brightness: 0.6 + Math.random() * 0.4,
    isBraking: false,
    blinkState: Math.random() * Math.PI * 2,
  };
}

/**
 * Calculate the color at a position based on nearby cars
 */
function calculateTrafficColor(cars: Car[], position: number, baseBrightness: number): RGB {
  let r = COLORS.ambient[0];
  let g = COLORS.ambient[1];
  let b = COLORS.ambient[2];

  for (const car of cars) {
    // Distance from car to this position
    const distance = Math.abs(car.position - position);

    // Car light falloff (closer = brighter influence)
    const falloff = Math.max(0, 1 - distance * 4); // Light radius ~0.25 of strip

    if (falloff > 0) {
      const influence = falloff * falloff * car.brightness * baseBrightness;

      // Determine car color
      let carColor: RGB;
      if (car.direction === -1) {
        // Tail lights (going away)
        carColor = car.isBraking ? COLORS.brakeLight : COLORS.tailLight;
      } else {
        // Headlights (coming toward)
        carColor = car.brightness > 0.8 ? COLORS.headlightBright : COLORS.headlight;
      }

      // Occasional turn signal flash
      if (Math.sin(car.blinkState) > 0.8 && Math.random() < 0.3) {
        carColor = COLORS.turnSignal;
      }

      // Add this car's contribution
      r = Math.min(255, r + carColor[0] * influence);
      g = Math.min(255, g + carColor[1] * influence);
      b = Math.min(255, b + carColor[2] * influence);
    }
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}

/**
 * Highway variant - faster, more uniform flow
 */
export const highway: EffectPreset = {
  id: 'highway',
  name: 'Highway',
  description: 'Fast highway traffic streaks',
  category: 'ambient',

  defaultOptions: {
    speed: 80,
    brightness: 240,
    intensity: 0.8,
  },

  getInterval(): number {
    return 25; // 40fps for fast streaks
  },

  init(): TrafficState {
    const cars: Car[] = [];
    // More cars, more uniform distribution
    for (let i = 0; i < 6; i++) {
      const car = createCar(Math.random());
      car.speed = 0.8 + Math.random() * 0.4; // Faster, more uniform
      cars.push(car);
    }
    return {
      cars,
      lastSpawn: 0,
      phase: 0,
    };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    // Use same logic as traffic but with highway defaults
    return traffic.cycle(state, {
      ...options,
      speed: options.speed ?? 80,
      intensity: options.intensity ?? 0.8,
    });
  },
};
