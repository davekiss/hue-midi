import { useEffect, useRef } from 'react';
import { useStore } from './store';
import type { MidiMessage, MidiMapping, LightState, Scene } from './types';

interface LightControlledMessage {
  lightId?: string;
  sceneId?: string;
  midiMessage: MidiMessage;
  mapping: MidiMapping;
  appliedStates?: AppliedState[];
}

interface AppliedState {
  targetId: string;
  targetType: 'light' | 'grouped_light';
  state: LightState;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const addMidiActivity = useStore((state) => state.addMidiActivity);
  const addActivity = useStore((state) => state.addActivity);
  const scenes = useStore((state) => state.scenes);
  const setTempo = useStore((state) => state.setTempo);
  const setCurrentPreset = useStore((state) => state.setCurrentPreset);
  const setCurrentSnapshot = useStore((state) => state.setCurrentSnapshot);
  const setStreamingStatus = useStore((state) => state.setStreamingStatus);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      // In dev mode, connect directly to backend (Vite proxy doesn't handle WebSocket upgrade)
      const isDev = import.meta.env.DEV;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = isDev ? 'localhost:3000' : window.location.host;
      const ws = new WebSocket(`${protocol}//${host}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        addActivity('system', 'Connected to server');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        console.log('WebSocket disconnected - will attempt to reconnect in 3s');
        // Reconnect after 3 seconds (don't reload page)
        reconnectTimeout = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleWebSocketMessage = (message: unknown) => {
    if (!isRecord(message) || typeof message.type !== 'string') {
      return;
    }

    const { type, data } = message;

    switch (type) {
      case 'midi':
        if (isMidiMessage(data)) {
          addMidiActivity(data);
        }
        break;
      case 'cc':
        // Handle CC messages - convert to activity log format
        if (isRecord(data) && typeof data.channel === 'number' && typeof data.controller === 'number' && typeof data.value === 'number') {
          addActivity('midi', `CC${data.controller} = ${data.value} (Ch ${data.channel})`);
          // Track CC69 as Helix snapshot (values 0-7)
          if (data.controller === 69 && data.value >= 0 && data.value <= 7) {
            setCurrentSnapshot(data.value);
          }
        }
        break;
      case 'lightControlled':
        if (isLightControlledMessage(data)) {
          const descriptor = buildTargetDescriptor(data, scenes);
          addActivity('light', `${descriptor} controlled by MIDI note ${data.midiMessage.note}`);
        }
        break;
      case 'tempo':
        if (isRecord(data) && typeof data.bpm === 'number' && typeof data.source === 'string') {
          setTempo({ bpm: data.bpm, source: data.source, updatedAt: Date.now() });
        }
        break;
      case 'pc':
        if (isRecord(data) && typeof data.program === 'number') {
          setCurrentPreset(data.program);
          addActivity('midi', `Preset ${data.program + 1} (PC ${data.program})`);
        }
        break;
      case 'error':
        console.error('Server error:', data);
        break;
      case 'streamingStarted':
        addActivity('streaming', 'Entertainment streaming started');
        // Refresh streaming status
        import('./api').then(({ api }) => {
          api.entertainment.getStatus().then(setStreamingStatus).catch(console.error);
        });
        break;
      case 'streamingStopped':
        addActivity('streaming', 'Entertainment streaming stopped');
        import('./api').then(({ api }) => {
          api.entertainment.getStatus().then(setStreamingStatus).catch(console.error);
        });
        break;
      case 'streamingError':
        if (isRecord(data) && typeof data.error === 'string') {
          addActivity('streaming', `Streaming error: ${data.error}`);
        }
        break;
      default:
        break;
    }
  };

  return wsRef.current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMidiMessage(value: unknown): value is MidiMessage {
  return (
    isRecord(value) &&
    typeof value.channel === 'number' &&
    typeof value.note === 'number' &&
    typeof value.velocity === 'number' &&
    typeof value.timestamp === 'number'
  );
}

function isMidiMapping(value: unknown): value is MidiMapping {
  return (
    isRecord(value) &&
    typeof value.midiNote === 'number' &&
    typeof value.midiChannel === 'number'
  );
}

function isAppliedState(value: unknown): value is AppliedState {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.targetId !== 'string') {
    return false;
  }
  if (value.targetType !== 'light' && value.targetType !== 'grouped_light') {
    return false;
  }
  const state = value.state;
  return isRecord(state) && typeof state.on === 'boolean';
}

function isLightControlledMessage(value: unknown): value is LightControlledMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (!isMidiMessage(value.midiMessage)) {
    return false;
  }
  if (!isMidiMapping(value.mapping)) {
    return false;
  }
  if (value.lightId !== undefined && typeof value.lightId !== 'string') {
    return false;
  }
  if (value.sceneId !== undefined && typeof value.sceneId !== 'string') {
    return false;
  }
  if (value.appliedStates !== undefined) {
    if (!Array.isArray(value.appliedStates) || !value.appliedStates.every(isAppliedState)) {
      return false;
    }
  }
  return true;
}

function buildTargetDescriptor(message: LightControlledMessage, scenes: Scene[]): string {
  if (message.sceneId) {
    const scene = scenes.find((item) => item.id === message.sceneId);
    return scene ? `Scene ${scene.name}` : `Scene ${message.sceneId}`;
  }

  if (message.lightId) {
    return `Light ${message.lightId}`;
  }

  const fallback = message.appliedStates?.find(state => typeof state.targetId === 'string');
  if (fallback) {
    return `${fallback.targetType === 'grouped_light' ? 'Group' : 'Light'} ${fallback.targetId}`;
  }

  return 'Light';
}
