---
name: preset-design
description: Design Hue light effect presets for the hue-midi streaming engine. Use when creating new effects, modifying existing presets, or implementing gradient-aware light animations. Covers EffectPreset interface, ColorUtils, Palettes, and Hue Entertainment safety guidelines.
---

# Hue Effect Preset Design

Create streaming-compatible light effects at 50Hz via Hue Entertainment API.

## Quick Start

```typescript
import { EffectPreset, EffectState, EffectOptions, EffectOutput, RGB, ColorUtils } from '../types';

interface MyEffectState {
  phase: number;
}

export const myEffect: EffectPreset = {
  id: 'my_effect',
  name: 'My Effect',
  description: 'What the effect looks like',
  category: 'nature', // 'ambient' | 'dynamic' | 'nature' | 'chase' | 'alert'

  defaultOptions: {
    speed: 50,
    brightness: 254,
    intensity: 0.5,
  },

  getInterval(): number {
    return 33; // ~30fps, adjust 20-50ms
  },

  init(): MyEffectState {
    return { phase: 0 };
  },

  cycle(state: EffectState, options: EffectOptions): EffectOutput {
    const custom = state.custom as MyEffectState;
    const brightness = (options.brightness ?? 254) / 254;

    // Update state
    custom.phase += 0.1;

    // Calculate color
    const rgb: RGB = [255, 128, 0];

    return { rgb: ColorUtils.scale(rgb, brightness) };
  },
};
```

## Gradient Support (Multi-Segment Lights)

Always check `isGradient` and `segmentCount` to support gradient light strips:

```typescript
cycle(state: EffectState, options: EffectOptions): EffectOutput {
  const segmentCount = options.segmentCount ?? 1;
  const isGradient = options.isGradient ?? false;

  const rgb = calculateColor();

  if (isGradient && segmentCount > 1) {
    const gradient: RGB[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const segmentPos = i / (segmentCount - 1); // 0-1 position along strip
      gradient.push(calculateSegmentColor(segmentPos));
    }
    return { rgb, gradient };
  }

  return { rgb };
}
```

## Key Patterns

**Oscillators** - Combine sine waves at different frequencies for organic motion:
```typescript
const flicker = Math.sin(phase * 1.0) * 0.4 +
                Math.sin(phase * 2.3) * 0.35 +
                Math.sin(phase * 0.7) * 0.25;
```

**Smooth transitions** - Use smoothstep for natural easing:
```typescript
const t = progress * progress * (3 - 2 * progress);
const color = ColorUtils.blend(color1, color2, t);
```

**Random events** - Trigger occasional bursts/effects:
```typescript
if (Math.random() < 0.03 * intensity) {
  custom.burst = 1.0;
}
custom.burst *= 0.9; // Decay
```

**Traveling effects** - Create motion across gradient segments:
```typescript
custom.position = (custom.position + speed / 500) % segmentCount;
const distFromHead = custom.position - segmentIndex;
```

## Safety Guidelines

**CRITICAL**: Never cause epileptic symptoms.

- Keep brightness changes **below 5Hz**
- Avoid sudden full brightness changes in peripheral vision
- Use smooth transitions (>100ms) for large brightness swings
- Reserve strobe-like effects for special moments, keep very short

See [GUIDELINES.md](GUIDELINES.md) for full Hue Entertainment design recommendations.

## References

- **Types & API**: [TYPES.md](TYPES.md) - Full interface definitions and ColorUtils
- **Examples**: [EXAMPLES.md](EXAMPLES.md) - Patterns from fire, aurora, traffic presets
- **Design Guidelines**: [GUIDELINES.md](GUIDELINES.md) - Hue Entertainment best practices

## Registration

After creating a preset, add to `server/src/effects/presets/index.ts`:

```typescript
export { myEffect } from './myEffect';

// In effectPresets:
myEffect: myEffect,
```

And add to `streamingPresets` array in `server/src/server/ApiServer.ts`.
