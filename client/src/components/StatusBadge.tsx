interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'pending';
  children: React.ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const statusStyles = {
    connected: 'bg-[--color-success]/10 text-[--color-success] border-[--color-success]/20',
    pending: 'bg-[--color-warning]/10 text-[--color-warning] border-[--color-warning]/20',
    disconnected: 'bg-[--color-surface-3] text-[--color-text-muted] border-[--color-border]',
  };

  const dotStyles = {
    connected: 'status-dot-connected',
    pending: 'status-dot-pending',
    disconnected: 'status-dot-disconnected',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border ${statusStyles[status]}`}
    >
      <span className={`status-dot ${dotStyles[status]}`} />
      {children}
    </span>
  );
}
