/**
 * Effect Presets Index
 *
 * Central export point for all streaming-compatible effect presets.
 * These replace native Hue effects when streaming is active.
 */

// Nature effects
export { candle } from './candle';
export { fire, fireplace } from './fire';
export { aurora } from './aurora';
export { ocean, underwater } from './ocean';
export { lava } from './lava';
export { thunderstorm, rain } from './thunderstorm';
export { forest, meadow } from './forest';
export { starfield, galaxy } from './starfield';

// Urban effects
export { traffic, highway } from './traffic';

// Ambient effects
export { sparkle } from './sparkle';
export { prism, colorloop } from './prism';
export { opal } from './opal';
export { glisten } from './glisten';
export { tvBallast, fluorescent } from './tv-ballast';
export { sparse, scattered } from './sparse';
export { cozyWindow, partyWindow, eveningWindow } from './window';

// Chase effects
export { marquee, marqueeAlternate, theater } from './marquee';
export {
  rainbowChase,
  twoColorChase,
  waveChase,
  bounceChase,
  cometChase,
  pulseChase,
} from './chase';

// Re-export types
export * from '../types';

// Preset registry for lookup by ID
import { EffectPreset } from '../types';
import { candle } from './candle';
import { fire, fireplace } from './fire';
import { aurora } from './aurora';
import { ocean, underwater } from './ocean';
import { lava } from './lava';
import { thunderstorm, rain } from './thunderstorm';
import { forest, meadow } from './forest';
import { starfield, galaxy } from './starfield';
import { traffic, highway } from './traffic';
import { sparkle } from './sparkle';
import { prism, colorloop } from './prism';
import { opal } from './opal';
import { glisten } from './glisten';
import { tvBallast, fluorescent } from './tv-ballast';
import { sparse, scattered } from './sparse';
import { cozyWindow, partyWindow, eveningWindow } from './window';
import { marquee, marqueeAlternate, theater } from './marquee';
import {
  rainbowChase,
  twoColorChase,
  waveChase,
  bounceChase,
  cometChase,
  pulseChase,
} from './chase';

/**
 * All available effect presets indexed by ID
 */
export const effectPresets: Record<string, EffectPreset> = {
  // Nature effects
  candle: candle,
  fire: fire,
  fireplace: fireplace,
  aurora: aurora,
  ocean: ocean,
  underwater: underwater,
  lava: lava,
  thunderstorm: thunderstorm,
  rain: rain,
  forest: forest,
  meadow: meadow,
  starfield: starfield,
  galaxy: galaxy,

  // Urban effects
  traffic: traffic,
  highway: highway,

  // Ambient effects
  sparkle: sparkle,
  prism: prism,
  colorloop: colorloop,
  opal: opal,
  glisten: glisten,
  tv_ballast: tvBallast,
  fluorescent: fluorescent,
  sparse: sparse,
  scattered: scattered,
  cozy_window: cozyWindow,
  party_window: partyWindow,
  evening_window: eveningWindow,

  // Chase effects
  marquee: marquee,
  marquee_alternate: marqueeAlternate,
  theater: theater,
  rainbow_chase: rainbowChase,
  two_color_chase: twoColorChase,
  wave_chase: waveChase,
  wave: waveChase,
  bounce_chase: bounceChase,
  bounce: bounceChase,
  comet_chase: cometChase,
  comet: cometChase,
  pulse: pulseChase,
};

/**
 * Get an effect preset by ID
 */
export function getEffectPreset(id: string): EffectPreset | undefined {
  return effectPresets[id.toLowerCase()];
}

/**
 * Get all available effect IDs
 */
export function getAvailableEffects(): string[] {
  return Object.keys(effectPresets);
}

/**
 * Get effects by category
 */
export function getEffectsByCategory(category: string): EffectPreset[] {
  return Object.values(effectPresets).filter(p => p.category === category);
}

/**
 * Map native Hue effect names to streaming alternatives
 */
export const nativeEffectMap: Record<string, string> = {
  // Direct mappings
  candle: 'candle',
  fire: 'fire',
  fireplace: 'fireplace',
  sparkle: 'sparkle',
  prism: 'prism',
  colorloop: 'colorloop',
  opal: 'opal',
  glisten: 'glisten',
  thunderstorm: 'thunderstorm',
  rain: 'rain',
  forest: 'forest',
  meadow: 'meadow',
  starfield: 'starfield',
  galaxy: 'galaxy',

  tv_ballast: 'tv_ballast',
  fluorescent: 'fluorescent',
  sparse: 'sparse',
  scattered: 'scattered',
  cozy_window: 'cozy_window',
  party_window: 'party_window',
  evening_window: 'evening_window',
  marquee: 'marquee',
  marquee_alternate: 'marquee_alternate',
  theater: 'theater',

  // Hue effect names to streaming equivalents
  sunrise: 'candle', // Warm glow
  sunset: 'fire', // Warm colors
  'night light': 'candle', // Soft warm
  relax: 'glisten', // Gentle
  concentrate: 'pulse', // Rhythmic
  energize: 'sparkle', // Bright flashes
  'movie scene': 'aurora', // Dynamic colors
  'tv time': 'tv_ballast', // TV glow
  gaming: 'rainbow_chase', // Dynamic
  ocean: 'ocean',
  underwater: 'underwater',
  arctic: 'glisten', // Cool shimmer
  storm: 'thunderstorm', // Storm scene
  'night sky': 'starfield', // Stars
  space: 'galaxy', // Cosmic
  nature: 'forest', // Nature scene
  garden: 'meadow', // Outdoor
  party: 'party_window', // Party lights
  'living room': 'cozy_window', // Cozy interior
};

/**
 * Get the streaming-compatible alternative for a native Hue effect
 */
export function getStreamingAlternative(nativeEffect: string): EffectPreset | undefined {
  const mappedId = nativeEffectMap[nativeEffect.toLowerCase()];
  if (mappedId) {
    return effectPresets[mappedId];
  }
  // Try direct lookup
  return effectPresets[nativeEffect.toLowerCase()];
}
