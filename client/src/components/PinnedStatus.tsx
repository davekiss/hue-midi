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
    hueStatus === 'Not Connected' ? 'disconnected' : 'connected';

  const tempo = useStore((state) => state.tempo);
  const [tempoLabel, setTempoLabel] = useState<string>('120 BPM (fallback)');
  const [tempoState, setTempoState] = useState<'connected' | 'pending'>('pending');

  useEffect(() => {
    if (!tempo) {
      setTempoLabel('120 BPM (fallback)');
      setTempoState('pending');
      return;
    }

    const age = Date.now() - tempo.updatedAt;
    const stale = age > 5000 && tempo.source !== 'manual';
    setTempoState(stale ? 'pending' : 'connected');
    setTempoLabel(`${tempo.bpm.toFixed(1)} BPM${tempo.source === 'midi' ? '' : ' (manual)'}`);
  }, [tempo]);

  return (
    <div className="fixed top-16 right-4 z-50 space-y-2 text-right">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-[#aaa]">MIDI</span>
        <StatusBadge status={midiState}>{midiStatus}</StatusBadge>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-[#aaa]">Hue</span>
        <StatusBadge status={hueState}>{hueStatus}</StatusBadge>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-[#aaa]">Tempo</span>
        <StatusBadge status={tempoState}>{tempoLabel}</StatusBadge>
      </div>
    </div>
  );
}
