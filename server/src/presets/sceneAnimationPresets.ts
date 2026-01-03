import type {
  GradientMode,
  LightAnimation,
  LightAnimationStep,
  LightState,
  SceneAnimationPreset,
  ChaseAnimationPresetParams,
  GradientCrossfadePresetParams,
  LightningAnimationPresetParams,
} from '../types';

const MIN_GRADIENT_STOPS = 2;
const MAX_GRADIENT_STOPS = 5;
const MAX_PRESET_STEPS = 32;

const DEFAULT_CHASE_PALETTE: Array<{ x: number; y: number }> = [
  { x: 0.6915, y: 0.3083 },
  { x: 0.17, y: 0.7 },
  { x: 0.1532, y: 0.0475 },
];

const DEFAULT_WHITE_POINT: { x: number; y: number } = { x: 0.3227, y: 0.329 };

export interface PresetBuildContext {
  baseState: LightState;
}

export function buildAnimationFromPreset(
  preset: SceneAnimationPreset,
  context: PresetBuildContext
): LightAnimation {
  return {
    mode: 'loop',
    preset,
    steps: generatePresetSteps(preset, context),
  };
}

export function generatePresetSteps(
  preset: SceneAnimationPreset,
  context: PresetBuildContext
): LightAnimationStep[] {
  switch (preset.id) {
    case 'chase':
      return buildChaseSteps(preset.params, context, preset.version);
    case 'gradientCrossfade':
      return buildGradientCrossfadeSteps(preset.params, context, preset.version);
    case 'lightning':
      return buildLightningSteps(preset.params, context, preset.version);
    default:
      return [];
  }
}

function buildChaseSteps(
  params: ChaseAnimationPresetParams,
  context: PresetBuildContext,
  version: number | undefined
): LightAnimationStep[] {
  const palette = ensurePalette(params.palette, context, 2);
  const beatsPerStep = clamp(params.beatsPerStep ?? 0.5, 0.0625, 16);
  const stopCount = clampInteger(
    params.stopCount ?? Math.min(MAX_GRADIENT_STOPS, Math.max(palette.length + 1, MIN_GRADIENT_STOPS)),
    MIN_GRADIENT_STOPS,
    MAX_GRADIENT_STOPS
  );
  const stepCount = clampInteger(
    params.stepCount ?? Math.max(stopCount, 3),
    2,
    MAX_PRESET_STEPS
  );
  const gradientMode: GradientMode =
    params.gradientMode ?? context.baseState.gradientMode ?? 'segmented_palette';

  const steps: LightAnimationStep[] = [];

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const gradient = Array.from({ length: stopCount }, (_, stopIndex) => {
      const paletteIndex = (stopIndex + stepIndex) % palette.length;
      return clonePoint(palette[paletteIndex]);
    });

    steps.push({
      id: `preset-chase-${version ?? 1}-${stepIndex}`,
      label: `Chase ${stepIndex + 1}`,
      durationBeats: beatsPerStep,
      state: {
        on: true,
        gradient,
        gradientMode,
      },
    });
  }

  return steps;
}

function buildGradientCrossfadeSteps(
  params: GradientCrossfadePresetParams,
  context: PresetBuildContext,
  version: number | undefined
): LightAnimationStep[] {
  const totalBeats = clamp(params.totalBeats ?? 8, 0.5, 128);
  const subdivision = clamp(params.stepSubdivision ?? 0.5, 0.0625, totalBeats);
  const gradientMode: GradientMode =
    params.gradientMode ?? context.baseState.gradientMode ?? 'interpolated_palette';

  const applyEasing = easingResolver(params.easing ?? 'linear');

  const fallbackFrom = context.baseState.gradient ?? paletteToGradient(ensurePalette(undefined, context, 2), 2);
  const fromGradient = normalizeGradient(params.fromGradient ?? fallbackFrom);
  const toGradient = normalizeGradient(params.toGradient);

  const stopCount = Math.max(fromGradient.length, toGradient.length, MIN_GRADIENT_STOPS);
  const paddedFrom = padGradient(fromGradient, stopCount);
  const paddedTo = padGradient(toGradient, stopCount);

  const stepCount = clampInteger(
    Math.round(totalBeats / subdivision),
    2,
    MAX_PRESET_STEPS
  );
  const durationPerStep = totalBeats / stepCount;

  const steps: LightAnimationStep[] = [];

  for (let index = 0; index < stepCount; index += 1) {
    const t = stepCount === 1 ? 1 : index / (stepCount - 1);
    const eased = applyEasing(t);

    const gradient = paddedFrom.map((start, stopIndex) => ({
      x: lerp(start.x, paddedTo[stopIndex].x, eased),
      y: lerp(start.y, paddedTo[stopIndex].y, eased),
    }));

    steps.push({
      id: `preset-crossfade-${version ?? 1}-${index}`,
      label: index === 0 ? 'Start' : index === stepCount - 1 ? 'End' : `Blend ${index + 1}`,
      durationBeats: durationPerStep,
      state: {
        on: true,
        gradient,
        gradientMode,
      },
    });
  }

  return steps;
}

