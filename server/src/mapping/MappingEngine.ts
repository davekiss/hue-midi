import { EventEmitter } from 'events';
import { MidiMessage, MidiCCMessage, MidiPCMessage, MidiMapping, LightState, MidiAction, Scene, SceneLightState, SceneTransition, LightAnimation, LightAnimationStep, LightStateOverride, HueNativeEffect, HueSignalingEffect, CustomEffect } from '../types';
import { HueBridgeController } from '../hue/HueBridgeController';
import { HueBluetoothController } from '../hue/HueBluetoothController';
import { SpringAnimator, AnimationTarget } from '../animation/SpringAnimator';

interface AppliedSceneState {
  targetId: string;
  targetType: SceneLightState['targetType'];
  state: LightState;
}

interface LightControlledEventData {
  midiMessage: MidiMessage;
  mapping: MidiMapping;
  appliedStates: AppliedSceneState[];
  lightId?: string;
  sceneId?: string;
}


export class MappingEngine extends EventEmitter {
  private mappings: Map<string, MidiMapping> = new Map();        // Note mappings: "channel:note" -> mapping
  private ccMappings: Map<string, MidiMapping[]> = new Map();    // CC mappings: "channel:cc" -> mappings[]
  private scenes: Map<string, Scene> = new Map();
  private bridgeController: HueBridgeController | null = null;
  private bluetoothController: HueBluetoothController | null = null;
  private connectionMode: 'bridge' | 'bluetooth' = 'bridge';
  private animator: SpringAnimator;
  private lightStates: Map<string, AnimationTarget> = new Map();
  private tempoBpm = 120;
  private tempoSource: 'default' | 'midi' | 'manual' = 'default';
  private lastTempoUpdate = Date.now();
  private animationTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeAnimations: Map<string, { steps: RuntimeAnimationStep[]; current: number; animation: LightAnimation; startedAt: number }>
    = new Map();
  private previewLights: Set<string> = new Set();
  private currentPreset: number | null = null;  // Current MIDI Program/Preset number
  private lastCCMessages: Map<string, { value: number; timestamp: number }> = new Map();  // CC debounce
  private static readonly CC_DEBOUNCE_MS = 50;  // Ignore duplicate CCs within 50ms

  // Native Hue V2 effects (handled by bridge via effects_v2 API)
  private static readonly NATIVE_EFFECTS: ReadonlyArray<HueNativeEffect> = [
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
  ];

  // Signaling effects (use Hue signaling API)
  private static readonly SIGNALING_EFFECTS: ReadonlyArray<HueSignalingEffect> = [
    'flash',
    'flash_color',
    'alternating',
  ];

  // Custom effects (implemented by CustomEffectsEngine)
  private static readonly CUSTOM_EFFECTS: ReadonlyArray<CustomEffect> = [
    'strobe',
    'police',
    'ambulance',
    'lightning',
    'color_flash',
    'breathe_smooth',
    'chase',
  ];

  private static readonly NATIVE_EFFECTS_SET = new Set<string>(MappingEngine.NATIVE_EFFECTS);
  private static readonly SIGNALING_EFFECTS_SET = new Set<string>(MappingEngine.SIGNALING_EFFECTS);
  private static readonly CUSTOM_EFFECTS_SET = new Set<string>(MappingEngine.CUSTOM_EFFECTS);

  // Keep for backwards compatibility
  private static readonly APPLIED_EFFECTS_SET = MappingEngine.NATIVE_EFFECTS_SET;

  constructor(
    bridgeController?: HueBridgeController,
    bluetoothController?: HueBluetoothController
  ) {
    super();
    if (bridgeController) this.bridgeController = bridgeController;
    if (bluetoothController) this.bluetoothController = bluetoothController;
    this.animator = new SpringAnimator();
  }

  /**
   * Set connection mode
   */
  setConnectionMode(mode: 'bridge' | 'bluetooth'): void {
    this.connectionMode = mode;
  }

