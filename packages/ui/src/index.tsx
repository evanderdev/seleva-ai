import { createContext, useContext, type PropsWithChildren } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
const light = {
  background: '#FAFCF9',
  surface: '#FFFFFF',
  subtle: '#F5F8F2',
  text: '#172B25',
  muted: '#87958B',
  primary: '#223F2D',
  border: '#DFE6DC',
  accent: '#D5F779',
  selected: '#EDF5E5',
  selectionBorder: '#9DBF67',
  onPrimary: '#FFFFFF',
  overlay: 'rgba(28,51,36,0.25)',
};
export type Palette = typeof light;
const dark: Palette = {
  background: '#172119',
  surface: '#202E24',
  subtle: '#202E24',
  text: '#F5F8F0',
  muted: '#93A08F',
  primary: '#223F2D',
  border: '#344338',
  accent: '#D5F779',
  selected: '#354338',
  selectionBorder: '#9DBF67',
  onPrimary: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.5)',
};
export const theme = {
  colors: light,
  spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
  radius: 20,
} as const;
const ThemeContext = createContext<Palette>(light);
export function ThemeProvider({
  mode,
  children,
}: PropsWithChildren<{ mode: 'light' | 'dark' }>) {
  return (
    <ThemeContext.Provider value={mode === 'dark' ? dark : light}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export const layout = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 450,
    alignSelf: 'center',
    paddingHorizontal: 30,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '600', letterSpacing: -1 },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  body: { fontSize: 14, lineHeight: 22 },
});
export type IconName =
  | 'search'
  | 'back'
  | 'arrow'
  | 'close'
  | 'check'
  | 'settings'
  | 'sparkles'
  | 'sun'
  | 'moon'
  | 'lock'
  | 'similar'
  | 'screenshots'
  | 'space';
export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const colors = useTheme();
  const tint = color ?? colors.muted;
  if (name === 'lock')
    return (
      <View style={{ width: size, height: size }}>
        <View
          style={{
            position: 'absolute',
            left: size * 0.3,
            top: 0,
            width: size * 0.4,
            height: size * 0.55,
            borderWidth: 1.2,
            borderColor: tint,
            borderRadius: size * 0.25,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: size * 0.15,
            bottom: 0,
            width: size * 0.7,
            height: size * 0.6,
            borderWidth: 1.2,
            borderColor: tint,
            borderRadius: 2,
            backgroundColor: colors.background,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: size * 0.47,
            bottom: size * 0.17,
            width: 1.2,
            height: size * 0.18,
            backgroundColor: tint,
          }}
        />
      </View>
    );
  if (name === 'settings')
    return (
      <View
        style={{ width: size, height: size, justifyContent: 'space-around' }}
      >
        {[0.2, 0.7].map((position, index) => (
          <View
            key={index}
            style={{ height: 1.3, backgroundColor: tint, width: size * 0.85 }}
          >
            <View
              style={{
                position: 'absolute',
                top: -2.4,
                left: size * position,
                width: 6,
                height: 6,
                borderRadius: 3,
                borderWidth: 1.3,
                borderColor: tint,
                backgroundColor: colors.background,
              }}
            />
          </View>
        ))}
      </View>
    );
  if (name === 'search')
    return (
      <View style={{ width: size, height: size }}>
        <View
          style={{
            width: size * 0.65,
            height: size * 0.65,
            borderWidth: 1.5,
            borderColor: tint,
            borderRadius: size,
            top: 1,
            left: 1,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.4,
            height: 1.5,
            backgroundColor: tint,
            transform: [{ rotate: '45deg' }],
            right: 0,
            bottom: 3,
          }}
        />
      </View>
    );
  const glyphs: Record<Exclude<IconName, 'search'>, string> = {
    back: '←',
    arrow: '↑',
    close: '×',
    check: '✓',
    settings: '☷',
    sparkles: '✧',
    sun: '☼',
    moon: '☾',
    lock: '♙',
    similar: '⌁',
    screenshots: '▧',
    space: '◌',
  };
  return (
    <Text
      accessible={false}
      style={{
        color: tint,
        fontSize: size + 3,
        lineHeight: size + 6,
        textAlign: 'center',
      }}
    >
      {glyphs[name]}
    </Text>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  selected = false,
  disabled = false,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor:
            variant === 'primary' ? colors.primary : 'transparent',
          minHeight: variant === 'primary' ? 52 : 36,
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: variant === 'primary' ? 18 : 24,
          justifyContent: 'center',
          borderWidth: variant === 'outline' || selected ? 1 : 0,
          borderColor: selected ? colors.selectionBorder : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: variant === 'primary' ? colors.onPrimary : colors.text,
          fontSize: variant === 'primary' ? 14 : 12,
          textAlign: 'center',
          fontWeight: variant === 'primary' ? '600' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
