import { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import type { MidiMapping, HueLight, Scene } from '../types';

interface PresetGroupProps {
  preset: number | 'global';
  name?: string;
  mappings: MidiMapping[];
  lights: HueLight[];
  scenes: Scene[];
  isCollapsed: boolean;
  isActive: boolean;
  activeMappings: Set<string>;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onEditMapping: (mapping: MidiMapping) => void;
  onRemoveMapping: (mapping: MidiMapping) => void;
  getMappingDescription: (action: any) => string;
  hsvToHex: (hue: number, sat: number) => string;
}

export function PresetGroup({
  preset,
  name,
  mappings,
  lights,
  scenes,
  isCollapsed,
  isActive,
  activeMappings,
  onToggleCollapse,
  onRename,
  onEditMapping,
  onRemoveMapping,
  getMappingDescription,
  hsvToHex,
}: PresetGroupProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveName = () => {
    onRename(editName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditName(name || '');
      setIsEditing(false);
    }
  };

  const getMappingKey = (mapping: MidiMapping) => {
    if (mapping.triggerType === 'cc') {
      return `cc:${mapping.midiChannel}:${mapping.ccNumber}:${mapping.ccValue}`;
    }
    return `${mapping.midiChannel}:${mapping.midiNote}`;
  };

  const displayName = preset === 'global'
    ? 'Global Mappings'
    : name || `Preset ${(preset as number) + 1}`;

  const pcLabel = preset === 'global'
    ? 'Any preset'
    : `PC ${preset}`;

  return (
    <div className={`rounded-lg border overflow-hidden transition-all ${
      isActive
        ? 'border-[--color-accent] bg-[--color-accent]/5'
        : 'border-[--color-border] bg-[--color-surface-2]'
    }`}>
      {/* Header */}
      <div
        className="group flex items-center gap-3 p-3 cursor-pointer hover:bg-[--color-surface-3]/50 transition-colors"
        onClick={onToggleCollapse}
      >
        {/* Collapse indicator */}
        <span className={`text-[--color-text-muted] transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
          {'\u25B6'}
        </span>

        {/* Name / Edit */}
        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          {isEditing && preset !== 'global' ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleKeyDown}
              className="input py-1 px-2 text-sm w-full max-w-[200px]"
              placeholder={`Preset ${(preset as number) + 1}`}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className={`font-medium truncate ${isActive ? 'text-[--color-accent]' : 'text-[--color-text]'}`}>
                {displayName}
              </span>
              {preset !== 'global' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  className="text-[--color-text-subtle] hover:text-[--color-text] text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Rename preset"
                >
                  {'\u270E'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[--color-text-subtle] font-mono bg-[--color-surface-3] px-1.5 py-0.5 rounded">
            {pcLabel}
          </span>
          <span className="text-xs text-[--color-text-muted]">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
          </span>
          {isActive && (
            <span className="status-dot status-dot-connected animate-pulse-glow" />
          )}
        </div>
      </div>

      {/* Mappings list */}
      {!isCollapsed && (
        <div className="border-t border-[--color-border]">
          {mappings.length === 0 ? (
            <div className="text-[--color-text-muted] text-sm text-center py-6">
              No mappings in this preset
            </div>
          ) : (
            <div className="divide-y divide-[--color-border]">
              {mappings.map((mapping, i) => {
                const light = lights.find((l) => l.id === mapping.lightId);
                const scene = scenes.find((s) => s.id === mapping.sceneId);
                const lightName = scene
                  ? `Scene: ${scene.name}`
                  : light
                  ? light.name
                  : mapping.lightId
                  ? `Light ${mapping.lightId}`
                  : 'Unassigned';
                const mappingKey = getMappingKey(mapping);
                const isActiveMIDI = activeMappings.has(mappingKey);
                const isScene = Boolean(scene);

                let colorSwatch = null;
                if (mapping.action.type === 'color' && mapping.action.colorHue !== undefined && mapping.action.colorSat !== undefined) {
                  const hexColor = hsvToHex(mapping.action.colorHue, mapping.action.colorSat);
                  colorSwatch = (
                    <div
                      className="w-8 h-8 rounded-lg border-2 border-white/10 flex-shrink-0"
                      style={{ backgroundColor: hexColor }}
                    />
                  );
                }

                return (
                  <div
                    key={i}
                    className={`p-3 pl-10 flex gap-3 items-center transition-colors ${
                      isActiveMIDI ? 'bg-[--color-accent]/10' : 'hover:bg-[--color-surface-3]/30'
                    }`}
                  >
                    {/* Icon/swatch */}
                    <div className="flex items-center justify-center w-8 h-8">
                      {isScene ? (
                        <div className="w-8 h-8 rounded-lg bg-[--color-surface-3] flex items-center justify-center text-sm">
                          {'\uD83C\uDFAC'}
                        </div>
                      ) : colorSwatch ?? (
                        <div className="w-8 h-8 rounded-lg bg-[--color-surface-3] flex items-center justify-center text-sm">
                          {mapping.action.type === 'brightness' && '\uD83D\uDCA1'}
                          {mapping.action.type === 'toggle' && '\u26A1'}
                          {mapping.action.type === 'effect' && '\u2728'}
                          {mapping.action.type === 'gradient' && '\uD83C\uDF08'}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {mapping.name && (
                        <div className="text-[--color-accent] font-medium text-sm mb-0.5 truncate">
                          {mapping.name}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className={`inline-block text-white px-1.5 py-0.5 rounded text-xs font-mono ${
                            mapping.triggerType === 'cc'
                              ? 'bg-[--color-secondary-dim]'
                              : 'bg-[--color-accent-dim]'
                          }`}
                        >
                          {mapping.triggerType === 'cc'
                            ? `CC${mapping.ccNumber}${mapping.ccValue !== undefined ? `=${mapping.ccValue}` : ''}`
                            : `N${mapping.midiNote}`}
                        </span>
                        <span className="text-[--color-text-subtle]">{'\u2192'}</span>
                        <span className="text-[--color-text] truncate">{lightName}</span>
                      </div>
                      <div className="text-xs text-[--color-text-muted] mt-0.5">
                        {isScene ? 'Trigger scene' : getMappingDescription(mapping.action)}
                        {mapping.action.animationPreset && mapping.action.animationPreset !== 'none' && (
                          <span className="ml-2 text-[--color-secondary]">
                            {'\u2022'} {mapping.action.animationPreset}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active indicator */}
                    {isActiveMIDI && (
                      <div className="status-dot status-dot-connected animate-pulse-glow" />
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => onEditMapping(mapping)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => onRemoveMapping(mapping)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
