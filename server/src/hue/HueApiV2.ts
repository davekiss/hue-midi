import axios, { AxiosInstance } from 'axios';
import https from 'https';
import {
  HueLightClient,
  HueLightResource,
  LightUpdateRequest,
  LightEffect,
  GradientPoint,
  GradientMode,
  LightSignal,
  XYPoint,
} from './HueLightClient';

/**
 * Hue API v2 Client for advanced features like dynamic effects and gradients
 * The node-hue-api library doesn't support v2 API features yet, so we implement them directly
 */
export class HueApiV2 {
  private client: AxiosInstance;
  private bridgeIp: string;
  private username: string;
  private readonly lightClient: HueLightClient;

  constructor(bridgeIp: string, username: string) {
    this.bridgeIp = bridgeIp;
    this.username = username;
    this.lightClient = new HueLightClient({
      bridgeIp,
      applicationKey: username,
    });

    // Create axios instance with SSL verification disabled for local bridge
    this.client = axios.create({
      baseURL: `https://${bridgeIp}/clip/v2`,
      headers: {
        'hue-application-key': username,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Hue bridge uses self-signed cert
      }),
    });
  }

  /**
   * Get all lights with v2 API capabilities
   */
  async getLights(): Promise<HueLightResource[]> {
    try {
      const lights = await this.lightClient.list();
      return lights;
    } catch (error: any) {
      console.error('Failed to get lights from API v2:', error.message ?? error);
      return [];
    }
  }

  /**
   * Update light state via V2 API
   */
  async updateLight(lightId: string, payload: any): Promise<void> {
    try {
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      console.error('Failed to update light via V2 API:', error.message ?? error);
      throw error;
    }
  }

  /**
   * Get all scenes including dynamic scenes
   */
  async getScenes(): Promise<any[]> {
    try {
      const response = await this.client.get('/resource/scene');
      return response.data.data || [];
    } catch (error: any) {
      console.error('Failed to get scenes from API v2:', error.message);
      return [];
    }
  }

  /**
   * Activate a scene (including dynamic scenes)
   */
  async activateScene(sceneId: string): Promise<void> {
    try {
      await this.client.put(`/resource/scene/${sceneId}`, {
        recall: { action: 'active' },
      });
    } catch (error: any) {
      throw new Error(`Failed to activate scene: ${error.message}`);
    }
  }

  /**
   * Set light state with v2 API (supports effects like sparkle, fire, candle)
   */
  async setLightEffect(
    lightId: string,
    effect: string,
    options?: {
      duration?: number;
      color?: { x: number; y: number };
      speed?: number;
      colorTemperature?: { mirek: number };
    }
  ): Promise<void> {
    try {
      // Map effect names to v2 API effect identifiers
      const effectMap: { [key: string]: string } = {
        sparkle: 'sparkle',
        fire: 'fire',
        candle: 'candle',
        fireplace: 'fire', // fireplace is alias for fire
        prism: 'prism',
        opal: 'opal',
        glisten: 'glisten',
        underwater: 'underwater',
        cosmos: 'cosmos',
        sunbeam: 'sunbeam',
        enchant: 'enchant',
      };

      const mappedEffect = (effectMap[effect] || effect) as LightEffect;

      const payload: LightUpdateRequest = {
        on: { on: true },
        dynamics: {
          duration: options?.duration ?? 0  // 0 = instant transition
        },
        effects_v2: {
          action: {
            effect: mappedEffect,
            parameters: undefined,
          }
        }
      };

      const parameters: NonNullable<LightUpdateRequest['effects_v2']>['action']['parameters'] = {};
      if (options?.color) {
        parameters.color = { xy: options.color };
      }
      if (options?.colorTemperature) {
        parameters.color_temperature = options.colorTemperature;
      }
      if (options?.speed !== undefined) {
        parameters.speed = options.speed;
      }

      const hasParameters = Object.keys(parameters).length > 0;
      if (hasParameters) {
        payload.effects_v2 = {
          action: {
            effect: mappedEffect,
            parameters,
          },
        };
      } else {
        payload.effects_v2 = {
          action: {
            effect: mappedEffect,
          },
        };
      }

      console.log('Sending v2 API effect request:', JSON.stringify(payload, null, 2));
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to set light effect: ${error.message}`);
    }
  }

  /**
   * Set light color using v2 API
   * @param transitionMs - Optional transition duration in milliseconds (0 = instant)
   */
  async setLightColor(lightId: string, xy: { x: number; y: number }, brightness?: number, transitionMs?: number): Promise<void> {
    try {
      const payload: LightUpdateRequest = {
        on: { on: true },
        color: {
          xy: xy
        },
        dynamics: {
          duration: transitionMs ?? 0  // Default to instant transition
        }
      };

      if (brightness !== undefined) {
        // Convert 0-254 to 0-100 percentage
        payload.dimming = {
          brightness: Math.round((brightness / 254) * 100)
        };
      }

      console.log('Sending v2 API color request:', JSON.stringify(payload, null, 2));
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to set light color: ${error.message}`);
    }
  }

  /**
   * Set gradient for gradient-capable lights
   * points: Array of color points { color: { xy: { x, y } } }
   * @param transitionMs - Optional transition duration in milliseconds (0 = instant)
   */
  async setGradient(
    lightId: string,
    points: Array<{ color: { xy: { x: number; y: number } } }>,
    mode?: GradientMode,
    transitionMs?: number
  ): Promise<void> {
    try {
      const payload: LightUpdateRequest = {
        gradient: {
          points: points as GradientPoint[],
          mode: mode ?? 'interpolated_palette',
        },
        on: { on: true },
        dynamics: {
          duration: transitionMs ?? 0,
        },
      };

      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to set gradient: ${error.message}`);
    }
  }

  /**
   * Get entertainment configurations (for streaming mode)
   */
  async getEntertainmentConfigurations(): Promise<any[]> {
    try {
      const response = await this.client.get('/resource/entertainment_configuration');
      return response.data.data || [];
    } catch (error: any) {
      console.error('Failed to get entertainment configs:', error.message);
      return [];
    }
  }

  /**
   * Get a specific entertainment configuration by ID
   */
  async getEntertainmentConfiguration(configId: string): Promise<any | null> {
    try {
      const response = await this.client.get(`/resource/entertainment_configuration/${configId}`);
      return response.data.data?.[0] || null;
    } catch (error: any) {
      console.error('Failed to get entertainment config:', error.message);
      return null;
    }
  }

  /**
   * Start streaming on an entertainment configuration
   * This activates the entertainment zone for DTLS streaming
   */
  async startStreaming(configId: string): Promise<boolean> {
    try {
      console.log(`[HueApiV2] Sending start streaming request for config: ${configId}`);
      const response = await this.client.put(`/resource/entertainment_configuration/${configId}`, {
        action: 'start',
      });
      console.log(`[HueApiV2] Started streaming for entertainment config: ${configId}`, response.data);
      return true;
    } catch (error: any) {
      console.error('[HueApiV2] Failed to start streaming:', error.message);
      if (error.response) {
        console.error('[HueApiV2] Response status:', error.response.status);
        console.error('[HueApiV2] Response data:', JSON.stringify(error.response.data));
      }
      throw new Error(`Failed to start streaming: ${error.message}`);
    }
  }

  /**
   * Stop streaming on an entertainment configuration
   */
  async stopStreaming(configId: string): Promise<boolean> {
    try {
      await this.client.put(`/resource/entertainment_configuration/${configId}`, {
        action: 'stop',
      });
      console.log(`[HueApiV2] Stopped streaming for entertainment config: ${configId}`);
      return true;
    } catch (error: any) {
      console.error('Failed to stop streaming:', error.message);
      return false;
    }
  }

  /**
   * Get the application ID for DTLS PSK identity
   * This is required for the streaming DTLS handshake
   */
  async getApplicationId(): Promise<string | null> {
    try {
      // The application ID is returned in the response header of /auth/v1
      const authClient = axios.create({
        baseURL: `https://${this.bridgeIp}`,
        headers: {
          'hue-application-key': this.username,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      const response = await authClient.get('/auth/v1');
      const applicationId = response.headers['hue-application-id'];

      if (applicationId) {
        console.log(`[HueApiV2] Got application ID: ${applicationId}`);
        return applicationId;
      }

      console.error('[HueApiV2] No application ID in response headers');
      return null;
    } catch (error: any) {
      console.error('Failed to get application ID:', error.message);
      return null;
    }
  }

  /**
   * Get available effects for a specific light
   */
  async getLightEffects(lightId: string): Promise<string[]> {
    try {
      const light: HueLightResource = await this.lightClient.get(lightId);

      // Extract available effects from light capabilities
      const effects: string[] = [];

      if (light.effects?.effect_values) {
        effects.push(...light.effects.effect_values);
      }

      return effects;
    } catch (error: any) {
      console.error('Failed to get light effects:', error.message);
      return [];
    }
  }

  /**
   * Check if light supports gradient
   */
  async supportsGradient(lightId: string): Promise<boolean> {
    try {
      const light: HueLightResource = await this.lightClient.get(lightId);
      return light.gradient !== undefined;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Trigger a signaling effect on a light (flash, alternating colors, etc.)
   * @param lightId - The light ID
   * @param signal - The signal type: 'on_off', 'on_off_color', 'alternating', 'no_signal'
   * @param durationMs - Duration in milliseconds (max 65534000ms, stepsize 1s for short durations)
   * @param colors - Optional array of 1-2 colors for on_off_color or alternating signals
   */
  async setSignaling(
    lightId: string,
    signal: LightSignal,
    durationMs: number,
    colors?: Array<{ x: number; y: number }>
  ): Promise<void> {
    try {
      const payload: LightUpdateRequest = {
        signaling: {
          signal,
          duration: durationMs,
        },
      };

      // Add colors if provided (for on_off_color or alternating)
      if (colors && colors.length > 0) {
        payload.signaling!.colors = colors.map(c => ({ xy: { x: c.x, y: c.y } }));
      }

      console.log('Sending signaling request:', JSON.stringify(payload, null, 2));
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to set signaling: ${error.message}`);
    }
  }

  /**
   * Stop any active signaling on a light
   */
  async stopSignaling(lightId: string): Promise<void> {
    try {
      const payload: LightUpdateRequest = {
        signaling: {
          signal: 'no_signal',
          duration: 0,
        },
      };
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to stop signaling: ${error.message}`);
    }
  }

  /**
   * Trigger a breathe alert (single pulse)
   * This is a simple visual identification that does one breathe cycle
   */
  async triggerBreathe(lightId: string): Promise<void> {
    try {
      const payload: LightUpdateRequest = {
        alert: {
          action: 'breathe',
        },
      };
      console.log('Sending breathe alert');
      await this.lightClient.update(lightId, payload);
    } catch (error: any) {
      throw new Error(`Failed to trigger breathe: ${error.message}`);
    }
  }

  /**
   * Check if light supports signaling
   */
  async supportsSignaling(lightId: string): Promise<LightSignal[]> {
    try {
      const light: HueLightResource = await this.lightClient.get(lightId);
      return light.signaling?.signal_values || [];
    } catch (error: any) {
      return [];
    }
  }
}