function buildLightningSteps(
  params: LightningAnimationPresetParams,
  context: PresetBuildContext,
  version: number | undefined
): LightAnimationStep[] {
  const palette = ensurePalette(params.palette, context, 1);
  const flashCount = clampInteger(params.flashCount ?? 4, 1, MAX_PRESET_STEPS / 2);
  const flashBeats = clamp(params.flashBeats ?? 0.125, 0.03125, 2);
  const calmBeats = clamp(params.calmBeats ?? 0.25, 0.03125, 8);
  const randomness = clamp(params.randomness ?? 0.35, 0, 1);
  const settleBeats = clamp(params.settleBeats ?? Math.max(calmBeats, 0.5), 0, 16);
  const brightnessScale = clamp(params.brightnessScale ?? 1.4, 0.5, 3);
  const baseBrightness = clampInteger(context.baseState.brightness ?? 180, 1, 254);
  const calmBrightness = clampInteger(Math.round(baseBrightness * 0.2), 1, baseBrightness);
  const rng = createRng(params.seed ?? 1337);

  const steps: LightAnimationStep[] = [];

  for (let index = 0; index < flashCount; index += 1) {
    const color = palette[index % palette.length];
    const flashDuration = flashBeats * jitter(rng, randomness);
    const calmDuration = calmBeats * jitter(rng, randomness);
    const brightness = clampInteger(
      Math.round(baseBrightness * brightnessScale * jitter(rng, randomness * 0.6)),
      baseBrightness,
      254
    );

    const gradient = [clonePoint(color), clonePoint(color)];

    steps.push({
      id: `preset-lightning-${version ?? 1}-flash-${index}`,
      label: `Flash ${index + 1}`,
      durationBeats: flashDuration,
      state: {
        on: true,
        brightness,
        gradient,
        gradientMode: 'interpolated_palette',
      },
    });

    steps.push({
      id: `preset-lightning-${version ?? 1}-calm-${index}`,
      label: `Calm ${index + 1}`,
      durationBeats: calmDuration,
      state: {
        on: true,
        brightness: calmBrightness,
      },
    });
  }

  if (settleBeats > 0) {
    steps.push({
      id: `preset-lightning-${version ?? 1}-settle`,
      label: 'Settle',
      durationBeats: settleBeats,
      state: {
        on: true,
        brightness: baseBrightness,
      },
    });
  }

  return steps;
}

function ensurePalette(
  palette: Array<{ x: number; y: number }> | undefined,
  context: PresetBuildContext,
  minLength: number
): Array<{ x: number; y: number }> {
  const candidates = (palette ?? []).filter(isValidPoint).map(clonePoint);
  if (candidates.length >= minLength) {
    return candidates.slice(0, MAX_GRADIENT_STOPS);
  }

  const gradient = context.baseState.gradient;
  if (gradient && gradient.length >= minLength) {
    return gradient.slice(0, MAX_GRADIENT_STOPS).map(clonePoint);
  }

  if (context.baseState.effectColor) {
    return [clonePoint(context.baseState.effectColor), clonePoint(DEFAULT_WHITE_POINT)];
  }

  return DEFAULT_CHASE_PALETTE.slice(0, Math.max(minLength, MIN_GRADIENT_STOPS)).map(clonePoint);
}

function normalizeGradient(
  gradient: Array<{ x: number; y: number }> | undefined
): Array<{ x: number; y: number }> {
  if (!gradient || gradient.length === 0) {
    return [];
  }
  return gradient.filter(isValidPoint).map(clonePoint).slice(0, MAX_GRADIENT_STOPS);
}

function padGradient(
  gradient: Array<{ x: number; y: number }>,
  targetLength: number
): Array<{ x: number; y: number }> {
  if (gradient.length === 0) {
    return Array.from({ length: targetLength }, () => clonePoint(DEFAULT_WHITE_POINT));
  }
  if (gradient.length >= targetLength) {
    return gradient.map(clonePoint).slice(0, targetLength);
  }
  const result = gradient.map(clonePoint);
  const last = gradient[gradient.length - 1];
  while (result.length < targetLength) {
    result.push(clonePoint(last));
  }
  return result;
}

function paletteToGradient(
  palette: Array<{ x: number; y: number }>,
  minimumStops: number
): Array<{ x: number; y: number }> {
  if (palette.length >= minimumStops) {
    return palette.slice(0, MAX_GRADIENT_STOPS).map(clonePoint);
  }
  const result = palette.slice();
  while (result.length < minimumStops) {
    result.push(clonePoint(palette[result.length % palette.length] ?? DEFAULT_WHITE_POINT));
  }
  return result.slice(0, MAX_GRADIENT_STOPS).map(clonePoint);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return min;
  }
  return Math.min(max, Math.max(min, rounded));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easingResolver(
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
): (t: number) => number {
  switch (easing) {
    case 'easeIn':
      return (t) => t * t;
    case 'easeOut':
      return (t) => 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return (t) => {
        if (t < 0.5) {
          return 2 * t * t;
        }
        return 1 - Math.pow(-2 * t + 2, 2) / 2;
      };
    case 'linear':
    default:
      return (t) => t;
  }
}

function isValidPoint(point: { x: number; y: number } | undefined): point is { x: number; y: number } {
  return Boolean(
    point &&
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
  );
}

function clonePoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

function createRng(seed: number): () => number {
  let value = Math.floor(seed) % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function jitter(rng: () => number, amount: number): number {
  if (amount <= 0) {
    return 1;
  }
  const deviation = (rng() * 2 - 1) * amount;
  return Math.max(0.1, 1 + deviation);
}
