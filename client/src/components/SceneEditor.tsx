import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { api } from '../api';
import type { ScenePayload } from '../api';
import type {
  HueLight,
  Scene,
  GradientMode,
  LightAnimation,
  LightStateOverride,
  LightAnimationStep,
  SceneAnimationPreset,
  SceneAnimationPresetId,
  LightState,
  ChaseAnimationPresetParams,
  GradientCrossfadePresetParams,
  LightningAnimationPresetParams,
} from '../types';
import { generatePresetSteps } from '../sceneAnimationPresets';

type SceneEffect = Exclude<NonNullable<Scene['lights'][number]['state']['effect']>, 'none'>;

const dynamicEffects: ReadonlyArray<SceneEffect> = [
  'sparkle',
  'fire',
  'candle',
  'prism',
  'opal',
  'glisten',
  'underwater',
  'cosmos',
  'sunbeam',
  'enchant',
  'colorloop',
  'flash',
  'pulse',
];
const defaultGradient = ['#ff005b', '#00c6ff'];
const gradientMinStops = 2;
const gradientMaxStops = 5;
const gradientModes: ReadonlyArray<GradientMode> = [
  'interpolated_palette',
  'interpolated_palette_mirrored',
  'random_pixelated',
  'segmented_palette',
];
const defaultGradientMode: GradientMode = 'interpolated_palette';
const defaultEffectSpeed = 0.5;
const defaultColor = '#ffffff';
const smallButtonClass = 'px-2 py-1 text-xs bg-[#2a2a2a] border border-[#444] rounded hover:border-[#666] transition disabled:opacity-40 disabled:cursor-not-allowed';
const animationBeatOptions = [
  { label: '1 Beat', value: 1 },
  { label: '1/2 Beat', value: 0.5 },
  { label: '1/4 Beat', value: 0.25 },
  { label: '1/8 Beat', value: 0.125 },
  { label: 'Custom (ms)', value: 'custom' },
  { label: '2 Beats', value: 2 },
  { label: '4 Beats', value: 4 },
];
const maxAnimationSteps = 16;
type BeatDivision = '1' | '1/2' | '1/4' | '1/8' | '1/16';

interface SceneEditorProps {
  mode: 'create' | 'edit';
  lights: HueLight[];
  initialScene?: Scene;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (payload: ScenePayload) => void;
}

interface SceneLightDraft {
  targetId: string;
  on: boolean;
  brightness: number;
  mode: 'color' | 'gradient' | 'effect';
  colorHex: string;
  gradientStops: string[];
  gradientMode: GradientMode;
  effect?: SceneEffect;
  effectColorHex?: string;
  effectSpeed?: number;
  animation?: LightAnimation;
}

interface SceneDraft {
  name: string;
  description: string;
  tags: string;
  transitionMs: number;
  lights: SceneLightDraft[];
}