  /**
   * Add a MIDI to light mapping
   */
  addMapping(mapping: MidiMapping): void {
    if (mapping.triggerType === 'cc') {
      // CC mapping - store by channel:ccNumber, multiple mappings can share same CC
      const key = this.getCCMappingKey(mapping.ccNumber ?? 0, mapping.midiChannel);
      const existing = this.ccMappings.get(key) || [];

      // Remove any existing mapping with same ccValue (if specified)
      const filtered = existing.filter(m => {
        if (mapping.ccValue !== undefined && m.ccValue !== undefined) {
          return m.ccValue !== mapping.ccValue;
        }
        // For range-based or any-value mappings, check overlap
        return false; // For now, replace existing
      });

      filtered.push(mapping);
      this.ccMappings.set(key, filtered);
    } else {
      // Note mapping (default)
      const key = this.getMappingKey(mapping.midiNote, mapping.midiChannel);
      this.mappings.set(key, mapping);
    }
    this.emit('mappingAdded', mapping);
  }

  /**
   * Remove a mapping
   */
  removeMapping(note: number, channel: number, triggerType?: 'note' | 'cc', ccValue?: number): void {
    if (triggerType === 'cc') {
      // Remove CC mapping
      const key = this.getCCMappingKey(note, channel); // note is ccNumber for CC mappings
      const existing = this.ccMappings.get(key);
      if (existing) {
        if (ccValue !== undefined) {
          // Remove specific value mapping
          const filtered = existing.filter(m => m.ccValue !== ccValue);
          if (filtered.length > 0) {
            this.ccMappings.set(key, filtered);
          } else {
            this.ccMappings.delete(key);
          }
        } else {
          // Remove all mappings for this CC
          this.ccMappings.delete(key);
        }
        this.emit('mappingRemoved', { channel, ccNumber: note, ccValue });
      }
    } else {
      // Remove note mapping
      const key = this.getMappingKey(note, channel);
      const mapping = this.mappings.get(key);
      if (mapping) {
        this.mappings.delete(key);
        this.emit('mappingRemoved', mapping);
      }
    }
  }

  /**
   * Get all mappings (both note and CC)
   */
  getMappings(): MidiMapping[] {
    const noteMappings = Array.from(this.mappings.values());
    const ccMappingArrays = Array.from(this.ccMappings.values());
    const ccMappings = ccMappingArrays.flat();
    return [...noteMappings, ...ccMappings];
  }

  /**
   * Clear all mappings
   */
  clearMappings(): void {
    this.mappings.clear();
    this.ccMappings.clear();
    this.emit('mappingsCleared');
  }

  /**
   * Load mappings from array
   */
  loadMappings(mappings: MidiMapping[]): void {
    this.clearMappings();
    console.log(`[MappingEngine] Loading ${mappings.length} mappings...`);
    mappings.forEach(mapping => {
      console.log(`[MappingEngine] Adding mapping: type=${mapping.triggerType}, channel=${mapping.midiChannel}, ${mapping.triggerType === 'cc' ? `cc=${mapping.ccNumber}, ccValue=${mapping.ccValue}` : `note=${mapping.midiNote}`}`);
      this.addMapping(mapping);
    });
    console.log(`[MappingEngine] Loaded. Note mappings: ${this.mappings.size}, CC mappings keys: ${this.ccMappings.size}`);
    // Log all CC mapping keys
    for (const [key, arr] of this.ccMappings.entries()) {
      console.log(`[MappingEngine] CC key "${key}" has ${arr.length} mapping(s)`);
    }
  }

  loadScenes(scenes: Scene[]): void {
    this.scenes.clear();
    scenes.forEach(scene => this.scenes.set(scene.id, scene));
  }

  updateTempo(bpm: number, timestamp?: number, source: 'midi' | 'manual' = 'midi'): void {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      return;
    }

