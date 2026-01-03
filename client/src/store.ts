import { create } from 'zustand';
import type { HueLight, MidiMapping, MidiMessage, BluetoothStatus, Scene } from './types';

// localStorage keys
const STORAGE_KEY = 'hue-midi-presets';

// Load persisted preset state from localStorage
function loadPersistedState(): { encounteredPresets: number[]; selectedPreset: number | null; autoFollowPreset: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        encounteredPresets: Array.isArray(parsed.encounteredPresets) ? parsed.encounteredPresets : [],
        selectedPreset: typeof parsed.selectedPreset === 'number' ? parsed.selectedPreset : null,
        autoFollowPreset: typeof parsed.autoFollowPreset === 'boolean' ? parsed.autoFollowPreset : true,
      };
    }
  } catch (e) {
    console.warn('Failed to load preset state from localStorage:', e);
  }
  return { encounteredPresets: [], selectedPreset: null, autoFollowPreset: true };
}

// Save preset state to localStorage
function savePresetState(state: { encounteredPresets: number[]; selectedPreset: number | null; autoFollowPreset: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save preset state to localStorage:', e);
  }
}

const initialPresetState = loadPersistedState();

interface AppState {
  // Status
  midiStatus: string;
  hueStatus: string;
  bluetoothStatus: BluetoothStatus | null;

  // Data
  lights: HueLight[];
  mappings: MidiMapping[];
  scenes: Scene[];
  activityLog: Array<{ type: string; message: string; timestamp: number }>;
  tempo: { bpm: number; source: string; updatedAt: number } | null;
  currentPreset: number | null;  // Current MIDI Program/Preset from Helix
  selectedPreset: number | null; // Currently selected preset in UI (null = "All Presets")
  encounteredPresets: number[];  // All presets we've seen via PC messages
  autoFollowPreset: boolean;     // Auto-switch UI when preset changes

  // Actions
  setMidiStatus: (status: string) => void;
  setHueStatus: (status: string) => void;
  setBluetoothStatus: (status: BluetoothStatus) => void;
  setLights: (lights: HueLight[]) => void;
  setMappings: (mappings: MidiMapping[]) => void;
  setScenes: (scenes: Scene[]) => void;
  setTempo: (tempo: { bpm: number; source: string; updatedAt: number }) => void;
  setCurrentPreset: (preset: number) => void;
  setSelectedPreset: (preset: number | null) => void;
  setAutoFollowPreset: (follow: boolean) => void;
  addEncounteredPreset: (preset: number) => void;
  addActivity: (type: string, message: string) => void;
  addMidiActivity: (message: MidiMessage) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  midiStatus: 'Not Connected',
  hueStatus: 'Bridge Not Connected',
  bluetoothStatus: null,
  lights: [],
  mappings: [],
  scenes: [],
  activityLog: [],
  tempo: null,
  currentPreset: null,
  selectedPreset: initialPresetState.selectedPreset,
  encounteredPresets: initialPresetState.encounteredPresets,
  autoFollowPreset: initialPresetState.autoFollowPreset,

  // Actions
  setMidiStatus: (status) => set({ midiStatus: status }),
  setHueStatus: (status) => set({ hueStatus: status }),
  setBluetoothStatus: (status) => set({ bluetoothStatus: status }),
  setLights: (lights) => set({ lights }),
  setMappings: (mappings) => set({ mappings }),
  setScenes: (scenes) => set({ scenes }),
  setTempo: (tempo) => set({ tempo }),
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
    });
  },
  setSelectedPreset: (preset) => {
    set({ selectedPreset: preset });
    const state = get();
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: preset,
      autoFollowPreset: state.autoFollowPreset,
    });
  },
  setAutoFollowPreset: (follow) => {
    set({ autoFollowPreset: follow });
    const state = get();
    savePresetState({
      encounteredPresets: state.encounteredPresets,
      selectedPreset: state.selectedPreset,
      autoFollowPreset: follow,
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