export function SceneEditor({ mode, lights, initialScene, isSaving, onCancel, onSubmit }: SceneEditorProps) {
  const isEdit = mode === 'edit' && initialScene;

  const [draft, setDraft] = useState<SceneDraft>(() =>
    initialScene ? createDraftFromScene(initialScene) : createEmptyDraft(lights)
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);

  const availableLights = useMemo(
    () => lights.map(light => ({ id: light.id, name: light.name, supportsGradient: light.capabilities?.gradient ?? false })),
    [lights]
  );

  const handleModeChange = (lightIndex: number, nextMode: SceneLightDraft['mode']) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }

        if (light.mode === nextMode) {
          return light;
        }

        if (nextMode === 'gradient') {
          const baseStops = light.gradientStops.length > 0 ? light.gradientStops : [light.colorHex, defaultGradient[1]];
          const sanitizedStops = sanitizeGradientStops(baseStops);
          const primaryStop = sanitizedStops[0] ?? light.colorHex;
          return {
            ...light,
            mode: nextMode,
            gradientStops: sanitizedStops,
            gradientMode: light.gradientMode ?? defaultGradientMode,
            colorHex: normalizeHexColor(primaryStop),
          };
        }

        if (nextMode === 'effect') {
          return {
            ...light,
            mode: nextMode,
            effect: light.effect ?? dynamicEffects[0],
            effectColorHex: normalizeHexColor(light.effectColorHex ?? light.colorHex),
            effectSpeed: light.effectSpeed ?? defaultEffectSpeed,
          };
        }

        return {
          ...light,
          mode: nextMode,
          colorHex: normalizeHexColor(light.colorHex),
        };
      }),
    }));
  };

  const handleGradientStopChange = (lightIndex: number, stopIndex: number, hexValue: string) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }

        const stops = [...light.gradientStops];
        const current = light.gradientStops[stopIndex] ?? defaultColor;
        const normalizedHex = normalizeHexColor(hexValue, current);
        stops[stopIndex] = normalizedHex;
        const sanitizedStops = sanitizeGradientStops(stops);
        const updated: SceneLightDraft = {
          ...light,
          gradientStops: sanitizedStops,
        };
        if (updated.mode === 'gradient' && sanitizedStops[0]) {
          updated.colorHex = normalizeHexColor(sanitizedStops[0]);
        }
        return updated;
      }),
    }));
  };

  const addGradientStop = (lightIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        if (light.gradientStops.length >= gradientMaxStops) {
          return light;
        }
        const nextStops = [...light.gradientStops, defaultGradient[light.gradientStops.length % defaultGradient.length]];
        const sanitizedStops = sanitizeGradientStops(nextStops);
        const updated: SceneLightDraft = {
          ...light,
          gradientStops: sanitizedStops,
        };
        if (updated.mode === 'gradient' && sanitizedStops[0]) {
          updated.colorHex = normalizeHexColor(sanitizedStops[0]);
        }
        return updated;
      }),
    }));
  };

  const toggleAnimation = (lightIndex: number, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }

        if (!enabled) {
          return { ...light, animation: undefined };
        }

        return {
          ...light,
          animation: createDefaultAnimation(light),
        };
      }),
    }));
  };

  const setAnimationPreset = (lightIndex: number, presetId: SceneAnimationPresetId | '') => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation) {
          return light;
        }

        if (!presetId) {
          if (!light.animation.preset) {
            return light;
          }
          return {
            ...light,
            animation: {
              ...light.animation,
              preset: undefined,
            },
          };
        }

        const preset = createDefaultAnimationPreset(light, presetId);
        return applyPresetToLight(light, preset);
      }),
    }));
  };

  const updateAnimationPreset = (
    lightIndex: number,
    updater: (preset: SceneAnimationPreset) => SceneAnimationPreset
  ) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation?.preset) {
          return light;
        }

        const nextPreset = updater(light.animation.preset);
        return applyPresetToLight(light, nextPreset);
      }),
    }));
  };

  const updateAnimationStep = (lightIndex: number, stepIndex: number, changes: Partial<LightAnimationStep>) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation || light.animation.preset) {
          return light;
        }

        const steps = light.animation.steps.map((step, idx) => {
          if (idx !== stepIndex) {
            return step;
          }

          const nextState = changes.state ? cloneLightStateOverride(changes.state) : step.state;
          const { state: _ignored, ...rest } = changes;

          return {
            ...step,
            ...rest,
            state: nextState,
          };
        });

        return {
          ...light,
          animation: {
            ...light.animation,
            steps,
          },
        };
      }),
    }));
  };

  const addAnimationStep = (lightIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation || light.animation.preset) {
          return light;
        }

        if (light.animation.steps.length >= maxAnimationSteps) {
          return light;
        }

        const nextStep: LightAnimationStep = {
          id: randomId(),
          durationBeats: 1,
          state: createDefaultLightStateOverride(light),
        };

        return {
          ...light,
          animation: {
            ...light.animation,
            steps: [...light.animation.steps, nextStep],
          },
        };
      }),
    }));
  };

  const removeAnimationStep = (lightIndex: number, stepIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation || light.animation.preset) {
          return light;
        }

        if (light.animation.steps.length <= 2) {
          return light;
        }

        return {
          ...light,
          animation: {
            ...light.animation,
            steps: light.animation.steps.filter((_, idx) => idx !== stepIndex),
          },
        };
      }),
    }));
  };

  const moveAnimationStep = (lightIndex: number, stepIndex: number, direction: -1 | 1) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation || light.animation.preset) {
          return light;
        }

        const list = [...light.animation.steps];
        const target = stepIndex + direction;
        if (target < 0 || target >= list.length) {
          return light;
        }
        [list[stepIndex], list[target]] = [list[target], list[stepIndex]];
        return {
          ...light,
          animation: {
            ...light.animation,
            steps: list,
          },
        };
      }),
    }));
  };

  const setAnimationSync = (lightIndex: number, groupId?: string, beatDivision?: BeatDivision) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex || !light.animation) {
          return light;
        }

        return {
          ...light,
          animation: {
            ...light.animation,
            sync: groupId || beatDivision ? { groupId, beatDivision } : undefined,
          },
        };
      }),
    }));
  };

  const removeGradientStop = (lightIndex: number, stopIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        if (light.gradientStops.length <= gradientMinStops) {
          return light;
        }
        const nextStops = light.gradientStops.filter((_, idx) => idx !== stopIndex);
        const sanitizedStops = sanitizeGradientStops(nextStops);
        const updated: SceneLightDraft = {
          ...light,
          gradientStops: sanitizedStops,
        };
        if (updated.mode === 'gradient' && sanitizedStops[0]) {
          updated.colorHex = normalizeHexColor(sanitizedStops[0]);
        }
        return updated;
      }),
    }));
  };

  const moveGradientStop = (lightIndex: number, stopIndex: number, direction: -1 | 1) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        const targetIndex = stopIndex + direction;
        if (targetIndex < 0 || targetIndex >= light.gradientStops.length) {
          return light;
        }
        const nextStops = [...light.gradientStops];
        const temp = nextStops[targetIndex];
        nextStops[targetIndex] = nextStops[stopIndex];
        nextStops[stopIndex] = temp;
        const sanitizedStops = sanitizeGradientStops(nextStops);
        const updated: SceneLightDraft = {
          ...light,
          gradientStops: sanitizedStops,
        };
        if (updated.mode === 'gradient' && sanitizedStops[0]) {
          updated.colorHex = normalizeHexColor(sanitizedStops[0]);
        }
        return updated;
      }),
    }));
  };

  const handleEffectChange = (lightIndex: number, effect: SceneEffect) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        const fallbackHex = normalizeHexColor(light.effectColorHex ?? light.colorHex);

        return {
          ...light,
          effect,
          effectColorHex: fallbackHex,
        };
      }),
    }));
  };

  const handleEffectColorChange = (lightIndex: number, hex: string) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        return {
          ...light,
          effectColorHex: normalizeHexColor(hex, light.effectColorHex ?? light.colorHex),
        };
      }),
    }));
  };

  const handleEffectSpeedChange = (lightIndex: number, speed: number) => {
    setDraft((prev) => ({
      ...prev,
      lights: prev.lights.map((light, index) => {
        if (index !== lightIndex) {
          return light;
        }
        return {
          ...light,
          effectSpeed: clampNumber(speed, 0, 1),
        };
      }),
    }));
  };

  const updateLight = (index: number, changes: Partial<SceneLightDraft>) => {
    setDraft(prev => ({
      ...prev,
      lights: prev.lights.map((entry, idx) =>
        idx === index ? { ...entry, ...changes } : entry
      ),
    }));
  };

  const addLight = () => {
    if (availableLights.length === 0) return;
    const preferred = availableLights.find(light => !draft.lights.some(entry => entry.targetId === light.id));
    const targetId = preferred ? preferred.id : availableLights[0].id;
    setDraft(prev => ({
      ...prev,
      lights: [
        ...prev.lights,
        {
          targetId,
          on: true,
          brightness: 200,
          mode: 'color',
          colorHex: defaultColor,
          gradientStops: [...defaultGradient].slice(0, gradientMinStops),
          gradientMode: defaultGradientMode,
          effectColorHex: defaultColor,
          effectSpeed: defaultEffectSpeed,
          animation: undefined,
        },
      ],
    }));
  };

  const removeLight = (index: number) => {
    setDraft(prev => ({
      ...prev,
      lights: prev.lights.filter((_, idx) => idx !== index),
    }));
  };

  const previewScene = async () => {
    if (draft.lights.length === 0) {
      setPreviewMessage('Add at least one light to preview this scene.');
      return;
    }

    try {
      setIsPreviewing(true);
      setPreviewMessage(null);
      const payload = convertDraftToPayload(draft);
      const response = await api.test.scenePreview(payload);
      setPreviewTargetId('__scene__');
      const count = response.lights?.length ?? 0;
      setPreviewMessage(`Preview running${count > 0 ? ` on ${count} target${count === 1 ? '' : 's'}` : ''}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to preview scene';
      setPreviewMessage(message);
    } finally {
      setIsPreviewing(false);
    }
  };

  const stopPreview = async () => {
    if (!previewTargetId) return;
    try {
      setIsPreviewing(true);
      await api.test.stopScenePreview();
      setPreviewMessage('Preview stopped.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop preview';
      setPreviewMessage(message);
    } finally {
      setIsPreviewing(false);
      setPreviewTargetId(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = convertDraftToPayload(draft);
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="bg-[#1b1b1b] border border-[#333] rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl text-[#e0e0e0]">
            {isEdit ? `Edit Scene${initialScene?.name ? `: ${initialScene.name}` : ''}` : 'Create Scene'}
          </h2>
          <button
            className="text-2xl text-[#999] hover:text-white"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {previewMessage && (
            <div className="text-xs text-[#10b981] bg-[#102418] border border-[#10b981]/40 rounded p-2">
              {previewMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={previewScene}
              disabled={isPreviewing || previewDisabledReason(draft) !== null}
            >
              {isPreviewing && !previewTargetId ? 'Previewing…' : 'Preview'}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={stopPreview}
              disabled={!previewTargetId || isPreviewing}
            >
              Stop Preview
            </Button>
            {previewDisabledReason(draft) && (
              <span className="text-xs text-[#777]">{previewDisabledReason(draft)}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#aaa] mb-1">Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft(prev => ({ ...prev, name: event.target.value }))}
                required
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
              />
            </div>
            <div>
              <label className="block text-sm text-[#aaa] mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={draft.tags}
                onChange={(event) => setDraft(prev => ({ ...prev, tags: event.target.value }))}
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                placeholder="e.g. intro, verse"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#aaa] mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft(prev => ({ ...prev, description: event.target.value }))}
              rows={3}
              className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
              placeholder="Optional notes about this scene"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#aaa] mb-1">Transition Duration (ms)</label>
              <input
                type="number"
                min="0"
                step="50"
                value={draft.transitionMs}
                onChange={(event) => setDraft(prev => ({ ...prev, transitionMs: Number(event.target.value) || 0 }))}
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[#e0e0e0] font-medium">Targets</h3>
              <Button onClick={addLight} type="button" disabled={availableLights.length === 0}>
                Add Light
              </Button>
            </div>

            {draft.lights.length === 0 ? (
              <p className="text-sm text-[#777]">No lights assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {draft.lights.map((entry, index) => {
                  const lightInfo = availableLights.find((light) => light.id === entry.targetId);
                  const supportsGradient = lightInfo?.supportsGradient ?? false;
                  const gradientStyle = entry.gradientStops.length > 0
                    ? { backgroundImage: `linear-gradient(90deg, ${entry.gradientStops.join(', ')})` }
                    : { backgroundColor: entry.colorHex };

                  return (
                    <div key={`${entry.targetId}-${index}`} className="p-3 bg-[#242424] rounded border border-[#333]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-[#aaa] mb-1">Light</label>
                          <select
                            value={entry.targetId}
                            onChange={(event) => updateLight(index, { targetId: event.target.value })}
                            className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                          >
                            {availableLights.map((light) => (
                              <option key={light.id} value={light.id}>
                                {light.name} ({light.id})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-[#aaa] mb-1">On / Off</label>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm text-[#ddd]">
                              <input
                                type="checkbox"
                                className="accent-[#667eea]"
                                checked={entry.on}
                                onChange={(event) => updateLight(index, { on: event.target.checked })}
                              />
                              On
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-sm text-[#aaa] mb-1">Brightness: {entry.brightness}</label>
                          <input
                            type="range"
                            min="1"
                            max="254"
                            value={entry.brightness}
                            onChange={(event) => updateLight(index, { brightness: clampBrightness(Number(event.target.value) || 0) })}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-[#aaa] mb-1">Mode</label>
                          <select
                            value={entry.mode}
                            onChange={(event) => handleModeChange(index, event.target.value as SceneLightDraft['mode'])}
                            className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                          >
                            <option value="color">Color</option>
                            <option value="gradient" disabled={!supportsGradient && entry.mode !== 'gradient'}>Gradient</option>
                            <option value="effect">Effect</option>
                          </select>
                      {!supportsGradient && entry.mode !== 'gradient' && (
                        <p className="mt-1 text-xs text-[#777]">This light may not support gradients.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between bg-[#1f1f1f] border border-[#333] rounded px-3 py-2">
                    <div>
                      <span className="text-sm text-[#aaa]">Animation</span>
                      <p className="text-xs text-[#666]">Loop custom steps while this scene is active.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-[#ddd]">
                      <input
                        type="checkbox"
                        className="accent-[#667eea]"
                        checked={Boolean(entry.animation)}
                        onChange={(event) => toggleAnimation(index, event.target.checked)}
                      />
                      Enabled
                    </label>
                  </div>

                  {entry.animation && (
                    <AnimationEditor
                      light={entry}
                      lightIndex={index}
                      onUpdateStep={updateAnimationStep}
                      onAddStep={addAnimationStep}
                      onRemoveStep={removeAnimationStep}
                      onMoveStep={moveAnimationStep}
                      onSyncChange={setAnimationSync}
                      onPresetChange={setAnimationPreset}
                      onPresetParamsChange={updateAnimationPreset}
                    />
                  )}

                  {entry.mode === 'color' && (
                    <div className="mt-3">
                          <label className="block text-sm text-[#aaa] mb-1">Color</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={entry.colorHex}
                              onChange={(event) => updateLight(index, { colorHex: normalizeHexColor(event.target.value) })}
                              className="h-10 w-16 bg-[#2a2a2a] border border-[#444] rounded"
                            />
                            <span className="text-xs text-[#aaa] tracking-wide">{entry.colorHex}</span>
                          </div>
                        </div>
                      )}

                      {entry.mode === 'gradient' && (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                              <label className="block text-sm text-[#aaa] mb-1">Gradient Mode</label>
                              <select
                                value={entry.gradientMode}
                                onChange={(event) => updateLight(index, { gradientMode: event.target.value as GradientMode })}
                                className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                              >
                                {gradientModes.map((modeOption) => (
                                  <option key={modeOption} value={modeOption}>{modeOption}</option>
                                ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              onClick={() => addGradientStop(index)}
                              disabled={entry.gradientStops.length >= gradientMaxStops}
                            >
                              Add Stop
                            </Button>
                          </div>

                          <div
                            className="h-2 rounded-full border border-[#333]"
                            style={gradientStyle}
                          />

                          <div className="space-y-2">
                            {entry.gradientStops.map((stop, stopIndex) => (
                              <div key={`${stop}-${stopIndex}`} className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-[#777] w-16">Stop {stopIndex + 1}</span>
                                <input
                                  type="color"
                                  value={stop}
                                  onChange={(event) => handleGradientStopChange(index, stopIndex, event.target.value)}
                                  className="h-10 w-16 bg-[#2a2a2a] border border-[#444] rounded"
                                />
                                <input
                                  type="text"
                                  defaultValue={stop}
                                  onBlur={(event) => handleGradientStopChange(index, stopIndex, event.target.value)}
                                  placeholder="#rrggbb"
                                  className="w-24 bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
                                />
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className={smallButtonClass}
                                    onClick={() => moveGradientStop(index, stopIndex, -1)}
                                    disabled={stopIndex === 0}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className={smallButtonClass}
                                    onClick={() => moveGradientStop(index, stopIndex, 1)}
                                    disabled={stopIndex === entry.gradientStops.length - 1}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    className={smallButtonClass}
                                    onClick={() => removeGradientStop(index, stopIndex)}
                                    disabled={entry.gradientStops.length <= gradientMinStops}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-[#777]">Gradients require between {gradientMinStops} and {gradientMaxStops} stops.</p>
                        </div>
                      )}

                      {entry.mode === 'effect' && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="block text-sm text-[#aaa] mb-1">Effect</label>
                            <select
                              value={entry.effect ?? dynamicEffects[0]}
                              onChange={(event) => handleEffectChange(index, event.target.value as SceneEffect)}
                              className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                            >
                              {dynamicEffects.map((effectOption) => (
                                <option key={effectOption} value={effectOption}>{effectOption}</option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm text-[#aaa] mb-1">Speed</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={entry.effectSpeed ?? defaultEffectSpeed}
                                  onChange={(event) => handleEffectSpeedChange(index, Number(event.target.value))}
                                  className="flex-1"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={(entry.effectSpeed ?? defaultEffectSpeed).toFixed(2)}
                                  onChange={(event) => handleEffectSpeedChange(index, Number(event.target.value))}
                                  className="w-20 bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
                                />
                              </div>
                              <p className="mt-1 text-xs text-[#777]">0 = slowest, 1 = fastest.</p>
                            </div>
                          </div>

                          {entry.effect && (
                            <div>
                              <label className="block text-sm text-[#aaa] mb-1">Effect Color</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="color"
                                  value={normalizeHexColor(entry.effectColorHex ?? entry.colorHex)}
                                  onChange={(event) => handleEffectColorChange(index, event.target.value)}
                                  className="h-10 w-16 bg-[#2a2a2a] border border-[#444] rounded"
                                />
                                <span className="text-xs text-[#aaa] tracking-wide">{normalizeHexColor(entry.effectColorHex ?? entry.colorHex)}</span>
                              </div>
                              <p className="mt-1 text-xs text-[#777]">Optional: supply a custom color for this effect. Some effects ignore color.</p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex justify-end">
                        <Button variant="danger" type="button" onClick={() => removeLight(index)}>
                          Remove Target
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="danger" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || draft.lights.length === 0}>
              {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Scene'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AnimationEditorProps {
  light: SceneLightDraft;
  lightIndex: number;
  onUpdateStep: (lightIndex: number, stepIndex: number, changes: Partial<LightAnimationStep>) => void;
  onAddStep: (lightIndex: number) => void;
  onRemoveStep: (lightIndex: number, stepIndex: number) => void;
  onMoveStep: (lightIndex: number, stepIndex: number, direction: -1 | 1) => void;
  onSyncChange: (lightIndex: number, groupId?: string, beatDivision?: BeatDivision) => void;
  onPresetChange: (lightIndex: number, preset: SceneAnimationPresetId | '') => void;
  onPresetParamsChange: (
    lightIndex: number,
    updater: (preset: SceneAnimationPreset) => SceneAnimationPreset
  ) => void;
}

function AnimationEditor({
  light,
  lightIndex,
  onUpdateStep,
  onAddStep,
  onRemoveStep,
  onMoveStep,
  onSyncChange,
  onPresetChange,
  onPresetParamsChange,
}: AnimationEditorProps) {
  const animation = light.animation;
  if (!animation) {
    return null;
  }

  const isPreset = Boolean(animation.preset);
  const presetId = animation.preset?.id ?? '';
  const disableAdd = animation.steps.length >= maxAnimationSteps || isPreset;

  return (
    <div className="mt-3 space-y-3 border border-[#333] bg-[#1a1a1a] rounded p-3">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-[#aaa]">Animation Mode</label>
        <div className="flex flex-col md:flex-row md:items-center md:gap-3">
          <select
            value={presetId}
            onChange={(event) => onPresetChange(lightIndex, event.target.value as SceneAnimationPresetId | '')}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded text-sm md:w-64"
          >
            <option value="">Manual (custom steps)</option>
            <option value="chase">Preset: Chase</option>
            <option value="gradientCrossfade">Preset: Gradient Crossfade</option>
            <option value="lightning">Preset: Lightning Flicker</option>
          </select>
          {isPreset && (
            <span className="text-xs text-[#777]">
              Generated steps are read-only. Switch to manual to fine-tune.
            </span>
          )}
        </div>
      </div>

      {animation.preset && (
        <PresetControls
          light={light}
          preset={animation.preset}
          onChange={(updater) => onPresetParamsChange(lightIndex, updater)}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-[#aaa]">Steps</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Sync Group (optional)"
            value={animation.sync?.groupId ?? ''}
            onChange={(event) => onSyncChange(lightIndex, event.target.value || undefined, animation.sync?.beatDivision)}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded text-sm"
          />
          <select
            value={animation.sync?.beatDivision ?? ''}
            onChange={(event) => {
              const value = event.target.value as BeatDivision | '';
              onSyncChange(lightIndex, animation.sync?.groupId, value || undefined);
            }}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded text-sm"
          >
            <option value="">Beat Division</option>
            <option value="1">1</option>
            <option value="1/2">1/2</option>
            <option value="1/4">1/4</option>
            <option value="1/8">1/8</option>
            <option value="1/16">1/16</option>
          </select>
          <Button type="button" onClick={() => onAddStep(lightIndex)} disabled={disableAdd}>
            Add Step
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {animation.steps.map((step, stepIndex) => {
          const stepColorHex = getStepColorHex(step, light.colorHex);
          const isOn = step.state.on !== undefined ? step.state.on : true;
          const effectColorHex = step.state.effectColor ? xyToHex(step.state.effectColor.x, step.state.effectColor.y) : stepColorHex;

          return (
            <div key={step.id} className="border border-[#333] rounded bg-[#202020] p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#777]">Step {stepIndex + 1}</span>
                <input
                  type="text"
                  value={step.label ?? ''}
                  onChange={(event) => onUpdateStep(lightIndex, stepIndex, { label: event.target.value || undefined })}
                  placeholder="Label (optional)"
                  disabled={isPreset}
                  className="flex-1 min-w-[140px] bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`${smallButtonClass} ${isPreset ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (!isPreset) {
                        onMoveStep(lightIndex, stepIndex, -1);
                      }
                    }}
                    disabled={isPreset || stepIndex === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={`${smallButtonClass} ${isPreset ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (!isPreset) {
                        onMoveStep(lightIndex, stepIndex, 1);
                      }
                    }}
                    disabled={isPreset || stepIndex === animation.steps.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${smallButtonClass} ${isPreset ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => {
                      if (!isPreset) {
                        onRemoveStep(lightIndex, stepIndex);
                      }
                    }}
                    disabled={isPreset || animation.steps.length <= 2}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-[#aaa]">
                <div>
                  <label className="block mb-1">Duration</label>
                  <select
                    value={step.durationMs !== undefined ? 'custom' : step.durationBeats ?? 1}
                    onChange={(event) => {
                      if (event.target.value === 'custom') {
                        onUpdateStep(lightIndex, stepIndex, { durationBeats: undefined, durationMs: step.durationMs ?? 500 });
                      } else {
                        onUpdateStep(lightIndex, stepIndex, { durationBeats: Number(event.target.value), durationMs: undefined });
                      }
                    }}
                    disabled={isPreset}
                    className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
                  >
                    {animationBeatOptions.map((option) => (
                      <option key={option.label} value={option.value as any}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {step.durationMs !== undefined && (
                  <div>
                    <label className="block mb-1">Duration (ms)</label>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={step.durationMs}
                      onChange={(event) => onUpdateStep(lightIndex, stepIndex, { durationMs: Math.max(10, Number(event.target.value) || 10) })}
                      disabled={isPreset}
                      className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
                    />
                  </div>
                )}
                <div>
                  <label className="block mb-1">State</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`${smallButtonClass} ${isPreset ? 'opacity-40 cursor-not-allowed' : ''}`}
                      onClick={() => {
                        if (!isPreset) {
                          const nextState: LightStateOverride = { ...step.state, on: !isOn };
                          onUpdateStep(lightIndex, stepIndex, { state: nextState });
                        }
                      }}
                      disabled={isPreset}
                    >
                      {isOn ? 'Set Off' : 'Set On'}
                    </button>
                    <button
                      type="button"
                      className={`${smallButtonClass} ${isPreset ? 'opacity-40 cursor-not-allowed' : ''}`}
                      onClick={() => {
                        if (!isPreset) {
                          const baseState = createDefaultLightStateOverride(light);
                          onUpdateStep(lightIndex, stepIndex, { state: { ...step.state, ...baseState } });
                        }
                      }}
                      disabled={isPreset}
                    >
                      Use Base Color
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-[#aaa]">
                {renderColorOverride(light, step, lightIndex, stepIndex, onUpdateStep, isPreset)}
                {light.mode === 'gradient'
                  ? renderGradientOverride(light, lightIndex, stepIndex, step, onUpdateStep, isPreset)
                  : <div className="text-xs text-[#666] italic">Enable gradient mode to override stops.</div>}
                {renderEffectOverride(step, lightIndex, stepIndex, onUpdateStep, effectColorHex, isPreset)}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[#555]">
        Animations loop while the scene is active. Beat durations follow the latest MIDI tempo; custom millisecond durations are used when tempo is unknown.
      </p>
    </div>
  );
}

interface PresetControlsProps {
  light: SceneLightDraft;
  preset: SceneAnimationPreset;
  onChange: (updater: (preset: SceneAnimationPreset) => SceneAnimationPreset) => void;
}

function PresetControls({ light, preset, onChange }: PresetControlsProps) {
  switch (preset.id) {
    case 'chase':
      return (
        <ChasePresetControls
          light={light}
          preset={preset}
          onChange={(updater) =>
            onChange((current) => (current.id === 'chase' ? updater(current) : current))
          }
        />
      );
    case 'gradientCrossfade':
      return (
        <GradientCrossfadePresetControls
          light={light}
          preset={preset}
          onChange={(updater) =>
            onChange((current) => (current.id === 'gradientCrossfade' ? updater(current) : current))
          }
        />
      );
    case 'lightning':
      return (
        <LightningPresetControls
          light={light}
          preset={preset}
          onChange={(updater) =>
            onChange((current) => (current.id === 'lightning' ? updater(current) : current))
          }
        />
      );
    default:
      return null;
  }
}

interface ChasePresetControlsProps {
  light: SceneLightDraft;
  preset: Extract<SceneAnimationPreset, { id: 'chase' }>;
  onChange: (
    updater: (
      preset: Extract<SceneAnimationPreset, { id: 'chase' }>
    ) => Extract<SceneAnimationPreset, { id: 'chase' }>
  ) => void;
}

function ChasePresetControls({ light, preset, onChange }: ChasePresetControlsProps) {
  const paletteHex = getPaletteHexFromPreset(light, preset.params.palette, 2);
  const stopCount = clampNumber(preset.params.stopCount ?? Math.max(paletteHex.length + 1, gradientMinStops), gradientMinStops, gradientMaxStops);
  const stepCount = clampNumber(preset.params.stepCount ?? Math.max(stopCount, 4), 2, maxAnimationSteps);

  const handlePaletteChange = (index: number, hex: string) => {
    const nextPalette = [...paletteHex];
    nextPalette[index] = normalizeHexColor(hex);
    onChange((current) => ({
      ...current,
      params: {
        ...current.params,
        palette: nextPalette.map((value) => hexToXy(value)),
      },
    }));
  };

  const updateParam = <K extends keyof ChaseAnimationPresetParams>(key: K, value: ChaseAnimationPresetParams[K]) => {
    onChange((current) => ({
      ...current,
      params: {
        ...current.params,
        [key]: value,
      },
    }));
  };

  return (
    <div className="border border-[#2f2f2f] rounded p-3 bg-[#1f1f1f] space-y-3">
      <div className="text-xs uppercase tracking-wide text-[#777]">Chase preset</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paletteHex.map((color, idx) => (
          <div key={`chase-color-${idx}`} className="flex flex-col gap-1">
            <label className="text-xs text-[#aaa]">Color {idx + 1}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(event) => handlePaletteChange(idx, event.target.value)}
                className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
              />
              <span className="text-xs text-[#777]">{color}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-[#ccc]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Beats per step</span>
          <select
            value={preset.params.beatsPerStep ?? 0.5}
            onChange={(event) => updateParam('beatsPerStep', Number(event.target.value))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          >
            {[0.125, 0.25, 0.5, 1, 2, 4].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Stops per gradient</span>
          <input
            type="number"
            min={gradientMinStops}
            max={gradientMaxStops}
            value={stopCount}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              const nextValue = Number.isNaN(parsed) ? stopCount : clampNumber(parsed, gradientMinStops, gradientMaxStops);
              updateParam('stopCount', nextValue);
            }}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Step count</span>
          <input
            type="number"
            min={2}
            max={maxAnimationSteps}
            value={stepCount}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              const nextValue = Number.isNaN(parsed) ? stepCount : clampNumber(parsed, 2, maxAnimationSteps);
              updateParam('stepCount', nextValue);
            }}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-[#ccc]">
        <span className="text-xs text-[#777]">Gradient mode</span>
        <select
          value={preset.params.gradientMode ?? light.gradientMode ?? defaultGradientMode}
          onChange={(event) => updateParam('gradientMode', event.target.value as GradientMode)}
          className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
        >
          {gradientModes.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface GradientCrossfadePresetControlsProps {
  light: SceneLightDraft;
  preset: Extract<SceneAnimationPreset, { id: 'gradientCrossfade' }>;
  onChange: (
    updater: (
      preset: Extract<SceneAnimationPreset, { id: 'gradientCrossfade' }>
    ) => Extract<SceneAnimationPreset, { id: 'gradientCrossfade' }>
  ) => void;
}

function GradientCrossfadePresetControls({ light, preset, onChange }: GradientCrossfadePresetControlsProps) {
  const fromHex = getGradientHexFromPreset(light, preset.params.fromGradient, light.gradientStops);
  const toHex = getGradientHexFromPreset(light, preset.params.toGradient, [...light.gradientStops].reverse());

  const updateGradient = (key: 'fromGradient' | 'toGradient', nextStops: string[]) => {
    onChange((current) => ({
      ...current,
      params: {
        ...current.params,
        [key]: nextStops.map((hex) => hexToXy(hex)),
      },
    }));
  };

  const updateParam = <K extends keyof GradientCrossfadePresetParams>(key: K, value: GradientCrossfadePresetParams[K]) => {
    onChange((current) => ({
      ...current,
      params: {
        ...current.params,
        [key]: value,
      },
    }));
  };

  const totalBeats = preset.params.totalBeats ?? 8;
  const stepSubdivision = preset.params.stepSubdivision ?? 0.5;

  return (
    <div className="border border-[#2f2f2f] rounded p-3 bg-[#1f1f1f] space-y-3">
      <div className="text-xs uppercase tracking-wide text-[#777]">Gradient crossfade</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GradientStopsEditor
          title="Start gradient"
          stops={fromHex}
          onChange={(stops) => updateGradient('fromGradient', stops)}
        />
        <GradientStopsEditor
          title="End gradient"
          stops={toHex}
          onChange={(stops) => updateGradient('toGradient', stops)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-[#ccc]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Total beats</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={totalBeats}
            onChange={(event) => updateParam('totalBeats', Math.max(0.5, Number(event.target.value) || totalBeats))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Beat subdivision</span>
          <select
            value={stepSubdivision}
            onChange={(event) => updateParam('stepSubdivision', Number(event.target.value))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          >
            {[0.125, 0.25, 0.5, 1, 2].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Easing</span>
          <select
            value={preset.params.easing ?? 'linear'}
            onChange={(event) => updateParam('easing', event.target.value as NonNullable<GradientCrossfadePresetParams['easing']>)}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          >
            <option value="linear">Linear</option>
            <option value="easeIn">Ease in</option>
            <option value="easeOut">Ease out</option>
            <option value="easeInOut">Ease in/out</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-[#ccc]">
        <span className="text-xs text-[#777]">Gradient mode</span>
        <select
          value={preset.params.gradientMode ?? light.gradientMode ?? defaultGradientMode}
          onChange={(event) => updateParam('gradientMode', event.target.value as GradientMode)}
          className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
        >
          {gradientModes.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface LightningPresetControlsProps {
  light: SceneLightDraft;
  preset: Extract<SceneAnimationPreset, { id: 'lightning' }>;
  onChange: (
    updater: (
      preset: Extract<SceneAnimationPreset, { id: 'lightning' }>
    ) => Extract<SceneAnimationPreset, { id: 'lightning' }>
  ) => void;
}

function LightningPresetControls({ light, preset, onChange }: LightningPresetControlsProps) {
  const paletteHex = getPaletteHexFromPreset(light, preset.params.palette, 1);

  const updateParam = <K extends keyof LightningAnimationPresetParams>(key: K, value: LightningAnimationPresetParams[K]) => {
    onChange((current) => ({
      ...current,
      params: {
        ...current.params,
        [key]: value,
      },
    }));
  };

  return (
    <div className="border border-[#2f2f2f] rounded p-3 bg-[#1f1f1f] space-y-3">
      <div className="text-xs uppercase tracking-wide text-[#777]">Lightning preset</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-[#ccc]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Flash color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={paletteHex[0]}
              onChange={(event) => updateParam('palette', [hexToXy(event.target.value)])}
              className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
            />
            <span className="text-xs text-[#777]">{paletteHex[0]}</span>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Flash count</span>
          <input
            type="number"
            min={1}
            max={12}
            value={preset.params.flashCount ?? 4}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              const nextValue = Number.isNaN(parsed) ? (preset.params.flashCount ?? 4) : clampNumber(parsed, 1, 12);
              updateParam('flashCount', nextValue);
            }}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Brightness scale</span>
          <input
            type="number"
            min={0.5}
            max={3}
            step={0.1}
            value={preset.params.brightnessScale ?? 1.4}
            onChange={(event) => updateParam('brightnessScale', clampNumber(Number(event.target.value) || 1.4, 0.5, 3))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-[#ccc]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Flash beats</span>
          <input
            type="number"
            min={0.03125}
            step={0.03125}
            value={preset.params.flashBeats ?? 0.125}
            onChange={(event) => updateParam('flashBeats', clampNumber(Number(event.target.value) || 0.125, 0.03125, 2))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Calm beats</span>
          <input
            type="number"
            min={0.03125}
            step={0.03125}
            value={preset.params.calmBeats ?? 0.25}
            onChange={(event) => updateParam('calmBeats', clampNumber(Number(event.target.value) || 0.25, 0.03125, 8))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Settle beats</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={preset.params.settleBeats ?? 1}
            onChange={(event) => updateParam('settleBeats', Math.max(0, Number(event.target.value) || 0))}
            className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#777]">Randomness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={preset.params.randomness ?? 0.35}
            onChange={(event) => updateParam('randomness', clampNumber(Number(event.target.value), 0, 1))}
            className="accent-[#fbbf24]"
          />
        </label>
      </div>
    </div>
  );
}

interface GradientStopsEditorProps {
  title: string;
  stops: string[];
  onChange: (stops: string[]) => void;
}

function GradientStopsEditor({ title, stops, onChange }: GradientStopsEditorProps) {
  const sanitizedStops = sanitizeGradientStops(stops);

  const updateStop = (index: number, hex: string) => {
    const nextStops = sanitizedStops.map((stop, idx) => (idx === index ? normalizeHexColor(hex) : stop));
    onChange(nextStops);
  };

  const removeStop = (index: number) => {
    if (sanitizedStops.length <= gradientMinStops) {
      return;
    }
    const nextStops = sanitizedStops.filter((_, idx) => idx !== index);
    onChange(nextStops);
  };

  const addStop = () => {
    if (sanitizedStops.length >= gradientMaxStops) {
      return;
    }
    const fallback = sanitizedStops[sanitizedStops.length - 1] ?? defaultColor;
    onChange([...sanitizedStops, fallback]);
  };

  return (
    <div className="border border-[#333] rounded p-3 bg-[#252525] space-y-2">
      <div className="text-xs text-[#aaa]">{title}</div>
      {sanitizedStops.map((hex, idx) => (
        <div key={`${title}-stop-${idx}`} className="flex items-center gap-2">
          <span className="text-xs text-[#777]">Stop {idx + 1}</span>
          <input
            type="color"
            value={hex}
            onChange={(event) => updateStop(idx, event.target.value)}
            className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
          />
          <button
            type="button"
            onClick={() => removeStop(idx)}
            className={`${smallButtonClass} ${sanitizedStops.length <= gradientMinStops ? 'opacity-40 cursor-not-allowed' : ''}`}
            disabled={sanitizedStops.length <= gradientMinStops}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addStop}
          className={`${smallButtonClass} ${sanitizedStops.length >= gradientMaxStops ? 'opacity-40 cursor-not-allowed' : ''}`}
          disabled={sanitizedStops.length >= gradientMaxStops}
        >
          Add Stop
        </button>
      </div>
    </div>
  );
}

function renderColorOverride(
  light: SceneLightDraft,
  step: LightAnimationStep,
  lightIndex: number,
  stepIndex: number,
  onUpdateStep: (lightIndex: number, stepIndex: number, changes: Partial<LightAnimationStep>) => void,
  disabled: boolean
): ReactNode {
  if (light.mode === 'gradient') {
    return (
      <div className="text-xs text-[#666] italic">Color override applies when light mode is set to Color.</div>
    );
  }

  const hex = getStepColorHex(step, light.colorHex);

  return (
    <div>
      <label className="block mb-1">Color Override</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(event) => {
            const hsv = hexToHsv(event.target.value);
            const nextState: LightStateOverride = {
              ...step.state,
              hue: hsv.hue,
              saturation: hsv.saturation,
            };
            onUpdateStep(lightIndex, stepIndex, { state: nextState });
          }}
          disabled={disabled}
          className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
        />
        <button
          type="button"
          className={`${smallButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={() => {
            if (!disabled) {
              const nextState = { ...step.state } as LightStateOverride;
              delete nextState.hue;
              delete nextState.saturation;
              onUpdateStep(lightIndex, stepIndex, { state: nextState });
            }
          }}
          disabled={disabled}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function renderEffectOverride(
  step: LightAnimationStep,
  lightIndex: number,
  stepIndex: number,
  onUpdateStep: (lightIndex: number, stepIndex: number, changes: Partial<LightAnimationStep>) => void,
  effectColorHex: string,
  disabled: boolean
): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="block mb-1">Effect Override</label>
        <select
          value={step.state.effect ?? ''}
          onChange={(event) => {
            const value = event.target.value as SceneEffect | '';
            const nextState = { ...step.state } as LightStateOverride;
            if (value) {
              nextState.effect = value;
            } else {
              delete nextState.effect;
            }
            onUpdateStep(lightIndex, stepIndex, { state: nextState });
          }}
          disabled={disabled}
          className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded"
        >
          <option value="">Inherit</option>
          {dynamicEffects.map((effectOption) => (
            <option key={effectOption} value={effectOption}>{effectOption}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1">Effect Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
          value={effectColorHex}
          onChange={(event) => {
            const nextState = { ...step.state, effectColor: hexToXy(event.target.value) };
            onUpdateStep(lightIndex, stepIndex, { state: nextState });
          }}
          disabled={disabled}
          className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
        />
        <button
          type="button"
          className={`${smallButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={() => {
            if (!disabled) {
              const nextState = { ...step.state } as LightStateOverride;
              delete nextState.effectColor;
              onUpdateStep(lightIndex, stepIndex, { state: nextState });
            }
          }}
          disabled={disabled}
        >
          Clear
        </button>
      </div>
      </div>
    </div>
  );
}

function renderGradientOverride(
  light: SceneLightDraft,
  lightIndex: number,
  stepIndex: number,
  step: LightAnimationStep,
  onUpdateStep: (lightIndex: number, stepIndex: number, changes: Partial<LightAnimationStep>) => void,
  disabled: boolean
): ReactNode {
  const currentGradient = step.state.gradient ?? [];
  const baseGradientHex = light.gradientStops.length > 0 ? light.gradientStops : [light.colorHex, defaultColor];

  const ensureGradientMode = (state: LightStateOverride): LightStateOverride => ({
    ...state,
    gradientMode: state.gradientMode ?? light.gradientMode ?? defaultGradientMode,
  });

  if (currentGradient.length === 0) {
    return (
      <button
        type="button"
        className={`${smallButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (!disabled) {
            const sanitized = sanitizeGradientStops(baseGradientHex);
            const gradientPoints = sanitized.map((hex) => hexToXy(hex));
            const nextState = ensureGradientMode({
              ...step.state,
              gradient: gradientPoints,
            });
            onUpdateStep(lightIndex, stepIndex, { state: nextState });
          }
        }}
        disabled={disabled}
      >
        Copy base gradient
      </button>
    );
  }

  const handleGradientChange = (idx: number, hex: string) => {
    const normalized = normalizeHexColor(hex);
    const xy = hexToXy(normalized);
    const nextGradient = currentGradient.map((point, pointIndex) =>
      pointIndex === idx ? xy : point
    );
    const nextState = ensureGradientMode({
      ...step.state,
      gradient: nextGradient,
    });
    onUpdateStep(lightIndex, stepIndex, { state: nextState });
  };

  const removeStop = (idx: number) => {
    if (currentGradient.length <= gradientMinStops) {
      return;
    }
    const nextGradient = currentGradient.filter((_, pointIndex) => pointIndex !== idx);
    const nextState = ensureGradientMode({
      ...step.state,
      gradient: nextGradient,
    });
    onUpdateStep(lightIndex, stepIndex, { state: nextState });
  };

  const addStop = () => {
    if (currentGradient.length >= gradientMaxStops) {
      return;
    }
    const fallbackHex = baseGradientHex[currentGradient.length % baseGradientHex.length] ?? defaultColor;
    const nextGradient = [...currentGradient, hexToXy(fallbackHex)].slice(0, gradientMaxStops);
    const nextState = ensureGradientMode({
      ...step.state,
      gradient: nextGradient,
    });
    onUpdateStep(lightIndex, stepIndex, { state: nextState });
  };

  return (
    <div className="space-y-2">
      {currentGradient.map((point, idx) => {
        const hex = xyToHex(point.x, point.y);
        return (
          <div key={`${step.id}-gradient-${idx}`} className="flex items-center gap-2">
            <span className="text-xs text-[#777]">Stop {idx + 1}</span>
            <input
              type="color"
              value={hex}
              onChange={(event) => handleGradientChange(idx, event.target.value)}
              disabled={disabled}
              className="h-8 w-12 bg-[#2a2a2a] border border-[#444] rounded"
            />
            <button
              type="button"
              className={`${smallButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => removeStop(idx)}
              disabled={disabled || currentGradient.length <= gradientMinStops}
            >
              Remove
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${smallButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={addStop}
          disabled={disabled || currentGradient.length >= gradientMaxStops}
        >
          Add Stop
        </button>
        <select
          value={step.state.gradientMode ?? light.gradientMode ?? defaultGradientMode}
          onChange={(event) => {
            const nextState: LightStateOverride = {
              ...step.state,
              gradientMode: event.target.value as GradientMode,
            };
            onUpdateStep(lightIndex, stepIndex, { state: nextState });
          }}
          disabled={disabled}
          className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2 rounded text-xs"
        >
          {gradientModes.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function createEmptyDraft(lights: HueLight[]): SceneDraft {
  const firstLight = lights[0];
  return {
    name: 'New Scene',
    description: '',
    tags: '',
    transitionMs: 0,
    lights: firstLight
      ? [{
          targetId: firstLight.id,
          on: true,
          brightness: 200,
          mode: 'color',
          colorHex: defaultColor,
          gradientStops: [...defaultGradient].slice(0, gradientMinStops),
          gradientMode: defaultGradientMode,
          effectColorHex: defaultColor,
          effectSpeed: defaultEffectSpeed,
          animation: undefined,
        }]
      : [],
  };
}

function createDraftFromScene(scene: Scene): SceneDraft {
  return {
    name: scene.name,
    description: scene.description ?? '',
    tags: scene.tags?.join(', ') ?? '',
    transitionMs: scene.transition?.durationMs ?? 0,
    lights: scene.lights.map((light) => ({
      targetId: light.targetId,
      on: light.state.on,
      brightness: clampBrightness(light.state.brightness ?? 200),
      ...sceneLightStateToDraft(light.state),
      animation: cloneAnimation(light.animation),
    })),
  };
}

function convertDraftToPayload(draft: SceneDraft): ScenePayload {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    tags: draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    transition: draft.transitionMs > 0 ? { durationMs: draft.transitionMs } : undefined,
    lights: draft.lights.map((entry) => {
      const animation = cloneAnimation(entry.animation);
      return {
        targetId: entry.targetId,
        state: lightDraftToState(entry),
        targetType: 'light',
        ...(animation ? { animation } : {}),
      };
    }),
    metadata: undefined,
  };
}

function sceneLightStateToDraft(state: Scene['lights'][number]['state']): Omit<SceneLightDraft, 'targetId' | 'on' | 'brightness'> {
  const gradientStops = sanitizeGradientStops(
    Array.isArray(state.gradient) ? state.gradient.map((point) => xyToHex(point.x, point.y)) : []
  );
  const gradientMode = normalizeGradientMode(state.gradientMode);
  const effectCandidate = state.effect && state.effect !== 'none'
    ? (state.effect as SceneEffect)
    : undefined;
  const resolvedEffect = effectCandidate && dynamicEffects.includes(effectCandidate)
    ? effectCandidate
    : undefined;
  const effectSpeed = typeof state.effectSpeed === 'number' ? clampNumber(state.effectSpeed, 0, 1) : defaultEffectSpeed;
  const fallbackHex = lightStateToHex(state);

  if (resolvedEffect) {
    const effectColorHex = state.effectColor ? xyToHex(state.effectColor.x, state.effectColor.y) : fallbackHex;
    return {
      mode: 'effect',
      colorHex: normalizeHexColor(effectColorHex || fallbackHex),
      gradientStops,
      gradientMode,
      effect: resolvedEffect,
      effectColorHex: normalizeHexColor(effectColorHex || fallbackHex),
      effectSpeed,
    };
  }

  if (Array.isArray(state.gradient) && state.gradient.length >= gradientMinStops) {
    const firstStopHex = gradientStops[0] ?? fallbackHex;
    return {
      mode: 'gradient',
      colorHex: normalizeHexColor(firstStopHex),
      gradientStops,
      gradientMode,
      effectColorHex: normalizeHexColor(fallbackHex),
      effectSpeed,
    };
  }

  return {
    mode: 'color',
    colorHex: normalizeHexColor(fallbackHex),
    gradientStops,
    gradientMode,
    effectColorHex: normalizeHexColor(fallbackHex),
    effectSpeed,
  };
}

function lightDraftToState(draft: SceneLightDraft): Scene['lights'][number]['state'] {
  const brightness = clampBrightness(draft.brightness);
  const sanitizedColor = normalizeHexColor(draft.colorHex);
  const gradientStops = sanitizeGradientStops(draft.gradientStops);
  const gradientMode = normalizeGradientMode(draft.gradientMode);

  const state: Scene['lights'][number]['state'] = {
    on: draft.on,
    brightness,
  };

  if (draft.mode === 'gradient') {
    const firstStop = gradientStops[0] ?? sanitizedColor;
    const hsv = hexToHsv(firstStop);
    state.hue = hsv.hue;
    state.saturation = hsv.saturation;
    state.gradient = gradientStops.map((hex) => hexToXy(hex));
    if (state.gradient.length >= gradientMinStops) {
      state.gradientMode = gradientMode;
    }
  } else {
    const hsv = hexToHsv(sanitizedColor);
    state.hue = hsv.hue;
    state.saturation = hsv.saturation;
  }

  if (draft.mode === 'effect' && draft.effect) {
    state.effect = draft.effect;
    const effectHex = normalizeHexColor(draft.effectColorHex ?? sanitizedColor);
    state.effectColor = hexToXy(effectHex);
    if (typeof draft.effectSpeed === 'number') {
      state.effectSpeed = clampNumber(draft.effectSpeed, 0, 1);
    }
  }

  return state;
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{6})$/.test(value.trim());
}

function normalizeHexColor(value: string | undefined, fallback: string = defaultColor): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return isValidHexColor(withHash) ? withHash.toLowerCase() : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampBrightness(value: number): number {
  return clampNumber(Math.round(value), 1, 254);
}

function sanitizeGradientStops(stops: string[]): string[] {
  const normalized = stops
    .map((stop) => normalizeHexColor(stop, ''))
    .filter((stop): stop is string => Boolean(stop))
    .slice(0, gradientMaxStops);

  if (normalized.length >= gradientMinStops) {
    return normalized;
  }

  const fallback = [...normalized];
  let i = 0;
  while (fallback.length < gradientMinStops) {
    fallback.push(defaultGradient[i % defaultGradient.length]);
    i += 1;
  }
  return fallback.slice(0, gradientMaxStops);
}

function isValidGradientMode(mode: unknown): mode is GradientMode {
  return typeof mode === 'string' && gradientModes.includes(mode as GradientMode);
}

function normalizeGradientMode(mode: GradientMode | undefined): GradientMode {
  return isValidGradientMode(mode) ? mode : defaultGradientMode;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `step-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultLightStateOverride(light: SceneLightDraft): LightStateOverride {
  const hsv = hexToHsv(light.colorHex);
  return {
    hue: hsv.hue,
    saturation: hsv.saturation,
    brightness: clampBrightness(light.brightness),
  };
}

function createDefaultAnimation(light: SceneLightDraft): LightAnimation {
  const baseState = createDefaultLightStateOverride(light);
  const baseBrightness = baseState.brightness ?? clampBrightness(light.brightness);
  const dimBrightnessCandidate = Math.max(1, Math.min(254, Math.round(baseBrightness * 0.4)));
  const dimBrightness = dimBrightnessCandidate === baseBrightness ? Math.max(1, Math.min(254, baseBrightness - 40)) : dimBrightnessCandidate;

  const brightStep: LightStateOverride = { ...baseState, on: true, brightness: baseBrightness };
  const dimStep: LightStateOverride = { ...baseState, on: true, brightness: dimBrightness };

  return {
    mode: 'loop',
    steps: [
      { id: randomId(), durationBeats: 1, state: brightStep },
      { id: randomId(), durationBeats: 1, state: dimStep },
    ],
  };
}

function applyPresetToLight(light: SceneLightDraft, preset: SceneAnimationPreset): SceneLightDraft {
  const baseState = lightDraftToState(light) as LightState;
  const steps = generatePresetSteps(preset, { baseState });
  const nextAnimation: LightAnimation = {
    mode: 'loop',
    steps,
    sync: light.animation?.sync ? { ...light.animation.sync } : undefined,
    preset,
  };
  return {
    ...light,
    animation: nextAnimation,
  };
}

function createDefaultAnimationPreset(light: SceneLightDraft, presetId: SceneAnimationPresetId): SceneAnimationPreset {
  const gradientStops = sanitizeGradientStops(light.gradientStops.length > 0 ? light.gradientStops : [...defaultGradient]);
  const paletteXY = gradientStops.map((hex) => hexToXy(hex));
  const reversedPaletteXY = [...gradientStops].reverse().map((hex) => hexToXy(hex));

  switch (presetId) {
    case 'chase':
      return {
        id: 'chase',
        version: 1,
        params: {
          palette: paletteXY.slice(0, 2),
          beatsPerStep: 0.5,
          stopCount: Math.min(Math.max(paletteXY.length + 1, gradientMinStops), gradientMaxStops),
          stepCount: Math.max(4, Math.min(maxAnimationSteps, paletteXY.length * 2)),
          gradientMode: light.gradientMode ?? defaultGradientMode,
        },
      };
    case 'gradientCrossfade':
      return {
        id: 'gradientCrossfade',
        version: 1,
        params: {
          fromGradient: paletteXY.slice(0, gradientMaxStops),
          toGradient: reversedPaletteXY.slice(0, gradientMaxStops),
          totalBeats: 8,
          stepSubdivision: 0.5,
          easing: 'linear',
          gradientMode: light.gradientMode ?? defaultGradientMode,
        },
      };
    case 'lightning':
      return {
        id: 'lightning',
        version: 1,
        params: {
          palette: [paletteXY[0] ?? hexToXy(defaultColor)],
          flashCount: 4,
          flashBeats: 0.125,
          calmBeats: 0.25,
          randomness: 0.35,
          settleBeats: 1,
          brightnessScale: 1.4,
        },
      };
    default:
      return {
        id: 'chase',
        version: 1,
        params: {
          palette: paletteXY.slice(0, 2),
        },
      };
  }
}

function getPaletteHexFromPreset(
  light: SceneLightDraft,
  palette: Array<{ x: number; y: number }> | undefined,
  minimum: number
): string[] {
  if (palette && palette.length > 0) {
    return palette
      .slice(0, gradientMaxStops)
      .map((point) => xyToHex(point.x, point.y));
  }
  const baseStops = sanitizeGradientStops(light.gradientStops.length > 0 ? light.gradientStops : [...defaultGradient]);
  if (baseStops.length >= minimum) {
    return baseStops.slice(0, Math.max(minimum, Math.min(gradientMaxStops, baseStops.length)));
  }
  const result = [...baseStops];
  let index = 0;
  while (result.length < minimum) {
    result.push(defaultGradient[index % defaultGradient.length]);
    index += 1;
  }
  return sanitizeGradientStops(result).slice(0, gradientMaxStops);
}

function getGradientHexFromPreset(
  light: SceneLightDraft,
  gradient: Array<{ x: number; y: number }> | undefined,
  fallbackStops: string[]
): string[] {
  if (gradient && gradient.length > 0) {
    return gradient
      .slice(0, gradientMaxStops)
      .map((point) => xyToHex(point.x, point.y));
  }
  const baseStops = sanitizeGradientStops(
    fallbackStops.length > 0 ? fallbackStops : light.gradientStops.length > 0 ? light.gradientStops : [...defaultGradient]
  );
  return baseStops.slice(0, gradientMaxStops);
}

function getStepColorHex(step: LightAnimationStep, fallback: string): string {
  if (step.state.gradient && step.state.gradient.length > 0) {
    const first = step.state.gradient[0];
    return xyToHex(first.x, first.y);
  }
  if (step.state.effectColor) {
    return xyToHex(step.state.effectColor.x, step.state.effectColor.y);
  }
  if (typeof step.state.hue === 'number' && typeof step.state.saturation === 'number') {
    return hsvToHex(step.state.hue, step.state.saturation);
  }
  return fallback;
}

function cloneAnimation(animation?: LightAnimation): LightAnimation | undefined {
  if (!animation) {
    return undefined;
  }

  return {
    mode: animation.mode,
    sync: animation.sync ? { ...animation.sync } : undefined,
    preset: cloneAnimationPreset(animation.preset),
    steps: animation.steps.map((step) => ({
      id: step.id,
      label: step.label,
      durationBeats: step.durationBeats,
      durationMs: step.durationMs,
      state: cloneLightStateOverride(step.state),
    })),
  };
}

function cloneAnimationPreset(preset?: SceneAnimationPreset): SceneAnimationPreset | undefined {
  if (!preset) {
    return undefined;
  }

  switch (preset.id) {
    case 'chase':
      {
        const palette = preset.params.palette?.map((point) => ({ ...point }));
        return {
          id: 'chase',
          version: preset.version,
          params: {
            ...(palette ? { palette } : {}),
            beatsPerStep: preset.params.beatsPerStep,
            stopCount: preset.params.stopCount,
            stepCount: preset.params.stepCount,
            gradientMode: preset.params.gradientMode,
          },
        };
      }
    case 'gradientCrossfade':
      return {
        id: 'gradientCrossfade',
        version: preset.version,
        params: {
          fromGradient: preset.params.fromGradient?.map((point) => ({ ...point })),
          toGradient: preset.params.toGradient.map((point) => ({ ...point })),
          totalBeats: preset.params.totalBeats,
          stepSubdivision: preset.params.stepSubdivision,
          easing: preset.params.easing,
          gradientMode: preset.params.gradientMode,
        },
      };
    case 'lightning':
      return {
        id: 'lightning',
        version: preset.version,
        params: {
          palette: preset.params.palette?.map((point) => ({ ...point })),
          flashCount: preset.params.flashCount,
          flashBeats: preset.params.flashBeats,
          calmBeats: preset.params.calmBeats,
          randomness: preset.params.randomness,
          seed: preset.params.seed,
          settleBeats: preset.params.settleBeats,
          brightnessScale: preset.params.brightnessScale,
        },
      };
    default:
      return undefined;
  }
}

function cloneLightStateOverride(state: LightStateOverride): LightStateOverride {
  const clone: LightStateOverride = { ...state };
  if (state.effectColor) {
    clone.effectColor = { ...state.effectColor };
  }
  if (state.effectTemperature) {
    clone.effectTemperature = { ...state.effectTemperature };
  }
  if (state.gradient) {
    clone.gradient = state.gradient.map((point) => ({ ...point }));
  }
  if (state.gradientMode) {
    clone.gradientMode = state.gradientMode;
  }
  return clone;
}

function hexToXy(hex: string): { x: number; y: number } {
  const hsv = hexToHsv(normalizeHexColor(hex));
  const h = hsv.hue / 65535;
  const s = hsv.saturation / 254;
  const v = 1.0;

  const c = v * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 1 / 6) {
    r = c; g = x; b = 0;
  } else if (h >= 1 / 6 && h < 2 / 6) {
    r = x; g = c; b = 0;
  } else if (h >= 2 / 6 && h < 3 / 6) {
    r = 0; g = c; b = x;
  } else if (h >= 3 / 6 && h < 4 / 6) {
    r = 0; g = x; b = c;
  } else if (h >= 4 / 6 && h < 5 / 6) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  r = r + m;
  g = g + m;
  b = b + m;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

  const sum = X + Y + Z;
  return {
    x: sum === 0 ? 0 : X / sum,
    y: sum === 0 ? 0 : Y / sum,
  };
}

function xyToHex(x: number, y: number): string {
  const z = Math.max(0, 1 - x - y);
  const Y = 1;
  const X = y === 0 ? 0 : (Y / y) * x;
  const Z = y === 0 ? 0 : (Y / y) * z;

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  const clamp = (value: number) => Math.max(0, Math.min(1, value));

  r = clamp(r);
  g = clamp(g);
  b = clamp(b);

  const gammaCorrect = (value: number) =>
    value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

  const toHex = (value: number) =>
    Math.round(gammaCorrect(value) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lightStateToHex(state: Scene['lights'][number]['state']): string {
  if (state.gradient && state.gradient.length > 0) {
    const first = state.gradient[0];
    return xyToHex(first.x, first.y);
  }
  if (state.effectColor) {
    return xyToHex(state.effectColor.x, state.effectColor.y);
  }
  if (typeof state.hue === 'number' && typeof state.saturation === 'number') {
    return hsvToHex(state.hue, state.saturation);
  }
  return defaultColor;
}

function hexToHsv(hex: string): { hue: number; saturation: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }

  const s = max === 0 ? 0 : delta / max;

  return {
    hue: Math.round(h * 65535),
    saturation: Math.round(s * 254),
  };
}

function hsvToHex(hue: number, saturation: number): string {
  const h = hue / 65535;
  const s = saturation / 254;
  const v = 1;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0;
  let g = 0;
  let b = 0;

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const previewDisabledReason = (draft: SceneDraft): string | null => {
  if (draft.lights.length === 0) {
    return 'Add at least one light to preview the scene.';
  }
  for (let i = 0; i < draft.lights.length; i += 1) {
    const light = draft.lights[i];
    const label = `Light ${i + 1}`;

    if (!isValidHexColor(light.colorHex)) {
      return `${label}: choose a valid color.`;
    }

    if (light.mode === 'gradient') {
      if (light.gradientStops.length < gradientMinStops) {
        return `${label}: gradients need at least ${gradientMinStops} stops.`;
      }
      const invalidStop = light.gradientStops.find((stop) => !isValidHexColor(stop));
      if (invalidStop) {
        return `${label}: gradient stop colors must be valid hex values.`;
      }
    }

    if (light.mode === 'effect') {
      if (!light.effect) {
        return `${label}: select an effect.`;
      }
      if (light.effectSpeed === undefined || Number.isNaN(light.effectSpeed)) {
        return `${label}: provide a valid effect speed.`;
      }
    }

    if (light.animation) {
      if (light.animation.steps.length === 0) {
        return `${label}: add at least one animation step or disable animation.`;
      }

      for (let stepIndex = 0; stepIndex < light.animation.steps.length; stepIndex += 1) {
        const step = light.animation.steps[stepIndex];
        if (!step.durationBeats && !step.durationMs) {
          return `${label} Step ${stepIndex + 1}: set a duration.`;
        }
        if (!step.state || Object.keys(step.state).length === 0) {
          return `${label} Step ${stepIndex + 1}: define at least one override.`;
        }
      }
    }
  }
  return null;
};
