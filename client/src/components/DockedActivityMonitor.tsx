import { useEffect, useMemo, useState } from 'react';

interface DockedActivityMonitorProps {
  activityLog: Array<{ type: string; message: string; timestamp: number }>;
}

export function DockedActivityMonitor({ activityLog }: DockedActivityMonitorProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('activityMonitorCollapsed');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('activityMonitorCollapsed', JSON.stringify(collapsed));
    } catch {}
  }, [collapsed]);

  const toggle = () => setCollapsed((c) => !c);

  const headerSummary = useMemo(() => {
    if (!activityLog.length) return 'No activity';
    const latest = activityLog[0];
    return latest.message;
  }, [activityLog]);

  const activityCount = activityLog.length;

  return (
    <div className="fixed left-0 right-0 bottom-0 z-50">
      <div className="max-w-4xl mx-auto px-5">
        <div className="bg-[--color-surface-1]/98 backdrop-blur-md border border-b-0 border-[--color-border] rounded-t-xl shadow-2xl overflow-hidden">
          {/* Header / Toggle */}
          <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left select-none hover:bg-[--color-surface-2]/50 transition-colors"
            aria-expanded={!collapsed}
            aria-controls="activity-monitor-panel"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[--color-accent] font-medium text-sm">Activity</span>
                {activityCount > 0 && (
                  <span className="text-[10px] font-mono text-[--color-text-subtle] bg-[--color-surface-3] px-1.5 py-0.5 rounded">
                    {activityCount}
                  </span>
                )}
              </div>
              <span className="text-xs text-[--color-text-muted] truncate">
                {headerSummary}
              </span>
            </div>
            <span className="text-[--color-text-subtle] text-xs transition-transform duration-200" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}>
              ▼
            </span>
          </button>

          {/* Collapsible content */}
          <div
            id="activity-monitor-panel"
            className={`transition-[max-height,opacity] duration-300 ease-in-out ${
              collapsed ? 'max-h-0 opacity-0' : 'max-h-[50vh] opacity-100'
            } overflow-hidden`}
          >
            <div className="p-3 border-t border-[--color-border-subtle]">
              <div className="bg-[--color-surface-2] rounded-lg h-[200px] md:h-[240px] overflow-y-auto font-mono text-xs border border-[--color-border]">
                {activityLog.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[--color-text-subtle]">
                    Waiting for activity...
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {activityLog.map((entry, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded border-l-2 ${
                          entry.type === 'midi'
                            ? 'border-[--color-accent] bg-[--color-accent]/5'
                            : 'border-[--color-secondary] bg-[--color-secondary]/5'
                        }`}
                      >
                        <span className="text-[--color-text]">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
