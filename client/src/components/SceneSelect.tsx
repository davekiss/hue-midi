import { useMemo } from 'react';
import type { Scene } from '../types';

interface SceneSelectProps {
  scenes: Scene[];
  value?: string;
  onChange: (sceneId?: string) => void;
}

export function SceneSelect({ scenes, value, onChange }: SceneSelectProps) {
  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => a.name.localeCompare(b.name)),
    [scenes]
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm text-[#aaa]">Scene</label>
      <select
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next.length > 0 ? next : undefined);
        }}
        className="w-full bg-[#2a2a2a] border border-[#444] text-[#e0e0e0] p-2.5 rounded"
      >
        <option value="">(None)</option>
        {sortedScenes.map((scene) => (
          <option key={scene.id} value={scene.id}>
            {scene.name}
          </option>
        ))}
      </select>
    </div>
  );
}
