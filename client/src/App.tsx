import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useWebSocket } from './useWebSocket';
import { api } from './api';
import { Header } from './components/Header';
import { Section } from './components/Section';
import { Button } from './components/Button';
import { MappingForm } from './components/MappingForm';
import { SceneManager } from './components/SceneManager';
import { PinnedStatus } from './components/PinnedStatus';
import { StreamingSettings } from './components/StreamingSettings';
import { PresetGroup } from './components/PresetGroup';
import { MidiLearnPanel } from './components/MidiLearnPanel';
import type { MidiMapping } from './types';
import { DockedActivityMonitor } from './components/DockedActivityMonitor';

type Page = 'connections' | 'lights' | 'mappings';
type ConnectionTab = 'midi' | 'hue' | 'streaming';

function App() {
  useWebSocket();

  const {
    midiStatus,
    hueStatus,
    lights,
    mappings,
    scenes,
    activityLog,
    currentPreset,
    currentSnapshot,
    selectedPreset,
    encounteredPresets,
    autoFollowPreset,
    presetNames,
    collapsedPresets,
  } = useStore();

  const {
    setMidiStatus,
    setHueStatus,
    setLights,
    setMappings,
    setScenes,
    setSelectedPreset,
    setAutoFollowPreset,
    addEncounteredPreset,
    setPresetName,
    togglePresetCollapsed,
  } = useStore();

  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<MidiMapping | undefined>(undefined);
  const [newMappingTemplate, setNewMappingTemplate] = useState<Partial<MidiMapping> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [discoveredBridges, setDiscoveredBridges] = useState<any[]>([]);
  const [activeMappings, setActiveMappings] = useState<Set<string>>(new Set());
  const [activePage, setActivePage] = useState<Page>('connections');
  const [activeConnTab, setActiveConnTab] = useState<ConnectionTab>('midi');
  const [bridgeIp, setBridgeIp] = useState<string | undefined>(undefined);
  const [bridgeUsername, setBridgeUsername] = useState<string | undefined>(undefined);
  const [availableMidiPorts, setAvailableMidiPorts] = useState<string[]>([]);
  const [selectedMidiPort, setSelectedMidiPort] = useState<string>('');

  useEffect(() => {
    refreshMappings();
    refreshScenes();
    loadBridgeConnection();
    refreshMidiPorts();
  }, []);

  const refreshMidiPorts = async () => {
    try {
      const data = await api.midi.getPorts();
      setAvailableMidiPorts(data.ports || []);
    } catch (err) {
      console.error('Failed to fetch MIDI ports:', err);
    }
  };

  const connectToMidiPort = async (portName: string) => {
    try {
      const data = await api.midi.setPort(portName);
      setMidiStatus(data.port);
      showSuccessToast('Connected to MIDI port: ' + data.port);
    } catch (err: any) {
      showErrorToast('Failed to connect to MIDI port: ' + err.message);
    }
  };

  // Track active MIDI mappings for visual feedback
  useEffect(() => {
    const isDev = import.meta.env.DEV;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isDev ? 'localhost:3000' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'midi' && message.data) {
          const { channel, note, velocity } = message.data;
          const key = `${channel}:${note}`;

          if (velocity > 0) {
            setActiveMappings((prev) => new Set(prev).add(key));
            setTimeout(() => {
              setActiveMappings((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            }, 200);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  const loadBridgeConnection = async () => {
    try {
      const config = await api.config.get();
      setBridgeIp(config.bridgeIp);
      setBridgeUsername(config.bridgeUsername);

      const hasBridgeCredentials = Boolean(config.bridgeIp && config.bridgeUsername);
      if (!hasBridgeCredentials) {
        setHueStatus('Not Configured');
      }

      await refreshLights({ silent: true, suppressBridgeErrorToast: true });
    } catch (err) {
      console.error('Failed to load bridge connection:', err);
    }
  };

  const showErrorToast = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccessToast = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 5000);
  };

  const openVirtualPort = async () => {
    try {
      const data = await api.midi.setPort();
      setMidiStatus(data.port);
      showSuccessToast('Virtual MIDI port created: ' + data.port);
    } catch (err: any) {
      showErrorToast('Failed to create virtual port: ' + err.message);
    }
  };

  const refreshLights = async (options?: { silent?: boolean; suppressBridgeErrorToast?: boolean }) => {
    const { silent = false, suppressBridgeErrorToast = false } = options ?? {};

    try {
      const { lights: latestLights, bridgeConnected, bridgeError } = await api.hue.getLights();
      setLights(latestLights);

      if (bridgeConnected) {
        setHueStatus(bridgeIp ? `Connected: ${bridgeIp}` : 'Connected');
      } else if (bridgeIp && bridgeUsername) {
        setHueStatus('Not Connected');
        if (!silent && !suppressBridgeErrorToast) {
          showErrorToast(bridgeError || 'Hue bridge not connected');
        }
      } else {
        setHueStatus('Not Configured');
      }

      if (!silent) {
        showSuccessToast('Lights refreshed');
      }
    } catch (err: any) {
      console.error('Failed to refresh lights:', err);
      showErrorToast('Failed to refresh lights: ' + err.message);
    }
  };

  const testLight = async (lightId: string, on: boolean) => {
    try {
      await api.test.light(lightId, { on, brightness: 254, transitionTime: 2 });
    } catch (err: any) {
      showErrorToast('Failed to test light: ' + err.message);
    }
  };

  const refreshMappings = async () => {
    try {
      const data = await api.mappings.getAll();
      setMappings(data.mappings);
      data.mappings.forEach((mapping: MidiMapping) => {
        if (mapping.preset !== undefined) {
          addEncounteredPreset(mapping.preset);
        }
      });
    } catch (err: any) {
      console.error('Failed to refresh mappings:', err);
    }
  };

  const refreshScenes = async () => {
    try {
      const data = await api.scenes.getAll();
      setScenes(data.scenes);
    } catch (err: any) {
      console.error('Failed to refresh scenes:', err);
    }
  };

  const removeMapping = async (mapping: MidiMapping) => {
    try {
      if (mapping.triggerType === 'cc') {
        await api.mappings.remove(mapping.midiChannel, mapping.ccNumber ?? 0, 'cc', mapping.ccValue, mapping.preset);
      } else {
        await api.mappings.remove(mapping.midiChannel, mapping.midiNote, 'note', undefined, mapping.preset);
      }
      refreshMappings();
      showSuccessToast('Mapping removed');
    } catch (err: any) {
      showErrorToast('Failed to remove mapping: ' + err.message);
    }
  };

  const clearMappings = async () => {
    if (!confirm('Are you sure you want to clear all mappings?')) return;
    try {
      await api.mappings.clear();
      refreshMappings();
      showSuccessToast('All mappings cleared');
    } catch (err: any) {
      showErrorToast('Failed to clear mappings: ' + err.message);
    }
  };

  const handleAddMapping = async (mapping: MidiMapping) => {
    try {
      if (editingMapping) {
        if (editingMapping.triggerType === 'cc') {
          await api.mappings.remove(editingMapping.midiChannel, editingMapping.ccNumber ?? 0, 'cc', editingMapping.ccValue, editingMapping.preset);
        } else {
          await api.mappings.remove(editingMapping.midiChannel, editingMapping.midiNote, 'note', undefined, editingMapping.preset);
        }
      }

      await api.mappings.add(mapping);
      refreshMappings();
      setShowMappingModal(false);
      setEditingMapping(undefined);
      showSuccessToast(editingMapping ? 'Mapping updated' : 'Mapping added');
    } catch (err: any) {
      showErrorToast('Failed to save mapping: ' + err.message);
    }
  };

  const handleEditMapping = (mapping: MidiMapping) => {
    setEditingMapping(mapping);
    setNewMappingTemplate(undefined);
    setShowMappingModal(true);
  };

  const handleCreateFromLearn = (preset: number, snapshot: number) => {
    // Pre-fill a mapping template for the current preset + snapshot
    setEditingMapping(undefined);
    setNewMappingTemplate({
      preset,
      triggerType: 'cc',
      ccNumber: 69,
      ccValue: snapshot,
      midiChannel: 0,
    });
    setShowMappingModal(true);
  };

  // Check if a mapping already exists for the current preset + snapshot
  const hasMappingForCurrentContext = currentPreset !== null && currentSnapshot !== null &&
    mappings.some(m =>
      m.preset === currentPreset &&
      m.triggerType === 'cc' &&
      m.ccNumber === 69 &&
      m.ccValue === currentSnapshot
    );

  const hsvToHex = (hue: number, sat: number): string => {
    const h = hue / 65535;
    const s = sat / 254;
    const v = 1;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const getMappingDescription = (action: any) => {
    switch (action.type) {
      case 'color':
        return 'Set color' + (action.brightnessMode === 'velocity' ? ' (velocity)' : '');
      case 'brightness':
        return action.brightnessMode === 'velocity' ? 'Brightness by velocity' : 'Set brightness';
      case 'toggle':
        return 'Toggle on/off';
      case 'effect':
        return `Effect: ${action.effect || 'none'}`;
      case 'gradient':
        return 'Set gradient';
      default:
        return action.type;
    }
  };

  const filteredMappings = selectedPreset === null
    ? mappings
    : mappings.filter((m) => m.preset === selectedPreset || m.preset === undefined);

  const pages = [
    { key: 'connections' as const, label: 'Connections' },
    { key: 'lights' as const, label: 'Lights' },
    { key: 'mappings' as const, label: 'Mappings' },
  ];

  const connectionTabs = [
    { key: 'midi' as const, label: 'MIDI' },
    { key: 'hue' as const, label: 'Hue Bridge' },
    { key: 'streaming' as const, label: 'Streaming' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-5 pt-20 pb-72">
      <Header />
      <PinnedStatus midiStatus={midiStatus} hueStatus={hueStatus} />

      {/* Toast notifications */}
      {error && (
        <div className="toast toast-error p-3 rounded-lg mb-4 text-[--color-error] text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="toast toast-success p-3 rounded-lg mb-4 text-[--color-success] text-sm">
          {success}
        </div>
      )}

      {/* Main navigation */}
      <nav className="mb-6">
        <div className="flex gap-1 p-1 bg-[--color-surface-2] rounded-lg w-fit">
          {pages.map((item) => (
            <button
              key={item.key}
              onClick={() => setActivePage(item.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activePage === item.key
                  ? 'bg-[--color-accent] text-[--color-surface-0] shadow-sm'
                  : 'text-[--color-text-muted] hover:text-[--color-text] hover:bg-[--color-surface-3]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Connections Page */}
      {activePage === 'connections' && (
        <>
          {/* Connection tabs */}
          <div className="mb-4">
            <div className="flex gap-1">
              {connectionTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveConnTab(tab.key)}
                  className={`px-3 py-1.5 rounded text-sm transition-all ${
                    activeConnTab === tab.key
                      ? 'bg-[--color-surface-3] text-[--color-text] border border-[--color-border-strong]'
                      : 'text-[--color-text-muted] hover:text-[--color-text]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* MIDI Tab */}
          {activeConnTab === 'midi' && (
            <Section title="MIDI Configuration" subtitle="Connect your MIDI controller or create a virtual port">
              {/* Current status */}
              <div className="mb-6 bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border] flex items-center justify-between">
                <div>
                  <div className="text-[--color-text] font-medium">
                    {midiStatus === 'Not Connected' ? 'No device connected' : midiStatus}
                  </div>
                  <div className="text-xs text-[--color-text-muted] mt-0.5">
                    {availableMidiPorts.length} device{availableMidiPorts.length !== 1 && 's'} available
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={refreshMidiPorts}>
                  Refresh
                </Button>
              </div>

              {/* MIDI Ports */}
              {availableMidiPorts.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm text-[--color-text-muted] mb-2">
                    Connect to MIDI Device
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedMidiPort}
                      onChange={(e) => setSelectedMidiPort(e.target.value)}
                      className="select flex-1"
                    >
                      <option value="">Select a device...</option>
                      {availableMidiPorts.map((port) => (
                        <option key={port} value={port}>{port}</option>
                      ))}
                    </select>
                    <Button onClick={() => selectedMidiPort && connectToMidiPort(selectedMidiPort)} disabled={!selectedMidiPort}>
                      Connect
                    </Button>
                  </div>
                </div>
              )}

              {availableMidiPorts.length === 0 && (
                <div className="mb-6 bg-[--color-surface-2] p-4 rounded-lg text-[--color-text-muted] text-sm border border-[--color-border]">
                  No MIDI devices detected. Connect your controller via USB and refresh.
                </div>
              )}

              {/* Virtual Port */}
              <div className="border-t border-[--color-border] pt-5 mt-5">
                <label className="block text-sm text-[--color-text-muted] mb-2">
                  Or create a virtual port for DAW integration
                </label>
                <Button variant="secondary" onClick={openVirtualPort}>
                  Create Virtual Port
                </Button>
              </div>
            </Section>
          )}

          {/* Hue Tab */}
          {activeConnTab === 'hue' && (
            <Section title="Hue Bridge" subtitle="Connect to your Philips Hue bridge">
              {/* Current status */}
              <div className="mb-6 bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border] flex items-center justify-between">
                <div>
                  <div className="text-[--color-text] font-medium">{hueStatus}</div>
                  <div className="text-xs text-[--color-text-muted] mt-0.5">
                    {bridgeIp ? `Bridge IP: ${bridgeIp}` : 'No bridge configured'}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => refreshLights()}>
                  Refresh
                </Button>
              </div>

              <Button
                onClick={async () => {
                  try {
                    const data = await api.hue.discoverBridges();
                    const bridges = data.bridges || [];
                    if (bridges.length === 0) {
                      showErrorToast('No Hue Bridges found on network');
                      setDiscoveredBridges([]);
                    } else {
                      setDiscoveredBridges(bridges);
                      showSuccessToast(`Found ${bridges.length} bridge${bridges.length !== 1 ? 's' : ''}`);
                    }
                  } catch (err: any) {
                    showErrorToast('Failed to discover bridges: ' + err.message);
                  }
                }}
              >
                Discover Bridges
              </Button>

              {/* Discovered bridges */}
              {discoveredBridges.length > 0 && (
                <div className="mt-5 space-y-2 stagger-children">
                  <p className="text-sm text-[--color-text-muted]">Select a bridge to connect:</p>
                  {discoveredBridges.map((bridge) => (
                    <div
                      key={bridge.ipaddress}
                      className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border] flex justify-between items-center card-hover"
                    >
                      <div>
                        <div className="font-medium text-[--color-text] flex items-center gap-2">
                          {bridge.name || 'Philips Hue Bridge'}
                          {bridge.local && (
                            <span className="bg-[--color-success]/20 text-[--color-success] text-[10px] px-1.5 py-0.5 rounded font-medium">
                              Local
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[--color-text-muted] font-mono mt-0.5">
                          {bridge.ipaddress}
                        </div>
                      </div>
                      <Button
                        onClick={async () => {
                          try {
                            showSuccessToast('Press the link button on your Hue Bridge...');
                            const data = await api.hue.createUser(bridge.ipaddress);
                            showSuccessToast('Connected!');
                            await api.hue.connect(bridge.ipaddress, data.username);
                            setBridgeIp(bridge.ipaddress);
                            setBridgeUsername(data.username);
                            await refreshLights();
                            setDiscoveredBridges([]);
                          } catch (err: any) {
                            showErrorToast('Failed to connect: ' + err.message);
                          }
                        }}
                      >
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Streaming Tab */}
          {activeConnTab === 'streaming' && (
            <Section title="Entertainment Streaming" subtitle="Enable real-time 50Hz light control">
              <StreamingSettings onError={showErrorToast} onSuccess={showSuccessToast} />
            </Section>
          )}
        </>
      )}

      {/* Lights Page */}
      {activePage === 'lights' && (
        <Section title="Available Lights" subtitle={`${lights.length} light${lights.length !== 1 ? 's' : ''} discovered`}>
          <div className="mb-5">
            <Button variant="secondary" onClick={() => refreshLights()}>
              Refresh Lights
            </Button>
          </div>

          {lights.length === 0 ? (
            <div className="text-[--color-text-muted] text-center py-12">
              <div className="text-4xl mb-3 opacity-50">💡</div>
              <p>No lights found. Connect to your Hue Bridge first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 stagger-children">
              {lights.map((light) => (
                <div
                  key={light.id}
                  className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border] card-hover"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-[--color-accent] font-medium">{light.name}</h3>
                      <p className="text-xs text-[--color-text-muted] mt-0.5">{light.type}</p>
                    </div>
                    <span className="text-[10px] font-mono text-[--color-text-subtle] bg-[--color-surface-3] px-1.5 py-0.5 rounded">
                      {light.id}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => testLight(light.id, true)}>
                      On
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => testLight(light.id, false)}>
                      Off
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Mappings Page */}
      {activePage === 'mappings' && (
        <>
          <Section title="MIDI Mappings" subtitle="Map MIDI notes and CC messages to light actions">
            {/* MIDI Learn Panel */}
            <MidiLearnPanel
              onCreateMapping={handleCreateFromLearn}
              hasMappingForCurrentContext={hasMappingForCurrentContext}
            />

            {/* Preset filter */}
            <div className="mb-5 p-4 bg-[--color-surface-2] rounded-lg border border-[--color-border]">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[--color-text-muted]">Preset:</label>
                  <select
                    value={selectedPreset ?? 'all'}
                    onChange={(e) => setSelectedPreset(e.target.value === 'all' ? null : Number(e.target.value))}
                    className="select w-auto min-w-[140px]"
                  >
                    <option value="all">All Presets</option>
                    {encounteredPresets.map((pc) => (
                      <option key={pc} value={pc}>
                        {presetNames[pc] || `Preset ${pc + 1}`} (PC {pc})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-[--color-text-muted] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFollowPreset}
                    onChange={(e) => setAutoFollowPreset(e.target.checked)}
                    className="w-4 h-4 rounded bg-[--color-surface-3] border-[--color-border]"
                  />
                  Auto-follow
                </label>

                {currentPreset !== null && (
                  <span className="text-sm text-[--color-accent]">
                    Current: {presetNames[currentPreset] || `Preset ${currentPreset + 1}`}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-5">
              <Button onClick={() => {
                setNewMappingTemplate(undefined);
                setShowMappingModal(true);
              }}>Add Mapping</Button>
              <Button variant="danger" onClick={clearMappings}>Clear All</Button>
            </div>

            {/* Mappings grouped by preset */}
            {(() => {
              // Group mappings by preset
              const groupedMappings = new Map<number | 'global', MidiMapping[]>();

              filteredMappings.forEach(mapping => {
                const key = mapping.preset ?? 'global';
                if (!groupedMappings.has(key)) {
                  groupedMappings.set(key, []);
                }
                groupedMappings.get(key)!.push(mapping);
              });

              // Sort: global first, then by preset number
              const sortedKeys = Array.from(groupedMappings.keys()).sort((a, b) => {
                if (a === 'global') return -1;
                if (b === 'global') return 1;
                return (a as number) - (b as number);
              });

              if (sortedKeys.length === 0) {
                return (
                  <div className="text-[--color-text-muted] text-center py-12">
                    <div className="text-4xl mb-3 opacity-50">{'\uD83C\uDFB9'}</div>
                    <p>No mappings configured{selectedPreset !== null ? ' for this preset' : ''}</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {sortedKeys.map(presetKey => {
                    const presetMappings = groupedMappings.get(presetKey)!;
                    const isGlobal = presetKey === 'global';
                    const presetNum = isGlobal ? -1 : presetKey as number;

                    return (
                      <PresetGroup
                        key={presetKey}
                        preset={presetKey}
                        name={isGlobal ? undefined : presetNames[presetNum]}
                        mappings={presetMappings}
                        lights={lights}
                        scenes={scenes}
                        isCollapsed={isGlobal ? false : collapsedPresets.includes(presetNum)}
                        isActive={!isGlobal && currentPreset === presetNum}
                        activeMappings={activeMappings}
                        onToggleCollapse={() => !isGlobal && togglePresetCollapsed(presetNum)}
                        onRename={(name) => !isGlobal && setPresetName(presetNum, name)}
                        onEditMapping={handleEditMapping}
                        onRemoveMapping={removeMapping}
                        getMappingDescription={getMappingDescription}
                        hsvToHex={hsvToHex}
                      />
                    );
                  })}
                </div>
              );
            })()}
          </Section>

          <div className="mt-6">
            <SceneManager scenes={scenes} lights={lights} onRefresh={refreshScenes} />
          </div>
        </>
      )}

      {/* Activity Monitor */}
      <DockedActivityMonitor activityLog={activityLog} />

      {/* Mapping Modal */}
      {showMappingModal && (
        <div
          className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => {
            setShowMappingModal(false);
            setEditingMapping(undefined);
            setNewMappingTemplate(undefined);
          }}
        >
          <div
            className="bg-[--color-surface-1] p-6 rounded-xl max-w-[700px] w-full max-h-[90vh] overflow-y-auto border border-[--color-border] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-semibold text-[--color-text]">
                {editingMapping ? 'Edit Mapping' : 'Add Mapping'}
              </h2>
              <button
                className="text-[--color-text-muted] hover:text-[--color-text] text-2xl leading-none"
                onClick={() => {
                  setShowMappingModal(false);
                  setEditingMapping(undefined);
                  setNewMappingTemplate(undefined);
                }}
              >
                ×
              </button>
            </div>

            {lights.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[--color-text-muted] mb-4">
                  Connect to your Hue Bridge first to add mappings.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowMappingModal(false);
                    setEditingMapping(undefined);
                    setNewMappingTemplate(undefined);
                  }}
                >
                  Close
                </Button>
              </div>
            ) : (
              <MappingForm
                lights={lights}
                scenes={scenes}
                onSubmit={handleAddMapping}
                onClose={() => {
                  setShowMappingModal(false);
                  setEditingMapping(undefined);
                  setNewMappingTemplate(undefined);
                }}
                onScenesRefresh={refreshScenes}
                existingMapping={editingMapping}
                presetContext={selectedPreset}
                template={newMappingTemplate}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
