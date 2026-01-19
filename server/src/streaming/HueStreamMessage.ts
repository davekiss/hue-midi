/**
 * Hue Entertainment API Binary Protocol Message Builder
 *
 * Message format (V2 API):
 * - Header: 16 bytes
 *   - "HueStream" (9 bytes ASCII)
 *   - Version: 0x02, 0x00 (2 bytes)
 *   - Sequence ID: 1 byte (ignored by bridge)
 *   - Reserved: 2 bytes (0x00, 0x00)
 *   - Color Space: 1 byte (0x00=RGB, 0x01=XY)
 *   - Reserved: 1 byte (0x00)
 * - Entertainment Config ID: 36 bytes (UUID string)
 * - Per-channel data: 7 bytes each (max 20 channels)
 *   - Channel ID: 1 byte
 *   - Color: 6 bytes (3x uint16 big-endian for R,G,B or X,Y,Brightness)
 */

import type { RGB, XYBrightness, ColorSpace, ChannelFrame } from './types';

const PROTOCOL_NAME = Buffer.from('HueStream', 'ascii');
const VERSION_MAJOR = 0x02;
const VERSION_MINOR = 0x00;
const HEADER_LENGTH = 16;
const UUID_LENGTH = 36;
const CHANNEL_DATA_LENGTH = 7;
const MAX_CHANNELS = 20;

const COLOR_SPACE_RGB = 0x00;
const COLOR_SPACE_XY = 0x01;

export class HueStreamMessage {
  private sequenceId = 0;
  private entertainmentConfigId: string;

  constructor(entertainmentConfigId: string) {
    if (entertainmentConfigId.length !== UUID_LENGTH) {
      throw new Error(`Entertainment config ID must be ${UUID_LENGTH} characters (UUID format)`);
    }
    this.entertainmentConfigId = entertainmentConfigId;
  }

  /**
   * Build an RGB message for multiple channels
   * @param channels Map of channelId to RGB color [0-255, 0-255, 0-255]
   */
  buildRgbMessage(channels: Map<number, RGB>): Buffer {
    return this.buildMessage(channels, 'rgb');
  }

  /**
   * Build an XY+Brightness message for multiple channels
   * @param channels Map of channelId to XYBrightness
   */
  buildXyMessage(channels: Map<number, XYBrightness>): Buffer {
    return this.buildMessage(channels, 'xy');
  }

  /**
   * Build a message with the specified color space
   */
  private buildMessage(
    channels: Map<number, RGB | XYBrightness>,
    colorSpace: ColorSpace
  ): Buffer {
    const channelCount = Math.min(channels.size, MAX_CHANNELS);
    const totalLength = HEADER_LENGTH + UUID_LENGTH + CHANNEL_DATA_LENGTH * channelCount;
    const buffer = Buffer.alloc(totalLength);

    let offset = 0;

    // Write header
    offset = this.writeHeader(buffer, offset, colorSpace);

    // Write entertainment config UUID
    offset += buffer.write(this.entertainmentConfigId, offset, 'ascii');

    // Write channel data
    let count = 0;
    for (const [channelId, color] of channels) {
      if (count >= MAX_CHANNELS) break;

      if (colorSpace === 'rgb') {
        offset = this.writeRgbChannel(buffer, offset, channelId, color as RGB);
      } else {
        offset = this.writeXyChannel(buffer, offset, channelId, color as XYBrightness);
      }
      count++;
    }

    // Increment sequence for next message
    this.sequenceId = (this.sequenceId + 1) % 256;

    return buffer;
  }

  /**
   * Write the 16-byte header
   */
  private writeHeader(buffer: Buffer, offset: number, colorSpace: ColorSpace): number {
    // Protocol name: "HueStream" (9 bytes)
    PROTOCOL_NAME.copy(buffer, offset);
    offset += 9;

    // Version: 2.0 (2 bytes)
    buffer.writeUInt8(VERSION_MAJOR, offset++);
    buffer.writeUInt8(VERSION_MINOR, offset++);

    // Sequence ID (1 byte)
    buffer.writeUInt8(this.sequenceId, offset++);

    // Reserved (2 bytes)
    buffer.writeUInt8(0x00, offset++);
    buffer.writeUInt8(0x00, offset++);

    // Color space (1 byte)
    buffer.writeUInt8(colorSpace === 'rgb' ? COLOR_SPACE_RGB : COLOR_SPACE_XY, offset++);

    // Reserved (1 byte)
    buffer.writeUInt8(0x00, offset++);

    return offset;
  }

  /**
   * Write RGB channel data (7 bytes)
   */
  private writeRgbChannel(buffer: Buffer, offset: number, channelId: number, rgb: RGB): number {
    // Channel ID (1 byte)
    buffer.writeUInt8(channelId, offset++);

    // RGB values as 16-bit (scale 0-255 to 0-65535)
    buffer.writeUInt16BE(this.scaleRgb(rgb[0]), offset);
    offset += 2;
    buffer.writeUInt16BE(this.scaleRgb(rgb[1]), offset);
    offset += 2;
    buffer.writeUInt16BE(this.scaleRgb(rgb[2]), offset);
    offset += 2;

    return offset;
  }

  /**
   * Write XY+Brightness channel data (7 bytes)
   */
  private writeXyChannel(
    buffer: Buffer,
    offset: number,
    channelId: number,
    xy: XYBrightness
  ): number {
    // Channel ID (1 byte)
    buffer.writeUInt8(channelId, offset++);

    // X, Y as 16-bit (scale 0-1 to 0-65535)
    buffer.writeUInt16BE(this.scaleXy(xy.x), offset);
    offset += 2;
    buffer.writeUInt16BE(this.scaleXy(xy.y), offset);
    offset += 2;

    // Brightness as 16-bit (scale 0-254 to 0-65535)
    buffer.writeUInt16BE(this.scaleBrightness(xy.brightness), offset);
    offset += 2;

    return offset;
  }

  /**
   * Scale RGB value from 0-255 to 0-65535
   */
  private scaleRgb(value: number): number {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    if (clamped === 0) return 0;
    return Math.round((clamped / 255) * 65535);
  }

  /**
   * Scale XY value from 0-1 to 0-65535
   */
  private scaleXy(value: number): number {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped === 0) return 0;
    if (clamped === 1) return 65535;
    return Math.round(clamped * 65535);
  }

  /**
   * Scale brightness from 0-254 to 0-65535
   */
  private scaleBrightness(value: number): number {
    const clamped = Math.max(0, Math.min(254, Math.round(value)));
    if (clamped === 0) return 0;
    return Math.round((clamped / 254) * 65535);
  }

  /**
   * Get current sequence ID (for debugging)
   */
  getSequenceId(): number {
    return this.sequenceId;
  }

  /**
   * Reset sequence ID
   */
  resetSequence(): void {
    this.sequenceId = 0;
  }
}

/**
 * Helper to convert hex string clientKey to Buffer
 * @param hex 32-character hex string
 * @returns 16-byte Buffer
 */
export function hexToBuffer(hex: string): Buffer {
  if (hex.length !== 32) {
    throw new Error('Client key must be 32 hex characters (16 bytes)');
  }
  return Buffer.from(hex, 'hex');
}
