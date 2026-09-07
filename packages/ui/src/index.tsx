import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const theme = {
  colors: {
    background: '#F7F8F5',
    surface: '#FFFFFF',
    text: '#182B25',
    muted: '#52645C',
    primary: '#24674D',
    border: '#D7E2DA',
  },
  spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
  radius: 16,
} as const;

export function Card({
  children,
  dark = false,
}: PropsWithChildren<{ dark?: boolean }>) {
  return <View style={[styles.card, dark && styles.darkCard]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        disabled && styles.pressed,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.radius,
    gap: theme.spacing.md,
  },
  button: {
    backgroundColor: theme.colors.primary,
    minHeight: 48,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  pressed: { opacity: 0.8 },
  selected: { borderWidth: 3, borderColor: '#9BD8B6' },
  darkCard: { backgroundColor: '#24332F' },
});
