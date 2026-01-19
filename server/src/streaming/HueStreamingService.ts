/**
 * Hue Entertainment Streaming Service
 *
 * High-level service for streaming light colors to Hue Entertainment areas.
 * Manages the DTLS connection, render loop, and frame submission.
 */

import { EventEmitter } from 'events';
import { DtlsConnection } from './DtlsConnection';
import { HueStreamMessage } from './HueStreamMessage';
import type {
  RGB,
  XYBrightness,
  StreamingServiceOptions,
  EntertainmentChannel,
  ChannelMapping,
} from './types';

const DEFAULT_FPS = 50;
const FRAME_INTERVAL_MS = 1000 / DEFAULT_FPS; // 20ms for 50Hz
const KEEPALIVE_INTERVAL_MS = 1000; // Send frame every second even if unchanged

export interface StreamingServiceEvents {
  started: () => void;
  stopped: (reason?: string) => void;
  error: (error: Error) => void;
  frame: (frameNumber: number, channelCount: number) => void;
  connectionLost: () => void;
  reconnected: () => void;
}

export class HueStreamingService extends EventEmitter {
  private options: StreamingServiceOptions;
  private connection: DtlsConnection | null = null;
  private messageBuilder: HueStreamMessage | null = null;
  private renderLoop: NodeJS.Timeout | null = null;
  private keepaliveLoop: NodeJS.Timeout | null = null;

  private frameBuffer: Map<number, RGB> = new Map();
  private lastSentFrame: Map<number, RGB> = new Map();
  private frameCount = 0;
  private streaming = false;

  private channelMappings: ChannelMapping[] = [];
  private applicationId: string | null = null;

  // Callbacks for REST API operations (injected from HueBridgeController)
  private startStreamingCallback: (() => Promise<void>) | null = null;
  private stopStreamingCallback: (() => Promise<void>) | null = null;

  constructor(options: StreamingServiceOptions) {
    super();
    this.options = {
      targetFps: DEFAULT_FPS,
      ...options,
    };
  }

  /**
   * Set the application ID (from GET /auth/v1)
   */
  setApplicationId(applicationId: string): void {
    this.applicationId = applicationId;
  }

  /**
   * Set channel mappings for light ID to channel ID resolution
   */
  setChannelMappings(mappings: ChannelMapping[]): void {
    this.channelMappings = mappings;
  }

  /**
   * Set callbacks for REST API operations
   */
  setApiCallbacks(
    startStreaming: () => Promise<void>,
    stopStreaming: () => Promise<void>
  ): void {
    this.startStreamingCallback = startStreaming;
    this.stopStreamingCallback = stopStreaming;
  }

