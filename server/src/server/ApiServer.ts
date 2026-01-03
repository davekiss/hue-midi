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

      this.mappingEngine.removeMapping(note, channel, triggerType, ccValue);
      this.configManager.removeMapping(note, channel, triggerType, ccValue);
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
      console.log(`[API] isBluetoothLight: ${isBluetoothLight}`);

      if (isBluetoothLight) {
        // Use Bluetooth controller
        console.log(`[API] Using Bluetooth controller for light ${lightId}`);
        await this.bluetoothController.setLightState(lightId, state);
        res.json({ success: true });
        return;
      }

      console.log(`[API] Using Bridge controller for light ${lightId}`);

      // Otherwise use Bridge controller
      console.log(`Using Bridge controller for light ${lightId}`);

      // Handle native Hue V2 dynamic effects
      const nativeEffects = ['sparkle', 'fire', 'candle', 'prism', 'opal', 'glisten', 'underwater', 'cosmos', 'sunbeam', 'enchant'];
      if (state.effect && nativeEffects.includes(state.effect)) {
        try {
          // Stop any running custom effect before starting native effect
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setDynamicEffect(lightId, state.effect, undefined, {
            color: state.effectColor,
            speed: state.effectSpeed,
            colorTemperature: state.effectTemperature,
          });
          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set dynamic effect, falling back to standard control:', error);
        }
      }

      // Handle signaling effects (flash, flash_color, alternating)
      const signalingEffects = ['flash', 'flash_color', 'alternating'];
      if (state.effect && signalingEffects.includes(state.effect)) {
        try {
          // Stop any running custom effect before starting signaling effect
          await this.customEffectsEngine.stopEffect(lightId);
          const duration = state.effectDuration ?? 2000;

          if (state.effect === 'flash') {
            console.log(`[API] Setting flash signaling on light ${lightId} for ${duration}ms`);
            await this.bridgeController.setSignaling(lightId, 'on_off', duration);
          } else if (state.effect === 'flash_color') {
            const colors = state.effectColor ? [state.effectColor] : undefined;
            console.log(`[API] Setting flash_color signaling on light ${lightId} for ${duration}ms with color:`, colors);
            await this.bridgeController.setSignaling(lightId, 'on_off_color', duration, colors);
          } else if (state.effect === 'alternating') {
            const colors: Array<{ x: number; y: number }> = [];
            if (state.effectColor) colors.push(state.effectColor);
            if (state.effectColor2) colors.push(state.effectColor2);
            console.log(`[API] Setting alternating signaling on light ${lightId} for ${duration}ms with colors:`, colors);
            await this.bridgeController.setSignaling(lightId, 'alternating', duration, colors.length > 0 ? colors : undefined);
          }
          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set signaling effect:', error);
        }
      }

      // Handle custom effects via CustomEffectsEngine
      const customEffects = ['strobe', 'police', 'ambulance', 'lightning', 'color_flash', 'breathe_smooth', 'chase', 'desert', 'tv_flicker'];
      // Also handle legacy effects that map to custom effects
      const legacyToCustomMap: Record<string, CustomEffectType> = {
        'pulse': 'breathe_smooth',
        'breathe': 'breathe_smooth',
        'color_cycle': 'chase',
      };

      const effectToUse = legacyToCustomMap[state.effect as string] || state.effect;

      if (state.effect && (customEffects.includes(effectToUse as string) || legacyToCustomMap[state.effect as string])) {
        try {
          const bpm = state.effectBpm ?? 120;
          console.log(`[API] Starting custom effect ${effectToUse} on light ${lightId} at ${bpm} BPM`);

          await this.customEffectsEngine.startEffect(lightId, effectToUse as CustomEffectType, {
            speed: bpm,
            color1: state.effectColor,
            color2: state.effectColor2,
            brightness: state.brightness ?? 254,
            intensity: state.effectIntensity ?? 0.7,
          });

          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set custom effect:', error);
        }
      }

      // Handle colorloop -> prism mapping
      if (state.effect === 'colorloop') {
        try {
          console.log(`[API] Setting colorloop (prism effect) on light ${lightId}`);
          await this.bridgeController.setDynamicEffect(lightId, 'prism', undefined, {
            speed: state.effectSpeed ?? 0.5,
          });
          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set colorloop:', error);
        }
      }

      // Handle 'none' effect - stop any running effect
      if (state.effect === 'none') {
        try {
          console.log(`[API] Stopping effects on light ${lightId}`);
          // Stop custom effects engine
          await this.customEffectsEngine.stopEffect(lightId);
          // Stop signaling
          await this.bridgeController.stopSignaling(lightId);
          // Stop native dynamic effects
          await this.bridgeController.setDynamicEffect(lightId, 'no_effect', undefined, {});
          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to stop effect:', error);
        }
      }

      // Handle gradient if present
      if (state.gradient) {
        try {
          // Stop any running custom effect before setting gradient
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setGradient(lightId, state.gradient, state.gradientMode);
          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set gradient:', error);
        }
      }

      // Use v2 API for color changes (better performance and instant transitions)
      if (state.hue !== undefined && state.saturation !== undefined) {
        try {
          // Stop any running custom effect before setting color
          await this.customEffectsEngine.stopEffect(lightId);
          await this.bridgeController.setLightColorV2(lightId, state.hue, state.saturation, state.brightness);

          // Handle on/off separately if needed
          if (state.on === false) {
            await this.bridgeController.setLightState(lightId, { on: false });
          }

          res.json({ success: true });
          return;
        } catch (error) {
          console.warn('Failed to set color via v2 API, falling back to v1:', error);
          // Fall through to standard control
        }
      }

      // Standard light state control (v1 API fallback)
      // Stop any running custom effect before setting state
      await this.customEffectsEngine.stopEffect(lightId);
      await this.bridgeController.setLightState(lightId, state);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
