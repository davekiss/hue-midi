export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[--color-surface-0]/95 backdrop-blur-md border-b border-[--color-border-subtle]">
      <div className="max-w-4xl mx-auto h-14 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[--color-accent] to-[--color-accent-dim] rounded-lg opacity-20" />
            <div className="relative flex gap-0.5">
              <div className="w-1 h-4 bg-[--color-accent] rounded-full" />
              <div className="w-1 h-3 bg-[--color-accent] rounded-full mt-1" />
              <div className="w-1 h-5 bg-[--color-accent] rounded-full -mt-0.5" />
            </div>
          </div>

          {/* Brand name */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[--color-text] font-semibold text-lg tracking-tight">
              Hue
            </span>
            <span className="text-[--color-accent] font-semibold text-lg tracking-tight">
              MIDI
            </span>
          </div>
        </div>

        {/* Version badge */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] font-mono text-[--color-text-subtle] bg-[--color-surface-2] px-2 py-0.5 rounded">
            v1.0
          </span>
        </div>
      </div>
    </header>
  );
}
