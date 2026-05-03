/**
 * Tokens accesibles desde TS para autocompletado.
 * Los valores reales vienen de tokens.css. Estos son solo nombres tipados.
 */

export const color = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceHover: 'var(--surface-hover)',
  surface2: 'var(--surface-2)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',

  text: 'var(--text)',
  textMuted: 'var(--text-muted)',
  textDim: 'var(--text-dim)',
  textInverse: 'var(--text-inverse)',

  primary: 'var(--primary)',
  primaryHover: 'var(--primary-hover)',
  primaryPress: 'var(--primary-press)',
  primaryBg: 'var(--primary-bg)',
  primaryBgStrong: 'var(--primary-bg-strong)',

  success: 'var(--success)',
  successBg: 'var(--success-bg)',
  warning: 'var(--warning)',
  warningBg: 'var(--warning-bg)',
  danger: 'var(--danger)',
  dangerBg: 'var(--danger-bg)',
  info: 'var(--info)',
  infoBg: 'var(--info-bg)',
} as const;

export const space = {
  0: 'var(--space-0)',
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  8: 'var(--space-8)',
  10: 'var(--space-10)',
  12: 'var(--space-12)',
  16: 'var(--space-16)',
} as const;

export const radius = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  full: 'var(--radius-full)',
} as const;

export const text = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  base: 'var(--text-base)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)',
} as const;

export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const;

export const shadow = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  focus: 'var(--shadow-focus)',
} as const;

export const duration = {
  fast: 'var(--duration-fast)',
  base: 'var(--duration)',
  slow: 'var(--duration-slow)',
} as const;

export const ease = 'var(--ease)';

export const layout = {
  sidebarW: 'var(--sidebar-w)',
  sidebarWCollapsed: 'var(--sidebar-w-collapsed)',
  topbarH: 'var(--topbar-h)',
  drawerW: 'var(--drawer-w)',
} as const;
