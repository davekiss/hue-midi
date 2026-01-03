import axios, { AxiosInstance } from 'axios';
import https from 'https';

export interface HueApiErrorDetail {
  description: string;
}

export class HueApiError extends Error {
  constructor(message: string, public readonly errors: HueApiErrorDetail[]) {
    super(message);
    this.name = 'HueApiError';
  }
}

export type ResourceType =
  | 'device'
  | 'bridge_home'
  | 'room'
  | 'zone'
  | 'service_group'
  | 'light'
  | 'button'
  | 'bell_button'
  | 'relative_rotary'
  | 'temperature'
  | 'light_level'
  | 'motion'
  | 'camera_motion'
  | 'entertainment'
  | 'contact'
  | 'tamper'
  | 'convenience_area_motion'
  | 'security_area_motion'
  | 'speaker'
  | 'grouped_light'
  | 'grouped_motion'
  | 'grouped_light_level'
  | 'device_power'
  | 'device_software_update'
  | 'zigbee_connectivity'
  | 'zgp_connectivity'
  | 'bridge'
  | 'motion_area_candidate'
  | 'wifi_connectivity'
  | 'zigbee_device_discovery'
  | 'homekit'
  | 'matter'
  | 'matter_fabric'
  | 'scene'
  | 'entertainment_configuration'
  | 'public_image'
  | 'auth_v1'
  | 'behavior_script'
  | 'behavior_instance'
  | 'geofence_client'
  | 'geolocation'
  | 'smart_scene'
  | 'motion_area_configuration'
  | 'clip';

export type LightArchetype =
  | 'unknown_archetype'
  | 'classic_bulb'
  | 'sultan_bulb'
  | 'flood_bulb'
  | 'spot_bulb'
  | 'candle_bulb'
  | 'luster_bulb'
  | 'pendant_round'
  | 'pendant_long'
  | 'ceiling_round'
  | 'ceiling_square'
  | 'floor_shade'
  | 'floor_lantern'
  | 'table_shade'
  | 'recessed_ceiling'
  | 'recessed_floor'
  | 'single_spot'
  | 'double_spot'
  | 'table_wash'
  | 'wall_lantern'
  | 'wall_shade'
  | 'flexible_lamp'
  | 'ground_spot'
  | 'wall_spot'
  | 'plug'
  | 'hue_go'
  | 'hue_lightstrip'
  | 'hue_iris'
  | 'hue_bloom'
  | 'bollard'
  | 'wall_washer'
  | 'hue_play'
  | 'vintage_bulb'
  | 'vintage_candle_bulb'
  | 'ellipse_bulb'
  | 'triangle_bulb'
  | 'small_globe_bulb'
  | 'large_globe_bulb'
  | 'edison_bulb'
  | 'christmas_tree'
  | 'string_light'
  | 'hue_centris'
  | 'hue_lightstrip_tv'
  | 'hue_lightstrip_pc'
  | 'hue_tube'
  | 'hue_signe'
  | 'pendant_spot'
  | 'ceiling_horizontal'
  | 'ceiling_tube'
  | 'up_and_down'
  | 'up_and_down_up'
  | 'up_and_down_down'
  | 'hue_floodlight_camera'
  | 'twilight'
  | 'twilight_front'
  | 'twilight_back'
  | 'hue_play_wallwasher'
  | 'hue_omniglow'
  | 'hue_neon'
  | 'string_globe'
  | 'string_permanent';

export type LightFunction = 'functional' | 'decorative' | 'mixed' | 'unknown';

export interface ResourceIdentifier {
  rid: string;
  rtype: ResourceType;
}

export interface LightMetadata {
  name: string;
  archetype: LightArchetype;
  function: LightFunction;
  fixed_mired?: number;
  product_data?: {
    name?: string;
    archetype?: LightArchetype;
    function: LightFunction;
  };
}

export interface IdentifyFeature {
  service_id: number;
}

export interface OnFeature {
  on: boolean;
}

export interface DimmingFeature {
  brightness: number;
  min_dim_level?: number;
}

export type DeltaAction = 'up' | 'down' | 'stop';

export interface DimmingDeltaFeature {
  action: DeltaAction;
  brightness_delta?: number;
}

export interface MirekSchema {
  mirek_minimum: number;
  mirek_maximum: number;
}

export interface ColorTemperatureFeature {
  mirek: number | null;
  mirek_valid: boolean;
  mirek_schema: MirekSchema;
}

export interface ColorTemperatureDeltaFeature {
  action: DeltaAction;
  mirek_delta: number;
}

export interface XYPoint {
  x: number;
  y: number;
}

export interface ColorGamut {
  red: XYPoint;
  green: XYPoint;
  blue: XYPoint;
}

export type GamutType = 'A' | 'B' | 'C' | 'other';

