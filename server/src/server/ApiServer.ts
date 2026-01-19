import express, { Express, Request, Response } from 'express';
import { Server as WebSocketServer } from 'ws';
import * as http from 'http';
import * as path from 'path';
import { MidiHandler } from '../midi/MidiHandler';
import { HueBridgeController } from '../hue/HueBridgeController';
import { HueBluetoothController } from '../hue/HueBluetoothController';
import { MappingEngine } from '../mapping/MappingEngine';
import { ConfigManager } from '../mapping/ConfigManager';
import { CustomEffectsEngine, CustomEffectType } from '../effects/CustomEffectsEngine';
import { HueStreamingService, StreamingRouter, ChannelMapping } from '../streaming';
import { HueLight, MidiMapping, Scene, SceneLightState, SceneTransition, LightStateOverride, LightAnimationSync, LightAnimation } from '../types';
import { randomUUID } from 'crypto';

export class ApiServer {
  private app: Express;
  private server: http.Server;
  private wss: WebSocketServer;
  private midiHandler: MidiHandler;
  private bridgeController: HueBridgeController;
  private bluetoothController: HueBluetoothController;
  private mappingEngine: MappingEngine;
  private configManager: ConfigManager;
  private customEffectsEngine: CustomEffectsEngine;
  private streamingService: HueStreamingService | null = null;
  private streamingRouter: StreamingRouter | null = null;
  private channelMappings: ChannelMapping[] = [];

  constructor(
    midiHandler: MidiHandler,
    bridgeController: HueBridgeController,
    bluetoothController: HueBluetoothController,
    mappingEngine: MappingEngine,
    configManager: ConfigManager
  ) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.midiHandler = midiHandler;
    this.bridgeController = bridgeController;
    this.bluetoothController = bluetoothController;
    this.mappingEngine = mappingEngine;
    this.configManager = configManager;
    this.customEffectsEngine = new CustomEffectsEngine(bridgeController);

    // Connect CustomEffectsEngine to MappingEngine so custom effects work even without streaming
    this.mappingEngine.setCustomEffectsEngine(this.customEffectsEngine);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventListeners();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Config routes
    this.app.get('/api/config', this.getConfig.bind(this));
    this.app.post('/api/config', this.updateConfig.bind(this));

    // MIDI routes
    this.app.get('/api/midi/ports', this.getMidiPorts.bind(this));
    this.app.post('/api/midi/port', this.setMidiPort.bind(this));

    // Hue Bridge routes
    this.app.get('/api/hue/bridges', this.discoverBridges.bind(this));
    this.app.post('/api/hue/bridge/user', this.createBridgeUser.bind(this));
    this.app.post('/api/hue/bridge/connect', this.connectToBridge.bind(this));
    this.app.get('/api/hue/lights', this.getLights.bind(this));

    // Hue Bluetooth routes
    this.app.get('/api/hue/bluetooth/status', this.getBluetoothStatus.bind(this));
    this.app.post('/api/hue/bluetooth/scan', this.scanBluetoothLights.bind(this));
    this.app.post('/api/hue/bluetooth/connect', this.connectBluetoothLight.bind(this));
    this.app.post('/api/hue/bluetooth/connect-manual', this.connectBluetoothLightManual.bind(this));
    this.app.post('/api/hue/bluetooth/disconnect', this.disconnectBluetoothLight.bind(this));
    this.app.get('/api/hue/bluetooth/lights', this.getBluetoothLights.bind(this));

    // Mapping routes
    this.app.get('/api/mappings', this.getMappings.bind(this));
    this.app.post('/api/mappings', this.addMapping.bind(this));
    this.app.delete('/api/mappings/:channel/:note', this.removeMapping.bind(this));
    this.app.post('/api/mappings/clear', this.clearMappings.bind(this));

    // Scene routes
    this.app.get('/api/scenes', this.getScenes.bind(this));
    this.app.get('/api/scenes/:id', this.getSceneById.bind(this));
    this.app.post('/api/scenes', this.createScene.bind(this));
    this.app.put('/api/scenes/:id', this.updateScene.bind(this));
    this.app.delete('/api/scenes/:id', this.deleteScene.bind(this));

    // Test routes
    this.app.post('/api/test/light', this.testLight.bind(this));
    this.app.post('/api/test/scene', this.previewScene.bind(this));
    this.app.post('/api/test/scene/stop', this.stopScenePreview.bind(this));
    this.app.get('/api/tempo', this.getTempo.bind(this));
    this.app.post('/api/test/bluetooth/diagnostic', this.testBluetoothDiagnostic.bind(this));

