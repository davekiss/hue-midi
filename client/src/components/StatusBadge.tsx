interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'pending';
  children: React.ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const colorClasses = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    pending: 'bg-yellow-500',
  };

  return (
    <span
      className={`inline-block px-4 py-1 rounded-full text-sm font-medium text-white ${colorClasses[status]}`}
    >
      {children}
    </span>
  );
}
