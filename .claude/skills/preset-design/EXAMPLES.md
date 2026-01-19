# Effect Preset Examples

## Fire (Nature, Intense Flickering)

Multiple oscillators create organic flame movement:

```typescript
interface FireState {
  flicker1: number;
  flicker2: number;
  flicker3: number;
  crackle: number;
  crackleTimer: number;
  emberGlow: number;
}

// Multiple frequencies for organic motion
custom.flicker1 += 0.15 + Math.random() * 0.1;
custom.flicker2 += 0.08 + Math.random() * 0.05;
custom.flicker3 += 0.03 + Math.random() * 0.02;

const flicker = (
  Math.sin(custom.flicker1) * 0.4 +
  Math.sin(custom.flicker2) * 0.35 +
  Math.sin(custom.flicker3) * 0.25
);

// Random crackle bursts
if (custom.crackleTimer <= 0 && Math.random() < 0.03 * intensity) {
  custom.crackle = 0.8 + Math.random() * 0.2;
  custom.crackleTimer = 3 + Math.random() * 5;
}
custom.crackle *= 0.7; // Decay

// Gradient: embers at base, flames at tip
for (let i = 0; i < segmentCount; i++) {
  const segmentPos = i / (segmentCount - 1);
  const segFlicker = Math.sin(custom.flicker1 + i * 0.7) * 0.3;
  const segHeat = custom.emberGlow * (1 - segmentPos * 0.5) + segmentPos * 0.3;
  gradient.push(getFireColor(segHeat));
}
```

## Aurora (Nature, Flowing Colors)

Smooth color transitions with intensity surges:

```typescript
interface AuroraState {
  colorPhase: number;
  intensityPhase: number;
  colorIndex: number;
  nextColorIndex: number;
  transition: number;
}

// Update phases at different rates
custom.colorPhase += rate * 0.5;
custom.intensityPhase += rate * 0.7;
custom.transition += rate * 0.15;

// Smooth color transition (smoothstep)
const easeT = custom.transition * custom.transition * (3 - 2 * custom.transition);
const blendedColor = ColorUtils.blend(colors[colorIndex], colors[nextIndex], easeT);

// Intensity surges
const surge = Math.sin(custom.intensityPhase) * 0.3 + 0.7;

// Gradient: flowing bands across segments
for (let i = 0; i < segmentCount; i++) {
  const segmentPhase = custom.colorPhase + (i / segmentCount) * Math.PI * 2;
  const segWave = Math.sin(custom.intensityPhase + (i / segmentCount) * Math.PI);
  gradient.push(ColorUtils.scale(segColor, baseBrightness * segWave));
}
```

## Traffic (Ambient, Traveling Objects)

Cars as discrete moving objects with trails:

```typescript
interface TrafficState {
  cars: Array<{
    position: number;  // 0-1 along strip
    speed: number;
    direction: 1 | -1;
    isBraking: boolean;
    brightness: number;
  }>;
  spawnTimer: number;
}

// Move cars
for (const car of custom.cars) {
  car.position += car.speed * car.direction * (speed / 1000);
  // Random braking
  if (Math.random() < 0.02) car.isBraking = !car.isBraking;
}

// Spawn new cars
if (custom.spawnTimer <= 0 && Math.random() < 0.1) {
  custom.cars.push({
    position: Math.random() < 0.5 ? 0 : 1,
    speed: 0.02 + Math.random() * 0.03,
    direction: Math.random() < 0.5 ? 1 : -1,
    isBraking: false,
    brightness: 0.6 + Math.random() * 0.4,
  });
  custom.spawnTimer = 10 + Math.random() * 20;
}

// Gradient: cars as pools of light
for (let i = 0; i < segmentCount; i++) {
  const segmentPos = i / (segmentCount - 1);
  let segColor: RGB = [0, 0, 0]; // Default dark

  for (const car of custom.cars) {
    const dist = Math.abs(segmentPos - car.position);
    if (dist < 0.15) {
      const falloff = 1 - (dist / 0.15);
      const color = car.direction > 0
        ? [255, 50, 30] as RGB   // Taillights (red)
        : [255, 255, 240] as RGB; // Headlights (white)
      segColor = ColorUtils.blend(segColor, color, falloff * car.brightness);
    }
  }
  gradient.push(segColor);
}
```

## Comet (Chase, Traveling with Trail)

Bright head with fading warm trail:

```typescript
interface CometState {
  position: number;
}

// Move comet
custom.position = (custom.position + speed / 500) % (segmentCount + 4);

for (let i = 0; i < segmentCount; i++) {
  const distFromHead = custom.position - i;
  const tailLength = 4;

  if (distFromHead >= 0 && distFromHead < 1) {
    // Head - brightest
    segBrightness = maxBrightness;
  } else if (distFromHead >= 1 && distFromHead < tailLength + 1) {
    // Trail - fading exponentially
    const trailPos = (distFromHead - 1) / tailLength;
    segBrightness = maxBrightness * Math.pow(1 - trailPos, 2);
    // Shift tail color warmer
    segColor = ColorUtils.blend(baseColor, [255, 120, 30], trailPos * 0.4);
  } else {
    segBrightness = 0; // Not part of comet
  }
  gradient.push(ColorUtils.scale(segColor, segBrightness));
}
```

## Prism (Dynamic, Smooth Color Cycling)

Rainbow rotation - NO random noise for smooth cycling:

```typescript
interface PrismState {
  hue: number;
}

// Smooth hue rotation
custom.hue = (custom.hue + (speed / 30) * 0.5) % 360;
const color = ColorUtils.hsvToRgb(custom.hue, 1, brightness);

// Gradient: spread full rainbow across segments
for (let i = 0; i < segmentCount; i++) {
  const segmentPos = i / (segmentCount - 1);
  const segHue = (custom.hue + segmentPos * 360) % 360;
  gradient.push(ColorUtils.hsvToRgb(segHue, 1, brightness));
}
```

## Wave (Chase, Brightness Patterns)

Multiple sine waves for complex brightness patterns:

```typescript
custom.position += speed / 500;

const wave = (
  Math.sin(custom.position) * 0.5 +
  Math.sin(custom.position * 2.3) * 0.3 +
  Math.sin(custom.position * 0.7) * 0.2
);

const brightness = maxBrightness * (0.3 + (wave + 1) / 2 * 0.7 * intensity);
```
