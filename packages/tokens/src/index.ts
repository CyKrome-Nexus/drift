// Nocturne tokens as values, for the phone app (React Native has no CSS custom properties).
// Mirrors tokens.css — change both together.

export const color = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  accent2: '#a7a1db',
  /** #e9e9ed at 16% — RN has no color-mix, so the blend is written out. */
  divider: 'rgba(233,233,237,0.16)',
  neutral: {
    100: '#f3f5fe', 200: '#e4e7f5', 300: '#cfd3e5', 400: '#b2b6ca', 500: '#9397ab',
    600: '#75798c', 700: '#595d6c', 800: '#3f424d', 900: '#292b31',
  },
  accentRamp: {
    100: '#f5f4ff', 200: '#e7e5fe', 300: '#d2cefd', 400: '#b5abfc', 500: '#968ae0',
    600: '#796cbf', 700: '#5d5294', 800: '#423a6a', 900: '#2b2741',
  },
  traffic: { close: '#ff5f57', minimize: '#febc2e', zoom: '#28c840' },
} as const;

export const radius = { sm: 4, md: 8, lg: 14, xl: 28 } as const;

export const space = { 1: 2.8, 2: 5.6, 3: 8.4, 4: 11.2, 6: 16.8, 8: 22.4 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

/** Liquid-glass surface: the gradient stops and edge highlight the CSS draws with box-shadow. */
export const glass = {
  from: 'rgba(255,255,255,0.16)',
  to: 'rgba(255,255,255,0.04)',
  edge: 'rgba(255,255,255,0.14)',
  highlight: 'rgba(255,255,255,0.4)',
  blur: 24,
} as const;

/** `hex` at `alpha` (0–1), for the places the CSS uses color-mix against transparent. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
