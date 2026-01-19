interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Section({ title, subtitle, children }: SectionProps) {
  return (
    <section className="bg-[--color-surface-1] rounded-xl p-6 mb-5 border border-[--color-border] mesh-gradient animate-fade-in">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[--color-text] tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-[--color-text-muted] mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}
