interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const baseClasses =
    'px-5 py-2.5 rounded border-none text-base font-medium cursor-pointer transition-all mr-2.5 mb-2.5';

  const variantClasses = {
    primary: 'bg-[#667eea] text-white hover:bg-[#764ba2] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)]',
    danger: 'bg-[#ef4444] text-white hover:bg-[#dc2626]',
  };

  const disabledClasses = 'disabled:bg-[#555] disabled:cursor-not-allowed disabled:transform-none';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
