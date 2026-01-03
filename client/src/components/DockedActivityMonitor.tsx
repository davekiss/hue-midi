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

  // Precompute a summary for the header
  const headerSummary = useMemo(() => {
    if (!activityLog.length) return 'No recent activity';
    const latest = activityLog[0];
    return latest.message;
  }, [activityLog]);

  return (
    <div className="fixed left-0 right-0 bottom-0 z-50">
      <div className="max-w-6xl mx-auto px-5">
        <div className="bg-[#1a1a1a] border border-[#333] border-b-0 rounded-t-lg shadow-xl overflow-hidden">
          {/* Header / Toggle */}
          <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left select-none hover:bg-[#222]"
            aria-expanded={!collapsed}
            aria-controls="activity-monitor-panel"
          >
            <div className="flex items-center gap-2">
              <span className="text-[#667eea] font-semibold">Activity Monitor</span>
              <span className="text-xs text-[#aaa] truncate max-w-[60vw] md:max-w-[40vw]">
                {headerSummary}
              </span>
            </div>
            <span className="text-[#aaa]">
              {collapsed ? '▲' : '▼'}
            </span>
          </button>

          {/* Collapsible content */}
          <div
            id="activity-monitor-panel"
            className={`transition-[max-height] duration-300 ease-in-out ${collapsed ? 'max-h-0' : 'max-h-[50vh]'} overflow-hidden`}
          >
            <div className="p-2.5 border-t border-[#333] bg-[#1a1a1a]">
              <div className="bg-[#2a2a2a] p-2.5 rounded h-[200px] md:h-[260px] overflow-y-auto font-mono text-sm border border-[#444]">
                {activityLog.length === 0 ? (
                  <div className="text-[#aaa]">No activity yet.</div>
                ) : (
                  activityLog.map((entry, i) => (
                    <div
                      key={i}
                      className={`p-1 mb-1 border-l-2 pl-2.5 ${entry.type === 'midi' ? 'border-[#667eea]' : 'border-[#10b981]'}`}
                    >
                      {entry.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

