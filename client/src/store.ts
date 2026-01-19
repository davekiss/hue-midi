import { create } from 'zustand';
import type { HueLight, MidiMapping, MidiMessage, Scene } from './types';

// localStorage keys
const STORAGE_KEY = 'hue-midi-presets';

interface PersistedPresetState {
  encounteredPresets: number[];
  selectedPreset: number | null;
  autoFollowPreset: boolean;
  presetNames: Record<number, string>;
  collapsedPresets: number[];
}

// Load persisted preset state from localStorage
function loadPersistedState(): PersistedPresetState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        encounteredPresets: Array.isArray(parsed.encounteredPresets) ? parsed.encounteredPresets : [],
        selectedPreset: typeof parsed.selectedPreset === 'number' ? parsed.selectedPreset : null,
        autoFollowPreset: typeof parsed.autoFollowPreset === 'boolean' ? parsed.autoFollowPreset : true,
        presetNames: typeof parsed.presetNames === 'object' && parsed.presetNames !== null ? parsed.presetNames : {},
        collapsedPresets: Array.isArray(parsed.collapsedPresets) ? parsed.collapsedPresets : [],
      };
    }
  } catch (e) {
    console.warn('Failed to load preset state from localStorage:', e);
  }
  return { encounteredPresets: [], selectedPreset: null, autoFollowPreset: true, presetNames: {}, collapsedPresets: [] };
}

// Save preset state to localStorage
function savePresetState(state: PersistedPresetState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save preset state to localStorage:', e);
  }
}

const initialPresetState = loadPersistedState();

export interface StreamingStatus {
  enabled: boolean;
  streaming: boolean;
  entertainmentConfigId?: string;
  hasClientKey: boolean;
  stats?: {
    streaming: boolean;
    frameCount: number;
    channelCount: number;
    fps: number;
  };
  channels: Array<{
    channelId: number;
    lightId: string;
    position: { x: number; y: number; z: number };
  }>;
}

export interface EntertainmentConfig {
  id: string;
  metadata?: { name?: string };
  status: string;
  channels?: Array<{
    channel_id: number;
    members?: Array<{ service?: { rid: string } }>;
    position?: { x: number; y: number; z: number };
  }>;
}

interface AppState {
  // Status
  midiStatus: string;
  hueStatus: string;
  streamingStatus: StreamingStatus | null;

  // Data
  lights: HueLight[];
  mappings: MidiMapping[];
  scenes: Scene[];
  activityLog: Array<{ type: string; message: string; timestamp: number }>;
  tempo: { bpm: number; source: string; updatedAt: number } | null;
  currentPreset: number | null;  // Current MIDI Program/Preset from Helix
  currentSnapshot: number | null; // Current snapshot (CC69 value 0-7) from Helix
  selectedPreset: number | null; // Currently selected preset in UI (null = "All Presets")
  encounteredPresets: number[];  // All presets we've seen via PC messages
  autoFollowPreset: boolean;     // Auto-switch UI when preset changes
  presetNames: Record<number, string>;  // Custom names for presets (e.g., song names)
  collapsedPresets: number[];    // Which preset groups are collapsed in UI
  entertainmentConfigs: EntertainmentConfig[];

  // Actions
  setMidiStatus: (status: string) => void;
  setHueStatus: (status: string) => void;
  setStreamingStatus: (status: StreamingStatus | null) => void;
  setEntertainmentConfigs: (configs: EntertainmentConfig[]) => void;
  setLights: (lights: HueLight[]) => void;
  setMappings: (mappings: MidiMapping[]) => void;
  setScenes: (scenes: Scene[]) => void;
  setTempo: (tempo: { bpm: number; source: string; updatedAt: number }) => void;
  setCurrentPreset: (preset: number) => void;
  setCurrentSnapshot: (snapshot: number) => void;
  setSelectedPreset: (preset: number | null) => void;
  setAutoFollowPreset: (follow: boolean) => void;
  addEncounteredPreset: (preset: number) => void;
  setPresetName: (preset: number, name: string) => void;
  togglePresetCollapsed: (preset: number) => void;
  addActivity: (type: string, message: string) => void;
  addMidiActivity: (message: MidiMessage) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  midiStatus: 'Not Connected',
  hueStatus: 'Not Configured',
  streamingStatus: null,
  lights: [],
  mappings: [],
  scenes: [],
  activityLog: [],
  tempo: null,
  currentPreset: null,
  currentSnapshot: null,
  selectedPreset: initialPresetState.selectedPreset,
  encounteredPresets: initialPresetState.encounteredPresets,
  autoFollowPreset: initialPresetState.autoFollowPreset,
  presetNames: initialPresetState.presetNames,
  collapsedPresets: initialPresetState.collapsedPresets,
  entertainmentConfigs: [],

