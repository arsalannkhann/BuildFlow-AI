// Shared UI primitives per design.md §10–§13. Icon + label chips (never
// color-only), 48dp touch targets, 16px minimum body text.

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { StatusTone } from "../lib/report-status";
import { TOUCH_TARGET, colors, elevation, glass, radius, spacing, typography } from "./theme";

const toneStyles: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutral200, fg: colors.neutral700 },
  info: { bg: colors.brand100, fg: colors.brand700 },
  success: { bg: colors.success100, fg: colors.success700 },
  warning: { bg: colors.warning100, fg: colors.warning700 },
  danger: { bg: colors.danger100, fg: colors.danger700 },
};

export function StatusChip(props: { icon: string; label: string; tone: StatusTone }) {
  const tone = toneStyles[props.tone];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={props.label}
      style={[styles.chip, { backgroundColor: tone.bg }]}
    >
      <Text style={[styles.chipIcon, { color: tone.fg }]} importantForAccessibility="no">
        {props.icon}
      </Text>
      <Text style={[styles.chipLabel, { color: tone.fg }]}>{props.label}</Text>
    </View>
  );
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const background = props.accent ? colors.accent600 : colors.brand700;
  const disabled = props.disabled === true || props.busy === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled, busy: props.busy === true }}
      disabled={disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: background, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 },
        props.style,
      ]}
    >
      {props.busy ? <ActivityIndicator color={colors.surface} /> : null}
      {props.icon && !props.busy ? props.icon : null}
      <Text style={styles.primaryButtonLabel}>{props.label}</Text>
    </Pressable>
  );
}

export function SecondaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = props.danger ? colors.danger700 : colors.brand700;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: color, opacity: props.disabled ? 0.55 : pressed ? 0.8 : 1 },
        props.style,
      ]}
    >
      <Text style={[styles.secondaryButtonLabel, { color }]}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, props.style]}>{props.children}</View>;
}

export function SectionTitle(props: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, props.style]}>
      {props.children}
    </Text>
  );
}

export function BodyText(props: {
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
  nativeID?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      nativeID={props.nativeID}
      style={[
        props.strong ? styles.bodyStrong : styles.body,
        props.muted ? { color: colors.neutral500 } : null,
        props.style,
      ]}
    >
      {props.children}
    </Text>
  );
}

export function SupportingText(props: {
  children: ReactNode;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text numberOfLines={props.numberOfLines} style={[styles.supporting, props.style]}>
      {props.children}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    gap: spacing(1.5),
  },
  chipIcon: { fontSize: 14, lineHeight: 18, fontWeight: "700" },
  chipLabel: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  primaryButton: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing(2),
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
  },
  primaryButtonIcon: { color: colors.surface, fontSize: 20, lineHeight: 24 },
  primaryButtonLabel: {
    color: colors.surface,
    fontSize: typography.bodyStrong.fontSize,
    lineHeight: typography.bodyStrong.lineHeight,
    fontWeight: "600",
  },
  secondaryButton: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.control,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    backgroundColor: colors.surface,
  },
  secondaryButtonLabel: {
    fontSize: typography.bodyStrong.fontSize,
    lineHeight: typography.bodyStrong.lineHeight,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: glass.border,
    borderWidth: 1,
    ...elevation.raised,
    borderRadius: radius.card,
    padding: spacing(4),
    gap: spacing(2),
  },
  sectionTitle: {
    color: colors.neutral950,
    fontSize: typography.sectionTitle.fontSize,
    lineHeight: typography.sectionTitle.lineHeight,
    fontWeight: "700",
  },
  body: {
    color: colors.neutral950,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  bodyStrong: {
    color: colors.neutral950,
    fontSize: typography.bodyStrong.fontSize,
    lineHeight: typography.bodyStrong.lineHeight,
    fontWeight: "600",
  },
  supporting: {
    color: colors.neutral700,
    fontSize: typography.supporting.fontSize,
    lineHeight: typography.supporting.lineHeight,
  },
});