    // Entertainment/Streaming routes
    this.app.get('/api/hue/entertainment/configurations', this.getEntertainmentConfigurations.bind(this));
    this.app.post('/api/hue/entertainment/clientkey', this.generateClientKey.bind(this));
    this.app.post('/api/hue/entertainment/start', this.startStreaming.bind(this));
    this.app.post('/api/hue/entertainment/stop', this.stopStreaming.bind(this));
    this.app.get('/api/hue/entertainment/status', this.getStreamingStatus.bind(this));
  }

  /**
   * Setup WebSocket for real-time updates
   */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected');

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcast(type: string, data: any): void {
    const message = JSON.stringify({ type, data });
    this.wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // MIDI events
    this.midiHandler.on('note', (message) => {
      this.broadcast('midi', message);
    });

    this.midiHandler.on('cc', (message) => {
      this.broadcast('cc', message);
    });

    this.midiHandler.on('pc', (message) => {
      this.broadcast('pc', message);
    });

    // Mapping events
    this.mappingEngine.on('lightControlled', (data) => {
      this.broadcast('lightControlled', data);
    });

    this.mappingEngine.on('error', (error) => {
      this.broadcast('error', error);
    });

    this.mappingEngine.on('tempoChanged', (tempo) => {
      this.broadcast('tempo', tempo);
    });
  }

  // API Route Handlers

  private async getConfig(req: Request, res: Response): Promise<void> {
    res.json(this.configManager.getConfig());
  }

  private async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      this.configManager.updateConfig(req.body);
      await this.configManager.save();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getMidiPorts(req: Request, res: Response): Promise<void> {
    const ports = this.midiHandler.listPorts();
    res.json({ ports });
  }

  private async setMidiPort(req: Request, res: Response): Promise<void> {
    try {
      const { portName } = req.body;
      if (portName) {
        this.midiHandler.openPort(portName);
      } else {
        this.midiHandler.openVirtualPort();
      }
      res.json({ success: true, port: this.midiHandler.getCurrentPort() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async discoverBridges(req: Request, res: Response): Promise<void> {
    try {
      const bridges = await this.bridgeController.discoverBridges();
      res.json({ bridges });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async createBridgeUser(req: Request, res: Response): Promise<void> {
    try {
      const { bridgeIp } = req.body;
      const username = await this.bridgeController.createUser(bridgeIp);
      res.json({ username });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async connectToBridge(req: Request, res: Response): Promise<void> {
    try {
      const { bridgeIp, username } = req.body;
      await this.bridgeController.connect(bridgeIp, username);
      this.configManager.updateConfig({ bridgeIp, bridgeUsername: username });
      await this.configManager.save();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getLights(req: Request, res: Response): Promise<void> {
    try {
      // Prevent caching of lights list
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const lights: HueLight[] = [];
      let bridgeConnected = false;
      let bridgeError: string | undefined;

      // Try to get Bridge lights
      try {
        const bridgeLights = await this.bridgeController.getLights();
        // Only include reachable bridge lights to avoid stale entries
        const reachableBridgeLights = bridgeLights.filter((light) => light.reachable !== false);
        lights.push(...reachableBridgeLights);
        bridgeConnected = true;
      } catch (error) {
        bridgeError = error instanceof Error ? error.message : String(error);
      }

      // Add Bluetooth lights (already discovered/connected)
      const btLights = this.bluetoothController.getConnectedLights();
      lights.push(...btLights);

      res.json({ lights, bridgeConnected, bridgeError });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getMappings(req: Request, res: Response): Promise<void> {
    const mappings = this.mappingEngine.getMappings();
    res.json({ mappings });
  }

  private async addMapping(req: Request, res: Response): Promise<void> {
    try {
      const mapping: MidiMapping = req.body;
      this.mappingEngine.addMapping(mapping);
      this.configManager.addMapping(mapping);
      await this.configManager.save();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async removeMapping(req: Request, res: Response): Promise<void> {
    try {
      const channel = parseInt(req.params.channel);
      const note = parseInt(req.params.note);
      const triggerType = req.query.triggerType as 'note' | 'cc' | undefined;
      const ccValue = req.query.ccValue ? parseInt(req.query.ccValue as string) : undefined;
      const preset = req.query.preset ? parseInt(req.query.preset as string) : undefined;

      this.mappingEngine.removeMapping(note, channel, triggerType, ccValue, preset);
      this.configManager.removeMapping(note, channel, triggerType, ccValue, preset);
      await this.configManager.save();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async clearMappings(req: Request, res: Response): Promise<void> {
    try {
      this.mappingEngine.clearMappings();
      this.configManager.clearMappings();
      await this.configManager.save();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getScenes(req: Request, res: Response): Promise<void> {
    try {
      const scenes = this.configManager.getScenes();
      res.json({ scenes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getSceneById(req: Request, res: Response): Promise<void> {
    try {
      const scene = this.configManager.getScenes().find(s => s.id === req.params.id);
      if (!scene) {
        res.status(404).json({ error: 'Scene not found' });
        return;
      }
      res.json({ scene });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async createScene(req: Request, res: Response): Promise<void> {
    try {
      const scene = this.normalizeSceneForCreate(req.body as unknown);
      this.configManager.upsertScene(scene);
      await this.configManager.save();
      this.mappingEngine.upsertScene(scene);
      res.status(201).json({ scene });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  private async updateScene(req: Request, res: Response): Promise<void> {
    try {
      const existing = this.configManager.getScenes().find(s => s.id === req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Scene not found' });
        return;
      }

      const updated = this.normalizeSceneForUpdate(req.body as unknown, existing);
      this.configManager.upsertScene(updated);
      await this.configManager.save();
      this.mappingEngine.upsertScene(updated);
      res.json({ scene: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  private async deleteScene(req: Request, res: Response): Promise<void> {
    try {
      const sceneId = req.params.id;
      const existing = this.configManager.getScenes().find(s => s.id === sceneId);
      if (!existing) {
        res.status(404).json({ error: 'Scene not found' });
        return;
      }
      this.configManager.removeScene(sceneId);
      await this.configManager.save();
      this.mappingEngine.removeScene(sceneId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private normalizeSceneForCreate(payload: unknown): Scene {
    if (!this.isRecord(payload)) {
      throw new Error('Scene payload is required');
    }

    const now = new Date().toISOString();
    const id = typeof payload.id === 'string' && payload.id.trim().length > 0 ? payload.id : randomUUID();

    return {
      id,
      name: this.requireNonEmptyString(payload.name, 'name'),
      description: this.optionalString(payload.description),
      tags: this.sanitizeTags(payload.tags),
      createdAt: now,
      updatedAt: now,
      transition: this.sanitizeTransition(payload.transition),
      lights: this.sanitizeSceneLights(payload.lights),
      metadata: this.sanitizeMetadata(payload.metadata),
    };
  }

  private normalizeSceneForUpdate(payload: unknown, existing: Scene): Scene {
    const record = this.isRecord(payload) ? payload : {};
    const now = new Date().toISOString();

    return {
      id: existing.id,
      name: this.requireNonEmptyString(record.name ?? existing.name, 'name'),
      description: record.description !== undefined ? this.optionalString(record.description) : existing.description,
      tags: record.tags !== undefined ? this.sanitizeTags(record.tags) : existing.tags,
      createdAt: existing.createdAt,
      updatedAt: now,
      transition: record.transition !== undefined ? this.sanitizeTransition(record.transition) : existing.transition,
      lights: record.lights !== undefined ? this.sanitizeSceneLights(record.lights) : existing.lights,
      metadata: record.metadata !== undefined ? this.sanitizeMetadata(record.metadata) : existing.metadata,
    };
  }

  private requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Field "${field}" must be a non-empty string`);
    }
    return value.trim();
  }

  private optionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value);
  }

  private sanitizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(tag => String(tag)).filter(tag => tag.trim().length > 0);
  }

  private sanitizeTransition(value: unknown): SceneTransition | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const transition: SceneTransition = {};

    if (value.durationMs !== undefined) {
      const duration = Number(value.durationMs);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error('transition.durationMs must be a non-negative number');
      }
      transition.durationMs = duration;
    }

    if (value.staggerMs !== undefined) {
      const stagger = Number(value.staggerMs);
      if (!Number.isFinite(stagger) || stagger < 0) {
        throw new Error('transition.staggerMs must be a non-negative number');
      }
      transition.staggerMs = stagger;
    }

    if (value.easing !== undefined) {
      const allowed: ReadonlyArray<NonNullable<SceneTransition['easing']>> = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'sine', 'bounce'];
      const easingCandidate = value.easing;
      if (typeof easingCandidate !== 'string' || !allowed.includes(easingCandidate as NonNullable<SceneTransition['easing']>)) {
        throw new Error(`transition.easing must be one of: ${allowed.join(', ')}`);
      }
      transition.easing = easingCandidate as NonNullable<SceneTransition['easing']>;
    }

    return Object.keys(transition).length > 0 ? transition : undefined;
  }

  private sanitizeSceneLights(value: unknown): SceneLightState[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item, index) => {
      if (!this.isRecord(item)) {
        throw new Error(`Scene light entry at index ${index} must be an object`);
      }

      const targetId = this.requireNonEmptyString(item.targetId, `lights[${index}].targetId`);
      const targetType = item.targetType === 'grouped_light' ? 'grouped_light' : 'light';
      const state = this.sanitizeLightState(item.state);
      const animation = this.sanitizeLightAnimation(item.animation);

      return {
        targetId,
        targetType,
        state,
        animation,
      };
    });
  }

  private sanitizeMetadata(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (!this.isRecord(value)) {
      throw new Error('metadata must be an object');
    }
    return value;
  }

  private sanitizeLightState(value: unknown): SceneLightState['state'] {
    const record = this.isRecord(value) ? value : {};
    const state: SceneLightState['state'] = {
      on: typeof record.on === 'boolean' ? record.on : true,
    };

    if (typeof record.brightness === 'number') state.brightness = record.brightness;
    if (typeof record.hue === 'number') state.hue = record.hue;
    if (typeof record.saturation === 'number') state.saturation = record.saturation;
    if (typeof record.colorTemp === 'number') state.colorTemp = record.colorTemp;
    if (typeof record.transitionTime === 'number') state.transitionTime = record.transitionTime;

    const effect = this.sanitizeEffect(record.effect);
    if (effect) {
      state.effect = effect;
    }

    const effectColor = this.sanitizePoint(record.effectColor);
    if (effectColor) {
      state.effectColor = effectColor;
    }

    if (record.effectSpeed !== undefined) {
      const speed = Number(record.effectSpeed);
      if (Number.isFinite(speed)) {
        state.effectSpeed = Math.min(1, Math.max(0, speed));
      }
    }

    if (this.isRecord(record.effectTemperature) && typeof record.effectTemperature.mirek === 'number') {
      state.effectTemperature = { mirek: record.effectTemperature.mirek };
    }

    if (Array.isArray(record.gradient)) {
      const gradient = record.gradient
        .map(point => this.sanitizePoint(point))
        .filter((point): point is { x: number; y: number } => point !== undefined);
      if (gradient.length > 0) {
        state.gradient = gradient;
      }
    }

    const gradientMode = this.sanitizeGradientMode(record.gradientMode);
    if (gradientMode) {
      state.gradientMode = gradientMode;
    }

    return state;
  }

  private sanitizeLightAnimation(value: unknown): SceneLightState['animation'] {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const mode = value.mode === 'loop' ? 'loop' : undefined;
    if (!mode) {
      return undefined;
    }

    const stepsValue = Array.isArray(value.steps) ? value.steps : [];
    if (stepsValue.length === 0) {
      return undefined;
    }

    const steps = stepsValue.map((step, index) => {
      if (!this.isRecord(step)) {
        throw new Error(`animation.steps[${index}] must be an object`);
      }

      const id = typeof step.id === 'string' && step.id.trim().length > 0 ? step.id.trim() : randomUUID();
      const label = typeof step.label === 'string' && step.label.trim().length > 0 ? step.label.trim() : undefined;

      const durationBeats = step.durationBeats !== undefined ? Number(step.durationBeats) : undefined;
      if (durationBeats !== undefined && (!Number.isFinite(durationBeats) || durationBeats <= 0)) {
        throw new Error(`animation.steps[${index}].durationBeats must be a positive number`);
      }

      const durationMs = step.durationMs !== undefined ? Number(step.durationMs) : undefined;
      if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) {
        throw new Error(`animation.steps[${index}].durationMs must be a positive number`);
      }

      if (durationBeats === undefined && durationMs === undefined) {
        throw new Error(`animation.steps[${index}] must specify durationBeats or durationMs`);
      }

      const state = this.sanitizeLightStateOverride(step.state, index);

      return {
        id,
        label,
        durationBeats,
        durationMs,
        state,
      };
    });

    const syncValue = this.isRecord(value.sync) ? value.sync : undefined;
    const sync = syncValue
      ? {
          groupId: typeof syncValue.groupId === 'string' && syncValue.groupId.trim().length > 0 ? syncValue.groupId.trim() : undefined,
          beatDivision: this.sanitizeBeatDivision(syncValue.beatDivision),
        }
      : undefined;

    const preset = this.sanitizeAnimationPreset(value.preset);

    return {
      mode,
      steps,
      sync,
      ...(preset ? { preset } : {}),
    };
  }

  private sanitizeBeatDivision(value: unknown): LightAnimationSync['beatDivision'] {
    const allowed: LightAnimationSync['beatDivision'][] = ['1', '1/2', '1/4', '1/8', '1/16'];
    if (typeof value === 'string' && (allowed as string[]).includes(value)) {
      return value as LightAnimationSync['beatDivision'];
    }
    return undefined;
  }

  private sanitizeLightStateOverride(value: unknown, stepIndex: number): LightStateOverride {
    const record = this.isRecord(value) ? value : {};
    const state: LightStateOverride = {};

    if ('on' in record) state.on = Boolean(record.on);
    if (typeof record.brightness === 'number') state.brightness = record.brightness;
    if (typeof record.hue === 'number') state.hue = record.hue;
    if (typeof record.saturation === 'number') state.saturation = record.saturation;
    if (typeof record.colorTemp === 'number') state.colorTemp = record.colorTemp;

    if (record.effect !== undefined) {
      const effect = this.sanitizeEffect(record.effect);
      if (effect) {
        state.effect = effect;
      }
    }

    const effectColor = this.sanitizePoint(record.effectColor);
    if (effectColor) {
      state.effectColor = effectColor;
    }

    if (record.effectSpeed !== undefined) {
      const speed = Number(record.effectSpeed);
      if (Number.isFinite(speed)) {
        state.effectSpeed = Math.min(1, Math.max(0, speed));
      }
    }

    if (this.isRecord(record.effectTemperature) && typeof record.effectTemperature.mirek === 'number') {
      state.effectTemperature = { mirek: record.effectTemperature.mirek };
    }

    if (Array.isArray(record.gradient)) {
      const gradient = record.gradient
        .map(point => this.sanitizePoint(point))
        .filter((point): point is { x: number; y: number } => point !== undefined);
      if (gradient.length > 0) {
        state.gradient = gradient;
      }
    }

    const gradientMode = this.sanitizeGradientMode(record.gradientMode);
    if (gradientMode) {
      state.gradientMode = gradientMode;
    }

    if (Object.keys(state).length === 0) {
      throw new Error(`animation.steps[${stepIndex}].state must include at least one property`);
    }

    return state;
  }

  private sanitizeAnimationPreset(value: unknown): LightAnimation['preset'] {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const rawId = value.id;
    if (rawId !== 'chase' && rawId !== 'gradientCrossfade' && rawId !== 'lightning') {
      return undefined;
    }
    const version = value.version !== undefined ? Number(value.version) : undefined;
    if (version !== undefined && (!Number.isFinite(version) || version < 0)) {
      throw new Error('animation.preset.version must be a non-negative number when provided');
    }

    const paramsRecord = this.isRecord(value.params) ? value.params : {};

    switch (rawId) {
      case 'chase': {
        const palette = this.sanitizeGradientPoints(paramsRecord.palette);
        const beatsPerStep = this.optionalPositiveNumber(paramsRecord.beatsPerStep, 'animation.preset.params.beatsPerStep');
        const stopCount = this.optionalPositiveInteger(paramsRecord.stopCount, 'animation.preset.params.stopCount');
        const stepCount = this.optionalPositiveInteger(paramsRecord.stepCount, 'animation.preset.params.stepCount');
        const gradientMode = this.sanitizeGradientMode(paramsRecord.gradientMode);

        return {
          id: 'chase',
          version,
          params: {
            ...(palette.length > 0 ? { palette } : {}),
            ...(beatsPerStep !== undefined ? { beatsPerStep } : {}),
            ...(stopCount !== undefined ? { stopCount } : {}),
            ...(stepCount !== undefined ? { stepCount } : {}),
            ...(gradientMode ? { gradientMode } : {}),
          },
        };
      }
      case 'gradientCrossfade': {
        const toGradient = this.sanitizeGradientPoints(paramsRecord.toGradient);
        if (toGradient.length === 0) {
          throw new Error('animation.preset.params.toGradient must include at least one gradient stop');
        }
        const fromGradient = this.sanitizeGradientPoints(paramsRecord.fromGradient);
        const totalBeats = this.optionalPositiveNumber(paramsRecord.totalBeats, 'animation.preset.params.totalBeats');
        const stepSubdivision = this.optionalPositiveNumber(paramsRecord.stepSubdivision, 'animation.preset.params.stepSubdivision');
        const easing = typeof paramsRecord.easing === 'string' && ['linear', 'easeIn', 'easeOut', 'easeInOut'].includes(paramsRecord.easing)
          ? paramsRecord.easing as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
          : undefined;
        const gradientMode = this.sanitizeGradientMode(paramsRecord.gradientMode);
        return {
          id: 'gradientCrossfade',
          version,
          params: {
            toGradient,
            ...(fromGradient.length > 0 ? { fromGradient } : {}),
            ...(totalBeats !== undefined ? { totalBeats } : {}),
            ...(stepSubdivision !== undefined ? { stepSubdivision } : {}),
            ...(easing ? { easing } : {}),
            ...(gradientMode ? { gradientMode } : {}),
          },
        };
      }
      case 'lightning': {
        const palette = this.sanitizeGradientPoints(paramsRecord.palette);
        const flashCount = this.optionalPositiveInteger(paramsRecord.flashCount, 'animation.preset.params.flashCount');
        const flashBeats = this.optionalPositiveNumber(paramsRecord.flashBeats, 'animation.preset.params.flashBeats');
        const calmBeats = this.optionalPositiveNumber(paramsRecord.calmBeats, 'animation.preset.params.calmBeats');
        const randomness = this.optionalNumberInRange(paramsRecord.randomness, 0, 1, 'animation.preset.params.randomness');
        const seed = paramsRecord.seed !== undefined ? Number(paramsRecord.seed) : undefined;
        if (seed !== undefined && !Number.isFinite(seed)) {
          throw new Error('animation.preset.params.seed must be a finite number when provided');
        }
        const settleBeats = this.optionalNonNegativeNumber(paramsRecord.settleBeats, 'animation.preset.params.settleBeats');
        const brightnessScale = this.optionalPositiveNumber(paramsRecord.brightnessScale, 'animation.preset.params.brightnessScale');

        return {
          id: 'lightning',
          version,
          params: {
            ...(palette.length > 0 ? { palette } : {}),
            ...(flashCount !== undefined ? { flashCount } : {}),
            ...(flashBeats !== undefined ? { flashBeats } : {}),
            ...(calmBeats !== undefined ? { calmBeats } : {}),
            ...(randomness !== undefined ? { randomness } : {}),
            ...(seed !== undefined ? { seed } : {}),
            ...(settleBeats !== undefined ? { settleBeats } : {}),
            ...(brightnessScale !== undefined ? { brightnessScale } : {}),
          },
        };
      }
      default:
        return undefined;
    }
  }

  private sanitizeGradientPoints(value: unknown): Array<{ x: number; y: number }> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(point => this.sanitizePoint(point))
      .filter((point): point is { x: number; y: number } => point !== undefined)
      .slice(0, 5);
  }

  private optionalPositiveNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error(`${fieldName} must be a positive number`);
    }
    return num;
  }

  private optionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(`${fieldName} must be a non-negative number`);
    }
    return num;
  }

  private optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
      throw new Error(`${fieldName} must be a positive integer`);
    }
    return num;
  }

  private optionalNumberInRange(value: unknown, min: number, max: number, fieldName: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return num;
  }

  private sanitizeEffect(value: unknown): SceneLightState['state']['effect'] {
    if (typeof value !== 'string') {
      return undefined;
    }
    const allowed: ReadonlyArray<NonNullable<SceneLightState['state']['effect']>> = [
      'none',
      'colorloop',
      'sparkle',
      'fire',
      'candle',
      'prism',
      'opal',
      'glisten',
      'underwater',
      'cosmos',
      'sunbeam',
      'enchant',
      'flash',
      'pulse',
    ];
    return allowed.includes(value as NonNullable<SceneLightState['state']['effect']>)
      ? (value as SceneLightState['state']['effect'])
      : undefined;
  }

  private sanitizeGradientMode(value: unknown): SceneLightState['state']['gradientMode'] {
    if (typeof value !== 'string') {
      return undefined;
    }
    const allowed: ReadonlyArray<NonNullable<SceneLightState['state']['gradientMode']>> = [
      'interpolated_palette',
      'interpolated_palette_mirrored',
      'random_pixelated',
      'segmented_palette',
    ];
    return allowed.includes(value as NonNullable<SceneLightState['state']['gradientMode']>)
      ? (value as SceneLightState['state']['gradientMode'])
      : undefined;
  }

  private sanitizePoint(value: unknown): { x: number; y: number } | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }
    if (typeof value.x !== 'number' || typeof value.y !== 'number') {
      return undefined;
    }
    return { x: value.x, y: value.y };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async testLight(req: Request, res: Response): Promise<void> {
    try {
      const { lightId, state } = req.body;
      console.log(`[API] testLight called for lightId: ${lightId}, state:`, JSON.stringify(state));

      // Check if this light is connected via Bluetooth
      const isBluetoothLight = this.bluetoothController.isLightConnected(lightId);

      if (isBluetoothLight) {
        console.log(`[API] Using Bluetooth controller for light ${lightId}`);
        await this.bluetoothController.setLightState(lightId, state);
        res.json({ success: true });
        return;
      }

      // Check if streaming is active and this light is in the zone
      const useStreaming = this.streamingRouter?.isStreaming() && this.streamingRouter?.isLightInZone(lightId);
      console.log(`[API] useStreaming: ${useStreaming}, streamingActive: ${this.streamingRouter?.isStreaming()}, inZone: ${this.streamingRouter?.isLightInZone(lightId)}`);

      if (useStreaming) {
        // === STREAMING MODE ===
        // All light control goes through the streaming router
        // Native Hue effects are NOT supported in streaming mode

        // Stop any running custom effect first
        await this.customEffectsEngine.stopEffect(lightId);

        // Handle 'none' effect - stop effects and set static color
        if (state.effect === 'none') {
          console.log(`[API] Stopping effects on light ${lightId} (streaming mode)`);
          await this.customEffectsEngine.stopEffect(lightId);
        }

        // Streaming presets (gradient-aware, 50Hz)
        const streamingPresets = [
          'candle', 'fire', 'fireplace', 'aurora', 'ocean', 'underwater', 'lava',
          'thunderstorm', 'rain', 'forest', 'meadow', 'starfield', 'galaxy',
          'traffic', 'highway',
          'sparkle', 'prism', 'colorloop', 'opal', 'glisten',
          'tv_ballast', 'fluorescent', 'sparse', 'scattered',
          'cozy_window', 'party_window', 'evening_window',
          'marquee', 'marquee_alternate', 'theater',
          'rainbow_chase', 'two_color_chase', 'wave', 'wave_chase', 'bounce', 'bounce_chase', 'comet', 'comet_chase', 'pulse',
        ];

        if (state.effect && streamingPresets.includes(state.effect as string)) {
          console.log(`[API] Starting streaming preset "${state.effect}" on light ${lightId}`);

          const started = await this.customEffectsEngine.startPresetEffect(lightId, state.effect as string, {
            speed: state.effectSpeed ? Math.round(state.effectSpeed * 100) : 50,
            color1: state.effectColor,
            color2: state.effectColor2,
            brightness: state.brightness ?? 254,
            intensity: state.effectIntensity ?? 0.7,
          });

          if (started) {
            res.json({ success: true, mode: 'streaming', effect: state.effect, preset: true });
            return;
          }
          // Fall through if preset not found
        }

        // Handle legacy custom effects via CustomEffectsEngine (BPM-based)
        const customEffects = ['strobe', 'police', 'ambulance', 'lightning', 'color_flash', 'breathe_smooth', 'chase', 'desert', 'tv_flicker'];
        const legacyToCustomMap: Record<string, CustomEffectType> = {
          'pulse': 'breathe_smooth',
          'breathe': 'breathe_smooth',
          'color_cycle': 'chase',
        };

        const effectToUse = legacyToCustomMap[state.effect as string] || state.effect;

        if (state.effect && (customEffects.includes(effectToUse as string) || legacyToCustomMap[state.effect as string])) {
          const bpm = state.effectBpm ?? 120;
          console.log(`[API] Starting legacy custom effect ${effectToUse} on light ${lightId} at ${bpm} BPM`);

          await this.customEffectsEngine.startEffect(lightId, effectToUse as CustomEffectType, {
            speed: bpm,
            color1: state.effectColor,
            color2: state.effectColor2,
            brightness: state.brightness ?? 254,
            intensity: state.effectIntensity ?? 0.7,
          });

          res.json({ success: true, mode: 'streaming', effect: effectToUse });
          return;
        }

        // Set static color/brightness via streaming
        const rgb = this.stateToRgb(state);
        if (rgb) {
          console.log(`[API] Setting color via streaming for light ${lightId}: RGB(${rgb.join(',')})`);
          this.streamingRouter!.setLightRgb(lightId, rgb);
          res.json({ success: true, mode: 'streaming' });
          return;
        }

        // If we can't convert to RGB, just acknowledge
        res.json({ success: true, mode: 'streaming', note: 'No color change applied' });
        return;
      }

      // === REST API MODE (streaming not active or light not in zone) ===
      console.log(`[API] Using REST API for light ${lightId}`);

      // Handle native Hue V2 dynamic effects
      const nativeEffects = ['sparkle', 'fire', 'candle', 'prism', 'opal', 'glisten', 'underwater', 'cosmos', 'sunbeam', 'enchant'];
      if (state.effect && nativeEffects.includes(state.effect)) {
        try {
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setDynamicEffect(lightId, state.effect, undefined, {
            color: state.effectColor,
            speed: state.effectSpeed,
            colorTemperature: state.effectTemperature,
          });
          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to set dynamic effect:', error);
        }
      }

      // Handle signaling effects (flash, flash_color, alternating)
      const signalingEffects = ['flash', 'flash_color', 'alternating'];
      if (state.effect && signalingEffects.includes(state.effect)) {
        try {
          await this.customEffectsEngine.stopEffect(lightId);
          const duration = state.effectDuration ?? 2000;

          if (state.effect === 'flash') {
            await this.bridgeController.setSignaling(lightId, 'on_off', duration);
          } else if (state.effect === 'flash_color') {
            const colors = state.effectColor ? [state.effectColor] : undefined;
            await this.bridgeController.setSignaling(lightId, 'on_off_color', duration, colors);
          } else if (state.effect === 'alternating') {
            const colors: Array<{ x: number; y: number }> = [];
            if (state.effectColor) colors.push(state.effectColor);
            if (state.effectColor2) colors.push(state.effectColor2);
            await this.bridgeController.setSignaling(lightId, 'alternating', duration, colors.length > 0 ? colors : undefined);
          }
          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to set signaling effect:', error);
        }
      }

      // Handle custom effects via CustomEffectsEngine (will log warning since streaming not active)
      const customEffects = ['strobe', 'police', 'ambulance', 'lightning', 'color_flash', 'breathe_smooth', 'chase', 'desert', 'tv_flicker'];
      const legacyToCustomMap: Record<string, CustomEffectType> = {
        'pulse': 'breathe_smooth',
        'breathe': 'breathe_smooth',
        'color_cycle': 'chase',
      };

      const effectToUse = legacyToCustomMap[state.effect as string] || state.effect;

      if (state.effect && (customEffects.includes(effectToUse as string) || legacyToCustomMap[state.effect as string])) {
        const bpm = state.effectBpm ?? 120;
        console.log(`[API] Starting custom effect ${effectToUse} on light ${lightId} at ${bpm} BPM (REST mode - will be choppy)`);

        await this.customEffectsEngine.startEffect(lightId, effectToUse as CustomEffectType, {
          speed: bpm,
          color1: state.effectColor,
          color2: state.effectColor2,
          brightness: state.brightness ?? 254,
          intensity: state.effectIntensity ?? 0.7,
        });

        res.json({ success: true, mode: 'rest', warning: 'Custom effects require streaming for smooth operation' });
        return;
      }

      // Handle colorloop -> prism mapping
      if (state.effect === 'colorloop') {
        try {
          await this.bridgeController.setDynamicEffect(lightId, 'prism', undefined, {
            speed: state.effectSpeed ?? 0.5,
          });
          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to set colorloop:', error);
        }
      }

      // Handle 'none' effect - stop any running effect
      if (state.effect === 'none') {
        try {
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.stopSignaling(lightId);
          await this.bridgeController.setDynamicEffect(lightId, 'no_effect', undefined, {});
          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to stop effect:', error);
        }
      }

      // Handle gradient if present
      if (state.gradient) {
        try {
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setGradient(lightId, state.gradient, state.gradientMode);
          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to set gradient:', error);
        }
      }

      // Use v2 API for color changes
      if (state.hue !== undefined && state.saturation !== undefined) {
        try {
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setLightColorV2(lightId, state.hue, state.saturation, state.brightness);

          if (state.on === false) {
            await this.bridgeController.setLightState(lightId, { on: false });
          }

          res.json({ success: true, mode: 'rest' });
          return;
        } catch (error) {
          console.warn('Failed to set color via v2 API:', error);
        }
      }

      // Standard light state control
      await this.customEffectsEngine.stopEffect(lightId);
      await this.bridgeController.setLightState(lightId, state);
      res.json({ success: true, mode: 'rest' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Convert light state to RGB for streaming
   */
  private stateToRgb(state: any): [number, number, number] | null {
    // If light is off, return black
    if (state.on === false) {
      return [0, 0, 0];
    }

    const brightness = state.brightness ?? 254;

    // If we have hue and saturation, convert HSB to RGB
    if (state.hue !== undefined && state.saturation !== undefined) {
      const h = (state.hue / 65535) * 360;
      const s = state.saturation / 254;
      const v = brightness / 254;
      return this.hsvToRgb(h, s, v);
    }

    // If we have XY color (effectColor), convert to RGB
    if (state.effectColor) {
      return this.xyBriToRgb(state.effectColor, brightness);
    }

    // If just brightness, return white at that brightness
    if (brightness !== undefined) {
      const b = Math.round((brightness / 254) * 255);
      return [b, b, b];
    }

    return null;
  }

  /**
   * Convert HSV to RGB
   */
  private hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  /**
   * Convert XY + brightness to RGB
   */
  private xyBriToRgb(xy: { x: number; y: number }, brightness: number): [number, number, number] {
    const z = 1.0 - xy.x - xy.y;
    const Y = brightness / 254;
    const X = (Y / xy.y) * xy.x;
    const Z = (Y / xy.y) * z;

    let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    r = Math.pow(Math.max(0, Math.min(1, r)), 0.45) * 255;
    g = Math.pow(Math.max(0, Math.min(1, g)), 0.45) * 255;
    b = Math.pow(Math.max(0, Math.min(1, b)), 0.45) * 255;

    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  private async previewScene(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body?.scene;
      const scene = this.normalizeSceneForCreate(payload as unknown);
      await this.mappingEngine.previewScene(scene);
      res.json({ success: true, lights: scene.lights.map(light => light.targetId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  private async stopScenePreview(req: Request, res: Response): Promise<void> {
    try {
      await this.mappingEngine.stopPreviewScene();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getTempo(req: Request, res: Response): Promise<void> {
    const tempo = this.mappingEngine.getCurrentTempo();
    res.json({ tempo });
  }

  // Bluetooth API handlers

  private async getBluetoothStatus(req: Request, res: Response): Promise<void> {
    try {
      // Prevent caching of Bluetooth status
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const status = {
        ready: this.bluetoothController.isBluetoothReady(),
        connected: this.bluetoothController.isConnected(),
        connectedLights: this.bluetoothController.getConnectedLights()
      };
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async scanBluetoothLights(req: Request, res: Response): Promise<void> {
    try {
      const { duration, showAllDevices } = req.body;
      const lights = await this.bluetoothController.scanForLights(duration || 10000, showAllDevices || false);
      res.json({ lights });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async connectBluetoothLight(req: Request, res: Response): Promise<void> {
    try {
      const { lightId } = req.body;
      await this.bluetoothController.connectToLight(lightId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async connectBluetoothLightManual(req: Request, res: Response): Promise<void> {
    try {
      const { macAddress, name } = req.body;
      if (!macAddress) {
        res.status(400).json({ error: 'MAC address is required' });
        return;
      }
      await this.bluetoothController.connectByAddress(macAddress, name);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async disconnectBluetoothLight(req: Request, res: Response): Promise<void> {
    try {
      const { lightId } = req.body;
      if (lightId) {
        await this.bluetoothController.disconnectLight(lightId);
      } else {
        await this.bluetoothController.disconnect();
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getBluetoothLights(req: Request, res: Response): Promise<void> {
    try {
      // Prevent caching of Bluetooth status
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const lights = this.bluetoothController.getLights();
      res.json({ lights });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async testBluetoothDiagnostic(req: Request, res: Response): Promise<void> {
    try {
      const { lightId } = req.body;
      if (!lightId) {
        res.status(400).json({ error: 'lightId is required' });
        return;
      }
      await this.bluetoothController.testLightWithVerification(lightId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Entertainment/Streaming API handlers

  private async getEntertainmentConfigurations(req: Request, res: Response): Promise<void> {
    try {
      const configs = await this.bridgeController.getEntertainmentConfigurations();
      res.json({ configurations: configs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async generateClientKey(req: Request, res: Response): Promise<void> {
    try {
      const { bridgeIp } = req.body;
      const ip = bridgeIp || this.configManager.getConfig().bridgeIp;

      console.log('[API] generateClientKey called with bridgeIp:', bridgeIp, 'using:', ip);

      if (!ip) {
        console.log('[API] No bridge IP available');
        res.status(400).json({ error: 'Bridge IP is required. Connect to a bridge first.' });
        return;
      }

      console.log(`[API] Generating client key for bridge at ${ip}...`);

      const { username, clientKey } = await this.bridgeController.createUserWithClientKey(ip);
      console.log('[API] Client key generated successfully');

      // Save to config
      this.configManager.updateConfig({ bridgeIp: ip, bridgeUsername: username });
      this.configManager.updateStreamingConfig({ clientKey });
      await this.configManager.save();

      // Reconnect with new credentials
      await this.bridgeController.connect(ip, username, clientKey);

      res.json({ username, clientKey });
    } catch (error: any) {
      console.error('[API] generateClientKey error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  private async startStreaming(req: Request, res: Response): Promise<void> {
    try {
      const { entertainmentConfigId } = req.body;
      const config = this.configManager.getConfig();

      if (!config.bridgeIp || !config.bridgeUsername) {
        res.status(400).json({ error: 'Bridge not connected' });
        return;
      }

      const clientKey = config.streaming?.clientKey;
      if (!clientKey) {
        res.status(400).json({ error: 'Client key not configured. Generate one first.' });
        return;
      }

      if (!entertainmentConfigId) {
        res.status(400).json({ error: 'Entertainment configuration ID is required' });
        return;
      }

      // Stop existing streaming if any
      if (this.streamingService?.isStreaming()) {
        await this.streamingService.stop();
      }

      // Get entertainment configuration to build channel mappings
      const entertainmentConfigs = await this.bridgeController.getEntertainmentConfigurations();
      const entertainmentConfig = entertainmentConfigs.find((c: any) => c.id === entertainmentConfigId);

      if (!entertainmentConfig) {
        res.status(404).json({ error: 'Entertainment configuration not found' });
        return;
      }

      // Log the full entertainment config structure for debugging
      console.log('[API] Entertainment config structure:', JSON.stringify({
        id: entertainmentConfig.id,
        name: entertainmentConfig.metadata?.name,
        channels: entertainmentConfig.channels?.map((ch: any) => ({
          channel_id: ch.channel_id,
          members: ch.members?.map((m: any) => ({
            service: m.service,
          })),
        })),
        light_services: entertainmentConfig.light_services,
        locations: entertainmentConfig.locations,
      }, null, 2));

      // Build channel mappings
      // Note: entertainment configs reference "entertainment" resources, not "light" resources directly
      // The light_services array contains the actual light IDs
      const lightServiceIds = (entertainmentConfig.light_services || []).map((ls: any) => ls.rid);
      console.log('[API] Light services in entertainment zone:', lightServiceIds);

      // For gradient lights, multiple channels share the same entertainment resource ID
      // but light_services only has one entry. We need to map entertainment IDs to light IDs.
      const entertainmentToLightMap = new Map<string, string>();

      // First pass: build mapping from entertainment resource IDs to light IDs
      // Group channels by their entertainment resource ID to detect gradient lights
      const channelsByEntertainment = new Map<string, number[]>();
      for (const ch of entertainmentConfig.channels || []) {
        const entertainmentRid = ch.members?.[0]?.service?.rid || '';
        const rtype = ch.members?.[0]?.service?.rtype || 'unknown';
        if (rtype === 'entertainment' && entertainmentRid) {
          const existing = channelsByEntertainment.get(entertainmentRid) || [];
          existing.push(ch.channel_id);
          channelsByEntertainment.set(entertainmentRid, existing);
        }
      }

      // For each unique entertainment resource, find its corresponding light
      // If there are more channels than light_services, it's likely a gradient light
      let lightServiceIndex = 0;
      for (const [entertainmentRid, channelIds] of channelsByEntertainment) {
        if (lightServiceIndex < lightServiceIds.length) {
          const lightId = lightServiceIds[lightServiceIndex];
          entertainmentToLightMap.set(entertainmentRid, lightId);
          console.log(`[API] Entertainment ${entertainmentRid} (${channelIds.length} channels) -> Light ${lightId}`);
          lightServiceIndex++;
        }
      }

      this.channelMappings = (entertainmentConfig.channels || []).map((ch: any) => {
        const entertainmentRid = ch.members?.[0]?.service?.rid || '';
        const rtype = ch.members?.[0]?.service?.rtype || 'unknown';

        // Use the entertainment-to-light mapping for consistent light IDs
        let lightId = entertainmentRid;
        if (rtype === 'entertainment') {
          const mappedLightId = entertainmentToLightMap.get(entertainmentRid);
          if (mappedLightId) {
            lightId = mappedLightId;
          }
        }

        return {
          channelId: ch.channel_id,
          lightId,
          position: ch.position || { x: 0, y: 0, z: 0 },
        };
      });

      console.log('[API] Entertainment zone channel mappings:');
      this.channelMappings.forEach((m) => {
        const lightName = this.bridgeController.getLightNameById(m.lightId);
        console.log(`  Channel ${m.channelId} -> Light ${m.lightId} (${lightName || 'unknown'})`);
      });

      // Get application ID
      const applicationId = this.bridgeController.getApplicationId();
      if (!applicationId) {
        res.status(500).json({ error: 'Could not get application ID' });
        return;
      }

      // Create streaming service
      this.streamingService = new HueStreamingService({
        bridgeIp: config.bridgeIp,
        username: config.bridgeUsername,
        clientKey: clientKey,
        entertainmentConfigId: entertainmentConfigId,
        targetFps: 50,
      });

      this.streamingService.setApplicationId(applicationId);
      this.streamingService.setChannelMappings(this.channelMappings);

      // Set API callbacks
      this.streamingService.setApiCallbacks(
        async () => { await this.bridgeController.startEntertainmentStreaming(entertainmentConfigId); },
        async () => { await this.bridgeController.stopEntertainmentStreaming(entertainmentConfigId); }
      );

      // Set up event handlers
      this.streamingService.on('started', () => {
        console.log('[API] Streaming started');
        this.broadcast('streamingStarted', { entertainmentConfigId });
      });
      this.streamingService.on('stopped', (reason) => {
        console.log(`[API] Streaming stopped: ${reason}`);
        this.broadcast('streamingStopped', { reason });
      });
      this.streamingService.on('error', (err) => {
        console.error('[API] Streaming error:', err.message);
        this.broadcast('streamingError', { error: err.message });
      });

      // Create and configure streaming router
      this.streamingRouter = new StreamingRouter();
      this.streamingRouter.setStreamingService(this.streamingService);
      this.streamingRouter.setChannelMappings(this.channelMappings);
      // Provide V1→V2 ID lookup so effects using V1 IDs can find their channels
      this.streamingRouter.setV1ToV2Lookup((v1Id) => this.bridgeController.getV2LightId(v1Id));

      // Connect router to MappingEngine and CustomEffectsEngine for streaming
      this.mappingEngine.setStreamingRouter(this.streamingRouter);
      // Connect router to CustomEffectsEngine for smooth streaming animations
      this.customEffectsEngine.setStreamingRouter(this.streamingRouter);

      // Start streaming
      await this.streamingService.start();

      // Save config
      this.configManager.updateStreamingConfig({
        enabled: true,
        entertainmentConfigId: entertainmentConfigId,
      });
      await this.configManager.save();

      res.json({
        success: true,
        channels: this.channelMappings.length,
        entertainmentConfigId
      });
    } catch (error: any) {
      console.error('[API] Failed to start streaming:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private async stopStreaming(req: Request, res: Response): Promise<void> {
    try {
      if (this.streamingService?.isStreaming()) {
        await this.streamingService.stop();
      }

      // Disconnect streaming router (but keep CustomEffectsEngine connected for REST mode effects)
      this.mappingEngine.setStreamingRouter(null);
      this.customEffectsEngine.setStreamingRouter(null);
      this.streamingRouter = null;
      this.streamingService = null;

      // Update config
      this.configManager.updateStreamingConfig({ enabled: false });
      await this.configManager.save();

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getStreamingStatus(req: Request, res: Response): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      const isStreaming = this.streamingService?.isStreaming() ?? false;
      const stats = this.streamingService?.getStats();

      res.json({
        enabled: config.streaming?.enabled ?? false,
        streaming: isStreaming,
        entertainmentConfigId: config.streaming?.entertainmentConfigId,
        hasClientKey: !!config.streaming?.clientKey,
        stats,
        channels: this.channelMappings,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Start the server
   */
  start(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`\n🎹 Hue MIDI Bridge Server`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Web UI:  http://localhost:${port}`);
      console.log(`API:     http://localhost:${port}/api`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.wss.close();
    this.server.close();
  }
}
