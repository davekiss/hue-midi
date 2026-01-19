import { useState, useEffect, useRef, useCallback } from 'react';
import { ColorPicker, useColorState } from 'react-beautiful-color';
import 'react-beautiful-color/dist/react-beautiful-color.css';
import { Button } from './Button';
import { api } from '../api';
import type { ScenePayload } from '../api';
import type { HueLight, MidiMapping, LightState, Scene } from '../types';
import { SceneSelect } from './SceneSelect';

// Native Hue V2 effects (handled by the bridge)
const NATIVE_EFFECTS = ['sparkle', 'fire', 'candle', 'prism', 'opal', 'glisten', 'underwater', 'cosmos', 'sunbeam', 'enchant'] as const;

// Streaming-compatible effect presets (our preset system - these work great with Entertainment API)
const STREAMING_PRESETS = [
  // Nature
  'candle', 'fire', 'fireplace', 'aurora', 'ocean', 'underwater', 'lava',
  'thunderstorm', 'rain', 'forest', 'meadow', 'starfield', 'galaxy',
  // Urban
  'traffic', 'highway',
  // Ambient
  'sparkle', 'prism', 'colorloop', 'opal', 'glisten',
  'tv_ballast', 'fluorescent', 'sparse', 'scattered',
  'cozy_window', 'party_window', 'evening_window',
  // Chase
  'marquee', 'marquee_alternate', 'theater',
  'rainbow_chase', 'two_color_chase', 'wave', 'bounce', 'comet', 'pulse',
] as const;

// Custom effects (our CustomEffectsEngine with BPM control - legacy)
const CUSTOM_EFFECTS = ['strobe', 'police', 'ambulance', 'lightning', 'color_flash', 'breathe_smooth', 'chase', 'desert', 'tv_flicker'] as const;

// Effects that support color parameter
const EFFECTS_WITH_COLOR_PARAMETER = new Set<string>([
  ...NATIVE_EFFECTS,
  'color_flash', 'police', 'ambulance', 'breathe_smooth', 'chase',
  'two_color_chase', 'wave', 'comet', 'pulse',
  'sparse', 'scattered', 'glisten',
]);

// Effects that support speed parameter (native Hue 0-1 and streaming presets)
const EFFECTS_WITH_SPEED_PARAMETER = new Set<string>([
  ...NATIVE_EFFECTS,
  ...STREAMING_PRESETS,
]);

// Effects that support BPM parameter (legacy custom effects)
const EFFECTS_WITH_BPM_PARAMETER = new Set<string>([...CUSTOM_EFFECTS]);

// Effects that support a second color
const EFFECTS_WITH_TWO_COLORS = new Set<string>(['color_flash', 'police', 'ambulance', 'chase', 'two_color_chase']);

// Effects that support intensity parameter
const EFFECTS_WITH_INTENSITY_PARAMETER = new Set<string>([
  'lightning', 'tv_flicker',
  // Streaming presets also use intensity for effect strength
  'aurora', 'lava', 'ocean', 'traffic', 'highway', 'rainbow_chase', 'wave',
  'thunderstorm', 'rain', 'forest', 'meadow', 'starfield', 'galaxy',
  'candle', 'fire', 'fireplace', 'sparkle', 'opal', 'glisten',
  'tv_ballast', 'fluorescent', 'sparse', 'scattered',
  'cozy_window', 'party_window', 'evening_window',
  'marquee', 'marquee_alternate', 'theater',
]);

interface MappingFormProps {
  lights: HueLight[];
  scenes: Scene[];
  onSubmit: (mapping: MidiMapping) => void;
  onClose: () => void;
  onScenesRefresh: () => Promise<void>;
  existingMapping?: MidiMapping;  // Optional existing mapping for editing
  presetContext?: number | null;  // If set, auto-assign this preset to new mappings
  template?: Partial<MidiMapping>;  // Optional template to pre-fill values (from MIDI Learn)
}