    const clamped = Math.min(999, Math.max(10, bpm));
    this.tempoBpm = clamped;
    this.tempoSource = source;
    this.lastTempoUpdate = timestamp ?? Date.now();
    this.emit('tempoChanged', { bpm: clamped, source, timestamp: this.lastTempoUpdate });
  }

  getCurrentTempo(): { bpm: number; source: string; updatedAt: number } {
    return {
      bpm: this.tempoBpm,
      source: this.tempoSource,
      updatedAt: this.lastTempoUpdate,
    };
  }

  /**
   * Set the current preset (from Program Change message)
   */
  setCurrentPreset(preset: number): void {
    this.currentPreset = preset;
    console.log(`[MappingEngine] Current preset set to: ${preset}`);
    this.emit('presetChanged', { preset });
  }

  /**
   * Get the current preset number
   */
  getCurrentPreset(): number | null {
    return this.currentPreset;
  }

  beatsToMilliseconds(beats: number): number {
    if (!Number.isFinite(beats) || beats <= 0) {
      return 0;
    }
    if (!this.hasRecentTempo()) {
      return (60000 / 120) * beats;
    }
    return (60000 / this.tempoBpm) * beats;
  }

  private hasRecentTempo(): boolean {
    const age = Date.now() - this.lastTempoUpdate;
    return age < 5000 || this.tempoSource === 'manual';
  }

  upsertScene(scene: Scene): void {
    this.scenes.set(scene.id, scene);
  }

  removeScene(sceneId: string): void {
    this.scenes.delete(sceneId);
  }

  private startAnimation(light: SceneLightState): void {
    const lightId = light.targetId;

    if (light.targetType !== 'light') {
      console.warn(`Animation for target ${lightId} skipped: grouped_light animations not yet supported.`);
      return;
    }

    this.clearAnimation(lightId);

    const animation = light.animation;
    if (!animation || animation.steps.length === 0) {
      return;
    }

    const steps: RuntimeAnimationStep[] = animation.steps.map(step => ({
      id: step.id,
      label: step.label,
      durationBeats: step.durationBeats,
      durationMs: step.durationMs,
      state: this.mergeLightState(light.state, step.state),
    }));

    this.activeAnimations.set(lightId, {
      steps,
      current: 0,
      animation,
      startedAt: Date.now(),
    });

    this.scheduleNextStep(lightId);
  }

  private scheduleNextStep(lightId: string): void {
    const info = this.activeAnimations.get(lightId);
    if (!info) {
      return;
    }

    const step = info.steps[info.current];
    const durationMs = step.durationMs ?? this.beatsToMilliseconds(step.durationBeats ?? 1);
    const clampedDuration = Math.max(10, Math.min(60000, durationMs));

    this.applySceneTarget(lightId, 'light', this.cloneLightState(step.state)).catch((error) => {
      console.warn(`Failed to apply animation step for light ${lightId}:`, error);
    });

    const timer = setTimeout(() => {
      const nextInfo = this.activeAnimations.get(lightId);
      if (!nextInfo) {
        return;
      }
      nextInfo.current = (nextInfo.current + 1) % nextInfo.steps.length;
      this.scheduleNextStep(lightId);
    }, clampedDuration);

    this.animationTimers.set(lightId, timer);
  }

  private mergeLightState(base: LightState, override: LightStateOverride): LightState {
    const merged: LightState = this.cloneLightState(base);

    if (override.on !== undefined) merged.on = override.on;
    if (override.brightness !== undefined) merged.brightness = override.brightness;
    if (override.hue !== undefined) merged.hue = override.hue;
    if (override.saturation !== undefined) merged.saturation = override.saturation;
    if (override.colorTemp !== undefined) merged.colorTemp = override.colorTemp;
    if (override.transitionTime !== undefined) merged.transitionTime = override.transitionTime;

    if (override.effect !== undefined) merged.effect = override.effect;
    if (override.effectColor !== undefined) merged.effectColor = { ...override.effectColor };
    if (override.effectSpeed !== undefined) merged.effectSpeed = override.effectSpeed;
    if (override.effectTemperature !== undefined) merged.effectTemperature = { ...override.effectTemperature };

    if (override.gradient) {
      merged.gradient = override.gradient.map(point => ({ ...point }));
    }
    if (override.gradientMode) {
      merged.gradientMode = override.gradientMode;
    }

    merged.on = merged.on ?? true;
    return merged;
  }

  async previewScene(scene: Scene): Promise<void> {
    await this.stopPreviewScene();
    const applied = await this.executeScene(scene, 127);
    applied.forEach(entry => this.previewLights.add(entry.targetId));
  }

  async stopPreviewScene(): Promise<void> {
    const targets = Array.from(this.previewLights);
    this.previewLights.clear();

    await Promise.all(targets.map(async (lightId) => {
      this.clearAnimation(lightId);
      try {
        const offState: LightState = { on: false };
        await this.setLightState(lightId, offState);
      } catch (error) {
        console.warn(`Failed to stop preview for light ${lightId}:`, error);
      }
    }));
  }

  private lastCommandAt: Map<string, number> = new Map();
  private static readonly MIN_COMMAND_SPACING_MS = 80;

  private async rateLimitedSetLightState(lightId: string, state: LightState): Promise<void> {
    const now = Date.now();
    const lastAt = this.lastCommandAt.get(lightId) ?? 0;
    const elapsed = now - lastAt;

    if (elapsed < MappingEngine.MIN_COMMAND_SPACING_MS) {
      await new Promise(resolve => setTimeout(resolve, MappingEngine.MIN_COMMAND_SPACING_MS - elapsed));
    }

    await this.setLightState(lightId, state);
    this.lastCommandAt.set(lightId, Date.now());
  }

  private clearAnimation(lightId: string): void {
    const timer = this.animationTimers.get(lightId);
    if (timer) {
      clearTimeout(timer);
      this.animationTimers.delete(lightId);
    }
    this.activeAnimations.delete(lightId);
    this.previewLights.delete(lightId);
  }

  /**
   * Process incoming MIDI message
   */
  async processMidiMessage(message: MidiMessage): Promise<void> {
    const key = this.getMappingKey(message.note, message.channel);
    const mapping = this.mappings.get(key);

    if (!mapping) {
      // No mapping for this MIDI note
      return;
    }

    try {
      const sceneId = mapping.sceneId;
      const scene = sceneId ? this.scenes.get(sceneId) : undefined;

      if (scene) {
        const appliedStates = await this.executeScene(scene, message.velocity);
        this.emit('lightControlled', this.buildSceneEventPayload(mapping, message, appliedStates, scene.id));
        return;
      }

      if (sceneId) {
        console.warn(`Scene ${sceneId} referenced by mapping could not be found.`);
        return;
      }

      const lightState = this.createLightState(mapping.action, message.velocity);

      if (!mapping.lightId) {
        throw new Error(`Mapping for note ${mapping.midiNote} channel ${mapping.midiChannel} is missing a lightId`);
      }

      this.clearAnimation(mapping.lightId);

      if (mapping.action.animationPreset && mapping.action.animationPreset !== 'none') {
        await this.setLightStateWithAnimation(mapping.lightId, lightState, mapping.action.animationPreset);
      } else {
        await this.setLightState(mapping.lightId, lightState);
      }

      const appliedState: AppliedSceneState = {
        targetId: mapping.lightId,
        targetType: 'light',
        state: this.cloneLightState(lightState),
      };

      this.emit('lightControlled', this.buildSceneEventPayload(mapping, message, [appliedState], undefined, mapping.lightId));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', {
        message: 'Failed to control light',
        error: errorMessage,
        mapping
      });
    }
  }

  /**
   * Create light state from MIDI action and velocity
   */
  private createLightState(action: MidiAction, velocity: number): LightState {
    const state: LightState = { on: velocity > 0 };

    // Don't set brightness/color properties for note off events (velocity=0)
    // Just turn the light off
    if (velocity === 0) {
      return state;
    }

    switch (action.type) {
      case 'color':
        if (action.colorHue !== undefined) {
          state.hue = action.colorHue;
        }
        if (action.colorSat !== undefined) {
          state.saturation = action.colorSat;
        }
        // Apply brightness based on velocity or fixed value
        if (action.brightnessMode === 'velocity') {
          state.brightness = this.velocityToBrightness(velocity);
        } else if (action.fixedBrightness !== undefined) {
          state.brightness = action.fixedBrightness;
        }
        break;

      case 'brightness':
        if (action.brightnessMode === 'velocity') {
          state.brightness = this.velocityToBrightness(velocity);
        } else if (action.fixedBrightness !== undefined) {
          state.brightness = action.fixedBrightness;
        }
        break;

      case 'toggle':
        // Toggle is handled by on/off based on velocity
        state.on = velocity > 0;
        break;

      case 'effect':
        if (action.effect) {
          state.effect = action.effect;
          state.on = velocity > 0;

          // Include effect color(s) if specified
          if (action.effectColor) {
            state.effectColor = action.effectColor;
          }
          if (action.effectColor2) {
            state.effectColor2 = action.effectColor2;
          }

          // Effect speed (0-1)
          if (action.effectSpeed !== undefined) {
            state.effectSpeed = action.effectSpeed;
          }

          // Effect duration for signaling effects
          if (action.effectDuration !== undefined) {
            state.effectDuration = action.effectDuration;
          }

          // Effect temperature
          if (action.effectTemperature) {
            state.effectTemperature = action.effectTemperature;
          }

          // Set brightness for visual effects
          if (action.fixedBrightness) {
            state.brightness = action.fixedBrightness;
          }
        }
        break;

      case 'gradient':
        if (action.gradientColors && action.gradientColors.length > 0) {
          state.gradient = action.gradientColors;
          state.on = velocity > 0;
        }
        break;
    }

    if (action.transitionTime !== undefined) {
      state.transitionTime = action.transitionTime;
    }

    return state;
  }

  private buildSceneEventPayload(
    mapping: MidiMapping,
    midiMessage: MidiMessage,
    appliedStates: AppliedSceneState[],
    sceneId?: string,
    lightId?: string
  ): LightControlledEventData {
    return {
      midiMessage,
      mapping,
      appliedStates: appliedStates.map(entry => ({
        targetId: entry.targetId,
        targetType: entry.targetType,
        state: this.cloneLightState(entry.state),
      })),
      sceneId,
      lightId,
    };
  }

  private async executeScene(scene: Scene, velocity: number): Promise<AppliedSceneState[]> {
    if (velocity === 0) {
      const offState: LightState = { on: false };
      const offEntries: AppliedSceneState[] = scene.lights.map(light => ({
        targetId: light.targetId,
        targetType: light.targetType,
        state: this.cloneLightState(offState),
      }));

      for (const entry of offEntries) {
        this.clearAnimation(entry.targetId);
        await this.applySceneTarget(entry.targetId, entry.targetType, this.cloneLightState(offState));
      }

      return offEntries;
    }

    const entries: AppliedSceneState[] = [];
    const animationEntries: SceneLightState[] = [];

    for (const light of scene.lights) {
      const baseState = this.applySceneTransition(this.cloneLightState(light.state), scene.transition);
      if (light.animation && light.animation.mode === 'loop' && light.animation.steps.length > 0) {
        animationEntries.push(light);
      } else {
        entries.push({
          targetId: light.targetId,
          targetType: light.targetType,
          state: baseState,
        });
      }
    }

    for (const entry of entries) {
      this.clearAnimation(entry.targetId);
      await this.applySceneTarget(entry.targetId, entry.targetType, this.cloneLightState(entry.state));
    }

    for (const animated of animationEntries) {
      this.startAnimation(animated);
    }

    return [
      ...entries.map(entry => ({
        targetId: entry.targetId,
        targetType: entry.targetType,
        state: this.cloneLightState(entry.state),
      })),
      ...animationEntries.map(light => ({
        targetId: light.targetId,
        targetType: light.targetType,
        state: this.cloneLightState(light.state),
      })),
    ];
  }

  private async applySceneTarget(targetId: string, targetType: SceneLightState['targetType'], state: LightState): Promise<void> {
    if (targetType === 'grouped_light') {
      console.warn(`Grouped light target ${targetId} is not yet supported. Skipping.`);
      return;
    }
    await this.rateLimitedSetLightState(targetId, state);
  }

  private applySceneTransition(state: LightState, transition?: SceneTransition): LightState {
    if (!transition || transition.durationMs === undefined) {
      return state;
    }

    const transitionTime = Math.max(0, Math.round(transition.durationMs / 100));
    if (transitionTime > 0) {
      state.transitionTime = transitionTime;
    }
    return state;
  }

  private cloneLightState(source: LightState): LightState {
    return {
      ...source,
      effectColor: source.effectColor ? { ...source.effectColor } : undefined,
      effectTemperature: source.effectTemperature ? { ...source.effectTemperature } : undefined,
      gradient: source.gradient ? source.gradient.map(point => ({ ...point })) : undefined,
    };
  }

  /**
   * Convert MIDI velocity (0-127) to Hue brightness (0-254)
   */
  private velocityToBrightness(velocity: number): number {
    return Math.round((velocity / 127) * 254);
  }

  /**
   * Set light state using the appropriate controller
   */
  private async setLightState(lightId: string, state: LightState): Promise<void> {
    // Check if this light is connected via Bluetooth first
    const isBluetoothLight = this.bluetoothController?.isLightConnected(lightId) || false;

    if (isBluetoothLight && this.bluetoothController) {
      // Use Bluetooth controller for Bluetooth-connected lights
      await this.bluetoothController.setLightState(lightId, state);
      return;
    }

    // Otherwise use Bridge controller
    if (this.bridgeController) {
      const effect = state.effect;

      // Handle native Hue V2 effects (sparkle, fire, candle, etc.)
      if (effect && MappingEngine.NATIVE_EFFECTS_SET.has(effect)) {
        try {
          await this.bridgeController.setDynamicEffect(
            lightId,
            effect,
            undefined,
            { color: state.effectColor, speed: state.effectSpeed, colorTemperature: state.effectTemperature }
          );
          return;
        } catch (error) {
          console.warn('Failed to set native effect, falling back to standard control:', error);
        }
      }

      // Handle signaling effects (flash, flash_color, alternating)
      if (effect && MappingEngine.SIGNALING_EFFECTS_SET.has(effect)) {
        try {
          const duration = state.effectDuration ?? 2000; // Default 2 seconds

          if (effect === 'flash') {
            // Simple on/off flash
            await this.bridgeController.setSignaling(lightId, 'on_off', duration);
          } else if (effect === 'flash_color') {
            // Flash with a specific color
            const colors = state.effectColor ? [state.effectColor] : undefined;
            await this.bridgeController.setSignaling(lightId, 'on_off_color', duration, colors);
          } else if (effect === 'alternating') {
            // Alternate between two colors
            const colors: Array<{ x: number; y: number }> = [];
            if (state.effectColor) colors.push(state.effectColor);
            if (state.effectColor2) colors.push(state.effectColor2);
            await this.bridgeController.setSignaling(lightId, 'alternating', duration, colors.length > 0 ? colors : undefined);
          }
          return;
        } catch (error) {
          console.warn('Failed to set signaling effect:', error);
        }
      }

      // Handle custom effects (pulse, strobe, color_cycle, breathe)
      if (effect && MappingEngine.CUSTOM_EFFECTS_SET.has(effect)) {
        try {
          if (effect === 'pulse') {
            // Use the Hue "breathe" alert for a single pulse
            await this.bridgeController.triggerBreathe(lightId);
          } else if (effect === 'color_cycle' || effect === 'colorloop') {
            // Map colorloop/color_cycle to prism effect (closest equivalent in V2)
            await this.bridgeController.setDynamicEffect(
              lightId,
              'prism',
              undefined,
              { speed: state.effectSpeed ?? 0.5 }
            );
          } else if (effect === 'strobe') {
            // Rapid on/off using signaling with short duration
            const duration = state.effectDuration ?? 5000;
            await this.bridgeController.setSignaling(lightId, 'on_off', duration);
          } else if (effect === 'breathe') {
            // Slow breathing effect - trigger multiple breathe cycles
            await this.bridgeController.triggerBreathe(lightId);
          }
          return;
        } catch (error) {
          console.warn('Failed to set custom effect:', error);
        }
      }

      // Handle legacy colorloop
      if (effect === 'colorloop') {
        try {
          // Map to prism effect in V2 API
          await this.bridgeController.setDynamicEffect(
            lightId,
            'prism',
            undefined,
            { speed: state.effectSpeed ?? 0.5 }
          );
          return;
        } catch (error) {
          console.warn('Failed to set colorloop via prism, falling back to V1:', error);
          // Fall through to V1 API
        }
      }

      // Handle gradient if present
      if (state.gradient) {
        try {
          await this.bridgeController.setGradient(lightId, state.gradient, state.gradientMode);
          return;
        } catch (error) {
          console.warn('Failed to set gradient:', error);
        }
      }

      // Use v2 API for color changes (better performance and instant transitions)
      if (state.hue !== undefined && state.saturation !== undefined) {
        try {
          await this.bridgeController.setLightColorV2(lightId, state.hue, state.saturation, state.brightness);

          // Handle on/off separately if needed
          if (state.on === false) {
            await this.bridgeController.setLightState(lightId, { on: false });
          }

          return;
        } catch (error) {
          console.warn('Failed to set color via v2 API, falling back to v1:', error);
          // Fall through to standard control
        }
      }

      // Standard light state control (v1 API fallback)
      await this.bridgeController.setLightState(lightId, state);
    } else {
      throw new Error('No controller available for this light');
    }
  }

  /**
   * Set light state with spring animation
   */
  private async setLightStateWithAnimation(
    lightId: string,
    targetState: LightState,
    preset: 'bounceIn' | 'bounceOut' | 'gentle' | 'wobbly' | 'stiff' | 'slow' | 'snappy'
  ): Promise<void> {
    // Get current state (or default)
    const currentState = this.lightStates.get(lightId) || {
      brightness: 0,
      hue: 0,
      saturation: 0,
    };

    // Build target animation state
    const targetAnimation: AnimationTarget = {};
    if (targetState.brightness !== undefined) {
      targetAnimation.brightness = targetState.brightness;
    }
    if (targetState.hue !== undefined) {
      targetAnimation.hue = targetState.hue;
    }
    if (targetState.saturation !== undefined) {
      targetAnimation.saturation = targetState.saturation;
    }

    // Turn light on first if needed
    if (targetState.on && currentState.brightness === 0) {
      await this.setLightState(lightId, { on: true, brightness: 1, transitionTime: 0 });
    }

    // Animate the properties
    await this.animator.animateLight(
      lightId,
      currentState,
      targetAnimation,
      preset,
      async (intermediateState) => {
        const state: LightState = {
          on: true,
          ...intermediateState,
          transitionTime: 0, // No transition time during animation frames
        };
        await this.setLightState(lightId, state);
      }
    );

    // Store final state
    this.lightStates.set(lightId, targetAnimation);

    // Turn off if needed
    if (!targetState.on) {
      await this.setLightState(lightId, { on: false, transitionTime: 2 });
    }
  }

  /**
   * Generate mapping key from note and channel
   */
  private getMappingKey(note: number, channel: number): string {
    return `${channel}:${note}`;
  }

  /**
   * Generate mapping key from CC number and channel
   */
  private getCCMappingKey(ccNumber: number, channel: number): string {
    return `cc:${channel}:${ccNumber}`;
  }

  /**
   * Process incoming MIDI CC message
   */
  async processCCMessage(message: MidiCCMessage): Promise<void> {
    const key = this.getCCMappingKey(message.controller, message.channel);
    console.log(`[MappingEngine] Processing CC: key=${key}, value=${message.value}`);

    // Debounce: skip duplicate CC messages within the debounce window
    const lastCC = this.lastCCMessages.get(key);
    const now = Date.now();
    if (lastCC && lastCC.value === message.value && (now - lastCC.timestamp) < MappingEngine.CC_DEBOUNCE_MS) {
      console.log(`[MappingEngine] Skipping duplicate CC (debounce)`);
      return;
    }
    this.lastCCMessages.set(key, { value: message.value, timestamp: now });

    const mappings = this.ccMappings.get(key);
    console.log(`[MappingEngine] Found ${mappings?.length ?? 0} mapping(s) for key ${key}`);

    if (!mappings || mappings.length === 0) {
      // No mapping for this CC
      console.log(`[MappingEngine] No CC mappings found for ${key}`);
      return;
    }

    // Find matching mapping(s) based on CC value and preset
    const matchingMappings = mappings.filter(mapping => {
      // Check preset filter first - if mapping specifies a preset, it must match current preset
      if (mapping.preset !== undefined) {
        if (this.currentPreset !== mapping.preset) {
          console.log(`[MappingEngine] Skipping mapping - preset mismatch (mapping.preset=${mapping.preset}, currentPreset=${this.currentPreset})`);
          return false;
        }
      }

      // Exact value match
      if (mapping.ccValue !== undefined) {
        const matches = message.value === mapping.ccValue;
        console.log(`[MappingEngine] Checking ccValue: mapping.ccValue=${mapping.ccValue}, message.value=${message.value}, matches=${matches}`);
        return matches;
      }
      // Range match
      if (mapping.ccValueMin !== undefined && mapping.ccValueMax !== undefined) {
        return message.value >= mapping.ccValueMin && message.value <= mapping.ccValueMax;
      }
      // Any value (no ccValue specified)
      console.log(`[MappingEngine] Mapping has no ccValue filter, will match`);
      return true;
    });

    console.log(`[MappingEngine] ${matchingMappings.length} mapping(s) matched after filtering`);


    for (const mapping of matchingMappings) {
      try {
        const sceneId = mapping.sceneId;
        const scene = sceneId ? this.scenes.get(sceneId) : undefined;

        // For CC mappings with a specific value match (like Helix snapshots),
        // the CC value is just an identifier, not a brightness level.
        // Treat the trigger as "full on" (127) unless using "any value" mode
        // where the CC value controls brightness (like an expression pedal).
        const velocity = mapping.ccValue !== undefined ? 127 : message.value;

        if (scene) {
          const appliedStates = await this.executeScene(scene, velocity);
          this.emit('lightControlled', this.buildCCEventPayload(mapping, message, appliedStates, scene.id));
          continue;
        }

        if (sceneId) {
          console.warn(`Scene ${sceneId} referenced by CC mapping could not be found.`);
          continue;
        }

        const lightState = this.createLightState(mapping.action, velocity);

        if (!mapping.lightId) {
          throw new Error(`CC mapping for CC${mapping.ccNumber} channel ${mapping.midiChannel} is missing a lightId`);
        }

        this.clearAnimation(mapping.lightId);

        if (mapping.action.animationPreset && mapping.action.animationPreset !== 'none') {
          await this.setLightStateWithAnimation(mapping.lightId, lightState, mapping.action.animationPreset);
        } else {
          await this.setLightState(mapping.lightId, lightState);
        }

        const appliedState: AppliedSceneState = {
          targetId: mapping.lightId,
          targetType: 'light',
          state: this.cloneLightState(lightState),
        };

        this.emit('lightControlled', this.buildCCEventPayload(mapping, message, [appliedState], undefined, mapping.lightId));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emit('error', {
          message: 'Failed to control light via CC',
          error: errorMessage,
          mapping
        });
      }
    }
  }

  /**
   * Build event payload for CC-triggered light control
   */
  private buildCCEventPayload(
    mapping: MidiMapping,
    ccMessage: MidiCCMessage,
    appliedStates: AppliedSceneState[],
    sceneId?: string,
    lightId?: string
  ): LightControlledEventData {
    // Convert CC message to MidiMessage format for consistency
    const midiMessage: MidiMessage = {
      channel: ccMessage.channel,
      note: ccMessage.controller,
      velocity: ccMessage.value,
      timestamp: ccMessage.timestamp,
    };

    return {
      midiMessage,
      mapping,
      appliedStates: appliedStates.map(entry => ({
        targetId: entry.targetId,
        targetType: entry.targetType,
        state: this.cloneLightState(entry.state),
      })),
      sceneId,
      lightId,
    };
  }
}
type RuntimeAnimationStep = {
  id: string;
  label?: string;
  durationBeats?: number;
  durationMs?: number;
  state: LightState;
};
