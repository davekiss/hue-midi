import { v3 } from 'node-hue-api';
import { Bonjour } from 'bonjour-service';
import * as dns from 'dns';
import { exec } from 'child_process';
import { promisify } from 'util';
import { HueLight, LightState } from '../types';
import { HueApiV2 } from './HueApiV2';
import type { HueLightResource, GradientMode } from './HueLightClient';

const execAsync = promisify(exec);
const { discovery, api: hueApi } = v3;

export interface DiscoveredBridge {
  ipaddress: string;
  name?: string;
  id?: string;
  local?: boolean;  // true if discovered via mDNS (direct/local connection)
}

export class HueBridgeController {
  private api: any = null;
  private apiV2: HueApiV2 | null = null;
  private bridgeIp: string | null = null;
  private username: string | null = null;
  private clientKey: string | null = null;
  private applicationId: string | null = null;
  private lightIdMap: Map<string, string> = new Map(); // v1 ID -> v2 UUID
  private lightNameMap: Map<string, string> = new Map(); // v2 UUID -> name

  /**
   * Discover Hue Bridges on the network using both cloud and mDNS
   */
  async discoverBridges(): Promise<DiscoveredBridge[]> {
    const bridges: Map<string, DiscoveredBridge> = new Map();

    // Try cloud discovery (nupnp) - requires internet
    try {
      const cloudResults = await discovery.nupnpSearch();
      for (const bridge of cloudResults) {
        const b = bridge as any;
        bridges.set(bridge.ipaddress, {
          ipaddress: bridge.ipaddress,
          name: b.name || 'Philips Hue',
          id: b.id,
          local: false
        });
      }
      console.log(`[Discovery] Found ${cloudResults.length} bridge(s) via cloud`);
    } catch (error) {
      console.log('[Discovery] Cloud discovery failed (no internet?), trying local only');
    }

    // Try mDNS discovery - works for direct connections
    try {
      const mdnsResults = await this.discoverBridgesMdns();
      for (const bridge of mdnsResults) {
        // If we already found this bridge via cloud, mark it as also local
        const existing = bridges.get(bridge.ipaddress);
        if (existing) {
          existing.local = true;
        } else {
          bridges.set(bridge.ipaddress, bridge);
        }
      }
      console.log(`[Discovery] Found ${mdnsResults.length} bridge(s) via mDNS`);
    } catch (error) {
      console.log('[Discovery] mDNS discovery failed:', error);
    }

    return Array.from(bridges.values());
  }

  /**
   * Discover Hue Bridges via mDNS using system dns-sd command
   * Works for direct connections without a router
   */
  private async discoverBridgesMdns(): Promise<DiscoveredBridge[]> {
    const bridges: DiscoveredBridge[] = [];

    // First try bonjour-service library
    try {
      const bonjourBridges = await this.discoverWithBonjour();
      if (bonjourBridges.length > 0) {
        console.log(`[mDNS] Bonjour found ${bonjourBridges.length} bridge(s)`);
        return bonjourBridges;
      }
    } catch (err) {
      console.log('[mDNS] Bonjour library failed, trying dns-sd command');
    }

    // Fallback to system dns-sd command (works better on macOS with multiple interfaces)
    try {
      const dnssdBridges = await this.discoverWithDnsSd();
      bridges.push(...dnssdBridges);
    } catch (err) {
      console.log('[mDNS] dns-sd command failed:', err);
    }

    return bridges;
  }

  /**
   * Try discovery with bonjour-service library
   */
  private discoverWithBonjour(): Promise<DiscoveredBridge[]> {
    return new Promise((resolve) => {
      const bridges: DiscoveredBridge[] = [];
      const bonjour = new Bonjour();

      const browser = bonjour.find({ type: 'hue' }, (service) => {
        console.log(`[mDNS/Bonjour] Found Hue service: ${service.name} at ${service.host}`);

        if (service.addresses && service.addresses.length > 0) {
          const ipv4 = service.addresses.find((addr: string) => !addr.includes(':'));
          const ip = ipv4 || service.addresses[0];
          bridges.push({
            ipaddress: ip,
            name: service.name || 'Hue Bridge',
            id: service.txt?.bridgeid as string,
            local: true
          });
        }
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        resolve(bridges);
      }, 2000);
    });
  }

