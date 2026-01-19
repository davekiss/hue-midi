import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Button } from './Button';

interface StreamingSettingsProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function StreamingSettings({ onError, onSuccess }: StreamingSettingsProps) {
  const { streamingStatus, entertainmentConfigs, setStreamingStatus, setEntertainmentConfigs } = useStore();
  const [loading, setLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualClientKey, setManualClientKey] = useState('');

  useEffect(() => {
    refreshStatus();
    refreshConfigurations();
  }, []);

  const refreshStatus = async () => {
    try {
      const status = await api.entertainment.getStatus();
      setStreamingStatus(status);
    } catch (err: any) {
      console.error('Failed to get streaming status:', err);
    }
  };

  const refreshConfigurations = async () => {
    try {
      const data = await api.entertainment.getConfigurations();
      setEntertainmentConfigs(data.configurations || []);
    } catch (err: any) {
      console.error('Failed to get entertainment configurations:', err);
    }
  };

  const handleGenerateClientKey = async () => {
    setGeneratingKey(true);
    try {
      onSuccess('Generating client key... Press the bridge button!');
      await api.entertainment.generateClientKey();
      onSuccess(`Client key generated!`);
      await refreshStatus();
    } catch (err: any) {
      console.error('Client key generation error:', err);
      onError('Failed to generate client key: ' + err.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleSaveManualClientKey = async () => {
    if (!manualClientKey.trim()) {
      onError('Please enter a client key');
      return;
    }
    setLoading(true);
    try {
      await api.config.update({
        streaming: {
          enabled: false,
          clientKey: manualClientKey.trim(),
        },
      });
      onSuccess('Client key saved!');
      setManualClientKey('');
      setShowManualEntry(false);
      await refreshStatus();
    } catch (err: any) {
      onError('Failed to save client key: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStreaming = async (configId: string) => {
    setLoading(true);
    try {
      await api.entertainment.start(configId);
      onSuccess('Streaming started!');
      await refreshStatus();
    } catch (err: any) {
      onError('Failed to start streaming: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopStreaming = async () => {
    setLoading(true);
    try {
      await api.entertainment.stop();
      onSuccess('Streaming stopped');
      await refreshStatus();
    } catch (err: any) {
      onError('Failed to stop streaming: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isStreaming = streamingStatus?.streaming ?? false;
  const hasClientKey = streamingStatus?.hasClientKey ?? false;

  return (
    <div className="space-y-5">
      {/* Status Overview */}
      <div className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[--color-text] font-medium">
              {isStreaming ? 'Streaming Active' : 'Streaming Inactive'}
            </div>
            <div className="text-xs text-[--color-text-muted] mt-0.5">
              {hasClientKey ? 'Client key configured' : 'Client key required'}
              {streamingStatus?.entertainmentConfigId && isStreaming && (
                <span className="ml-2">
                  • Zone: {entertainmentConfigs.find(c => c.id === streamingStatus.entertainmentConfigId)?.metadata?.name || 'Unknown'}
                </span>
              )}
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full transition-all ${isStreaming ? 'bg-[--color-success] shadow-[0_0_12px_var(--color-success)]' : 'bg-[--color-text-subtle]'}`} />
        </div>
        {isStreaming && streamingStatus?.stats && (
          <div className="mt-3 pt-3 border-t border-[--color-border-subtle] grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-mono text-[--color-accent]">{streamingStatus.stats.fps}</div>
              <div className="text-[10px] text-[--color-text-subtle] uppercase tracking-wider">Hz</div>
            </div>
            <div>
              <div className="text-lg font-mono text-[--color-text]">{streamingStatus.channels?.length || 0}</div>
              <div className="text-[10px] text-[--color-text-subtle] uppercase tracking-wider">Channels</div>
            </div>
            <div>
              <div className="text-lg font-mono text-[--color-text]">{streamingStatus.stats.frameCount}</div>
              <div className="text-[10px] text-[--color-text-subtle] uppercase tracking-wider">Frames</div>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-[--color-surface-0] p-4 rounded-lg border border-[--color-border-subtle] text-sm">
        <p className="text-[--color-text-muted] mb-3">
          <strong className="text-[--color-text]">Entertainment API</strong> enables real-time 50Hz light control
          for smooth animations without overwhelming your bridge.
        </p>
        <div className="space-y-1.5 text-xs text-[--color-text-subtle]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[--color-accent]" />
            Create an Entertainment Zone in the Hue app
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[--color-accent]" />
            Generate a client key (requires bridge button press)
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[--color-accent]" />
            Start streaming for low-latency control
          </div>
        </div>
      </div>

      {/* Step 1: Generate Client Key */}
      {!hasClientKey && (
        <div className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border]">
          <h3 className="text-[--color-accent] font-medium mb-3">Generate Client Key</h3>
          <ol className="text-sm text-[--color-text-muted] mb-4 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-[--color-accent] font-mono text-xs mt-0.5">1.</span>
              Press the link button on your Hue bridge
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[--color-accent] font-mono text-xs mt-0.5">2.</span>
              Click generate within 30 seconds
            </li>
          </ol>
          <div className="flex gap-3 flex-wrap items-center">
            <Button onClick={handleGenerateClientKey} disabled={generatingKey}>
              {generatingKey ? 'Generating...' : 'Generate Client Key'}
            </Button>
            <button
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="text-sm text-[--color-text-muted] hover:text-[--color-text] underline underline-offset-2"
            >
              {showManualEntry ? 'Hide' : 'Enter existing key'}
            </button>
          </div>

          {showManualEntry && (
            <div className="mt-4 p-3 bg-[--color-surface-0] rounded-lg border border-[--color-border-subtle]">
              <label className="block text-xs text-[--color-text-muted] mb-2">Client key:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualClientKey}
                  onChange={(e) => setManualClientKey(e.target.value)}
                  placeholder="e.g., 03BF7477BF9BB3CF0DDA62A85C590BDF"
                  className="input input-mono flex-1"
                />
                <Button variant="secondary" onClick={handleSaveManualClientKey} disabled={loading}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Entertainment Zone */}
      {hasClientKey && (
        <div className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[--color-accent] font-medium">
              {isStreaming ? 'Streaming Controls' : 'Entertainment Zones'}
            </h3>
            <Button variant="ghost" size="sm" onClick={refreshConfigurations}>
              Refresh
            </Button>
          </div>

          {entertainmentConfigs.length === 0 ? (
            <div className="text-sm text-[--color-text-muted]">
              <p>No Entertainment Zones found.</p>
              <p className="text-xs mt-1">Create one in the Hue app: Settings → Entertainment Areas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entertainmentConfigs.map((config) => {
                const isActive = isStreaming && streamingStatus?.entertainmentConfigId === config.id;
                return (
                  <div
                    key={config.id}
                    className={`p-3 rounded-lg border flex items-center justify-between transition-all ${
                      isActive
                        ? 'bg-[--color-success]/10 border-[--color-success]/30'
                        : 'bg-[--color-surface-0] border-[--color-border-subtle] hover:border-[--color-border]'
                    }`}
                  >
                    <div>
                      <div className="text-[--color-text] font-medium text-sm">
                        {config.metadata?.name || 'Unnamed Zone'}
                      </div>
                      <div className="text-[10px] text-[--color-text-muted] mt-0.5 font-mono">
                        {config.channels?.length || 0} channels • {config.status}
                      </div>
                    </div>
                    {isActive ? (
                      <Button variant="danger" size="sm" onClick={handleStopStreaming} disabled={loading}>
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStartStreaming(config.id)}
                        disabled={loading || isStreaming}
                      >
                        Start
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Active Channels */}
      {isStreaming && streamingStatus?.channels && streamingStatus.channels.length > 0 && (
        <div className="bg-[--color-surface-2] p-4 rounded-lg border border-[--color-border]">
          <h3 className="text-[--color-accent] font-medium mb-3">Active Channels</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {streamingStatus.channels.map((channel) => (
              <div
                key={channel.channelId}
                className="bg-[--color-surface-0] p-2.5 rounded-lg border border-[--color-border-subtle]"
              >
                <div className="text-sm text-[--color-text] font-medium">Ch {channel.channelId}</div>
                <div className="text-[10px] text-[--color-text-subtle] font-mono truncate mt-0.5">
                  {channel.lightId.slice(0, 12)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regenerate Key */}
      {hasClientKey && !isStreaming && (
        <div className="text-center pt-2">
          <button
            onClick={handleGenerateClientKey}
            disabled={generatingKey}
            className="text-xs text-[--color-text-subtle] hover:text-[--color-text-muted] underline underline-offset-2"
          >
            {generatingKey ? 'Generating...' : 'Regenerate client key'}
          </button>
        </div>
      )}
    </div>
  );
}