  /**
   * Start streaming to the entertainment configuration
   */
  async start(): Promise<void> {
    if (this.streaming) {
      console.log('[HueStreamingService] Already streaming');
      return;
    }

    const { bridgeIp, clientKey, entertainmentConfigId } = this.options;

    if (!this.applicationId) {
      throw new Error('Application ID not set. Call setApplicationId() first.');
    }

    console.log('[HueStreamingService] Starting streaming...');

    // Initialize message builder
    this.messageBuilder = new HueStreamMessage(entertainmentConfigId);

    // Create DTLS connection
    this.connection = new DtlsConnection({
      host: bridgeIp,
      port: 2100,
      pskIdentity: this.applicationId,
      pskSecret: clientKey, // Pass as hex string
    });

    // Set up connection event handlers
    this.connection.on('connected', () => {
      console.log('[HueStreamingService] DTLS connected');
    });

    this.connection.on('disconnected', (reason) => {
      console.log('[HueStreamingService] DTLS disconnected:', reason);
      this.emit('connectionLost');
    });

    this.connection.on('error', (error) => {
      console.error('[HueStreamingService] DTLS error:', error.message);
      this.emit('error', error);
    });

    try {
      // Activate streaming on the bridge via REST API
      if (this.startStreamingCallback) {
        await this.startStreamingCallback();
        console.log('[HueStreamingService] Streaming activated on bridge');
      }

      // Establish DTLS connection
      await this.connection.connect();
      console.log('[HueStreamingService] DTLS connection established');

      // Start the render loop
      this.startRenderLoop();

      this.streaming = true;
      this.emit('started');
      console.log('[HueStreamingService] Streaming started successfully');
    } catch (error) {
      // Clean up on failure
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop streaming
   */
  async stop(): Promise<void> {
    if (!this.streaming) {
      return;
    }

    console.log('[HueStreamingService] Stopping streaming...');
    await this.cleanup();

    this.streaming = false;
    this.emit('stopped', 'Stopped by user');
    console.log('[HueStreamingService] Streaming stopped');
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.streaming;
  }

  /**
   * Set RGB color for a channel (will be sent on next render frame)
   */
  setChannelRgb(channelId: number, rgb: RGB): void {
    this.frameBuffer.set(channelId, rgb);
  }

  /**
   * Set RGB color for a light by its ID
   */
  setLightRgb(lightId: string, rgb: RGB): void {
    const mapping = this.channelMappings.find((m) => m.lightId === lightId);
    if (mapping) {
      this.setChannelRgb(mapping.channelId, rgb);
    }
  }

  /**
   * Set RGB colors for all channels at once
   */
  setAllChannels(channels: Map<number, RGB>): void {
    for (const [channelId, rgb] of channels) {
      this.frameBuffer.set(channelId, rgb);
    }
  }

  /**
   * Clear all pending frame data
   */
  clearFrameBuffer(): void {
    this.frameBuffer.clear();
  }

  /**
   * Get channel ID for a light ID
   */
  getChannelForLight(lightId: string): number | null {
    const mapping = this.channelMappings.find((m) => m.lightId === lightId);
    return mapping?.channelId ?? null;
  }

  /**
   * Check if a light is in the entertainment zone
   */
  isLightInZone(lightId: string): boolean {
    return this.channelMappings.some((m) => m.lightId === lightId);
  }

  /**
   * Get current frame statistics
   */
  getStats(): {
    streaming: boolean;
    frameCount: number;
    channelCount: number;
    fps: number;
  } {
    return {
      streaming: this.streaming,
      frameCount: this.frameCount,
      channelCount: this.frameBuffer.size,
      fps: this.options.targetFps ?? DEFAULT_FPS,
    };
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const intervalMs = 1000 / (this.options.targetFps ?? DEFAULT_FPS);

    this.renderLoop = setInterval(() => {
      this.renderFrame();
    }, intervalMs);

    // Keepalive timer - send frame even if nothing changed
    this.keepaliveLoop = setInterval(() => {
      if (this.frameBuffer.size === 0 && this.lastSentFrame.size > 0) {
        // Resend last frame to keep connection alive
        this.sendFrame(this.lastSentFrame);
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  /**
   * Stop the render loop
   */
  private stopRenderLoop(): void {
    if (this.renderLoop) {
      clearInterval(this.renderLoop);
      this.renderLoop = null;
    }
    if (this.keepaliveLoop) {
      clearInterval(this.keepaliveLoop);
      this.keepaliveLoop = null;
    }
  }

  /**
   * Render a single frame
   */
  private renderFrame(): void {
    if (!this.connection?.connected() || !this.messageBuilder) {
      return;
    }

    // Only send if there's data in the buffer
    if (this.frameBuffer.size === 0) {
      return;
    }

    // Copy current buffer for sending
    const frameData = new Map(this.frameBuffer);

    // Send the frame
    if (this.sendFrame(frameData)) {
      this.frameCount++;
      this.lastSentFrame = frameData;
      this.emit('frame', this.frameCount, frameData.size);
    }
  }

  /**
   * Send a frame to the bridge
   */
  private sendFrame(channels: Map<number, RGB>): boolean {
    if (!this.connection || !this.messageBuilder) {
      return false;
    }

    try {
      const message = this.messageBuilder.buildRgbMessage(channels);
      return this.connection.send(message);
    } catch (err) {
      console.error('[HueStreamingService] sendFrame error:', err);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.stopRenderLoop();

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    // Deactivate streaming on the bridge
    if (this.stopStreamingCallback) {
      try {
        await this.stopStreamingCallback();
      } catch (error) {
        console.error('[HueStreamingService] Failed to stop streaming on bridge:', error);
      }
    }

    this.frameBuffer.clear();
    this.lastSentFrame.clear();
    // Note: frameCount is intentionally NOT reset here so stats can be read after stop()
    this.messageBuilder = null;
  }
}
