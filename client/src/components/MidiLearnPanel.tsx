import { useStore } from '../store';
import { Button } from './Button';

interface MidiLearnPanelProps {
  onCreateMapping: (preset: number, snapshot: number) => void;
  hasMappingForCurrentContext: boolean;
}

export function MidiLearnPanel({ onCreateMapping, hasMappingForCurrentContext }: MidiLearnPanelProps) {
  const currentPreset = useStore((state) => state.currentPreset);
  const currentSnapshot = useStore((state) => state.currentSnapshot);
  const presetNames = useStore((state) => state.presetNames);

  const presetName = currentPreset !== null
    ? presetNames[currentPreset] || `Preset ${currentPreset + 1}`
    : null;

  const snapshotName = currentSnapshot !== null
    ? `Snapshot ${currentSnapshot + 1}`
    : null;

  const hasContext = currentPreset !== null && currentSnapshot !== null;

  return (
    <div className="bg-[--color-surface-2] rounded-lg border border-[--color-border] p-4 mb-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm text-[--color-text-muted] mb-1">Detected from Helix</div>
          <div className="flex items-center gap-3">
            {/* Preset */}
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-1 rounded text-sm font-mono ${
                currentPreset !== null
                  ? 'bg-[--color-accent]/20 text-[--color-accent] border border-[--color-accent]/30'
                  : 'bg-[--color-surface-3] text-[--color-text-subtle]'
              }`}>
                {presetName || 'No preset'}
              </span>
              {currentPreset !== null && (
                <span className="text-xs text-[--color-text-subtle]">PC {currentPreset}</span>
              )}
            </div>

            <span className="text-[--color-text-subtle]">+</span>

            {/* Snapshot */}
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-1 rounded text-sm font-mono ${
                currentSnapshot !== null
                  ? 'bg-[--color-secondary]/20 text-[--color-secondary] border border-[--color-secondary]/30'
                  : 'bg-[--color-surface-3] text-[--color-text-subtle]'
              }`}>
                {snapshotName || 'No snapshot'}
              </span>
              {currentSnapshot !== null && (
                <span className="text-xs text-[--color-text-subtle]">CC69={currentSnapshot}</span>
              )}
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="flex-shrink-0">
          {hasContext ? (
            hasMappingForCurrentContext ? (
              <span className="text-sm text-[--color-success] flex items-center gap-1">
                <span className="status-dot status-dot-connected" />
                Mapping exists
              </span>
            ) : (
              <Button
                onClick={() => onCreateMapping(currentPreset!, currentSnapshot!)}
              >
                Create Mapping
              </Button>
            )
          ) : (
            <span className="text-sm text-[--color-text-subtle]">
              Switch preset/snapshot on Helix
            </span>
          )}
        </div>
      </div>

      {!hasContext && (
        <div className="mt-3 text-xs text-[--color-text-muted] bg-[--color-surface-3] rounded p-2">
          Switch to a preset and snapshot on your Helix to auto-detect. The detected PC and CC69 values will appear here.
        </div>
      )}
    </div>
  );
}