  // Actions
  setMidiStatus: (status) => set({ midiStatus: status }),
  setHueStatus: (status) => set({ hueStatus: status }),
  setStreamingStatus: (status) => set({ streamingStatus: status }),
  setEntertainmentConfigs: (configs) => set({ entertainmentConfigs: configs }),
  setLights: (lights) => set({ lights }),
  setMappings: (mappings) => set({ mappings }),
  setScenes: (scenes) => set({ scenes }),
  setTempo: (tempo) => set({ tempo }),
  setCurrentSnapshot: (snapshot) => set({ currentSnapshot: snapshot }),
  setCurrentPreset: (preset) => {
    const state = get();
    let newEncountered = state.encounteredPresets;
    // Add to encountered presets if new
    if (!state.encounteredPresets.includes(preset)) {
      newEncountered = [...state.encounteredPresets, preset].sort((a, b) => a - b);
    }
    const newSelected = state.autoFollowPreset ? preset : state.selectedPreset;
    set({
      currentPreset: preset,
      encounteredPresets: newEncountered,
      selectedPreset: newSelected,
    });
    // Persist
    savePresetState({
      encounteredPresets: newEncountered,
      selectedPreset: newSelected,
      autoFollowPreset: state.autoFollowPreset,
      presetNames: state.presetNames,
      collapsedPresets: state.collapsedPresets,
    });
  },
  setSelectedPreset: (preset) => {
    set({ selectedPreset: preset });
    const state = get();
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: preset,
      autoFollowPreset: state.autoFollowPreset,
      presetNames: state.presetNames,
      collapsedPresets: state.collapsedPresets,
    });
  },
  setAutoFollowPreset: (follow) => {
    set({ autoFollowPreset: follow });
    const state = get();
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: state.selectedPreset,
      autoFollowPreset: follow,
      presetNames: state.presetNames,
      collapsedPresets: state.collapsedPresets,
    });
  },
  addEncounteredPreset: (preset) => {
    const state = get();
    if (state.encounteredPresets.includes(preset)) return;
    const newEncountered = [...state.encounteredPresets, preset].sort((a, b) => a - b);
    set({ encounteredPresets: newEncountered });
    savePresetState({
      encounteredPresets: newEncountered,
      selectedPreset: state.selectedPreset,
      autoFollowPreset: state.autoFollowPreset,
      presetNames: state.presetNames,
      collapsedPresets: state.collapsedPresets,
    });
  },
  setPresetName: (preset, name) => {
    const state = get();
    const newNames = { ...state.presetNames };
    if (name.trim()) {
      newNames[preset] = name.trim();
    } else {
      delete newNames[preset];
    }
    set({ presetNames: newNames });
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: state.selectedPreset,
      autoFollowPreset: state.autoFollowPreset,
      presetNames: newNames,
      collapsedPresets: state.collapsedPresets,
    });
  },
  togglePresetCollapsed: (preset) => {
    const state = get();
    const isCollapsed = state.collapsedPresets.includes(preset);
    const newCollapsed = isCollapsed
      ? state.collapsedPresets.filter(p => p !== preset)
      : [...state.collapsedPresets, preset];
    set({ collapsedPresets: newCollapsed });
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: state.selectedPreset,
      autoFollowPreset: state.autoFollowPreset,
      presetNames: state.presetNames,
      collapsedPresets: newCollapsed,
    });
  },

  addActivity: (type, message) =>
    set((state) => ({
      activityLog: [
        { type, message, timestamp: Date.now() },
        ...state.activityLog.slice(0, 49), // Keep last 50
      ],
    })),

  addMidiActivity: (message) =>
    set((state) => ({
      activityLog: [
        {
          type: 'midi',
          message: `MIDI: Ch ${message.channel} Note ${message.note} Vel ${message.velocity}`,
          timestamp: Date.now(),
        },
        ...state.activityLog.slice(0, 49),
      ],
    })),
}));