// Convert XY color to hex (moved outside component to avoid TDZ issues)
const xyToHex = (x: number, y: number): string => {
  const z = Math.max(0, 1.0 - x - y);
  const Y = 1.0;
  const X = y === 0 ? 0 : (Y / y) * x;
  const Z = y === 0 ? 0 : (Y / y) * z;

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  const clamp = (val: number) => Math.max(0, Math.min(1, val));

  r = clamp(r);
  g = clamp(g);
  b = clamp(b);

  const gammaCorrect = (val: number) =>
    val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;

  const toHex = (val: number) =>
    Math.round(gammaCorrect(val) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Helix-specific CC presets
const HELIX_CC_PRESETS = [
  { label: 'Snapshot 1', cc: 69, value: 0 },
  { label: 'Snapshot 2', cc: 69, value: 1 },
  { label: 'Snapshot 3', cc: 69, value: 2 },
  { label: 'Snapshot 4', cc: 69, value: 3 },
  { label: 'Snapshot 5', cc: 69, value: 4 },
  { label: 'Snapshot 6', cc: 69, value: 5 },
  { label: 'Snapshot 7', cc: 69, value: 6 },
  { label: 'Snapshot 8', cc: 69, value: 7 },
] as const;

export function MappingForm({ lights, scenes, onSubmit, onClose, onScenesRefresh, existingMapping, presetContext, template }: MappingFormProps) {
  // Use template values if provided, otherwise fall back to existingMapping or defaults
  const source = existingMapping || template;

  const [name, setName] = useState(existingMapping?.name || '');
  const [triggerType, setTriggerType] = useState<'note' | 'cc'>(source?.triggerType || 'note');
  const [midiChannel, setMidiChannel] = useState(source?.midiChannel ?? 0);
  const [midiNote, setMidiNote] = useState(existingMapping?.midiNote ?? 60);
  // CC-specific state
  const [ccNumber, setCcNumber] = useState(source?.ccNumber ?? 69); // Default to Helix snapshot CC
  const [ccValue, setCcValue] = useState<number | undefined>(source?.ccValue);
  const [ccValueMode, setCcValueMode] = useState<'specific' | 'any'>(source?.ccValue !== undefined ? 'specific' : 'any');
  // Preset filtering (for per-song mappings)
  // If there's a preset context from the UI or template, use it automatically
  const hasPresetContext = presetContext !== null && presetContext !== undefined;
  const hasTemplatePreset = template?.preset !== undefined;
  const [usePresetFilter, setUsePresetFilter] = useState(existingMapping?.preset !== undefined || hasPresetContext || hasTemplatePreset);
  const [preset, setPreset] = useState<number | undefined>(existingMapping?.preset ?? template?.preset ?? (hasPresetContext ? presetContext : undefined));
  const [lightId, setLightId] = useState(existingMapping?.lightId || lights[0]?.id || '');
  const [sceneId, setSceneId] = useState<string | undefined>(existingMapping?.sceneId);
  const [actionType, setActionType] = useState<'color' | 'brightness' | 'toggle' | 'effect' | 'gradient'>(existingMapping?.action.type || 'color');

  // Helper to convert HSV to hex for color picker
  const hsvToHex = (hue: number, sat: number): string => {
    const h = hue / 65535;
    const s = sat / 254;
    const v = 1.0;

    const c = v * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 1/6) { r = c; g = x; b = 0; }
    else if (h >= 1/6 && h < 2/6) { r = x; g = c; b = 0; }
    else if (h >= 2/6 && h < 3/6) { r = 0; g = c; b = x; }
    else if (h >= 3/6 && h < 4/6) { r = 0; g = x; b = c; }
    else if (h >= 4/6 && h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const toHex = (val: number) => Math.round((val + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const initialColor = existingMapping?.action.colorHue !== undefined && existingMapping?.action.colorSat !== undefined
    ? hsvToHex(existingMapping.action.colorHue, existingMapping.action.colorSat)
    : '#ff0000';

  const [{ colorInput }, setColorState] = useColorState({ type: 'hex', value: initialColor });
  const [brightnessMode, setBrightnessMode] = useState<'velocity' | 'fixed'>(existingMapping?.action.brightnessMode || 'velocity');
  const [fixedBrightness, setFixedBrightness] = useState(existingMapping?.action.fixedBrightness ?? 254);
  const [effect, setEffect] = useState<string>(existingMapping?.action.effect || 'prism');
  const [effectBpm, setEffectBpm] = useState(existingMapping?.action.effectBpm ?? 120);
  const [effectIntensity, setEffectIntensity] = useState(existingMapping?.action.effectIntensity ?? 0.7);
  const [{ colorInput: effectColor2Input }, setEffectColor2State] = useColorState({ type: 'hex', value: '#0088ff' });
  const [effectSpeed, setEffectSpeed] = useState(existingMapping?.action.effectSpeed ?? 0.5);
  const [{ colorInput: effectColorInput }, setEffectColorState] = useColorState({ type: 'hex', value: '#ff6600' });
  const [transitionTime, setTransitionTime] = useState(existingMapping?.action.transitionTime ?? 2);
  const [animationPreset, setAnimationPreset] = useState<'bounceIn' | 'bounceOut' | 'gentle' | 'wobbly' | 'stiff' | 'slow' | 'snappy' | 'none'>(existingMapping?.action.animationPreset || 'none');
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const defaultGradientPreset = ['#ff005b', '#00c6ff'];
  const initialGradientHexes =
    existingMapping?.action.type === 'gradient' && existingMapping.action.gradientColors?.length
      ? existingMapping.action.gradientColors.map(({ x, y }) => xyToHex(x, y))
      : [...defaultGradientPreset];
  const [gradientColors, setGradientColors] = useState<string[]>(initialGradientHexes);
  const [activeGradientIndex, setActiveGradientIndex] = useState(0);
  const [{ colorInput: gradientColorInput }, setGradientColorState] = useColorState({
    type: 'hex',
    value: initialGradientHexes[0] || defaultGradientPreset[0],
  });
  const [isLearning, setIsLearning] = useState(false);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Get selected light
  const selectedLight = lights.find((l) => l.id === lightId);

  // Convert hex color to HSV for Hue lights
  const hexToHsv = (hex: string): { hue: number; saturation: number } => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / delta + 2) / 6;
      } else {
        h = ((r - g) / delta + 4) / 6;
      }
    }

    const s = max === 0 ? 0 : delta / max;

    return {
      hue: Math.round(h * 65535), // Hue uses 0-65535
      saturation: Math.round(s * 254), // Hue uses 0-254
    };
  };

  // Convert hex color to XY color space
  const hexToXy = (hex: string): { x: number; y: number } => {
    const hsv = hexToHsv(hex);
    // Convert HSV to RGB
    const h = hsv.hue / 65535;
    const s = hsv.saturation / 254;
    const v = 1.0;

    const c = v * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 1/6) {
      r = c; g = x; b = 0;
    } else if (h >= 1/6 && h < 2/6) {
      r = x; g = c; b = 0;
    } else if (h >= 2/6 && h < 3/6) {
      r = 0; g = c; b = x;
    } else if (h >= 3/6 && h < 4/6) {
      r = 0; g = x; b = c;
    } else if (h >= 4/6 && h < 5/6) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    r = (r + m);
    g = (g + m);
    b = (b + m);

    // Apply gamma correction
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : (r / 12.92);
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : (g / 12.92);
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : (b / 12.92);

    // Convert to XYZ
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

    // Calculate xy
    const sum = X + Y + Z;
    return {
      x: sum === 0 ? 0 : X / sum,
      y: sum === 0 ? 0 : Y / sum
    };
  };

  const getHexFromInput = (input: unknown): string => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as {
        value?: string;
        hex?: string;
        r?: number;
        g?: number;
        b?: number;
        getHex?: () => string;
      };

      if (typeof obj.getHex === 'function') {
        const raw = obj.getHex();
        return raw.startsWith('#') ? raw : `#${raw}`;
      }

      if (typeof obj.value === 'string') {
        return obj.value;
      }
      if (typeof obj.hex === 'string') {
        return obj.hex.startsWith('#') ? obj.hex : `#${obj.hex}`;
      }
      if (
        typeof obj.r === 'number' &&
        typeof obj.g === 'number' &&
        typeof obj.b === 'number'
      ) {
        const toHex = (val: number) => Math.round(val).toString(16).padStart(2, '0');
        return `#${toHex(obj.r)}${toHex(obj.g)}${toHex(obj.b)}`;
      }
    }
    return '#ffffff';
  };

  const currentColorHex = getHexFromInput(colorInput);
  const currentEffectHex = getHexFromInput(effectColorInput);
  const currentEffectColor2Hex = getHexFromInput(effectColor2Input);
  const currentGradientHex = getHexFromInput(gradientColorInput);

  const supportsGradient = Boolean(selectedLight?.capabilities?.gradient);
  const isSceneMapping = Boolean(sceneId);

  useEffect(() => {
    if (isSceneMapping) {
      setConversionMessage(null);
    }
  }, [isSceneMapping]);

  useEffect(() => {
    if (isSceneMapping) {
      setActionType('color');
    }
  }, [isSceneMapping]);

  useEffect(() => {
    if (!isSceneMapping && actionType === 'gradient' && !supportsGradient) {
      setActionType('color');
    }
  }, [actionType, supportsGradient, isSceneMapping]);

  useEffect(() => {
    if (gradientColors.length === 0) {
      setGradientColors([...defaultGradientPreset]);
      setActiveGradientIndex(0);
      return;
    }

    if (activeGradientIndex >= gradientColors.length) {
      setActiveGradientIndex(Math.max(gradientColors.length - 1, 0));
    }
  }, [gradientColors, activeGradientIndex]);

  useEffect(() => {
    const nextColor = gradientColors[activeGradientIndex];
    const currentValue = currentGradientHex || '';
    if (nextColor && nextColor.toLowerCase() !== currentValue.toLowerCase()) {
      setGradientColorState({ type: 'hex', value: nextColor });
    }
  }, [activeGradientIndex, gradientColors, currentGradientHex, setGradientColorState]);

  const applyGradientColor = (input: Parameters<typeof setGradientColorState>[0]) => {
    setGradientColorState(input);
    const hex = getHexFromInput(input);
    setGradientColors((prev) => {
      if (activeGradientIndex >= prev.length) {
        return prev;
      }
      if (prev[activeGradientIndex]?.toLowerCase() === hex.toLowerCase()) {
        return prev;
      }
      const next = [...prev];
      next[activeGradientIndex] = hex;
      return next;
    });
  };

  const actionOptions: Array<{ value: 'color' | 'gradient' | 'brightness' | 'toggle' | 'effect'; label: string }> = [
    { value: 'color', label: 'Color' },
  ];

  if (supportsGradient) {
    actionOptions.push({ value: 'gradient', label: 'Gradient' });
  }

  actionOptions.push(
    { value: 'brightness', label: 'Brightness' },
    { value: 'toggle', label: 'On/Off Toggle' },
    { value: 'effect', label: 'Effect' },
  );

  const gradientPreviewStyle = {
    background:
      gradientColors.length > 0
        ? `linear-gradient(90deg, ${gradientColors
            .map((color, index) => {
              if (gradientColors.length === 1) {
                return `${color} 0%`;
              }
              const position = (index / (gradientColors.length - 1)) * 100;
              return `${color} ${position}%`;
            })
            .join(', ')})`
        : '#000000',
  };

  const addGradientStop = () => {
    setGradientColors((prev) => {
      if (prev.length >= 5) return prev;
      const next = [...prev, prev[prev.length - 1] || defaultGradientPreset[1]];
      setActiveGradientIndex(next.length - 1);
      return next;
    });
  };

  const removeGradientStop = (index: number) => {
    setGradientColors((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, idx) => idx !== index);
      if (index === activeGradientIndex) {
        setActiveGradientIndex(Math.max(index - 1, 0));
      } else if (index < activeGradientIndex) {
        setActiveGradientIndex((value) => Math.max(value - 1, 0));
      }
      return next;
    });
  };

  const gradientPalette = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8800ff', '#ff0088'];

  // Preview the current settings on the selected light
  const previewSettings = useCallback(async () => {
    if (!lightId || isSceneMapping) return;

    try {
      console.log('Sending preview request:', { actionType, effect, lightId });

      if (actionType === 'color') {
        const hsv = hexToHsv(currentColorHex);

        await api.test.light(lightId, {
          on: true,
          brightness: brightnessMode === 'fixed' ? fixedBrightness : 254,
          hue: hsv.hue,
          saturation: hsv.saturation,
          transitionTime,
        });
      } else if (actionType === 'brightness') {
        await api.test.light(lightId, {
          on: true,
          brightness: brightnessMode === 'fixed' ? fixedBrightness : 254,
          transitionTime,
        });
      } else if (actionType === 'gradient') {
        if (!supportsGradient) {
          return;
        }

        const xyGradient = gradientColors.filter(Boolean).map((hex) => hexToXy(hex));
        if (xyGradient.length < 2) {
          return;
        }

        await api.test.light(lightId, {
          on: true,
          gradient: xyGradient,
          transitionTime,
        });
      } else if (actionType === 'effect') {
        const payload: LightState = {
          on: true,
          brightness: 254,
          effect: effect as LightState['effect'],
          transitionTime,
        };

        if (EFFECTS_WITH_COLOR_PARAMETER.has(effect)) {
          payload.effectColor = hexToXy(currentEffectHex);
        }

        if (EFFECTS_WITH_TWO_COLORS.has(effect)) {
          payload.effectColor2 = hexToXy(currentEffectColor2Hex);
        }

        if (EFFECTS_WITH_SPEED_PARAMETER.has(effect)) {
          payload.effectSpeed = Number(effectSpeed.toFixed(2));
        }

        if (EFFECTS_WITH_BPM_PARAMETER.has(effect)) {
          payload.effectBpm = effectBpm;
        }

        if (EFFECTS_WITH_INTENSITY_PARAMETER.has(effect)) {
          payload.effectIntensity = effectIntensity;
        }

        await api.test.light(lightId, payload);
      }
    } catch (err) {
      console.error('Preview failed:', err);
    }
  }, [
    lightId,
    actionType,
    currentColorHex,
    brightnessMode,
    fixedBrightness,
    effect,
    currentEffectHex,
    currentEffectColor2Hex,
    transitionTime,
    gradientColors,
    supportsGradient,
    effectSpeed,
    effectBpm,
    effectIntensity,
    isSceneMapping,
  ]);

  // Debounced preview - wait 300ms after user stops adjusting
  useEffect(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    previewTimeoutRef.current = setTimeout(() => {
      console.log('Preview triggered:', { lightId, actionType, effect, brightnessMode, fixedBrightness });
      previewSettings();
    }, 300);

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [previewSettings]);

  // WebSocket connection for MIDI learning
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3000`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected for MIDI learn');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Only process MIDI messages when in learning mode
        if (isLearning) {
          if (message.type === 'midi') {
            // Note message
            console.log('Received MIDI note:', message.data);
            setTriggerType('note');
            setMidiChannel(message.data.channel);
            setMidiNote(message.data.note);
            setIsLearning(false);
          } else if (message.type === 'cc') {
            // CC message
            console.log('Received MIDI CC:', message.data);
            setTriggerType('cc');
            setMidiChannel(message.data.channel);
            setCcNumber(message.data.controller);
            setCcValue(message.data.value);
            setCcValueMode('specific');
            setIsLearning(false);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [isLearning]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const hsv = hexToHsv(currentColorHex);

    const trimmedName = name.trim() || undefined;
    const baseAction: MidiMapping['action'] = {
      type: actionType,
      brightnessMode,
      fixedBrightness,
      transitionTime,
      animationPreset,
    };

    const mapping: MidiMapping = {
      triggerType,
      midiChannel,
      midiNote: triggerType === 'cc' ? 0 : midiNote, // Use 0 for CC mappings (required field)
      lightId,
      name: trimmedName,
      action: baseAction,
    };

    // Add CC-specific fields
    if (triggerType === 'cc') {
      mapping.ccNumber = ccNumber;
      if (ccValueMode === 'specific' && ccValue !== undefined) {
        mapping.ccValue = ccValue;
      }
    }

    // Add preset filter (for per-song mappings)
    if (usePresetFilter && preset !== undefined) {
      mapping.preset = preset;
    }

    if (isSceneMapping) {
      mapping.sceneId = sceneId;
      onSubmit(mapping);
      return;
    }

    if (actionType === 'color') {
      mapping.action.colorHue = hsv.hue;
      mapping.action.colorSat = hsv.saturation;
    } else if (actionType === 'gradient') {
      const sanitizedGradient = gradientColors.filter(Boolean);
      if (sanitizedGradient.length < 2) {
        window.alert('Gradients need at least two colors.');
        return;
      }
      mapping.action.gradientColors = sanitizedGradient.map((hex) => hexToXy(hex));
    } else if (actionType === 'effect') {
      mapping.action.effect = effect as MidiMapping['action']['effect'];
      // Add effect color for effects that support it
      if (EFFECTS_WITH_COLOR_PARAMETER.has(effect)) {
        mapping.action.effectColor = hexToXy(currentEffectHex);
      }
      // Add second color for effects that support it
      if (EFFECTS_WITH_TWO_COLORS.has(effect)) {
        mapping.action.effectColor2 = hexToXy(currentEffectColor2Hex);
      }
      // Add speed for native Hue effects
      if (EFFECTS_WITH_SPEED_PARAMETER.has(effect)) {
        mapping.action.effectSpeed = effectSpeed;
      }
      // Add BPM for custom effects
      if (EFFECTS_WITH_BPM_PARAMETER.has(effect)) {
        mapping.action.effectBpm = effectBpm;
      }
      // Add intensity for lightning effect
      if (EFFECTS_WITH_INTENSITY_PARAMETER.has(effect)) {
        mapping.action.effectIntensity = effectIntensity;
      }
    }

    onSubmit(mapping);
  };

  const handleConvertToScene = async () => {
    if (!lightId) {
      setConversionMessage('Select a light before converting to a scene.');
      return;
    }

    if (actionType === 'gradient' && gradientColors.filter(Boolean).length < 2) {
      setConversionMessage('Gradients need at least two colors before converting.');
      return;
    }

    try {
      setIsConverting(true);
      setConversionMessage(null);

      const payload = buildScenePayload(lightId);
      const response = await api.scenes.create(payload);
      await onScenesRefresh();
      setSceneId(response.scene.id);
      setConversionMessage(`Scene "${response.scene.name}" created. You can refine it in the scene editor.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert mapping to scene';
      setConversionMessage(message);
    } finally {
      setIsConverting(false);
    }
  };

  const buildScenePayload = (targetLightId: string): ScenePayload => {
    const baseName = name.trim() || `Scene ch${midiChannel} note${midiNote}`;
    const transitionMs = transitionTime > 0 ? transitionTime * 100 : undefined;

    const state = buildSceneLightState();

    return {
      name: baseName,
      description: undefined,
      tags: [`ch${midiChannel}`, `note${midiNote}`],
      transition: transitionMs ? { durationMs: transitionMs } : undefined,
      lights: [
        {
          targetId: targetLightId,
          targetType: 'light',
          state,
        },
      ],
      metadata: undefined,
    };
  };

  const buildSceneLightState = (): LightState => {
    const base: LightState = { on: true };
    const resolvedBrightness = brightnessMode === 'fixed' ? Math.max(1, fixedBrightness) : 254;

    switch (actionType) {
      case 'color': {
        const hsv = hexToHsv(currentColorHex);
        base.hue = hsv.hue;
        base.saturation = hsv.saturation;
        base.brightness = resolvedBrightness;
        break;
      }
      case 'brightness': {
        base.brightness = resolvedBrightness;
        break;
      }
      case 'toggle': {
        base.on = true;
        break;
      }
      case 'effect': {
        base.effect = effect as LightState['effect'];
        base.brightness = resolvedBrightness;
        if (EFFECTS_WITH_COLOR_PARAMETER.has(effect)) {
          base.effectColor = hexToXy(currentEffectHex);
        }
        if (EFFECTS_WITH_SPEED_PARAMETER.has(effect)) {
          base.effectSpeed = effectSpeed;
        }
        break;
      }
      case 'gradient': {
        base.gradient = gradientColors
          .filter(Boolean)
          .map((hex) => hexToXy(hex));
        base.brightness = resolvedBrightness;
        break;
      }
      default:
        break;
    }

    if (transitionTime > 0) {
      base.transitionTime = transitionTime;
    }

    return base;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Preview Info Banner */}
      <div className="bg-[#667eea]/10 border border-[#667eea]/30 rounded p-3 text-sm text-[#aaa]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#667eea] animate-pulse"></div>
          <span>Live preview enabled - your changes will appear on the light in real-time</span>
        </div>
      </div>

      {/* Scene Selection */}
      {scenes.length > 0 ? (
        <SceneSelect scenes={scenes} value={sceneId} onChange={setSceneId} />
      ) : (
        <div className="flex flex-col gap-2">
          <label className="block text-sm text-[#aaa]">Scene</label>
          <p className="text-xs text-[#777]">Create scenes to trigger them from MIDI mappings.</p>
        </div>
      )}
      {isSceneMapping ? (
        <p className="text-xs text-[#777]">Per-light controls are disabled when a scene is selected.</p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[#777]">
          <span>Prefer reusing scenes? Convert this mapping into a scene for richer editing.</span>
        </div>
      )}

      {/* Mapping Name */}
      <div>
        <label className="block text-sm text-[#aaa] mb-1">
          Mapping Name <span className="text-xs text-[#777]">(optional)</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Kick Drum Red Flash"
          className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded placeholder:text-[#666]"
        />
      </div>

      {/* MIDI Settings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-[#aaa]">MIDI Trigger</label>
          <button
            type="button"
            onClick={() => setIsLearning(!isLearning)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              isLearning
                ? 'bg-[#f093fb] text-white animate-pulse'
                : 'bg-[#667eea] hover:bg-[#764ba2] text-white'
            }`}
          >
            {isLearning ? '🎹 Listening...' : '🎹 Learn'}
          </button>
        </div>

        {isLearning && (
          <div className="mb-3 bg-[#f093fb]/10 border border-[#f093fb]/30 rounded p-3 text-sm text-[#e0e0e0]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#f093fb] animate-pulse"></div>
              <span>Press any MIDI key or send a CC to capture it</span>
            </div>
          </div>
        )}

        {/* Trigger Type Toggle */}
        <div className="mb-4">
          <label className="block text-sm text-[#aaa] mb-2">Trigger Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTriggerType('note')}
              className={`flex-1 px-3 py-2 rounded border text-sm transition-colors ${
                triggerType === 'note'
                  ? 'bg-[#667eea] text-white border-[#667eea]'
                  : 'bg-[#2a2a2a] text-[#aaa] border-[#444] hover:bg-[#333]'
              }`}
            >
              🎹 Note
            </button>
            <button
              type="button"
              onClick={() => setTriggerType('cc')}
              className={`flex-1 px-3 py-2 rounded border text-sm transition-colors ${
                triggerType === 'cc'
                  ? 'bg-[#764ba2] text-white border-[#764ba2]'
                  : 'bg-[#2a2a2a] text-[#aaa] border-[#444] hover:bg-[#333]'
              }`}
            >
              🎛️ CC (Helix/Controllers)
            </button>
          </div>
        </div>

        {/* Note-specific fields */}
        {triggerType === 'note' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#aaa] mb-1">MIDI Channel (0-15)</label>
              <input
                type="number"
                min="0"
                max="15"
                value={midiChannel}
                onChange={(e) => setMidiChannel(Number(e.target.value))}
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                required
                disabled={isLearning}
              />
            </div>
            <div>
              <label className="block text-sm text-[#aaa] mb-1">MIDI Note (0-127)</label>
              <input
                type="number"
                min="0"
                max="127"
                value={midiNote}
                onChange={(e) => setMidiNote(Number(e.target.value))}
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                required
                disabled={isLearning}
              />
            </div>
          </div>
        )}

        {/* CC-specific fields */}
        {triggerType === 'cc' && (
          <div className="space-y-4">
            {/* Helix Presets */}
            <div>
              <label className="block text-sm text-[#aaa] mb-2">Helix Quick Presets</label>
              <div className="flex flex-wrap gap-2">
                {HELIX_CC_PRESETS.map((preset) => (
                  <button
                    key={`${preset.cc}-${preset.value}`}
                    type="button"
                    onClick={() => {
                      setCcNumber(preset.cc);
                      setCcValue(preset.value);
                      setCcValueMode('specific');
                    }}
                    className={`px-3 py-1.5 rounded text-xs transition-colors ${
                      ccNumber === preset.cc && ccValue === preset.value
                        ? 'bg-[#764ba2] text-white'
                        : 'bg-[#2a2a2a] text-[#aaa] border border-[#444] hover:bg-[#333]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#aaa] mb-1">MIDI Channel (0-15)</label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={midiChannel}
                  onChange={(e) => setMidiChannel(Number(e.target.value))}
                  className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                  required
                  disabled={isLearning}
                />
              </div>
              <div>
                <label className="block text-sm text-[#aaa] mb-1">CC Number (0-127)</label>
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={ccNumber}
                  onChange={(e) => setCcNumber(Number(e.target.value))}
                  className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                  required
                  disabled={isLearning}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#aaa] mb-2">CC Value Match</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setCcValueMode('specific')}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    ccValueMode === 'specific'
                      ? 'bg-[#764ba2] text-white'
                      : 'bg-[#2a2a2a] text-[#aaa] border border-[#444] hover:bg-[#333]'
                  }`}
                >
                  Specific Value
                </button>
                <button
                  type="button"
                  onClick={() => setCcValueMode('any')}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    ccValueMode === 'any'
                      ? 'bg-[#764ba2] text-white'
                      : 'bg-[#2a2a2a] text-[#aaa] border border-[#444] hover:bg-[#333]'
                  }`}
                >
                  Any Value
                </button>
              </div>
              {ccValueMode === 'specific' && (
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={ccValue ?? 0}
                  onChange={(e) => setCcValue(Number(e.target.value))}
                  className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                  disabled={isLearning}
                />
              )}
              <p className="text-xs text-[#777] mt-1">
                {ccValueMode === 'specific'
                  ? 'Triggers only when CC has this exact value (e.g., Helix Snapshot 1 = CC69 value 0)'
                  : 'Triggers on any CC value (useful for expression pedals)'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Preset Filter (for per-song mappings) */}
      <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
        {hasPresetContext ? (
          // Simplified view when there's a preset context
          <div className="flex items-center gap-2">
            <span className="text-[#667eea] font-medium">Preset {presetContext + 1}</span>
            <span className="text-sm text-[#aaa]">
              This mapping will be assigned to the currently selected preset.
            </span>
          </div>
        ) : (
          // Full view when in "All Presets" mode
          <>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="usePresetFilter"
                checked={usePresetFilter}
                onChange={(e) => {
                  setUsePresetFilter(e.target.checked);
                  if (!e.target.checked) {
                    setPreset(undefined);
                  }
                }}
                className="w-4 h-4"
              />
              <label htmlFor="usePresetFilter" className="text-sm text-[#aaa]">
                Only trigger for specific preset/song (Program Change)
              </label>
            </div>
            {usePresetFilter && (
              <div>
                <label className="block text-sm text-[#aaa] mb-1">Preset Number (PC)</label>
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={preset ?? 0}
                  onChange={(e) => setPreset(Number(e.target.value))}
                  className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                />
                <p className="text-xs text-[#777] mt-1">
                  This mapping will only trigger when on preset {(preset ?? 0) + 1} (PC {preset ?? 0}).
                  Change presets on your Helix to see the PC value in the Activity log.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Light Selection */}
      <div>
        <label className="block text-sm text-[#aaa] mb-1">Light</label>
        <select
          value={lightId}
          onChange={(e) => setLightId(e.target.value)}
          className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
          required
          disabled={isSceneMapping}
        >
          {lights.map((light) => {
            const badges = [];
            if (light.capabilities?.gradient) badges.push('Gradient');
            if (light.capabilities?.streaming) badges.push('Streaming');
            if (light.capabilities?.availableEffects && light.capabilities.availableEffects.length > 1) {
              badges.push(`${light.capabilities.availableEffects.length} effects`);
            }

            return (
              <option key={light.id} value={light.id}>
                {light.name} ({light.type}){badges.length > 0 ? ` • ${badges.join(' • ')}` : ''}
              </option>
            );
          })}
        </select>

        {/* Show selected light capabilities */}
        {selectedLight && !isSceneMapping && (
          <div className="mt-2 p-2 bg-[#1a1a1a] rounded text-xs">
            <div className="text-[#aaa] mb-1">Capabilities:</div>
            <div className="flex flex-wrap gap-1">
              {selectedLight.capabilities?.color && (
                <span className="px-2 py-0.5 bg-[#667eea]/20 text-[#667eea] rounded">Color</span>
              )}
              {selectedLight.capabilities?.brightness && (
                <span className="px-2 py-0.5 bg-[#667eea]/20 text-[#667eea] rounded">Brightness</span>
              )}
              {selectedLight.capabilities?.gradient && (
                <span className="px-2 py-0.5 bg-[#764ba2]/20 text-[#764ba2] rounded">Gradient</span>
              )}
              {selectedLight.capabilities?.streaming && (
                <span className="px-2 py-0.5 bg-[#f093fb]/20 text-[#f093fb] rounded">Streaming</span>
              )}
              {selectedLight.capabilities?.effects && (
                <span className="px-2 py-0.5 bg-[#4facfe]/20 text-[#4facfe] rounded">
                  Effects ({selectedLight.capabilities.availableEffects?.length || 0})
                </span>
              )}
            </div>
            {selectedLight.productName && (
              <div className="text-[#777] mt-1">Model: {selectedLight.productName}</div>
            )}
          </div>
        )}
      </div>

      {/* Action Type */}
      {!isSceneMapping && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">Action Type</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as any)}
            className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
            required
          >
            {actionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isSceneMapping && (
        <div className="flex items-center justify-between bg-[#1f1f1f] border border-[#333] rounded p-3">
          <div>
            <h4 className="text-sm text-[#e0e0e0] font-medium">Convert to Scene</h4>
            <p className="text-xs text-[#777] mt-1">Create a reusable scene from this mapping and manage it in the scene editor.</p>
            {conversionMessage && (
              <p className="text-xs text-[#10b981] mt-1">{conversionMessage}</p>
            )}
          </div>
          <Button type="button" onClick={handleConvertToScene} disabled={isConverting}>
            {isConverting ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      )}

      {!isSceneMapping && actionType === 'gradient' && supportsGradient && (
        <div>
          <label className="block text-sm text-[#aaa] mb-2">Gradient Palette</label>
          <div className="space-y-4">
            <div
              className="h-10 rounded border border-[#444] shadow-inner"
              style={gradientPreviewStyle}
            />
            <div className="flex flex-wrap gap-2">
              {gradientColors.map((color, index) => {
                const isActive = index === activeGradientIndex;
                return (
                  <div key={`gradient-stop-${index}`} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveGradientIndex(index)}
                      className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${
                        isActive ? 'border-[#667eea] bg-[#667eea]/10' : 'border-[#333] bg-[#222]'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded shadow-inner border border-black/30"
                        style={{ background: color }}
                      />
                      <span className="text-sm text-[#ddd]">Stop {index + 1}</span>
                    </button>
                    {gradientColors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeGradientStop(index)}
                        className="text-xs text-[#999] hover:text-[#f093fb] px-2 py-2 rounded"
                        aria-label={`Remove stop ${index + 1}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              {gradientColors.length < 5 && (
                <button
                  type="button"
                  onClick={addGradientStop}
                  className="px-3 py-2 rounded border border-dashed border-[#444] text-sm text-[#aaa] hover:border-[#667eea] hover:text-[#e0e0e0]"
                >
                  + Add Color
                </button>
              )}
            </div>

            <div className="text-xs text-[#777]">
              Use 2–5 colors. Colors are spaced evenly along the strip.
            </div>

            <div className="space-y-3">
              {/* Preset colors */}
              <div className="flex flex-wrap gap-2 text-sm">
                {gradientPalette.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyGradientColor({ type: 'hex', value: preset })}
                    className="px-3 py-2 rounded text-white shadow-inner border border-black/30"
                    style={{ background: preset }}
                  >
                    {preset.toUpperCase()}
                  </button>
                ))}
              </div>
              {/* Color picker and hex input */}
              <div className="flex gap-4 items-start">
                <div className="w-[200px] flex-shrink-0">
                  <ColorPicker color={gradientColorInput} onChange={applyGradientColor}>
                    <div className="mb-3 h-[150px]">
                      <ColorPicker.Saturation className="h-full w-full rounded" />
                    </div>
                    <ColorPicker.Hue className="h-4 mb-2" />
                    <ColorPicker.EyeDropper />
                  </ColorPicker>
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={currentGradientHex}
                    onChange={(e) => applyGradientColor({ type: 'hex', value: e.target.value })}
                    className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                    placeholder="#ff0000"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Color Picker (only for color action) */}
      {!isSceneMapping && actionType === 'color' && (
        <div>
          <label className="block text-sm text-[#aaa] mb-2">Color</label>
          <div className="flex gap-4 items-start">
            <div className="w-[200px]">
              <ColorPicker color={colorInput} onChange={setColorState}>
                <div className="mb-3 h-[200px]">
                  <ColorPicker.Saturation className="h-full w-full rounded" />
                </div>
                <ColorPicker.Hue className="h-4 mb-2" />
                <ColorPicker.EyeDropper />
              </ColorPicker>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={currentColorHex}
                onChange={(e) => setColorState({ type: 'hex', value: e.target.value })}
                className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded mb-2"
                placeholder="#ff0000"
              />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#ff0000' })}
                  className="p-2 rounded bg-[#ff0000] text-white"
                >
                  Red
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#ff8800' })}
                  className="p-2 rounded bg-[#ff8800] text-white"
                >
                  Orange
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#ffff00' })}
                  className="p-2 rounded bg-[#ffff00] text-black"
                >
                  Yellow
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#00ff00' })}
                  className="p-2 rounded bg-[#00ff00] text-black"
                >
                  Green
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#00ffff' })}
                  className="p-2 rounded bg-[#00ffff] text-black"
                >
                  Cyan
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#0000ff' })}
                  className="p-2 rounded bg-[#0000ff] text-white"
                >
                  Blue
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#8800ff' })}
                  className="p-2 rounded bg-[#8800ff] text-white"
                >
                  Purple
                </button>
                <button
                  type="button"
                  onClick={() => setColorState({ type: 'hex', value: '#ff0088' })}
                  className="p-2 rounded bg-[#ff0088] text-white"
                >
                  Pink
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Effect Selection (only for effect action) */}
      {!isSceneMapping && actionType === 'effect' && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">
            Effect
            {selectedLight && (
              <span className="ml-2 text-xs text-[#777]">
                ({selectedLight.productName || selectedLight.type})
              </span>
            )}
          </label>
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value)}
            className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
          >
            {/* Native Hue V2 Effects - Show first as they're most stable */}
            {selectedLight?.capabilities?.availableEffects && selectedLight.capabilities.availableEffects.length > 0 && (
              <optgroup label="✨ Hue Dynamic Effects">
                {selectedLight.capabilities.availableEffects.includes('prism') && (
                  <option value="prism">Prism (Color Cycle)</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('sparkle') && (
                  <option value="sparkle">Sparkle</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('fire') && (
                  <option value="fire">Fire</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('candle') && (
                  <option value="candle">Candle</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('opal') && (
                  <option value="opal">Opal</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('glisten') && (
                  <option value="glisten">Glisten</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('underwater') && (
                  <option value="underwater">Underwater</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('cosmos') && (
                  <option value="cosmos">Cosmos</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('sunbeam') && (
                  <option value="sunbeam">Sunbeam</option>
                )}
                {selectedLight.capabilities.availableEffects.includes('enchant') && (
                  <option value="enchant">Enchant</option>
                )}
              </optgroup>
            )}

            {/* Streaming Presets - work great with Entertainment API */}
            <optgroup label="🎬 Nature Presets">
              <option value="aurora">Aurora (Northern Lights)</option>
              <option value="lava">Lava (Molten Flow)</option>
              <option value="ocean">Ocean (Underwater Waves)</option>
              <option value="thunderstorm">Thunderstorm (Lightning)</option>
              <option value="rain">Rain (Gentle Clouds)</option>
              <option value="forest">Forest (Dappled Light)</option>
              <option value="meadow">Meadow (Sunlit Grass)</option>
              <option value="starfield">Starfield (Twinkling Stars)</option>
              <option value="galaxy">Galaxy (Cosmic Nebula)</option>
            </optgroup>

            <optgroup label="🏠 Window Views">
              <option value="cozy_window">Cozy Window (Warm Interior)</option>
              <option value="evening_window">Evening Window (Quiet Lamp)</option>
              <option value="party_window">Party Window (Colorful)</option>
            </optgroup>

            <optgroup label="💡 Ambient">
              <option value="tv_ballast">TV Ballast (CRT Warmup)</option>
              <option value="fluorescent">Fluorescent (Tube Light)</option>
              <option value="sparse">Sparse (Scattered Points)</option>
              <option value="scattered">Scattered (Colorful Points)</option>
              <option value="traffic">Traffic (Night Drive)</option>
              <option value="highway">Highway (Fast Traffic)</option>
            </optgroup>

            <optgroup label="🎪 Chase Effects">
              <option value="marquee">Marquee (Theater Lights)</option>
              <option value="marquee_alternate">Marquee Alternate</option>
              <option value="theater">Theater (Slow Elegant)</option>
              <option value="rainbow_chase">Rainbow Chase</option>
              <option value="comet">Comet (Trailing Fade)</option>
              <option value="wave">Wave (Flowing Pattern)</option>
              <option value="bounce">Bounce (Back & Forth)</option>
              <option value="pulse">Pulse (Rhythmic)</option>
              <option value="colorloop">Color Loop</option>
              <option value="two_color_chase">Two Color Chase</option>
            </optgroup>

            {/* Stop/None */}
            <optgroup label="⏹️ Control">
              <option value="none">No Effect (Stop)</option>
            </optgroup>

            {/* Custom Effects - legacy BPM-based */}
            <optgroup label="🧪 Custom Effects (BPM)">
              <option value="strobe">Strobe (Rapid On/Off)</option>
              <option value="police">Police Lights (Red/Blue)</option>
              <option value="ambulance">Ambulance (Red/White)</option>
              <option value="lightning">Lightning (Random Flashes)</option>
              <option value="color_flash">Color Flash (Two Colors)</option>
              <option value="breathe_smooth">Breathe (Smooth Fade)</option>
              <option value="chase">Color Chase</option>
              <option value="desert">Desert (Heat Shimmer)</option>
              <option value="tv_flicker">TV Flicker (Through Blinds)</option>
            </optgroup>
          </select>

          {/* Effect description */}
          <p className="text-xs text-[#777] mt-2">
            {/* Streaming presets */}
            {effect === 'aurora' && '🌌 Northern lights with flowing green/teal/purple bands'}
            {effect === 'lava' && '🌋 Molten lava with cooling zones and bubbling hotspots'}
            {effect === 'ocean' && '🌊 Deep underwater waves with traveling light bursts'}
            {effect === 'thunderstorm' && '⛈️ Dark storm clouds with dramatic lightning flashes'}
            {effect === 'rain' && '🌧️ Gentle rain with soft blue-gray clouds'}
            {effect === 'forest' && '🌲 Peaceful canopy with dappled sunlight filtering through'}
            {effect === 'meadow' && '🌻 Sunlit meadow with gentle grass sway'}
            {effect === 'starfield' && '✨ Twinkling stars with occasional shooting stars'}
            {effect === 'galaxy' && '🌌 Colorful cosmic nebula with purple/blue/pink hues'}
            {effect === 'traffic' && '🚗 Night traffic - red taillights and white headlights'}
            {effect === 'highway' && '🛣️ Fast highway traffic streaks'}
            {effect === 'rainbow_chase' && '🌈 Rainbow colors cycling across gradient lights'}
            {effect === 'comet' && '☄️ Bright head with warm fading trail'}
            {effect === 'wave' && '🌊 Flowing wave brightness pattern'}
            {effect === 'bounce' && '↔️ Colors bouncing back and forth'}
            {effect === 'pulse' && '💓 Rhythmic brightness pulsing'}
            {effect === 'colorloop' && '🔄 Classic smooth color cycling'}
            {effect === 'two_color_chase' && '🎨 Alternating between two colors'}
            {/* Window views */}
            {effect === 'cozy_window' && '🏠 Warm living room light with TV glow and passing shadows'}
            {effect === 'evening_window' && '🌙 Quiet evening lamp light through window'}
            {effect === 'party_window' && '🎉 Colorful party lights seen through window'}
            {/* Ambient effects */}
            {effect === 'tv_ballast' && '📺 Old CRT TV warming up with characteristic flicker'}
            {effect === 'fluorescent' && '💡 Fluorescent tube light with subtle buzz'}
            {effect === 'sparse' && '✨ Scattered light points with darkness between'}
            {effect === 'scattered' && '🌈 Colorful scattered light points'}
            {/* Chase effects */}
            {effect === 'marquee' && '🎭 Classic theater marquee lights chasing'}
            {effect === 'marquee_alternate' && '💡 Alternating marquee bulbs blinking'}
            {effect === 'theater' && '🎬 Elegant slow-moving theater lights'}
            {/* Legacy custom effects */}
            {effect === 'strobe' && '⚡ Rapid on/off strobe at configurable speed'}
            {effect === 'police' && '🚔 Alternating red/blue police lights'}
            {effect === 'ambulance' && '🚑 Alternating red/white ambulance lights'}
            {effect === 'lightning' && '⛈️ Random bright flashes like a thunderstorm'}
            {effect === 'color_flash' && '🎨 Flash between two colors you choose'}
            {effect === 'breathe_smooth' && '🌬️ Smooth sine-wave brightness fade'}
            {effect === 'chase' && '🔄 Cycle through colors in sequence'}
            {effect === 'desert' && '🏜️ Warm dusty colors drifting like desert heat shimmer'}
            {effect === 'tv_flicker' && '📺 Cool blue TV glow flickering through window blinds'}
            {/* Native Hue effects */}
            {effect === 'sparkle' && '✨ Twinkling sparkle effect'}
            {effect === 'fire' && '🔥 Flickering fire/flame simulation'}
            {effect === 'fireplace' && '🔥 Cozy fireplace flames'}
            {effect === 'candle' && '🕯️ Gentle candle flicker'}
            {effect === 'prism' && '🌈 Smooth color cycling through spectrum'}
            {effect === 'opal' && '💎 Subtle opal shimmer'}
            {effect === 'glisten' && '✨ Soft glistening effect'}
            {effect === 'underwater' && '🌊 Underwater caustics effect'}
            {effect === 'cosmos' && '🌌 Deep space aurora effect'}
            {effect === 'sunbeam' && '☀️ Warm sunlight beam effect'}
            {effect === 'enchant' && '🔮 Magical enchantment effect'}
            {effect === 'none' && '⏹️ Stop any running effect'}
          </p>
        </div>
      )}

      {/* Effect Color Picker (for dynamic effects that support color) */}
      {!isSceneMapping && actionType === 'effect' && EFFECTS_WITH_COLOR_PARAMETER.has(effect) && (
        <div>
          <label className="block text-sm text-[#aaa] mb-2">
            Effect Color
            <span className="ml-2 text-xs text-[#777]">(optional for some effects)</span>
          </label>
          <div className="flex gap-4 items-start">
            <div className="w-[200px]">
              <ColorPicker color={effectColorInput} onChange={setEffectColorState}>
                <div className="mb-3 h-[150px]">
                  <ColorPicker.Saturation className="h-full w-full rounded" />
                </div>
                <ColorPicker.Hue className="mb-3" />
              </ColorPicker>
              <div className="text-xs text-[#aaa] mt-2">
                Current: {currentEffectHex}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[#aaa] mb-2">Quick colors for {effect}:</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#ff6600' })}
                  className="p-2 rounded bg-[#ff6600] text-white text-xs"
                >
                  Orange
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#ff0000' })}
                  className="p-2 rounded bg-[#ff0000] text-white text-xs"
                >
                  Red
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#ffff00' })}
                  className="p-2 rounded bg-[#ffff00] text-black text-xs"
                >
                  Yellow
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#0088ff' })}
                  className="p-2 rounded bg-[#0088ff] text-white text-xs"
                >
                  Blue
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#8800ff' })}
                  className="p-2 rounded bg-[#8800ff] text-white text-xs"
                >
                  Purple
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColorState({ type: 'hex', value: '#00ff88' })}
                  className="p-2 rounded bg-[#00ff88] text-black text-xs"
                >
                  Green
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Second Color Picker (for alternating effect) */}
      {!isSceneMapping && actionType === 'effect' && EFFECTS_WITH_TWO_COLORS.has(effect) && (
        <div>
          <label className="block text-sm text-[#aaa] mb-2">
            Second Color
            <span className="ml-2 text-xs text-[#777]">(alternates with first color)</span>
          </label>
          <div className="flex gap-4 items-start">
            <div className="w-[200px]">
              <ColorPicker color={effectColor2Input} onChange={setEffectColor2State}>
                <div className="mb-3 h-[150px]">
                  <ColorPicker.Saturation className="h-full w-full rounded" />
                </div>
                <ColorPicker.Hue className="mb-3" />
              </ColorPicker>
              <div className="text-xs text-[#aaa] mt-2">
                Current: {currentEffectColor2Hex}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[#aaa] mb-2">Quick colors:</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEffectColor2State({ type: 'hex', value: '#0088ff' })}
                  className="p-2 rounded bg-[#0088ff] text-white text-xs"
                >
                  Blue
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColor2State({ type: 'hex', value: '#00ff88' })}
                  className="p-2 rounded bg-[#00ff88] text-black text-xs"
                >
                  Green
                </button>
                <button
                  type="button"
                  onClick={() => setEffectColor2State({ type: 'hex', value: '#8800ff' })}
                  className="p-2 rounded bg-[#8800ff] text-white text-xs"
                >
                  Purple
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Effect BPM (for custom effects) */}
      {!isSceneMapping && actionType === 'effect' && EFFECTS_WITH_BPM_PARAMETER.has(effect) && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">
            Effect Speed: {effectBpm} BPM
          </label>
          <input
            type="range"
            min="30"
            max="300"
            step="5"
            value={effectBpm}
            onChange={(e) => setEffectBpm(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[#666] mt-1">
            <span>Slow (30)</span>
            <span>Medium (120)</span>
            <span>Fast (300)</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setEffectBpm(60)}
              className="px-2 py-1 text-xs bg-[#333] rounded hover:bg-[#444]"
            >
              60 BPM
            </button>
            <button
              type="button"
              onClick={() => setEffectBpm(120)}
              className="px-2 py-1 text-xs bg-[#333] rounded hover:bg-[#444]"
            >
              120 BPM
            </button>
            <button
              type="button"
              onClick={() => setEffectBpm(180)}
              className="px-2 py-1 text-xs bg-[#333] rounded hover:bg-[#444]"
            >
              180 BPM
            </button>
            <button
              type="button"
              onClick={() => setEffectBpm(240)}
              className="px-2 py-1 text-xs bg-[#333] rounded hover:bg-[#444]"
            >
              240 BPM
            </button>
          </div>
        </div>
      )}

      {/* Effect Intensity (for lightning) */}
      {!isSceneMapping && actionType === 'effect' && EFFECTS_WITH_INTENSITY_PARAMETER.has(effect) && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">
            Flash Intensity: {Math.round(effectIntensity * 100)}%
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={effectIntensity}
            onChange={(e) => setEffectIntensity(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-[#777] mt-1">
            Higher intensity = more frequent and brighter flashes.
          </p>
        </div>
      )}

      {/* Effect Speed (for native Hue effects) */}
      {!isSceneMapping && actionType === 'effect' && EFFECTS_WITH_SPEED_PARAMETER.has(effect) && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">
            Effect Speed: {Math.round(effectSpeed * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={effectSpeed}
            onChange={(e) => setEffectSpeed(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-[#777] mt-1">
            Lower values slow the animation, higher values make it more energetic.
          </p>
        </div>
      )}

      {/* Brightness Settings */}
      {!isSceneMapping && (actionType === 'color' || actionType === 'brightness') && (
        <>
          <div>
            <label className="block text-sm text-[#aaa] mb-1">Brightness Mode</label>
            <select
              value={brightnessMode}
              onChange={(e) => setBrightnessMode(e.target.value as any)}
              className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
            >
              <option value="velocity">Use MIDI Velocity</option>
              <option value="fixed">Fixed Brightness</option>
            </select>
          </div>

          {brightnessMode === 'fixed' && (
            <div>
              <label className="block text-sm text-[#aaa] mb-1">
                Fixed Brightness (0-254): {fixedBrightness}
              </label>
              <input
                type="range"
                min="1"
                max="254"
                value={fixedBrightness}
                onChange={(e) => setFixedBrightness(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}
        </>
      )}

      {/* Transition Time */}
      {!isSceneMapping && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">
            Transition Time (100ms increments): {transitionTime * 100}ms
          </label>
          <input
            type="range"
            min="0"
            max="50"
            value={transitionTime}
            onChange={(e) => setTransitionTime(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {/* Spring Animation Preset */}
      {!isSceneMapping && (
        <div>
          <label className="block text-sm text-[#aaa] mb-1">Animation Preset</label>
          <select
            value={animationPreset}
            onChange={(e) => setAnimationPreset(e.target.value as any)}
            className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
          >
            <option value="none">None (Instant)</option>
            <option value="gentle">Gentle (Smooth & Slow)</option>
            <option value="bounceIn">Bounce In (Elastic Entry)</option>
            <option value="bounceOut">Bounce Out (Elastic Exit)</option>
            <option value="wobbly">Wobbly (High Bounce)</option>
            <option value="snappy">Snappy (Quick & Punchy)</option>
            <option value="stiff">Stiff (Fast & Tight)</option>
            <option value="slow">Slow (Very Gradual)</option>
          </select>
          <p className="text-xs text-[#777] mt-1">
            {animationPreset === 'none' && 'Changes happen instantly'}
            {animationPreset === 'gentle' && 'Smooth spring animation, feels natural'}
            {animationPreset === 'bounceIn' && 'Overshoots target then settles, like a bounce'}
            {animationPreset === 'bounceOut' && 'Bouncy exit with elastic feel'}
            {animationPreset === 'wobbly' && 'High bounce, very playful and energetic'}
            {animationPreset === 'snappy' && 'Quick response, punchy and responsive'}
            {animationPreset === 'stiff' && 'Fast and tight, minimal overshoot'}
            {animationPreset === 'slow' && 'Very gradual change, relaxed feel'}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" onClick={onClose} variant="danger">
          Cancel
        </Button>
        <Button type="submit">Add Mapping</Button>
      </div>
    </form>
  );
}
