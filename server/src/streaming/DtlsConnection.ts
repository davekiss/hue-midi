/**
 * DTLS Connection Wrapper for Hue Entertainment API
 *
 * Handles secure UDP connection to Hue Bridge using DTLS with PSK authentication.
 * Uses node-dtls-client for the underlying DTLS implementation.
 */

import { EventEmitter } from 'events';
import { dtls } from 'node-dtls-client';

const HUE_STREAMING_PORT = 2100;
const DEFAULT_TIMEOUT = 10000;
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 3;

/** Connection options for DTLS */
export interface DtlsConnectionOptions {
  host: string;
  port?: number;
  pskIdentity: string; // hue-application-id
  pskSecret: string; // clientKey as hex string (will be converted internally)
  timeout?: number;
}

export interface DtlsConnectionEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  data: (data: Buffer) => void;
}

export class DtlsConnection extends EventEmitter {
  private socket: dtls.Socket | null = null;
  private options: Required<Pick<DtlsConnectionOptions, 'host' | 'port' | 'pskIdentity' | 'pskSecret' | 'timeout'>>;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: DtlsConnectionOptions) {
    super();
    this.options = {
      host: options.host,
      port: options.port ?? HUE_STREAMING_PORT,
      pskIdentity: options.pskIdentity,
      pskSecret: options.pskSecret,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Establish DTLS connection to Hue Bridge
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`DTLS connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      try {
        // node-dtls-client uses Buffer.from(psk, "ascii") internally
        // We need to convert our hex clientKey to raw bytes, then to a latin1 string
        // so that when the library converts it back, we get the correct 16-byte PSK
        const pskBuffer = Buffer.from(this.options.pskSecret, 'hex');
        const pskString = pskBuffer.toString('latin1');

        console.log('[DtlsConnection] Connecting to', this.options.host + ':' + this.options.port);
        console.log('[DtlsConnection] PSK identity:', this.options.pskIdentity);
        console.log('[DtlsConnection] PSK length:', pskBuffer.length, 'bytes');

        const config: dtls.Options = {
          type: 'udp4',
          address: this.options.host,
          port: this.options.port,
          psk: {
            [this.options.pskIdentity]: pskString,
          },
          timeout: this.options.timeout,
        };

        console.log('[DtlsConnection] Creating DTLS socket with config:', JSON.stringify({
          type: config.type,
          address: config.address,
          port: config.port,
          timeout: config.timeout,
          pskIdentityLength: Object.keys(config.psk || {}).length,
        }));

        this.socket = dtls.createSocket(config);

        this.socket.on('connected', () => {
          console.log('[DtlsConnection] Socket connected event received');
          clearTimeout(timeoutHandle);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.socket.on('error', (err: Error) => {
          console.error('[DtlsConnection] Socket error event:', err.message);
          clearTimeout(timeoutHandle);
          this.handleError(err);
          if (!this.isConnected) {
            reject(err);
          }
        });

        this.socket.on('close', () => {
          console.log('[DtlsConnection] Socket close event, isConnected:', this.isConnected);
          clearTimeout(timeoutHandle);
          if (!this.isConnected) {
            // Socket closed during connection attempt (likely handshake failure)
            reject(new Error('DTLS socket closed during handshake'));
          } else {
            this.handleDisconnect('Socket closed');
          }
        });

        this.socket.on('message', (msg: Buffer) => {
          this.emit('data', msg);
        });
      } catch (err) {
        clearTimeout(timeoutHandle);
        reject(err);
      }
    });
  }

  /**
   * Send data over the DTLS connection
   */
  send(data: Buffer): boolean {
    if (!this.isConnected || !this.socket) {
      return false;
    }

    try {
      this.socket.send(data);
      return true;
    } catch (err) {
      this.handleError(err as Error);
      return false;
    }
  }

  /**
   * Close the DTLS connection
   */
  async close(): Promise<void> {
    this.clearReconnectTimer();

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors
      }
      this.socket = null;
    }

    this.isConnected = false;
    this.emit('disconnected', 'Connection closed');
  }

  /**
   * Check if connection is active
   */
  connected(): boolean {
    return this.isConnected;
  }

  /**
   * Handle connection errors
   */
  private handleError(error: Error): void {
    console.error('[DtlsConnection] Error:', error.message);
    this.emit('error', error);

    if (this.isConnected) {
      this.handleDisconnect(`Error: ${error.message}`);
    }
  }

  /**
   * Handle disconnection with optional reconnection
   */
  private handleDisconnect(reason: string): void {
    if (!this.isConnected) return;

    this.isConnected = false;
    this.socket = null;
    this.emit('disconnected', reason);

    // Attempt reconnection if not closed intentionally
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      console.log(
        `[DtlsConnection] Reconnection attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
      );

      try {
        await this.connect();
        console.log('[DtlsConnection] Reconnected successfully');
      } catch (err) {
        console.error('[DtlsConnection] Reconnection failed:', (err as Error).message);
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect();
        }
      }
    }, RECONNECT_DELAY * this.reconnectAttempts);
  }

  /**
   * Clear any pending reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
