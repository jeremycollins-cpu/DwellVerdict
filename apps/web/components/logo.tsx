import React from 'react';

/**
 * DwellVerdict Logo Component
 *
 * D-shaped house with V-checkmark inside, paired with Geist 800 two-tone wordmark.
 * "dwell" in ink + "verdict" in terracotta.
 *
 * Variants:
 *   - variant: 'full' (mark + wordmark) | 'mark' (mark only) | 'wordmark' (text only)
 *   - theme: 'light' | 'dark' | 'mono'
 *   - size: 'sm' (22px mark / 22px wm) | 'md' (28px / 28px) | 'lg' (44px / 36px) | 'xl' (64px / 48px)
 *
 * Usage:
 *   <Logo />                              → full lock-up, light theme, md size
 *   <Logo variant="mark" size="sm" />     → sidebar-sized mark only
 *   <Logo theme="dark" size="xl" />       → dark-mode hero
 */

type LogoVariant = 'full' | 'mark' | 'wordmark';
type LogoTheme = 'light' | 'dark' | 'mono';
type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  size?: LogoSize;
  className?: string;
  'aria-label'?: string;
}

const SIZES: Record<LogoSize, { mark: number; wordmark: number; gap: number; checkStroke: number }> = {
  sm: { mark: 22, wordmark: 22, gap: 8, checkStroke: 5.5 },
  md: { mark: 28, wordmark: 28, gap: 8, checkStroke: 5 },
  lg: { mark: 44, wordmark: 36, gap: 10, checkStroke: 4 },
  xl: { mark: 64, wordmark: 48, gap: 12, checkStroke: 4 },
};

// House colors: always terracotta for light/dark themes, ink for mono
const HOUSE_FILL: Record<LogoTheme, string> = {
  light: '#c55a3f',
  dark: '#c55a3f',
  mono: '#1c1917',
};

// Check colors: paper on terracotta house, ink on terracotta house (dark theme), paper on mono
const CHECK_STROKE: Record<LogoTheme, string> = {
  light: '#fafaf7',
  dark: '#1c1917',
  mono: '#fafaf7',
};

// Wordmark "dwell" color
const DWELL_COLOR: Record<LogoTheme, string> = {
  light: '#1c1917',
  dark: '#fafaf7',
  mono: '#1c1917',
};

// Wordmark "verdict" color
const VERDICT_COLOR: Record<LogoTheme, string> = {
  light: '#c55a3f',
  dark: '#c55a3f',
  mono: '#1c1917',
};

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  theme = 'light',
  size = 'md',
  className = '',
  'aria-label': ariaLabel = 'DwellVerdict',
}) => {
  const { mark: markSize, wordmark: wmSize, gap, checkStroke } = SIZES[size];

  const markSvg = (
    <svg
      width={markSize}
      height={markSize}
      viewBox="0 0 52 52"
      fill="none"
      role="img"
      aria-label={variant === 'mark' ? ariaLabel : undefined}
      aria-hidden={variant !== 'mark'}
      style={{ flexShrink: 0 }}
    >
      {variant === 'mark' && <title>{ariaLabel}</title>}
      <path
        d="M 8 22 L 26 6 L 44 22 Q 44 46 26 46 L 8 46 Z"
        fill={HOUSE_FILL[theme]}
      />
      <path
        d="M 15 31 L 22 38 L 36 24"
        stroke={CHECK_STROKE[theme]}
        strokeWidth={checkStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );

  const wordmarkSpan = (
    <span
      style={{
        // M1 fix: next/font/google self-hosts Geist under a hashed family
        // name and exposes it via the CSS variable set on <html> in
        // apps/web/app/layout.tsx. Using the literal 'Geist' family name
        // the handoff shipped would silently fall back to the system sans
        // in production. Reference the CSS variable instead.
        fontFamily: 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif',
        fontWeight: 800,
        fontSize: `${wmSize}px`,
        letterSpacing: '-0.045em',
        lineHeight: 1,
        display: 'inline-flex',
      }}
      aria-label={variant === 'wordmark' ? ariaLabel : undefined}
      aria-hidden={variant === 'mark'}
      role={variant === 'wordmark' ? 'img' : undefined}
    >
      <span style={{ color: DWELL_COLOR[theme] }}>dwell</span>
      <span style={{ color: VERDICT_COLOR[theme] }}>verdict</span>
    </span>
  );

  if (variant === 'mark') {
    return <span className={className}>{markSvg}</span>;
  }

  if (variant === 'wordmark') {
    return <span className={className}>{wordmarkSpan}</span>;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
      }}
      role="img"
      aria-label={ariaLabel}
    >
      {markSvg}
      {wordmarkSpan}
    </span>
  );
};

export default Logo;