export interface ColorFeature {
  xy: XYPoint;
  gamut?: ColorGamut;
  gamut_type?: GamutType;
}

export type DynamicsStatus = 'dynamic_palette' | 'none';

export interface DynamicsFeature {
  status: DynamicsStatus;
  status_values: DynamicsStatus[];
  speed: number;
  speed_valid: boolean;
}

export interface AlertFeature {
  action_values: string[];
}

export type LightSignal = 'no_signal' | 'on_off' | 'on_off_color' | 'alternating';

export interface SignalStatus {
  signal: LightSignal;
  estimated_end: string;
  colors?: ColorFeature[];
}

export interface SignalingFeature {
  signal_values: LightSignal[];
  status?: SignalStatus;
}

export type LightMode = 'normal' | 'streaming';

export type GradientMode =
  | 'interpolated_palette'
  | 'interpolated_palette_mirrored'
  | 'random_pixelated'
  | 'segmented_palette';

export interface GradientPoint {
  color: { xy: XYPoint };
}

export interface GradientFeature {
  points: GradientPoint[];
  mode: GradientMode;
  points_capable: number;
  mode_values: GradientMode[];
  pixel_count?: number;
}

export type LightEffect =
  | 'prism'
  | 'opal'
  | 'glisten'
  | 'sparkle'
  | 'fire'
  | 'candle'
  | 'underwater'
  | 'cosmos'
  | 'sunbeam'
  | 'enchant'
  | 'no_effect';

export interface EffectsFeature {
  status_values: LightEffect[];
  status: LightEffect;
  effect_values: LightEffect[];
}

export interface EffectsV2ActionParameters {
  color?: { xy: XYPoint };
  color_temperature?: { mirek: number; mirek_valid?: boolean };
  speed?: number;
}

export interface EffectsV2Action {
  effect: LightEffect;
  parameters?: EffectsV2ActionParameters;
}

export interface EffectsV2ActionState {
  effect_values: LightEffect[];
  effect?: LightEffect;
  parameters?: EffectsV2ActionParameters;
}

export interface EffectsV2StatusState {
  effect: LightEffect;
  effect_values: LightEffect[];
  parameters?: EffectsV2ActionParameters;
}

export interface EffectsV2Feature {
  action: EffectsV2ActionState;
  status: EffectsV2StatusState;
}

export type TimedEffect = 'sunrise' | 'sunset' | 'no_effect';

export interface TimedEffectsFeature {
  status_values: TimedEffect[];
  status: TimedEffect;
  effect_values: TimedEffect[];
}

export type PowerupPreset = 'safety' | 'powerfail' | 'last_on_state' | 'custom';
export type PowerupOnMode = 'on' | 'toggle' | 'previous';
export type PowerupDimmingMode = 'dimming' | 'previous';
export type PowerupColorMode = 'color_temperature' | 'color' | 'previous';

export interface PowerupOnFeature {
  on?: boolean;
}

export interface PowerupDimmingFeature {
  brightness: number;
}

export interface PowerupColorTemperatureFeature {
  mirek: number;
}

export interface PowerupColorFeature {
  xy: XYPoint;
}

export interface PowerupFeature {
  preset: PowerupPreset;
  configured: boolean;
  on: {
    mode: PowerupOnMode;
    on?: PowerupOnFeature;
  };
  dimming?: {
    mode: PowerupDimmingMode;
    dimming?: PowerupDimmingFeature;
  };
  color?: {
    mode: PowerupColorMode;
    color_temperature?: PowerupColorTemperatureFeature;
    color?: PowerupColorFeature;
  };
}

export type ContentConfigurationStatus = 'set' | 'changing';
export type ContentOrientation = 'horizontal' | 'vertical';
export type ContentOrder = 'forward' | 'reversed';

export interface ContentOrientationFeature {
  status: ContentConfigurationStatus;
  configurable: boolean;
  orientation: ContentOrientation;
}

export interface ContentOrderFeature {
  status: ContentConfigurationStatus;
  configurable: boolean;
  order: ContentOrder;
}

export interface ContentConfigurationFeature {
  orientation?: ContentOrientationFeature;
  order?: ContentOrderFeature;
}

export interface HueLightResource {
  id: string;
  id_v1?: string;
  owner: ResourceIdentifier;
  type: 'light';
  metadata: LightMetadata;
  identify: IdentifyFeature;
  on: OnFeature;
  dimming?: DimmingFeature;
  dimming_delta?: DimmingDeltaFeature;
  color_temperature?: ColorTemperatureFeature;
  color_temperature_delta?: ColorTemperatureDeltaFeature;
  color?: ColorFeature;
  dynamics?: DynamicsFeature;
  alert?: AlertFeature;
  signaling?: SignalingFeature;
  mode: LightMode;
  gradient?: GradientFeature;
  effects?: EffectsFeature;
  effects_v2?: EffectsV2Feature;
  timed_effects?: TimedEffectsFeature;
  powerup?: PowerupFeature;
  content_configuration?: ContentConfigurationFeature;
}

