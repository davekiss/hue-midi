interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="bg-[#1a1a1a] rounded-lg p-6 mb-5 border border-[#333]">
      <h2 className="text-2xl mb-5 text-[#667eea]">{title}</h2>
      {children}
    </div>
  );
}
