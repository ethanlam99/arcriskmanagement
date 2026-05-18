interface UserAvatarProps {
  seed: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

// Deterministic color from initials — keeps avatars visually distinct
const PALETTE = [
  'bg-arc-700 text-white',
  'bg-forest-600 text-white',
  'bg-cyan-700 text-white',
  'bg-slate-600 text-white',
  'bg-indigo-600 text-white',
  'bg-emerald-700 text-white',
];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

export function UserAvatar({ seed, name, size = 'md', className = '' }: UserAvatarProps) {
  const initials = seed.slice(0, 2).toUpperCase();
  const color    = pickColor(seed);
  return (
    <div
      className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-semibold shrink-0 ${className}`}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