  /**
   * Discovery using macOS dns-sd command - more reliable for link-local addresses
   */
  private async discoverWithDnsSd(): Promise<DiscoveredBridge[]> {
    const bridges: DiscoveredBridge[] = [];

    try {
      // Run dns-sd browse for 2 seconds to find Hue services
      console.log('[mDNS] Running dns-sd -B _hue._tcp...');
      const browseResult = await this.runWithTimeout(
        'dns-sd -B _hue._tcp local',
        2500
      );

      console.log('[mDNS] Browse output:', browseResult);

      // Parse the browse output to find service names
      // Format: "Timestamp  A/R    Flags  if Domain               Service Type         Instance Name"
      // Example: "10:30:45.123  Add        2   8 local.               _hue._tcp.           Philips Hue - 1A2B3C"
      const lines = browseResult.split('\n');
      const serviceInstances: { name: string; domain: string }[] = [];

      for (const line of lines) {
        // Look for lines with "Add" that contain the service instance
        if (line.includes('_hue._tcp.') && line.includes('Add')) {
          // Match the pattern: after _hue._tcp. comes the instance name
          const hueTypeIdx = line.indexOf('_hue._tcp.');
          if (hueTypeIdx !== -1) {
            const afterType = line.substring(hueTypeIdx + '_hue._tcp.'.length).trim();
            if (afterType && !serviceInstances.find(s => s.name === afterType)) {
              serviceInstances.push({ name: afterType, domain: 'local' });
              console.log(`[mDNS] Found service instance: "${afterType}"`);
            }
          }
        }
      }

      // For each service, use dns-sd -L to look up the target host, then resolve IP
      for (const instance of serviceInstances) {
        try {
          console.log(`[mDNS] Looking up service "${instance.name}"...`);
          // dns-sd -L looks up a specific service instance
          const lookupResult = await this.runWithTimeout(
            `dns-sd -L "${instance.name}" _hue._tcp local`,
            2500
          );

          console.log('[mDNS] Lookup result:', lookupResult);

          // Parse the lookup output for the target hostname
          // Format includes "can be reached at hostname.local.:port"
          const hostMatch = lookupResult.match(/can be reached at\s+(\S+\.local\.?)/i);
          if (hostMatch) {
            let hostname = hostMatch[1].replace(/\.$/, ''); // Remove trailing dot
            console.log(`[mDNS] Found hostname: ${hostname}`);

            // Now resolve the hostname to IP
            const resolveResult = await this.runWithTimeout(
              `dns-sd -G v4 "${hostname}"`,
              2500
            );

            console.log('[mDNS] Resolve result:', resolveResult);

            // Parse for IP address
            const resolveLines = resolveResult.split('\n');
            for (const line of resolveLines) {
              const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
              if (ipMatch) {
                const ip = ipMatch[1];
                console.log(`[mDNS] Resolved ${hostname} to ${ip}`);
                bridges.push({
                  ipaddress: ip,
                  name: instance.name || 'Hue Bridge',
                  local: true
                });
                break;
              }
            }
          }
        } catch (err) {
          console.log(`[mDNS] Failed to resolve ${instance.name}:`, err);
        }
      }
    } catch (err) {
      console.log('[mDNS] dns-sd browse failed:', err);
    }

    return bridges;
  }

