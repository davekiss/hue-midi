import { useState } from 'react';
import { Button } from './Button';
import { SceneEditor } from './SceneEditor';
import { api } from '../api';
import type { ScenePayload } from '../api';
import type { Scene, HueLight } from '../types';

interface SceneManagerProps {
  scenes: Scene[];
  lights: HueLight[];
  onRefresh: () => Promise<void>;
}

type EditorMode = 'create' | 'edit';

export function SceneManager({ scenes, lights, onRefresh }: SceneManagerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [selectedScene, setSelectedScene] = useState<Scene | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSceneId, setLoadingSceneId] = useState<string | null>(null);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreate = () => {
    setSelectedScene(undefined);
    setEditorMode('create');
    setIsEditorOpen(true);
    setError(null);
  };

  const handleEdit = async (sceneId: string) => {
    try {
      setLoadingSceneId(sceneId);
      const response = await api.scenes.get(sceneId);
      setSelectedScene(response.scene);
      setEditorMode('edit');
      setIsEditorOpen(true);
      setError(null);
    } catch (err) {
      console.error('Failed to load scene:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scene');
    } finally {
      setLoadingSceneId(null);
    }
  };

  const handleDelete = async (sceneId: string) => {
    if (!confirm('Delete this scene?')) {
      return;
    }
    try {
      setDeletingSceneId(sceneId);
      await api.scenes.delete(sceneId);
      await onRefresh();
    } catch (err) {
      console.error('Failed to delete scene:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete scene');
    } finally {
      setDeletingSceneId(null);
    }
  };

  const handleSave = async (payload: ScenePayload) => {
    try {
      setIsSaving(true);
      if (editorMode === 'edit' && selectedScene) {
        await api.scenes.update(selectedScene.id, payload);
      } else {
        await api.scenes.create(payload);
      }
      await onRefresh();
      setIsEditorOpen(false);
      setSelectedScene(undefined);
    } catch (err) {
      console.error('Failed to save scene:', err);
      setError(err instanceof Error ? err.message : 'Failed to save scene');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-[#121212] border border-[#333] rounded p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#e0e0e0]">Scenes</h2>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button onClick={handleCreate}>Add Scene</Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-sm text-[#ef4444] bg-[#451a1a] border border-[#ef4444]/40 rounded p-2">
          {error}
        </div>
      )}

      {scenes.length === 0 ? (
        <p className="text-sm text-[#777]">No scenes defined yet.</p>
      ) : (
        <ul className="space-y-3">
          {scenes.map((scene) => {
            const isLoading = loadingSceneId === scene.id;
            const isDeleting = deletingSceneId === scene.id;
            return (
              <li key={scene.id} className="p-3 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[#e0e0e0] font-medium">{scene.name}</h3>
                    {scene.description && (
                      <p className="text-xs text-[#888] mt-1">{scene.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-[#555]">
                    {new Date(scene.updatedAt).toLocaleString()}
                  </span>
                </div>
                {scene.tags && scene.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scene.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded bg-[#333] text-[#aaa]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-[#666]">
                  {scene.lights.length} target{scene.lights.length === 1 ? '' : 's'}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => handleEdit(scene.id)} disabled={isLoading}>
                    {isLoading ? 'Loading…' : 'Edit'}
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(scene.id)} disabled={isDeleting}>
                    {isDeleting ? 'Removing…' : 'Delete'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isEditorOpen && (
        <SceneEditor
          mode={editorMode}
          lights={lights}
          initialScene={selectedScene}
          onCancel={() => {
            setIsEditorOpen(false);
            setSelectedScene(undefined);
          }}
          onSubmit={handleSave}
          isSaving={isSaving}
        />
      )}
    </section>
  );
}
