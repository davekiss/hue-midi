export interface MidiMessage {
  channel: number;
  note: number;
  velocity: number;
  timestamp: number;
}

export interface MidiCCMessage {
  channel: number;
  controller: number;
  value: number;
  timestamp: number;
}

export interface MidiPCMessage {
  channel: number;
  program: number;
  timestamp: number;
}

export interface HueLight {
  id: string;
  name: string;
  type: 'bulb' | 'strip' | 'other';
  productName?: string;
  modelId?: string;
  capabilities: {
    color: boolean;
    brightness: boolean;
    effects: boolean;
    gradient?: boolean;
    streaming?: boolean;
    availableEffects?: string[];
    minDimlevel?: number;
    maxLumen?: number;
  };
}

export interface HueLightsResponse {
  lights: HueLight[];
  bridgeConnected?: boolean;
  bridgeError?: string;
}

export type GradientMode =
  | 'interpolated_palette'
  | 'interpolated_palette_mirrored'
  | 'random_pixelated'
  | 'segmented_palette';

// Native Hue V2 effects (handled by the Hue bridge)
export type HueNativeEffect =
  | 'sparkle'
  | 'fire'
  | 'candle'
  | 'prism'
  | 'opal'
  | 'glisten'
  | 'underwater'
  | 'cosmos'
  | 'sunbeam'
  | 'enchant';

// Signaling effects (use Hue signaling API)
export type HueSignalingEffect =
  | 'flash'           // on_off signaling
  | 'flash_color'     // on_off_color signaling with a color
  | 'alternating';    // alternating between 2 colors

// Custom effects (implemented by our CustomEffectsEngine with speed control)
export type CustomEffect =
  | 'strobe'          // rapid on/off at configurable speed
  | 'police'          // alternating red/blue (emergency lights)
  | 'ambulance'       // alternating red/white
  | 'lightning'       // random bright flashes
  | 'color_flash'     // flash between two selected colors
  | 'breathe_smooth'  // smooth sine-wave brightness fade
  | 'chase'           // color chase/rotation
  | 'desert'          // warm dusty colors, heat shimmer, tumbleweed vibe
  | 'tv_flicker';     // TV glow through window/blinds

// Legacy effects (mapped to new ones for backwards compatibility)
export type LegacyEffect =
  | 'colorloop'       // maps to prism
  | 'pulse'           // maps to breathe_smooth
  | 'breathe'         // maps to breathe_smooth
  | 'color_cycle';    // maps to chase

export type LightEffect = 'none' | HueNativeEffect | HueSignalingEffect | CustomEffect | LegacyEffect;

export interface LightState {
  on: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  colorTemp?: number;
  effect?: LightEffect;
  effectColor?: { x: number; y: number };   // XY color for effects
  effectColor2?: { x: number; y: number };  // Second color for alternating effects
  effectSpeed?: number;                      // 0-1 for native Hue effects
  effectBpm?: number;                        // BPM for custom effects (20-300)
  effectDuration?: number;                   // Duration in ms for signaling effects
  effectIntensity?: number;                  // 0-1 intensity for effects like lightning
  effectTemperature?: { mirek: number };
  transitionTime?: number;
  gradient?: Array<{ x: number; y: number }>;
  gradientMode?: GradientMode;
}

export type LightStateOverride = Partial<LightState>;

export interface LightAnimationStep {
  id: string;
  label?: string;
  durationBeats?: number;
  durationMs?: number;
  state: LightStateOverride;
}

export interface LightAnimationSync {
  groupId?: string;
  beatDivision?: '1' | '1/2' | '1/4' | '1/8' | '1/16';
}

export type SceneAnimationPresetId = 'chase' | 'gradientCrossfade' | 'lightning';

export interface ChaseAnimationPresetParams {
  palette?: Array<{ x: number; y: number }>;
  beatsPerStep?: number;
  stopCount?: number;
  stepCount?: number;
  gradientMode?: GradientMode;
}

export interface GradientCrossfadePresetParams {
  fromGradient?: Array<{ x: number; y: number }>;
  toGradient: Array<{ x: number; y: number }>;
  totalBeats?: number;
  stepSubdivision?: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  gradientMode?: GradientMode;
}

export interface LightningAnimationPresetParams {
  palette?: Array<{ x: number; y: number }>;
  flashCount?: number;
  flashBeats?: number;
  calmBeats?: number;
  randomness?: number;
  seed?: number;
  settleBeats?: number;
  brightnessScale?: number;
}

export type SceneAnimationPreset =
  | { id: 'chase'; version?: number; params: ChaseAnimationPresetParams }
  | { id: 'gradientCrossfade'; version?: number; params: GradientCrossfadePresetParams }
  | { id: 'lightning'; version?: number; params: LightningAnimationPresetParams };

export interface LightAnimation {
  mode: 'loop';
  steps: LightAnimationStep[];
  sync?: LightAnimationSync;
  preset?: SceneAnimationPreset;
}

export interface MidiMapping {
  // Trigger type: 'note' for MIDI notes (default), 'cc' for Control Change
  triggerType?: 'note' | 'cc';

  // For note triggers (triggerType === 'note' or undefined)
  midiNote: number;
  midiChannel: number;

  // For CC triggers (triggerType === 'cc')
  ccNumber?: number;        // CC number (0-127), e.g., 69 for Helix snapshots
  ccValue?: number;         // Specific CC value to trigger on (0-127), or undefined for any value
  ccValueMin?: number;      // Min value in range (for range-based triggers)
  ccValueMax?: number;      // Max value in range (for range-based triggers)

  // Optional preset filtering - only trigger when on this preset (Program Change number)
  preset?: number;          // PC number (0-127) this mapping applies to, or undefined for any preset

  lightId: string;
  action: MidiAction;
  name?: string;  // Optional name for the mapping
  sceneId?: string;
}

export interface MidiAction {
  type: 'color' | 'brightness' | 'toggle' | 'effect' | 'gradient';
  colorHue?: number;
  colorSat?: number;
  brightnessMode?: 'fixed' | 'velocity';
  fixedBrightness?: number;
  effect?: LightEffect;
  effectColor?: { x: number; y: number };   // XY color for effects
  effectColor2?: { x: number; y: number };  // Second color for alternating effects
  effectSpeed?: number;                      // 0-1 for native Hue effects
  effectBpm?: number;                        // BPM for custom effects (20-300)
  effectDuration?: number;                   // Duration in ms for signaling effects
  effectIntensity?: number;                  // 0-1 intensity for effects like lightning
  effectTemperature?: { mirek: number };
  transitionTime?: number;
  // Spring animation settings
  animationPreset?: 'bounceIn' | 'bounceOut' | 'gentle' | 'wobbly' | 'stiff' | 'slow' | 'snappy' | 'none';
  // Gradient settings (for gradient-capable lights)
  gradientColors?: Array<{ x: number; y: number }>;
}

export interface SceneTransition {
  durationMs?: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'sine' | 'bounce';
  staggerMs?: number;
}

export interface SceneLightState {
  targetId: string;
  targetType: 'light' | 'grouped_light';
  state: LightState;
  animation?: LightAnimation;
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  transition?: SceneTransition;
  lights: SceneLightState[];
  metadata?: Record<string, unknown>;
}

export interface Config {
  bridgeIp?: string;
  bridgeUsername?: string;
  mappings: MidiMapping[];
  midiPortName?: string;
  scenes: Scene[];
  streaming?: {
    enabled: boolean;
    clientKey?: string;
  };
}
