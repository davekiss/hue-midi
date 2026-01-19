/**
 * Hue Entertainment API Streaming Types
 */

/** RGB color as 0-255 values */
export type RGB = [number, number, number];

/** XY color coordinates (CIE 1931) */
export interface XYColor {
  x: number;
  y: number;
}

/** XY color with brightness for streaming */
export interface XYBrightness {
  x: number;
  y: number;
  brightness: number; // 0-254
}

/** Color space for streaming messages */
export type ColorSpace = 'rgb' | 'xy';

/** Entertainment configuration from Hue bridge */
export interface EntertainmentConfiguration {
  id: string; // UUID
  name: string;
  configurationType: 'screen' | 'monitor' | 'music' | 'threed' | 'other';
  status: 'inactive' | 'active';
  channels: EntertainmentChannel[];
  locations?: {
    serviceLocations: ServiceLocation[];
  };
}

/** A channel in an entertainment configuration */
export interface EntertainmentChannel {
  channelId: number;
  position: ChannelPosition;
  members: ChannelMember[];
}

/** Position of a channel in the entertainment area */
export interface ChannelPosition {
  x: number; // -1 to 1
  y: number; // -1 to 1
  z: number; // -1 to 1
}

/** A light member in a channel */
export interface ChannelMember {
  index: number;
  service: {
    rid: string; // Light resource ID (UUID)
    rtype: 'light';
  };
}

/** Service location for positioning */
export interface ServiceLocation {
  service: {
    rid: string;
    rtype: 'light';
  };
  positions: Array<{
    x: number;
    y: number;
    z: number;
  }>;
}

/** Streaming service configuration */
export interface StreamingConfig {
  enabled: boolean;
  entertainmentConfigId: string;
  clientKey: string;
}

/** Streaming service options */
export interface StreamingServiceOptions {
  bridgeIp: string;
  username: string;
  clientKey: string;
  entertainmentConfigId: string;
  targetFps?: number; // Default 50
}

/** Frame data for a single channel */
export interface ChannelFrame {
  channelId: number;
  color: RGB | XYBrightness;
}

/** Streaming service events */
export interface StreamingEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  frame: (frameNumber: number) => void;
}

/** Frame provider interface for animation engines */
export interface FrameProvider {
  /** Get current frame for a channel, or null if no frame to provide */
  getFrame(channelId: number, timestamp: number): RGB | null;

  /** Check if this provider is actively animating */
  isActive(): boolean;
}

/** Mapping between light IDs and channel IDs */
export interface ChannelMapping {
  channelId: number;
  lightId: string; // v2 UUID
  legacyId?: string; // v1 ID for compatibility
  position: ChannelPosition;
}

/** Extended mapping for gradient lights with multiple segments */
export interface GradientLightInfo {
  lightId: string;
  channels: number[]; // Ordered channel IDs for this light's segments
  segmentCount: number;
  positions: ChannelPosition[]; // Position of each segment
}

/** Gradient color array for light strips */
export type GradientColors = RGB[];