  /**
   * Run a command with timeout (kills after timeout)
   */
  private runWithTimeout(command: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
        // dns-sd exits with error when killed by timeout, but we still want the output
        resolve(stdout + stderr);
      });

      // Kill the process after timeout
      setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs - 100);
    });
  }

  /**
   * Create a new user on the Hue Bridge
   * User must press the link button on the bridge first
   */
  async createUser(bridgeIp: string, appName: string = 'hue-midi', deviceName: string = 'midi-controller'): Promise<string> {
    try {
      const unauthenticatedApi = await hueApi.createLocal(bridgeIp).connect();
      const createdUser = await unauthenticatedApi.users.createUser(appName, deviceName);
      return createdUser.username;
    } catch (error: any) {
      if (error.message && error.message.includes('link button')) {
        throw new Error('Please press the link button on your Hue Bridge and try again');
      }
      throw error;
    }
  }

  /**
   * Create a new user with client key for entertainment streaming
   * User must press the link button on the bridge first
   * Returns both username and clientKey needed for DTLS streaming
   */
  async createUserWithClientKey(
    bridgeIp: string,
    appName: string = 'hue-midi',
    deviceName: string = 'midi-controller'
  ): Promise<{ username: string; clientKey: string }> {
    try {
      // Use axios to directly call the API with generateclientkey=true
      const axios = (await import('axios')).default;
      const https = await import('https');

      const response = await axios.post(
        `https://${bridgeIp}/api`,
        {
          devicetype: `${appName}#${deviceName}`,
          generateclientkey: true,
        },
        {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        }
      );

      const result = response.data[0];
      if (result.error) {
        if (result.error.description?.includes('link button')) {
          throw new Error('Please press the link button on your Hue Bridge and try again');
        }
        throw new Error(result.error.description || 'Failed to create user');
      }

      if (result.success) {
        console.log('[HueBridgeController] Created user with client key');
        return {
          username: result.success.username,
          clientKey: result.success.clientkey,
        };
      }

      throw new Error('Unexpected response from bridge');
    } catch (error: any) {
      if (error.message?.includes('link button')) {
        throw error;
      }
      throw new Error(`Failed to create user with client key: ${error.message}`);
    }
  }

  /**
   * Connect to the Hue Bridge
   */
  async connect(bridgeIp: string, username: string, clientKey?: string): Promise<void> {
    this.bridgeIp = bridgeIp;
    this.username = username;
    this.clientKey = clientKey || null;
    this.api = await hueApi.createLocal(bridgeIp).connect(username);
    this.apiV2 = new HueApiV2(bridgeIp, username);
    console.log('Connected to Hue Bridge (API v1 & v2)');

    // Fetch application ID if we have a client key (needed for streaming)
    if (clientKey) {
      try {
        this.applicationId = await this.apiV2.getApplicationId();
        if (this.applicationId) {
          console.log(`[HueBridgeController] Got application ID: ${this.applicationId}`);
        }
      } catch (error) {
        console.warn('[HueBridgeController] Failed to get application ID:', error);
      }
    }
  }

  /**
   * Get the stored client key
   */
  getClientKey(): string | null {
    return this.clientKey;
  }

  /**
   * Get the application ID (for DTLS PSK identity)
   */
  getApplicationId(): string | null {
    return this.applicationId;
  }

  /**
   * Get bridge IP
   */
  getBridgeIp(): string | null {
    return this.bridgeIp;
  }

  /**
   * Get username
   */
  getUsername(): string | null {
    return this.username;
  }

  /**
   * Get entertainment configurations
   */
  async getEntertainmentConfigurations(): Promise<any[]> {
    if (!this.apiV2) {
      throw new Error('Not connected to Hue Bridge');
    }
    return this.apiV2.getEntertainmentConfigurations();
  }

  /**
   * Get a specific entertainment configuration
   */
  async getEntertainmentConfiguration(configId: string): Promise<any> {
    if (!this.apiV2) {
      throw new Error('Not connected to Hue Bridge');
    }
    return this.apiV2.getEntertainmentConfiguration(configId);
  }

  /**
   * Start entertainment streaming on a configuration
   * This activates the entertainment zone for DTLS streaming
   */
  async startEntertainmentStreaming(configId: string): Promise<boolean> {
    if (!this.apiV2) {
      throw new Error('Not connected to Hue Bridge');
    }
    return this.apiV2.startStreaming(configId);
  }

  /**
   * Stop entertainment streaming on a configuration
   */
  async stopEntertainmentStreaming(configId: string): Promise<boolean> {
    if (!this.apiV2) {
      throw new Error('Not connected to Hue Bridge');
    }
    return this.apiV2.stopStreaming(configId);
  }

  /**
   * Get the v2 UUID for a v1 light ID
   */
  getV2LightId(v1LightId: string): string | undefined {
    return this.lightIdMap.get(v1LightId);
  }

  /**
   * Get the light name for a v2 UUID
   */
  getLightNameById(v2LightId: string): string | undefined {
    return this.lightNameMap.get(v2LightId);
  }

  /**
   * Get all lights from the bridge
   */
  async getLights(): Promise<HueLight[]> {
    if (!this.api) {
      throw new Error('Not connected to Hue Bridge');
    }

    const lights = await this.api.lights.getAll();

    // Try to fetch v2 API data for enhanced capabilities
    let v2Lights: HueLightResource[] = [];
    if (this.apiV2) {
      try {
        v2Lights = await this.apiV2.getLights();
        console.log('V2 API returned', v2Lights.length, 'lights');
      } catch (error) {
        console.warn('Failed to fetch v2 API data, using v1 only');
      }
    }

    const v2ByIdV1 = new Map<string, HueLightResource>();
    v2Lights.forEach((resource) => {
      if (resource.id_v1) {
        v2ByIdV1.set(resource.id_v1, resource);
      }
    });

    return Promise.all(lights.map(async (light: any) => {
      const capabilities = light.capabilities || {};
      const streaming = capabilities.streaming || {};
      const control = capabilities.control || {};

      // Determine available effects from v1 API
      const availableEffects: string[] = [];
      if (control.colourloop) availableEffects.push('colorloop');

      // Gradient capability detection (prefer v2 capability if available)
      let supportsGradient = (light.productname || '').toLowerCase().includes('gradient');

      // Check for entertainment/streaming support (needed for advanced effects)
      const supportsStreaming = streaming.renderer === true || streaming.proxy === true;

      // Try to get additional effects from v2 API and build ID mapping
      if (this.apiV2) {
        try {
          const legacyId = `/lights/${light.id}`;
          let v2Light = v2ByIdV1.get(legacyId);

          if (!v2Light) {
            v2Light = v2Lights.find((l) => l.metadata.name === light.name);
          }

          if (v2Light) {
            // Store the v1 -> v2 ID mapping
            this.lightIdMap.set(light.id.toString(), v2Light.id);
            // Store the v2 -> name mapping
            this.lightNameMap.set(v2Light.id, light.name);
            console.log(`Mapped light ${light.id} (${light.name}) -> ${v2Light.id}`);

            if (v2Light.effects?.effect_values) {
              // Add v2 effects (sparkle, fire, candle, etc.)
              v2Light.effects.effect_values.forEach((effect) => {
                if (!availableEffects.includes(effect)) {
                  availableEffects.push(effect);
                }
              });
            }

            if (!supportsGradient && v2Light.gradient) {
              supportsGradient = Boolean(v2Light.gradient.mode_values?.length || v2Light.gradient.points_capable);
            }
          }
        } catch (error) {
          // Silently fail - v1 data is still valid
        }
      }

      const merged = {
        id: light.id.toString(),
        name: light.name,
        type: this.determineType(light.type, light.productname),
        productName: light.productname,
        modelId: light.modelid,
        reachable: light.state?.reachable === undefined ? true : Boolean(light.state.reachable),
        capabilities: {
          color: capabilities.color?.xy !== undefined || capabilities.color?.gamut !== undefined,
          brightness: light.state.bri !== undefined,
          effects: availableEffects.length > 0,
          gradient: supportsGradient,
          streaming: supportsStreaming,
          availableEffects,
          minDimlevel: capabilities.control?.mindimlevel,
          maxLumen: capabilities.control?.maxlumen,
        }
      } as HueLight;
      return merged;
    }));
  }

  /**
   * Determine light type from product info
   */
  private determineType(type: string, productName: string): 'bulb' | 'strip' | 'other' {
    const lowerProduct = (productName || '').toLowerCase();
    const lowerType = (type || '').toLowerCase();

    if (lowerProduct.includes('strip') || lowerProduct.includes('lightstrip')) {
      return 'strip';
    } else if (lowerType.includes('light') || lowerProduct.includes('bulb')) {
      return 'bulb';
    }
    return 'other';
  }

  /**
   * Set light state
   */
  async setLightState(lightId: string, state: LightState): Promise<void> {
    if (!this.api) {
      throw new Error('Not connected to Hue Bridge');
    }

    // Try V2 API first if we have a mapping (more reliable for newer lights)
    const v2Id = this.lightIdMap.get(lightId);
    console.log(`[setLightState] lightId=${lightId}, v2Id=${v2Id}, mapSize=${this.lightIdMap.size}`);

    if (v2Id && this.apiV2) {
      try {
        console.log(`[setLightState] Using V2 API for light ${lightId} -> ${v2Id}`);
        await this.setLightStateV2(v2Id, state);
        console.log(`[setLightState] V2 API success for light ${lightId}`);
        return;
      } catch (error) {
        console.warn(`V2 API failed for light ${lightId}, falling back to V1:`, error);
      }
    } else {
      console.log(`[setLightState] V2 not available, using V1. v2Id=${v2Id}, hasApiV2=${!!this.apiV2}`);
    }

    // Fall back to V1 API
    const lightState = new v3.lightStates.LightState();

    if (state.on !== undefined) {
      lightState.on(state.on);
    }

    if (state.brightness !== undefined) {
      lightState.bri(state.brightness);
    }

    if (state.hue !== undefined && state.saturation !== undefined) {
      lightState.hue(state.hue).sat(state.saturation);
    }

    if (state.colorTemp !== undefined) {
      lightState.ct(state.colorTemp);
    }

    // Only set effect if it's a v1-compatible effect
    if (state.effect) {
      const v1Effects = ['none', 'colorloop'];
      if (v1Effects.includes(state.effect)) {
        lightState.effect(state.effect);
      }
      // v2 effects (sparkle, fire, etc.) should be handled by setDynamicEffect instead
    }

    if (state.transitionTime !== undefined) {
      lightState.transitiontime(state.transitionTime);
    }

    await this.api.lights.setLightState(lightId, lightState);
  }

  /**
   * Set light state using V2 API
   */
  private async setLightStateV2(v2LightId: string, state: LightState): Promise<void> {
    if (!this.apiV2) {
      throw new Error('V2 API not available');
    }

    const payload: any = {};

    if (state.on !== undefined) {
      payload.on = { on: state.on };
    }

    if (state.brightness !== undefined) {
      // V2 uses 0-100 scale, V1 uses 0-254
      payload.dimming = { brightness: Math.round((state.brightness / 254) * 100) };
    }

    if (state.hue !== undefined && state.saturation !== undefined) {
      // Convert HSV to XY for V2 API
      const xy = this.hsvToXy(state.hue, state.saturation);
      payload.color = { xy: { x: xy.x, y: xy.y } };
    }

    if (state.transitionTime !== undefined) {
      // V2 uses milliseconds, V1 uses 100ms increments
      payload.dynamics = { duration: state.transitionTime * 100 };
    }

    await this.apiV2.updateLight(v2LightId, payload);
  }

  /**
   * Get current state of a light
   */
  async getLightState(lightId: string): Promise<any> {
    if (!this.api) {
      throw new Error('Not connected to Hue Bridge');
    }

    const light = await this.api.lights.getLight(lightId);
    return light.state;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.api) {
      return false;
    }

    try {
      await this.api.configuration.get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set dynamic effect using v2 API (sparkle, fire, candle, etc.)
   */
  async setDynamicEffect(
    lightId: string,
    effect: string,
    duration?: number,
    options?: {
      color?: { x: number; y: number };
      speed?: number;
      colorTemperature?: { mirek: number };
    }
  ): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available - effects not supported');
    }

    // Map v1 ID to v2 UUID
    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    const color = options?.color;
    console.log(
      `Setting dynamic effect ${effect} on light ${lightId} (v2 ID: ${v2LightId})` +
        `${color ? ` with color (${color.x}, ${color.y})` : ''}` +
        `${options?.speed !== undefined ? ` speed=${options.speed}` : ''}`
    );
    await this.apiV2.setLightEffect(v2LightId, effect, {
      duration,
      color: options?.color,
      speed: options?.speed,
      colorTemperature: options?.colorTemperature,
    });
  }

  /**
   * Set gradient colors on gradient-capable lights
   * @param transitionMs - Optional transition duration in milliseconds
   */
  async setGradient(lightId: string, colors: Array<{ x: number; y: number }>, mode?: GradientMode, transitionMs?: number): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available - gradient not supported');
    }

    // Map v1 ID to v2 UUID
    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    const points = colors.map((color) => ({
      color: { xy: color },
    }));

    await this.apiV2.setGradient(v2LightId, points, mode, transitionMs);
  }

  /**
   * Check if a light supports gradients
   */
  async supportsGradient(lightId: string): Promise<boolean> {
    if (!this.apiV2) {
      return false;
    }

    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      return false;
    }

    return this.apiV2.supportsGradient(v2LightId);
  }

  /**
   * Set light color using v2 API (for better performance and consistency)
   * @param transitionMs - Optional transition duration in milliseconds
   */
  async setLightColorV2(lightId: string, hue: number, saturation: number, brightness?: number, transitionMs?: number): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available');
    }

    // Map v1 ID to v2 UUID
    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    // Convert HSV to XY color space
    const xy = this.hsvToXy(hue, saturation);

    console.log(`Setting color on light ${lightId} (v2 ID: ${v2LightId}) - hue: ${hue}, sat: ${saturation}, xy: ${JSON.stringify(xy)}`);
    await this.apiV2.setLightColor(v2LightId, xy, brightness, transitionMs);
  }

  /**
   * Set light color using XY coordinates directly (for effects engine)
   * @param transitionMs - Optional transition duration in milliseconds
   */
  async setLightColorXY(lightId: string, xy: { x: number; y: number }, brightness?: number, transitionMs?: number): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available');
    }

    // Map v1 ID to v2 UUID
    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    await this.apiV2.setLightColor(v2LightId, xy, brightness, transitionMs);
  }

  /**
   * Convert HSV (Hue: 0-65535, Saturation: 0-254) to XY color space
   */
  private hsvToXy(hue: number, saturation: number): { x: number; y: number } {
    // Convert Hue range (0-65535) to degrees (0-360)
    const hueDegrees = (hue / 65535) * 360;

    // Convert saturation (0-254) to percentage (0-1)
    const sat = saturation / 254;

    // Assume full brightness for color conversion
    const value = 1.0;

    // Convert HSV to RGB
    const c = value * sat;
    const x = c * (1 - Math.abs(((hueDegrees / 60) % 2) - 1));
    const m = value - c;

    let r = 0, g = 0, b = 0;
    if (hueDegrees >= 0 && hueDegrees < 60) {
      r = c; g = x; b = 0;
    } else if (hueDegrees >= 60 && hueDegrees < 120) {
      r = x; g = c; b = 0;
    } else if (hueDegrees >= 120 && hueDegrees < 180) {
      r = 0; g = c; b = x;
    } else if (hueDegrees >= 180 && hueDegrees < 240) {
      r = 0; g = x; b = c;
    } else if (hueDegrees >= 240 && hueDegrees < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    r = (r + m);
    g = (g + m);
    b = (b + m);

    // Convert RGB to XY using Philips Hue conversion
    // Apply gamma correction
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : (r / 12.92);
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : (g / 12.92);
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : (b / 12.92);

    // Convert to XYZ using Wide RGB D65 conversion formula
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

    // Calculate xy values
    const sum = X + Y + Z;
    const xyX = sum === 0 ? 0 : X / sum;
    const xyY = sum === 0 ? 0 : Y / sum;

    return { x: xyX, y: xyY };
  }

  /**
   * Trigger a signaling effect (flash, alternating colors)
   * @param lightId - The v1 light ID
   * @param signal - 'on_off' | 'on_off_color' | 'alternating' | 'no_signal'
   * @param durationMs - Duration in milliseconds
   * @param colors - Optional array of 1-2 XY colors for colored signals
   */
  async setSignaling(
    lightId: string,
    signal: 'on_off' | 'on_off_color' | 'alternating' | 'no_signal',
    durationMs: number,
    colors?: Array<{ x: number; y: number }>
  ): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available - signaling not supported');
    }

    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    console.log(`Setting signaling ${signal} on light ${lightId} (v2: ${v2LightId}) for ${durationMs}ms`);
    await this.apiV2.setSignaling(v2LightId, signal, durationMs, colors);
  }

  /**
   * Stop any active signaling on a light
   */
  async stopSignaling(lightId: string): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available');
    }

    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    await this.apiV2.stopSignaling(v2LightId);
  }

  /**
   * Trigger a breathe effect (single pulse cycle)
   * This is the Hue "alert" action that does one breathe/pulse
   */
  async triggerBreathe(lightId: string): Promise<void> {
    if (!this.apiV2) {
      throw new Error('API v2 not available');
    }

    const v2LightId = this.lightIdMap.get(lightId);
    if (!v2LightId) {
      throw new Error(`No v2 ID mapping found for light ${lightId}`);
    }

    console.log(`Triggering breathe on light ${lightId} (v2: ${v2LightId})`);
    await this.apiV2.triggerBreathe(v2LightId);
  }

  /**
   * Disconnect from bridge
   */
  disconnect(): void {
    this.api = null;
    this.apiV2 = null;
    this.bridgeIp = null;
    this.username = null;
    this.clientKey = null;
    this.applicationId = null;
    this.lightIdMap.clear();
  }
}