export interface LightMetadataUpdate {
  name?: string;
  archetype?: LightArchetype;
  function?: LightFunction;
}

export interface IdentifyAction {
  action: 'identify';
  duration?: number;
}

export interface OnUpdate {
  on?: boolean;
}

export interface DimmingUpdate {
  brightness?: number;
}

export interface ColorTemperatureUpdate {
  mirek?: number | null;
}

export interface ColorUpdate {
  xy: XYPoint;
}

export interface DynamicsUpdate {
  duration?: number;
  speed?: number;
}

export interface AlertUpdate {
  action: 'breathe';
}

export interface SignalingUpdate {
  signal: LightSignal;
  duration: number;
  colors?: Array<{ xy: XYPoint }>;
}

export interface GradientUpdate {
  points: GradientPoint[];
  mode?: GradientMode;
}

export interface EffectsUpdate {
  effect: LightEffect;
}

export interface EffectsV2Update {
  action: EffectsV2Action;
}

export interface TimedEffectsUpdate {
  effect: TimedEffect;
  duration?: number;
}

export interface PowerupUpdate {
  preset: PowerupPreset;
  on?: {
    mode: PowerupOnMode;
    on?: PowerupOnFeature;
  };
  dimming?: {
    mode: PowerupDimmingMode;
    dimming?: PowerupDimmingFeature;
  };
  color?: {
    mode: PowerupColorMode;
    color_temperature?: PowerupColorTemperatureFeature;
    color?: PowerupColorFeature;
  };
}

export interface ContentConfigurationUpdate {
  orientation?: {
    orientation: ContentOrientation;
  };
  order?: {
    order: ContentOrder;
  };
}

export interface LightUpdateRequest {
  type?: 'light';
  metadata?: LightMetadataUpdate;
  function?: LightFunction;
  identify?: IdentifyAction;
  on?: OnUpdate;
  dimming?: DimmingUpdate;
  dimming_delta?: DimmingDeltaFeature;
  color_temperature?: ColorTemperatureUpdate;
  color_temperature_delta?: ColorTemperatureDeltaFeature;
  color?: ColorUpdate;
  dynamics?: DynamicsUpdate;
  alert?: AlertUpdate;
  signaling?: SignalingUpdate;
  gradient?: GradientUpdate;
  effects?: EffectsUpdate;
  effects_v2?: EffectsV2Update;
  timed_effects?: TimedEffectsUpdate;
  powerup?: PowerupUpdate;
  content_configuration?: ContentConfigurationUpdate;
}

export interface HueApiEnvelope<T> {
  errors: HueApiErrorDetail[];
  data: T[];
}

export interface HueLightClientOptions {
  bridgeIp: string;
  applicationKey: string;
  timeoutMs?: number;
}

export class HueLightClient {
  private readonly client: AxiosInstance;

  constructor(options: HueLightClientOptions) {
    this.client = axios.create({
      baseURL: `https://${options.bridgeIp}/clip/v2`,
      headers: {
        'hue-application-key': options.applicationKey,
      },
      timeout: options.timeoutMs ?? 5000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  async list(): Promise<HueLightResource[]> {
    return this.request<HueLightResource>({
      method: 'get',
      url: '/resource/light',
    });
  }

  async get(lightId: string): Promise<HueLightResource> {
    const items = await this.request<HueLightResource>({
      method: 'get',
      url: `/resource/light/${lightId}`,
    });

    const resource = items[0];
    if (!resource) {
      throw new Error(`Light ${lightId} was not returned by the Hue API`);
    }

    return resource;
  }

  async update(lightId: string, payload: LightUpdateRequest): Promise<HueLightResource[]> {
    return this.request<HueLightResource>({
      method: 'put',
      url: `/resource/light/${lightId}`,
      data: payload,
    });
  }

  private async request<T>(config: { method: 'get' | 'put'; url: string; data?: unknown }): Promise<T[]> {
    try {
      const response = await this.client.request<HueApiEnvelope<T>>(config);
      return this.unwrap(response.data);
    } catch (error: any) {
      if (error.response?.data?.errors) {
        const envelope = error.response.data as HueApiEnvelope<T>;
        throw new HueApiError('Hue API request failed', envelope.errors);
      }
      throw error;
    }
  }

  private unwrap<T>(envelope: HueApiEnvelope<T>): T[] {
    if (envelope.errors && envelope.errors.length > 0) {
      throw new HueApiError('Hue API reported one or more errors', envelope.errors);
    }
    return envelope.data ?? [];
  }
}
