// Pipeline Nodes mark — ARC's identity glyph. Six dots arching from lower-left
// to lower-right, with the final dot in forest-500 (the brand accent). The
// arc itself is drawn as a faint connecting path beneath the dots.
//
// `variant` controls dot fill color so the same SVG renders cleanly on both
// dark backgrounds (sidebar, sign-in hero chip) and light backgrounds:
//   - "light" → light dots (white) for use on a DARK surface
//   - "dark"  → dark dots (arc-700) for use on a LIGHT surface
// The final forest-500 dot is preserved across both variants.

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';        // sm=24px, md=36px, lg=48px
  variant?: 'light' | 'dark';
  className?: string;
}

const SIZE_PX: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 24,
  md: 36,
  lg: 48,
};

export function Logo({ size = 'md', variant = 'light', className = '' }: LogoProps) {
  const px = SIZE_PX[size];
  const dotFill = variant === 'light' ? '#FFFFFF' : '#3F3F3F';
  const arcStroke = variant === 'light' ? '#FFFFFF' : '#3F3F3F';

  return (
    <svg
      viewBox="0 0 48 48"
      width={px}
      height={px}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M 8 30 Q 24 8 40 30"
        stroke={arcStroke}
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />
      <circle cx="8"    cy="30"   r="2.4" fill={dotFill} />
      <circle cx="14.4" cy="22"   r="2.4" fill={dotFill} />
      <circle cx="21.6" cy="15.5" r="2.4" fill={dotFill} />
      <circle cx="29.4" cy="15.5" r="2.4" fill={dotFill} />
      <circle cx="36"   cy="22"   r="2.4" fill={dotFill} />
      <circle cx="40"   cy="30"   r="3.2" fill="#2D4A3A" stroke={arcStroke} strokeWidth="1.2" />
    </svg>
  );
}
