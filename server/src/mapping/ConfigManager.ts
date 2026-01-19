import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, MidiMapping, Scene } from '../types';

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config.json');
    this.config = this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): Config {
    return {
      connectionMode: 'bridge',
      mappings: [],
      midiPortName: undefined,
      bridgeIp: undefined,
      bridgeUsername: undefined,
      scenes: [],
      streaming: {
        enabled: false,
        entertainmentConfigId: undefined,
        clientKey: undefined,
      },
    };
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Config> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      if (!Array.isArray(this.config.scenes)) {
        this.config.scenes = [];
      }
      // Ensure streaming config exists
      if (!this.config.streaming) {
        this.config.streaming = {
          enabled: false,
          entertainmentConfigId: undefined,
          clientKey: undefined,
        };
      }
      console.log(`Configuration loaded from ${this.configPath}`);
      return this.config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('No config file found, using defaults');
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async save(config?: Config): Promise<void> {
    if (config) {
      this.config = config;
    }

    const data = JSON.stringify(this.config, null, 2);
    await fs.writeFile(this.configPath, data, 'utf-8');
    console.log(`Configuration saved to ${this.configPath}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<Config>): void {
    this.config = {
      ...this.config,
      ...updates,
      scenes: updates.scenes ?? this.config.scenes
    };
  }

  /**
   * Add mapping to config
   */
  addMapping(mapping: MidiMapping): void {
    if (mapping.triggerType === 'cc') {
      // Remove existing CC mapping with same ccNumber/channel/ccValue/preset
      this.config.mappings = this.config.mappings.filter(m => {
        if (m.triggerType !== 'cc') return true;
        if (m.ccNumber !== mapping.ccNumber || m.midiChannel !== mapping.midiChannel) return true;
        // Different preset = different mapping, keep it
        if (m.preset !== mapping.preset) return true;
        // Same CC number, channel, and preset - check value match
        if (mapping.ccValue !== undefined && m.ccValue !== undefined) {
          return m.ccValue !== mapping.ccValue;
        }
        return false; // Remove if both are any-value mappings for same preset
      });
    } else {
      // Remove existing note mapping with same note/channel/preset
      this.config.mappings = this.config.mappings.filter(
        m => !(m.triggerType !== 'cc' && m.midiNote === mapping.midiNote && m.midiChannel === mapping.midiChannel && m.preset === mapping.preset)
      );
    }
    this.config.mappings.push(mapping);
  }

  /**
   * Remove mapping from config
   */
  removeMapping(note: number, channel: number, triggerType?: 'note' | 'cc', ccValue?: number, preset?: number): void {
    if (triggerType === 'cc') {
      // Remove CC mapping
      this.config.mappings = this.config.mappings.filter(m => {
        if (m.triggerType !== 'cc') return true;
        if (m.ccNumber !== note || m.midiChannel !== channel) return true;
        // If preset is specified, only remove mappings with matching preset
        if (preset !== undefined && m.preset !== preset) return true;
        if (ccValue !== undefined) {
          return m.ccValue !== ccValue;
        }
        return false; // Remove matching CC mapping
      });
    } else {
      // Remove note mapping
      this.config.mappings = this.config.mappings.filter(m => {
        if (m.triggerType === 'cc') return true;
        if (m.midiNote !== note || m.midiChannel !== channel) return true;
        // If preset is specified, only remove mappings with matching preset
        if (preset !== undefined && m.preset !== preset) return true;
        return false;
      });
    }
  }

  /**
   * Get all mappings
   */
  getMappings(): MidiMapping[] {
    return [...this.config.mappings];
  }

  /**
   * Clear all mappings
   */
  clearMappings(): void {
    this.config.mappings = [];
  }

  /**
   * Scene helpers
   */
  getScenes(): Scene[] {
    return [...this.config.scenes];
  }

  upsertScene(scene: Scene): void {
    const existingIndex = this.config.scenes.findIndex(s => s.id === scene.id);
    if (existingIndex >= 0) {
      this.config.scenes[existingIndex] = scene;
    } else {
      this.config.scenes.push(scene);
    }
  }

  removeScene(sceneId: string): void {
    this.config.scenes = this.config.scenes.filter(scene => scene.id !== sceneId);
  }

  /**
   * Update streaming configuration
   */
  updateStreamingConfig(updates: Partial<Config['streaming']>): void {
    this.config.streaming = {
      ...this.config.streaming,
      enabled: updates?.enabled ?? this.config.streaming?.enabled ?? false,
      entertainmentConfigId: updates?.entertainmentConfigId ?? this.config.streaming?.entertainmentConfigId,
      clientKey: updates?.clientKey ?? this.config.streaming?.clientKey,
    };
  }

  /**
   * Get streaming configuration
   */
  getStreamingConfig(): Config['streaming'] {
    return this.config.streaming;
  }
}
