import { Text as RNText, type TextProps } from 'react-native';
import { color, font } from '@drift/tokens';

type Weight = 'regular' | 'medium' | 'semibold';

export function Text({ weight = 'regular', size = 15, tone = color.text, style, ...rest }: TextProps & { weight?: Weight; size?: number; tone?: string }) {
  return <RNText {...rest} style={[{ fontFamily: font[weight], fontSize: size, color: tone, letterSpacing: size >= 28 ? -0.03 * size : 0 }, style]} />;
}

/** The small uppercase section label used throughout Settings. */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: TextProps['style'] }) {
  return (
    <Text size={11} tone={color.neutral[400]} style={[{ letterSpacing: 0.9, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}
