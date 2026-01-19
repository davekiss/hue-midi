/**
 * Streaming Router
 *
 * Routes light commands to either Entertainment API streaming or REST API
 * based on whether streaming is active and if the light is in the entertainment zone.
 *
 * Supports per-channel control for gradient light strips where a single light
 * may have multiple channels (segments) that can be individually controlled.
 */

import { HueStreamingService } from './HueStreamingService';
import type { RGB, ChannelMapping, GradientLightInfo, GradientColors } from './types';

/**
 * Minimal light state interface for streaming
 * Compatible with the main LightState type but only requires what streaming needs
 */
export interface StreamableLightState {
  on?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  effect?: string;
  gradient?: unknown;
}

export type RestApiFallback = (lightId: string, state: StreamableLightState) => Promise<void>;

export type V1ToV2IdLookup = (v1Id: string) => string | undefined;

export class StreamingRouter {
  private streamingService: HueStreamingService | null = null;
  private restFallback: RestApiFallback | null = null;
  private channelMappings: ChannelMapping[] = [];
  private v1ToV2Lookup: V1ToV2IdLookup | null = null;
  private v2IdCache = new Map<string, string>(); // Cache V1→V2 lookups

  // Gradient light info: maps light ID to its channels (for multi-segment lights)
  private gradientLights = new Map<string, GradientLightInfo>();

  /**
   * Set the streaming service to use
   */
  setStreamingService(service: HueStreamingService | null): void {
    this.streamingService = service;
  }

  /**
   * Set the REST API fallback function for lights not in the zone or when streaming is off
   */
  setRestFallback(fallback: (lightId: string, state: StreamableLightState) => Promise<void>): void {
    this.restFallback = fallback;
  }

  /**
   * Set channel mappings (light ID to channel ID)
   * Also builds gradient light info for lights with multiple channels
   */
  setChannelMappings(mappings: ChannelMapping[]): void {
    this.channelMappings = mappings;
    this.buildGradientLightMap();
  }

  /**
   * Build the gradient light map from channel mappings
   * Groups channels by light ID to identify gradient lights (multi-channel)
   */
  private buildGradientLightMap(): void {
    this.gradientLights.clear();

    // Group channels by light ID
    const lightChannels = new Map<string, { channelId: number; position: { x: number; y: number; z: number } }[]>();

    for (const mapping of this.channelMappings) {
      const existing = lightChannels.get(mapping.lightId) || [];
      existing.push({ channelId: mapping.channelId, position: mapping.position });
      lightChannels.set(mapping.lightId, existing);
    }

    // Build gradient info for lights with multiple channels
    for (const [lightId, channels] of lightChannels) {
      if (channels.length > 1) {
        // Sort by channel ID to ensure consistent ordering
        channels.sort((a, b) => a.channelId - b.channelId);

        this.gradientLights.set(lightId, {
          lightId,
          channels: channels.map(c => c.channelId),
          segmentCount: channels.length,
          positions: channels.map(c => c.position),
        });

        console.log(`[StreamingRouter] Gradient light detected: ${lightId} with ${channels.length} segments`);
      }
    }
  }

  /**
   * Set the V1 to V2 ID lookup function
   * This is needed because effects use V1 IDs but entertainment zones use V2 UUIDs
   */
  setV1ToV2Lookup(lookup: V1ToV2IdLookup | null): void {
    this.v1ToV2Lookup = lookup;
    this.v2IdCache.clear(); // Clear cache when lookup changes
  }

  /**
   * Resolve a light ID to its V2 equivalent for zone lookup
   * Results are cached to avoid repeated lookups and log spam
   */
  private resolveToV2Id(lightId: string): string {
    // If it looks like a V2 UUID already, return as-is
    if (lightId.includes('-')) {
      return lightId;
    }

    // Check cache first
    const cached = this.v2IdCache.get(lightId);
    if (cached !== undefined) {
      return cached;
    }

    // Try to convert V1 to V2
    if (this.v1ToV2Lookup) {
      const v2Id = this.v1ToV2Lookup(lightId);
      if (v2Id) {
        console.log(`[StreamingRouter] Resolved V1 ID "${lightId}" -> V2 ID "${v2Id}"`);
        this.v2IdCache.set(lightId, v2Id);
        return v2Id;
      } else {
        console.log(`[StreamingRouter] No V2 ID found for V1 ID "${lightId}"`);
        // Cache the original ID to avoid repeated lookups
        this.v2IdCache.set(lightId, lightId);
      }
    }
    // Return original if no conversion available
    return lightId;
  }

  /**
   * Check if streaming is currently active
   */
  isStreaming(): boolean {
    return this.streamingService?.isStreaming() ?? false;
  }

  /**
   * Check if a light is in the entertainment zone
   */
  isLightInZone(lightId: string): boolean {
    const v2Id = this.resolveToV2Id(lightId);
    return this.channelMappings.some((m) => m.lightId === v2Id);
  }

  /**
   * Get channel ID for a light
   */
  getChannelForLight(lightId: string): number | null {
    const v2Id = this.resolveToV2Id(lightId);
    const mapping = this.channelMappings.find((m) => m.lightId === v2Id);
    return mapping?.channelId ?? null;
  }

