import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useWebSocket } from './useWebSocket';
import { api } from './api';
import { Header } from './components/Header';
import { Section } from './components/Section';
import { Button } from './components/Button';
import { StatusBadge } from './components/StatusBadge';
import { MappingForm } from './components/MappingForm';
import { SceneManager } from './components/SceneManager';
import { PinnedStatus } from './components/PinnedStatus';
import type { MidiMapping } from './types';
import { DockedActivityMonitor } from './components/DockedActivityMonitor';

type ConnectionMode = 'bluetooth' | 'bridge';

type BridgeContext = {
  ip?: string;
  username?: string;
  connectionMode?: ConnectionMode;
};

interface RefreshLightsOptions {
  silent?: boolean;
  suppressBridgeErrorToast?: boolean;
  bridgeContext?: BridgeContext;
}

function App() {
  useWebSocket();

  const { midiStatus, hueStatus, bluetoothStatus, lights, mappings, scenes, activityLog, currentPreset, selectedPreset, encounteredPresets, autoFollowPreset } = useStore();
  const { setMidiStatus, setHueStatus, setBluetoothStatus, setLights, setMappings, setScenes, setSelectedPreset, setAutoFollowPreset, addEncounteredPreset } = useStore();

  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<MidiMapping | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [discoveredBridges, setDiscoveredBridges] = useState<any[]>([]);
  const [activeMappings, setActiveMappings] = useState<Set<string>>(new Set());
  const [manualMacAddress, setManualMacAddress] = useState<string>('');
  const [manualLightName, setManualLightName] = useState<string>('');
  const [showAllDevices, setShowAllDevices] = useState<boolean>(false);
  const [scannedDevices, setScannedDevices] = useState<any[]>([]);
  const [activePage, setActivePage] = useState<'connections' | 'lights' | 'mappings'>('connections');
  const [activeConnTab, setActiveConnTab] = useState<'midi' | 'hue' | 'bluetooth'>('midi');
  const [bridgeIp, setBridgeIp] = useState<string | undefined>(undefined);
  const [bridgeUsername, setBridgeUsername] = useState<string | undefined>(undefined);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('bridge');
  const [availableMidiPorts, setAvailableMidiPorts] = useState<string[]>([]);
  const [selectedMidiPort, setSelectedMidiPort] = useState<string>('');

  useEffect(() => {
    // Load initial data
    refreshMappings();
    refreshBluetoothStatus();
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
      showSuccess('Connected to MIDI port: ' + data.port);
    } catch (err: any) {
      showError('Failed to connect to MIDI port: ' + err.message);
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
          const channel = message.data.channel;
          const note = message.data.note;
          const velocity = message.data.velocity;
          const key = `${channel}:${note}`;

          // Only show visual feedback for note-on events (velocity > 0)
          if (velocity > 0) {
            // Mark mapping as active
            setActiveMappings(prev => {
              const next = new Set(prev);
              next.add(key);
              return next;
            });

            // Remove after 200ms for quick pulse effect
            setTimeout(() => {
              setActiveMappings(prev => {
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
      setConnectionMode(config.connectionMode);

      const hasBridgeCredentials = Boolean(config.bridgeIp && config.bridgeUsername);
      if (config.connectionMode === 'bluetooth') {
        setHueStatus('Bridge Disabled');
      } else if (!hasBridgeCredentials) {
        setHueStatus('Bridge Not Configured');
      }

      await refreshLights({
        silent: true,
        suppressBridgeErrorToast: true,
        bridgeContext: {
          ip: config.bridgeIp,
          username: config.bridgeUsername,
          connectionMode: config.connectionMode,
        },
      });
    } catch (err) {
      console.error('Failed to load bridge connection:', err);
    }
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 5000);
  };

  const openVirtualPort = async () => {
    try {
      const data = await api.midi.setPort();
      setMidiStatus(data.port);
      showSuccess('Virtual MIDI port created: ' + data.port);
    } catch (err: any) {
      showError('Failed to create virtual port: ' + err.message);
    }
  };

  const refreshBluetoothStatus = async () => {
    try {
      const status = await api.bluetooth.getStatus();
      setBluetoothStatus(status);
    } catch (err: any) {
      console.error('Failed to check Bluetooth status:', err);
    }
  };

  const scanBluetoothLights = async () => {
    try {
      const message = showAllDevices
        ? 'Scanning for ALL Bluetooth devices... This may take 10 seconds.'
        : 'Scanning for Bluetooth lights... This may take 10 seconds.';
    showSuccess(message);

      const data = await api.bluetooth.scan(10000, showAllDevices);
      setScannedDevices(data.lights);

      if (data.lights.length === 0) {
        showError('No devices found.');
      } else {
        const deviceText = showAllDevices ? 'device(s)' : 'Bluetooth light(s)';
        showSuccess(`Found ${data.lights.length} ${deviceText}`);
      }
    } catch (err: any) {
      showError('Failed to scan: ' + err.message);
    }
  };

  const connectManualBluetooth = async () => {
    if (!manualMacAddress) {
      showError('Please enter a MAC address');
      return;
    }
    try {
      showSuccess('Connecting to light... This may take 15 seconds.');
      await api.bluetooth.connectManual(manualMacAddress, manualLightName || undefined);
      showSuccess(`Connected to light!`);
      setManualMacAddress('');
      setManualLightName('');
      await refreshLights();
    } catch (err: any) {
      showError('Failed to connect: ' + err.message);
    }
  };

  const connectToScannedDevice = async (deviceId: string, deviceName: string) => {
    try {
      showSuccess(`Connecting to ${deviceName}... This may take 15 seconds.`);
      await api.bluetooth.connectManual(deviceId, deviceName);
      showSuccess(`Connected to ${deviceName}!`);
      await refreshLights();
    } catch (err: any) {
      showError('Failed to connect: ' + err.message);
    }
  };

  const refreshLights = async (options?: RefreshLightsOptions) => {
    const { silent = false, suppressBridgeErrorToast = false, bridgeContext } = options ?? {};
    const context = bridgeContext ?? { ip: bridgeIp, username: bridgeUsername, connectionMode };
    const { ip, username, connectionMode: mode } = context;

    try {
      await refreshBluetoothStatus();
      const { lights: latestLights, bridgeConnected, bridgeError } = await api.hue.getLights();
      setLights(latestLights);

      let bridgeErrorShown = false;
      const effectiveMode: ConnectionMode = mode ?? connectionMode;
      const bridgeConfigured = Boolean(ip && username);

      if (bridgeConnected) {
        setHueStatus(ip ? `Connected: ${ip}` : 'Bridge Connected');
      } else if (effectiveMode === 'bridge' && bridgeConfigured) {
        setHueStatus('Bridge Not Connected');
        if (!silent && !suppressBridgeErrorToast) {
          const message = bridgeError
            ? `Hue bridge not connected: ${bridgeError}`
            : 'Hue bridge not connected. Please reconnect.';
          showError(message);
          bridgeErrorShown = true;
        }
      } else if (effectiveMode === 'bridge') {
        setHueStatus('Bridge Not Configured');
      } else {
        setHueStatus('Bridge Disabled');
      }

      if (!silent && !bridgeErrorShown) {
        showSuccess('Lights refreshed');
      }
    } catch (err: any) {
      console.error('Failed to refresh lights:', err);
      showError('Failed to refresh lights: ' + err.message);
    }
  };

  const testLight = async (lightId: string, on: boolean) => {
    try {
      await api.test.light(lightId, { on, brightness: 254, transitionTime: 2 });
    } catch (err: any) {
      showError('Failed to test light: ' + err.message);
    }
  };

  const refreshMappings = async () => {
    try {
      const data = await api.mappings.getAll();
      setMappings(data.mappings);
      // Extract presets from existing mappings
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
        await api.mappings.remove(mapping.midiChannel, mapping.ccNumber ?? 0, 'cc', mapping.ccValue);
      } else {
        await api.mappings.remove(mapping.midiChannel, mapping.midiNote);
      }
      refreshMappings();
      showSuccess('Mapping removed');
    } catch (err: any) {
      showError('Failed to remove mapping: ' + err.message);
    }
  };

  const clearMappings = async () => {
    if (!confirm('Are you sure?')) return;
    try {
      await api.mappings.clear();
      refreshMappings();
      showSuccess('All mappings cleared');
    } catch (err: any) {
      showError('Failed to clear mappings: ' + err.message);
    }
  };

  const handleAddMapping = async (mapping: MidiMapping) => {
    try {
      // If editing an existing mapping, remove the old one first
      if (editingMapping) {
        if (editingMapping.triggerType === 'cc') {
          await api.mappings.remove(editingMapping.midiChannel, editingMapping.ccNumber ?? 0, 'cc', editingMapping.ccValue);
        } else {
          await api.mappings.remove(editingMapping.midiChannel, editingMapping.midiNote);
        }
      }

      await api.mappings.add(mapping);
      refreshMappings();
      setShowMappingModal(false);
      setEditingMapping(undefined);
      showSuccess(editingMapping ? 'Mapping updated successfully!' : 'Mapping added successfully!');
    } catch (err: any) {
      showError('Failed to save mapping: ' + err.message);
    }
  };

  const handleEditMapping = (mapping: MidiMapping) => {
    setEditingMapping(mapping);
    setShowMappingModal(true);
  };

  const getBluetoothStatusBadge = () => {
    if (!bluetoothStatus) return <StatusBadge status="disconnected">Unknown</StatusBadge>;
    if (bluetoothStatus.ready) {
      if (bluetoothStatus.connected) {
        return <StatusBadge status="connected">Connected ({bluetoothStatus.connectedLights.length} lights)</StatusBadge>;
      }
      return <StatusBadge status="pending">Ready</StatusBadge>;
    }
    return <StatusBadge status="disconnected">Not Available</StatusBadge>;
  };

  // Convert HSV to Hex for color swatch
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

  // Generate description for mapping action
  const getMappingDescription = (action: any) => {
    switch (action.type) {
      case 'color':
        return 'Set color' + (action.brightnessMode === 'velocity' ? ' (velocity brightness)' : '');
      case 'brightness':
        return action.brightnessMode === 'velocity' ? 'Control brightness by velocity' : 'Set brightness';
      case 'toggle':
        return 'Toggle on/off';
      case 'effect':
        return `Effect: ${action.effect || 'none'}`;
      case 'gradient':
        return 'Set gradient colors';
      default:
        return action.type;
    }
  };

  // Get mapping key for tracking active state
  const getMappingKey = (channel: number, note: number) => `${channel}:${note}`;

  return (
    <div className="max-w-6xl mx-auto p-5 pt-16">
      <Header />

      {/* Pinned connection status (top-right) */}
      <PinnedStatus midiStatus={midiStatus} hueStatus={hueStatus} />

      {error && <div className="text-[#ef4444] p-2.5 bg-[rgba(239,68,68,0.1)] rounded mb-2.5">{error}</div>}
      {success && <div className="text-[#10b981] p-2.5 bg-[rgba(16,185,129,0.1)] rounded mb-2.5">{success}</div>}

      {/* Navigation */}
      <div className="mb-4">
        <div className="flex gap-2">
          {[
            { key: 'connections', label: 'Connections/Config' },
            { key: 'lights', label: 'Lights' },
            { key: 'mappings', label: 'Mappings' },
          ].map((item) => (
            <button
              key={item.key}
              className={`px-3 py-1.5 rounded border ${
                activePage === (item.key as any)
                  ? 'bg-[#667eea] text-white border-[#667eea]'
                  : 'bg-[#1a1a1a] text-[#ddd] border-[#333] hover:bg-[#222]'
              }`}
              onClick={() => setActivePage(item.key as any)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Connections subnav */}
      {activePage === 'connections' && (
        <div className="mb-4">
          <div className="flex gap-2">
            {[
              { key: 'midi', label: 'MIDI' },
              { key: 'hue', label: 'Hue' },
              { key: 'bluetooth', label: 'Bluetooth' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`px-3 py-1 rounded border text-sm ${
                  activeConnTab === (tab.key as any)
                    ? 'bg-[#2a2a2a] text-white border-[#444]'
                    : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#1f1f1f]'
                }`}
                onClick={() => setActiveConnTab(tab.key as any)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pages */}
      {activePage === 'connections' && (
        <>
          {activeConnTab === 'midi' && (
            <Section title="MIDI Configuration">
              {/* Current connection status */}
              <div className="mb-4 bg-[#2a2a2a] p-3 rounded border border-[#444] flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">
                    {midiStatus === 'Not Connected' ? 'No MIDI device connected' : midiStatus}
                  </div>
                  <div className="text-xs text-[#aaa]">
                    {availableMidiPorts.length} device(s) available
                  </div>
                </div>
                <Button onClick={refreshMidiPorts}>Refresh</Button>
              </div>

              {/* Physical MIDI Ports */}
              {availableMidiPorts.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm text-[#aaa] mb-2">Connect to MIDI Device</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedMidiPort}
                      onChange={(e) => setSelectedMidiPort(e.target.value)}
                      className="flex-1 bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
                    >
                      <option value="">Select a MIDI device...</option>
                      {availableMidiPorts.map((port) => (
                        <option key={port} value={port}>{port}</option>
                      ))}
                    </select>
                    <Button
                      onClick={() => selectedMidiPort && connectToMidiPort(selectedMidiPort)}
                      disabled={!selectedMidiPort}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              )}

              {availableMidiPorts.length === 0 && (
                <div className="mb-4 bg-[#333] p-4 rounded text-[#aaa] text-sm">
                  No MIDI devices detected. Make sure your Helix or other MIDI device is connected via USB.
                </div>
              )}

              {/* Virtual Port Option */}
              <div className="border-t border-[#444] pt-4 mt-4">
                <label className="block text-sm text-[#aaa] mb-2">Or create a virtual port (for Ableton/DAW)</label>
                <Button onClick={openVirtualPort}>Create Virtual MIDI Port</Button>
              </div>
            </Section>
          )}

          {activeConnTab === 'hue' && (
            <Section title="Hue Bridge Setup">
              {/* Show current connection if available */}
              <div className="mb-4 bg-[#2a2a2a] p-3 rounded border border-[#444] flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{hueStatus}</div>
                  <div className="text-xs text-[#aaa]">
                    {bridgeIp ? `Bridge IP: ${bridgeIp}` : 'No bridge configured yet'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => refreshLights()}>Refresh Lights</Button>
                </div>
              </div>

              <Button onClick={async () => {
                try {
                  const data = await api.hue.discoverBridges();
                  const bridges = data.bridges || [];
                  if (bridges.length === 0) {
                    showError('No Hue Bridges found on network');
                    setDiscoveredBridges([]);
                  } else {
                    setDiscoveredBridges(bridges);
                    showSuccess(`Found ${bridges.length} bridge(s)`);
                  }
                } catch (err: any) {
                  showError('Failed to discover bridges: ' + err.message);
                }
              }}>Discover Bridges</Button>

              {discoveredBridges.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-[#aaa]">Select a bridge to connect:</p>
                  {discoveredBridges.map((bridge) => (
                    <div key={bridge.ipaddress} className="bg-[#2a2a2a] p-3 rounded border border-[#444] flex justify-between items-center">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {bridge.name || 'Philips Hue Bridge'}
                          {bridge.local && (
                            <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">Local</span>
                          )}
                        </div>
                        <div className="text-sm text-[#aaa]">{bridge.ipaddress}</div>
                      </div>
                      <Button onClick={async () => {
                        try {
                          showSuccess('Press the button on your Hue Bridge now...');
                          const data = await api.hue.createUser(bridge.ipaddress);
                          showSuccess(`Connected! Username: ${data.username}`);
                          await api.hue.connect(bridge.ipaddress, data.username);
                          setBridgeIp(bridge.ipaddress);
                          setBridgeUsername(data.username);
                          setConnectionMode('bridge');
                          await refreshLights({
                            bridgeContext: {
                              ip: bridge.ipaddress,
                              username: data.username,
                              connectionMode: 'bridge',
                            },
                          });
                          setDiscoveredBridges([]);
                        } catch (err: any) {
                          showError('Failed to connect: ' + err.message);
                        }
                      }}>Connect</Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {activeConnTab === 'bluetooth' && (
            <Section title="Bluetooth Setup">
              <div className="mb-4"><strong>Bluetooth:</strong> {getBluetoothStatusBadge()}</div>

              <div className="mb-4">
                <h3 className="text-[#667eea] mb-2">Auto Scan</h3>
                <div className="mb-3">
                  <label className="flex items-center gap-2 text-sm text-[#aaa] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAllDevices}
                      onChange={(e) => setShowAllDevices(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span>Show ALL Bluetooth devices (for troubleshooting)</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={scanBluetoothLights}>
                    {showAllDevices ? 'Scan All Devices' : 'Scan for Hue Lights'}
                  </Button>
                  <Button onClick={refreshBluetoothStatus}>Refresh Status</Button>
                </div>

                {/* Display scanned devices */}
                {scannedDevices.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-white font-medium">Scanned Devices:</h4>
                    {scannedDevices.map((device) => (
                      <div key={device.id} className="bg-[#2a2a2a] p-3 rounded border border-[#444] flex justify-between items-center">
                        <div>
                          <div className="text-white font-medium">{device.name}</div>
                          <div className="text-xs text-[#aaa]">ID: {device.id}</div>
                        </div>
                        <Button onClick={() => connectToScannedDevice(device.id, device.name)}>
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#2a2a2a] p-4 rounded border border-[#444]">
                <h3 className="text-[#667eea] mb-2">Manual Connection</h3>
                <p className="text-sm text-[#aaa] mb-3">
                  Can't find your light? Connect by MAC address directly.
                  <br />
                  Tip: Use a BLE scanner app (LightBlue on iOS, nRF Connect on Android) to find your light's MAC address.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="MAC Address (e.g., AA:BB:CC:DD:EE:FF)"
                    value={manualMacAddress}
                    onChange={(e) => setManualMacAddress(e.target.value)}
                    className="w-full p-2 bg-[#1a1a1a] border border-[#444] rounded text-white"
                  />
                  <input
                    type="text"
                    placeholder="Light Name (optional)"
                    value={manualLightName}
                    onChange={(e) => setManualLightName(e.target.value)}
                    className="w-full p-2 bg-[#1a1a1a] border border-[#444] rounded text-white"
                  />
                  <Button onClick={connectManualBluetooth}>Connect by MAC Address</Button>
                </div>
              </div>
            </Section>
          )}
        </>
      )}

      {activePage === 'lights' && (
        <Section title="Available Lights">
          <Button onClick={() => refreshLights()}>Refresh Lights</Button>
          {lights.length === 0 ? (
            <p className="mt-4">No lights found.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5 mt-4">
              {lights.map((light) => (
                <div key={light.id} className="bg-[#2a2a2a] p-4 rounded border border-[#444]">
                  <h3 className="mb-2.5 text-[#667eea]">{light.name}</h3>
                  <p>Type: {light.type}</p>
                  <p>ID: {light.id}</p>
                  <div className="mt-2.5">
                    <Button onClick={() => testLight(light.id, true)}>Turn On</Button>
                    <Button onClick={() => testLight(light.id, false)}>Turn Off</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {activePage === 'mappings' && (
        <>
        <Section title="MIDI Mappings">
          {/* Preset Context Selector */}
          <div className="mb-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#aaa]">Preset:</label>
                <select
                  value={selectedPreset ?? 'all'}
                  onChange={(e) => setSelectedPreset(e.target.value === 'all' ? null : Number(e.target.value))}
                  className="bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] px-3 py-1.5 rounded text-sm"
                >
                  <option value="all">All Presets</option>
                  {encounteredPresets.map((pc) => (
                    <option key={pc} value={pc}>
                      Preset {pc + 1} (PC {pc})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoFollow"
                  checked={autoFollowPreset}
                  onChange={(e) => setAutoFollowPreset(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="autoFollow" className="text-sm text-[#aaa]">
                  Auto-follow Helix
                </label>
              </div>
              {currentPreset !== null && (
                <div className="text-sm text-[#667eea]">
                  Current: Preset {currentPreset + 1}
                </div>
              )}
            </div>
            {selectedPreset !== null && (
              <p className="text-xs text-[#777] mt-2">
                Showing mappings for Preset {selectedPreset + 1}. New mappings will be assigned to this preset.
              </p>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <Button onClick={() => setShowMappingModal(true)}>Add New Mapping</Button>
            <Button variant="danger" onClick={clearMappings}>Clear All Mappings</Button>
          </div>
          {(() => {
            // Filter mappings by selected preset
            const filteredMappings = selectedPreset === null
              ? mappings
              : mappings.filter((m) => m.preset === selectedPreset || m.preset === undefined);
            return filteredMappings.length === 0 ? (
            <p className="mt-4">No mappings configured{selectedPreset !== null ? ' for this preset' : ''}.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {filteredMappings.map((mapping, i) => {
              const light = lights.find((l) => l.id === mapping.lightId);
              const scene = scenes.find((s) => s.id === mapping.sceneId);
              const lightName = scene
                ? `Scene: ${scene.name}`
                : light
                ? light.name
                : mapping.lightId
                ? `Light ${mapping.lightId}`
                : 'Unassigned';
              const mappingKey = getMappingKey(mapping.midiChannel, mapping.midiNote);
              const isActive = activeMappings.has(mappingKey);
              const isScene = Boolean(scene);

              // Get color swatch if this is a color action
              let colorSwatch = null;
              if (mapping.action.type === 'color' && mapping.action.colorHue !== undefined && mapping.action.colorSat !== undefined) {
                const hexColor = hsvToHex(mapping.action.colorHue, mapping.action.colorSat);
                colorSwatch = (
                  <div
                    className="w-8 h-8 rounded border-2 border-white/20 shadow-lg flex-shrink-0"
                    style={{ backgroundColor: hexColor }}
                    title={hexColor}
                  />
                );
              }

              return (
                <div
                  key={i}
                  className={`bg-[#2a2a2a] p-4 rounded mb-2.5 border-2 transition-all duration-200 flex gap-4 items-center ${
                    isActive
                      ? 'border-[#667eea] shadow-[0_0_20px_rgba(102,126,234,0.5)] scale-[1.02]'
                      : 'border-[#444]'
                  }`}
                >
                  {/* Color swatch or icon */}
                  <div className="flex items-center justify-center w-8">
                    {isScene ? (
                      <div className="w-8 h-8 rounded bg-[#444] flex items-center justify-center text-xs">🎬</div>
                    ) : (
                      colorSwatch ?? (
                        <div className="w-8 h-8 rounded bg-[#444] flex items-center justify-center text-xs">
                          {mapping.action.type === 'brightness' && '💡'}
                          {mapping.action.type === 'toggle' && '⚡'}
                          {mapping.action.type === 'effect' && '✨'}
                          {mapping.action.type === 'gradient' && '🌈'}
                        </div>
                      )
                    )}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {mapping.name && (
                      <div className="text-[#667eea] font-medium mb-1 truncate">{mapping.name}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`inline-block text-white px-2.5 py-0.5 rounded text-xs font-mono ${
                        mapping.triggerType === 'cc' ? 'bg-[#764ba2]' : 'bg-[#667eea]'
                      }`}>
                        {mapping.triggerType === 'cc'
                          ? `Ch ${mapping.midiChannel} • CC${mapping.ccNumber}${mapping.ccValue !== undefined ? ` = ${mapping.ccValue}` : ''}`
                          : `Ch ${mapping.midiChannel} • Note ${mapping.midiNote}`}
                      </span>
                      <span className="text-[#aaa]">→</span>
                      <strong className="text-white">{lightName}</strong>
                    </div>
                    <div className="text-sm text-[#aaa] mt-1">
                      {isScene
                        ? `Trigger scene${scene?.name ? `: ${scene.name}` : ''}`
                        : getMappingDescription(mapping.action)}
                      {mapping.action.animationPreset && mapping.action.animationPreset !== 'none' && (
                        <span className="ml-2 text-[#10b981]">• {mapping.action.animationPreset} animation</span>
                      )}
                    </div>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <div className="flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-[#667eea] animate-pulse"></div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button onClick={() => handleEditMapping(mapping)}>Edit</Button>
                    <Button variant="danger" onClick={() => removeMapping(mapping)}>Remove</Button>
                  </div>
                </div>
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
      <DockedActivityMonitor activityLog={activityLog} />

      {showMappingModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-[rgba(0,0,0,0.8)] z-[1000] flex items-center justify-center" onClick={() => {
          setShowMappingModal(false);
          setEditingMapping(undefined);
        }}>
          <div className="bg-[#1a1a1a] p-8 rounded-lg max-w-[700px] w-[90%] max-h-[90vh] overflow-y-auto border border-[#333]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[#667eea] text-2xl">{editingMapping ? 'Edit MIDI Mapping' : 'Add MIDI Mapping'}</h2>
              <button className="bg-transparent text-[#aaa] text-2xl p-0 w-8 h-8 cursor-pointer hover:text-white" onClick={() => {
                setShowMappingModal(false);
                setEditingMapping(undefined);
              }}>×</button>
            </div>
            {lights.length === 0 ? (
              <div>
                <p className="mb-4">Please connect to Hue Bridge or Bluetooth lights first, then refresh lights.</p>
                <Button onClick={() => {
                  setShowMappingModal(false);
                  setEditingMapping(undefined);
                }}>Close</Button>
              </div>
            ) : (
              <MappingForm
                lights={lights}
                scenes={scenes}
                onSubmit={handleAddMapping}
                onClose={() => {
                  setShowMappingModal(false);
                  setEditingMapping(undefined);
                }}
                onScenesRefresh={refreshScenes}
                existingMapping={editingMapping}
                presetContext={selectedPreset}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
