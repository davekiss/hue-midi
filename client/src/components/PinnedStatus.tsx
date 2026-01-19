import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { StatusBadge } from './StatusBadge';

interface PinnedStatusProps {
  midiStatus: string;
  hueStatus: string;
}

export function PinnedStatus({ midiStatus, hueStatus }: PinnedStatusProps) {
  const midiState: 'connected' | 'disconnected' | 'pending' =
    midiStatus === 'Not Connected' ? 'disconnected' : 'connected';

  const hueState: 'connected' | 'disconnected' | 'pending' =
    hueStatus.includes('Connected') ? 'connected' :
    hueStatus === 'Not Configured' ? 'disconnected' : 'pending';

  const tempo = useStore((state) => state.tempo);
  const streamingStatus = useStore((state) => state.streamingStatus);
  const [tempoLabel, setTempoLabel] = useState<string>('120 BPM');

  useEffect(() => {
    if (!tempo) {
      setTempoLabel('120 BPM');
      return;
    }
    setTempoLabel(`${tempo.bpm.toFixed(0)} BPM`);
  }, [tempo]);

  const isStreaming = streamingStatus?.streaming ?? false;

  return (
    <div className="fixed top-16 right-5 z-50 animate-fade-in">
      <div className="bg-[--color-surface-1]/95 backdrop-blur-md rounded-xl border border-[--color-border] p-3 shadow-lg">
        <div className="space-y-2">
          {/* MIDI Status */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[--color-text-subtle] uppercase tracking-wider">MIDI</span>
            <StatusBadge status={midiState}>
              {midiStatus === 'Not Connected' ? 'Disconnected' : 'Connected'}
            </StatusBadge>
          </div>

          {/* Hue Status */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[--color-text-subtle] uppercase tracking-wider">Hue</span>
            <StatusBadge status={hueState}>
              {hueState === 'connected' ? 'Connected' : hueState === 'pending' ? 'Connecting' : 'Offline'}
            </StatusBadge>
          </div>

          {/* Streaming Status */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[--color-text-subtle] uppercase tracking-wider">Stream</span>
            <StatusBadge status={isStreaming ? 'connected' : 'disconnected'}>
              {isStreaming ? `${streamingStatus?.stats?.fps || 0} Hz` : 'Inactive'}
            </StatusBadge>
          </div>

          {/* Tempo */}
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[--color-border-subtle]">
            <span className="text-xs text-[--color-text-subtle] uppercase tracking-wider">Tempo</span>
            <span className="text-sm font-mono text-[--color-accent]">{tempoLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