  /**
   * Route a light state command to streaming or REST
   */
  async setLightState(lightId: string, state: StreamableLightState): Promise<void> {
    // If streaming is active and light is in the zone, use streaming
    if (this.isStreaming() && this.isLightInZone(lightId)) {
      const channelId = this.getChannelForLight(lightId);
      if (channelId !== null) {
        // Handle off state
        if (state.on === false) {
          this.streamingService!.setChannelRgb(channelId, [0, 0, 0]);
          return;
        }

        // Convert state to RGB
        const rgb = this.stateToRgb(state);
        if (rgb) {
          this.streamingService!.setChannelRgb(channelId, rgb);
          return;
        }
      }
    }

    // Fall back to REST API
    if (this.restFallback) {
      await this.restFallback(lightId, state);
    } else {
      throw new Error('No REST fallback configured and streaming not available');
    }
  }

  /**
   * Set RGB directly for streaming (bypasses state conversion)
   * For gradient lights, this sets all segments to the same color
   */
  setLightRgb(lightId: string, rgb: RGB): boolean {
    if (!this.isStreaming() || !this.isLightInZone(lightId)) {
      return false;
    }

    const v2Id = this.resolveToV2Id(lightId);

    // Check if this is a gradient light
    const gradientInfo = this.gradientLights.get(v2Id);
    if (gradientInfo) {
      // Set all segments to the same color
      for (const channelId of gradientInfo.channels) {
        this.streamingService!.setChannelRgb(channelId, rgb);
      }
      return true;
    }

    // Single-channel light
    const channelId = this.getChannelForLight(lightId);
    if (channelId !== null) {
      this.streamingService!.setChannelRgb(channelId, rgb);
      return true;
    }

    return false;
  }

  /**
   * Set RGB color for a specific channel directly
   */
  setChannelRgb(channelId: number, rgb: RGB): boolean {
    if (!this.isStreaming()) {
      return false;
    }
    this.streamingService!.setChannelRgb(channelId, rgb);
    return true;
  }

  /**
   * Set gradient colors for a light strip (multiple colors for multiple segments)
   * Colors are distributed evenly across the light's segments
   */
  setLightGradient(lightId: string, colors: GradientColors): boolean {
    if (!this.isStreaming() || !this.isLightInZone(lightId)) {
      return false;
    }

    const v2Id = this.resolveToV2Id(lightId);
    const gradientInfo = this.gradientLights.get(v2Id);

    if (!gradientInfo) {
      // Not a gradient light, just use the first color
      if (colors.length > 0) {
        return this.setLightRgb(lightId, colors[0]);
      }
      return false;
    }

    const segmentCount = gradientInfo.segmentCount;

    // Distribute colors across segments
    for (let i = 0; i < segmentCount; i++) {
      let color: RGB;

      if (colors.length === 0) {
        color = [0, 0, 0];
      } else if (colors.length === 1) {
        // Single color for all segments
        color = colors[0];
      } else if (colors.length >= segmentCount) {
        // More colors than segments - pick evenly
        const colorIndex = Math.floor((i / segmentCount) * colors.length);
        color = colors[Math.min(colorIndex, colors.length - 1)];
      } else {
        // Fewer colors than segments - interpolate
        const t = i / (segmentCount - 1);
        const colorPosition = t * (colors.length - 1);
        const colorIndex = Math.floor(colorPosition);
        const blend = colorPosition - colorIndex;

        const color1 = colors[colorIndex];
        const color2 = colors[Math.min(colorIndex + 1, colors.length - 1)];

        color = [
          Math.round(color1[0] * (1 - blend) + color2[0] * blend),
          Math.round(color1[1] * (1 - blend) + color2[1] * blend),
          Math.round(color1[2] * (1 - blend) + color2[2] * blend),
        ];
      }

      this.streamingService!.setChannelRgb(gradientInfo.channels[i], color);
    }

    return true;
  }

  /**
   * Check if a light supports gradient streaming (has multiple channels)
   */
  isGradientLight(lightId: string): boolean {
    const v2Id = this.resolveToV2Id(lightId);
    return this.gradientLights.has(v2Id);
  }

  /**
   * Get the number of segments for a gradient light
   */
  getGradientSegmentCount(lightId: string): number {
    const v2Id = this.resolveToV2Id(lightId);
    return this.gradientLights.get(v2Id)?.segmentCount ?? 1;
  }

  /**
   * Get gradient light info
   */
  getGradientLightInfo(lightId: string): GradientLightInfo | null {
    const v2Id = this.resolveToV2Id(lightId);
    return this.gradientLights.get(v2Id) ?? null;
  }

  /**
   * Get all gradient lights in the entertainment zone
   */
  getGradientLights(): GradientLightInfo[] {
    return Array.from(this.gradientLights.values());
  }

  /**
   * Convert light state to RGB color
   */
  private stateToRgb(state: StreamableLightState): RGB | null {
    // If light is off or brightness is 0, return black
    if (state.on === false || state.brightness === 0) {
      return [0, 0, 0];
    }

    // Need hue and saturation to calculate RGB
    if (state.hue === undefined || state.saturation === undefined) {
      // If we only have brightness, return white at that brightness
      if (state.brightness !== undefined) {
        const b = Math.round((state.brightness / 254) * 255);
        return [b, b, b];
      }
      return null;
    }

    // Convert Hue's HSB to RGB
    // Hue's hue: 0-65535 (360 degrees)
    // Hue's saturation: 0-254
    // Hue's brightness: 0-254
    const h = (state.hue / 65535) * 360;
    const s = (state.saturation / 254) * 100;
    const l = ((state.brightness ?? 254) / 254) * 50; // Use 50% as max to keep colors vibrant

    return this.hslToRgb(h, s, l);
  }

  /**
   * Convert HSL to RGB
   */
  private hslToRgb(h: number, s: number, l: number): RGB {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [
      Math.round(f(0) * 255),
      Math.round(f(8) * 255),
      Math.round(f(4) * 255),
    ];
  }
}
