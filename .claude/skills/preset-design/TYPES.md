# Effect System Types

## Core Types

```typescript
/** RGB color tuple [r, g, b] with values 0-255 */
type RGB = [number, number, number];

/** XY color coordinates used by Hue API */
interface XYColor {
  x: number;
  y: number;
}

/** Effect state passed to each cycle */
interface EffectState {
  /** Time elapsed since effect started (ms) */
  elapsed: number;
  /** Custom state storage for the effect (set by init()) */
  custom: any;
}

/** Options passed when starting an effect */
interface EffectOptions {
  speed?: number;           // Speed in BPM (beats per minute)
  color1?: XYColor;         // Primary color
  color2?: XYColor;         // Secondary color
  brightness?: number;      // Brightness 0-254
  intensity?: number;       // Effect intensity 0-1
  segmentCount?: number;    // Number of segments (set by engine)
  isGradient?: boolean;     // Whether light supports gradients (set by engine)
}

/** Output from an effect cycle */
interface EffectOutput {
  rgb: RGB;         // RGB color (single-color or fallback)
  gradient?: RGB[]; // Gradient colors for multi-segment lights
}

/** Effect preset definition */
interface EffectPreset {
  id: string;                              // Unique identifier
  name: string;                            // Human-readable name
  description: string;                     // What the effect looks like
  category: 'ambient' | 'dynamic' | 'nature' | 'chase' | 'alert';
  defaultOptions: Partial<EffectOptions>;  // Default options
  getInterval(options: EffectOptions): number;  // Ms between cycles
  init(): any;                             // Initialize custom state
  cycle(state: EffectState, options: EffectOptions): EffectOutput;
}
```

## ColorUtils

```typescript
ColorUtils.xyToRgb(xy: XYColor, brightness?: number): RGB
// Convert Hue XY color to RGB

ColorUtils.hsvToRgb(h: number, s: number, v: number): RGB
// Convert HSV to RGB. h: 0-360, s: 0-1, v: 0-1

ColorUtils.blend(color1: RGB, color2: RGB, t: number): RGB
// Blend two colors. t: 0-1 (0=color1, 1=color2)

ColorUtils.scale(color: RGB, factor: number): RGB
// Scale RGB brightness. factor: 0-1

ColorUtils.noise(value: number, amount: number): number
// Add random noise to a value
```

## Palettes

```typescript
Palettes.flame   // ember, orange, yellow, white
Palettes.candle  // dim, warm, bright, flicker
Palettes.ocean   // deep, mid, surface, foam
Palettes.aurora  // green, teal, purple, pink
Palettes.sunset  // red, orange, pink, purple
Palettes.rainbow // Array of 7 RGB colors
Palettes.police  // red, blue, white
Palettes.lava    // black, darkRed, red, orange, yellow
```

## Category Guidelines

- **ambient**: Subtle background effects (candle, sparkle)
- **dynamic**: Active, attention-grabbing (prism, colorloop)
- **nature**: Natural phenomena (fire, aurora, ocean, lava)
- **chase**: Moving/cycling patterns (rainbow chase, comet)
- **alert**: Notifications, alerts (police, strobe)

## Frame Rate Guidelines

```typescript
getInterval(): number {
  return 25;  // 40fps - intense flickering (fire)
  return 33;  // 30fps - smooth motion (prism, aurora)
  return 40;  // 25fps - flowing effects
  return 50;  // 20fps - slow, thick movement (lava)
}
```
