import type {
  Config,
  HueLightsResponse,
  MidiMapping,
  LightState,
  Scene,
  SceneLightState,
  SceneTransition,
} from './types';
import type { StreamingStatus, EntertainmentConfig } from './store';

const API_BASE = '/api';

async function apiCall<T>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

export type ScenePayload = {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  transition?: SceneTransition;
  lights: SceneLightState[];
  metadata?: Record<string, unknown>;
};

export const api = {
  // Config
  config: {
    get: () => apiCall<Config>('/config'),
    update: (config: Partial<Config>) => apiCall<{ success: boolean }>('/config', 'POST', config),
  },

  // MIDI
  midi: {
    getPorts: () => apiCall<{ ports: string[] }>('/midi/ports'),
    setPort: (portName?: string) => apiCall<{ success: boolean; port: string }>('/midi/port', 'POST', { portName }),
  },

  // Hue Bridge
  hue: {
    discoverBridges: () => apiCall<{ bridges: Array<{ ipaddress: string; name?: string; local?: boolean }> }>('/hue/bridges'),
    createUser: (bridgeIp: string) => apiCall<{ username: string }>('/hue/bridge/user', 'POST', { bridgeIp }),
    connect: (bridgeIp: string, username: string) =>
      apiCall<{ success: boolean }>('/hue/bridge/connect', 'POST', { bridgeIp, username }),
    getLights: () => apiCall<HueLightsResponse>('/hue/lights'),
  },

  // Mappings
  mappings: {
    getAll: () => apiCall<{ mappings: MidiMapping[] }>('/mappings'),
    add: (mapping: MidiMapping) => apiCall<{ success: boolean }>('/mappings', 'POST', mapping),
    remove: (channel: number, note: number, triggerType?: 'note' | 'cc', ccValue?: number, preset?: number) => {
      let url = `/mappings/${channel}/${note}`;
      const params = new URLSearchParams();
      if (triggerType) params.set('triggerType', triggerType);
      if (ccValue !== undefined) params.set('ccValue', ccValue.toString());
      if (preset !== undefined) params.set('preset', preset.toString());
      if (params.toString()) url += `?${params.toString()}`;
      return apiCall<{ success: boolean }>(url, 'DELETE');
    },
    clear: () => apiCall<{ success: boolean }>('/mappings/clear', 'POST'),
  },

  scenes: {
    getAll: () => apiCall<{ scenes: Scene[] }>('/scenes'),
    get: (sceneId: string) => apiCall<{ scene: Scene }>(`/scenes/${sceneId}`),
    create: (scene: ScenePayload) => apiCall<{ scene: Scene }>('/scenes', 'POST', scene),
    update: (sceneId: string, updates: Partial<ScenePayload>) =>
      apiCall<{ scene: Scene }>(`/scenes/${sceneId}`, 'PUT', updates),
    delete: (sceneId: string) => apiCall<{ success: boolean }>(`/scenes/${sceneId}`, 'DELETE'),
  },

  // Test
  test: {
    light: (lightId: string, state: LightState) =>
      apiCall<{ success: boolean }>('/test/light', 'POST', { lightId, state }),
    scenePreview: (scene: ScenePayload) =>
      apiCall<{ success: boolean; lights: string[] }>('/test/scene', 'POST', { scene }),
    stopScenePreview: () => apiCall<{ success: boolean }>('/test/scene/stop', 'POST'),
  },

  // Entertainment/Streaming
  entertainment: {
    getConfigurations: () =>
      apiCall<{ configurations: EntertainmentConfig[] }>('/hue/entertainment/configurations'),
    generateClientKey: (bridgeIp?: string) =>
      apiCall<{ username: string; clientKey: string }>('/hue/entertainment/clientkey', 'POST', { bridgeIp }),
    start: (entertainmentConfigId: string) =>
      apiCall<{ success: boolean; channels: number; entertainmentConfigId: string }>(
        '/hue/entertainment/start',
        'POST',
        { entertainmentConfigId }
      ),
    stop: () => apiCall<{ success: boolean }>('/hue/entertainment/stop', 'POST'),
    getStatus: () => apiCall<StreamingStatus>('/hue/entertainment/status'),
  },
};
