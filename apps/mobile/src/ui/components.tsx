// Shared field UI primitives. Status remains icon + label (never color-only),
// controls meet Android touch guidance, and ripple feedback is clipped to the
// visible shape.

import { Ionicons } from "@expo/vector-icons";
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
import type { ComponentProps } from "react";
import type { StatusTone } from "../lib/report-status";
import {
  TOUCH_TARGET,
  colors,
  elevation,
  glass,
  radius,
  spacing,
  typography,
} from "./theme";

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
      style={[styles.chip, { backgroundColor: tone.bg, borderColor: `${tone.fg}26` }]}
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
      android_ripple={{ color: "rgba(255,255,255,0.2)" }}
      disabled={disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: background, opacity: disabled ? 0.48 : pressed ? 0.9 : 1 },
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
  icon?: ComponentProps<typeof Ionicons>["name"];
  style?: StyleProp<ViewStyle>;
}) {
  const color = props.danger ? colors.danger700 : colors.brand700;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      android_ripple={{ color: props.danger ? colors.danger100 : colors.brand100 }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: color, opacity: props.disabled ? 0.55 : pressed ? 0.8 : 1 },
        props.style,
      ]}
    >
      {props.icon ? <Ionicons name={props.icon} size={19} color={color} /> : null}
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

export function BrandLockup(props: { light?: boolean; compact?: boolean }) {
  const foreground = props.light ? colors.surface : colors.brand900;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="BuildFlow"
      style={styles.brandLockup}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={[styles.brandMark, props.light ? styles.brandMarkLight : null]}
      >
        <View style={[styles.brandBar, styles.brandBarOne]} />
        <View style={[styles.brandBar, styles.brandBarTwo]} />
        <View style={[styles.brandBar, styles.brandBarThree]} />
      </View>
      <View>
        <Text style={[styles.brandName, { color: foreground }]}>BuildFlow</Text>
        {!props.compact ? (
          <Text style={[styles.brandTagline, props.light ? styles.brandTaglineLight : null]}>
            FIELD OPERATIONS
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ConnectionPill(props: {
  online: boolean;
  onlineLabel: string;
  offlineLabel: string;
  dark?: boolean;
}) {
  const label = props.online ? props.onlineLabel : props.offlineLabel;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.connectionPill,
        props.dark ? styles.connectionPillDark : null,
        !props.online ? styles.connectionPillOffline : null,
      ]}
    >
      <View
        importantForAccessibility="no"
        style={[styles.connectionDot, !props.online ? styles.connectionDotOffline : null]}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.connectionLabel,
          props.dark ? styles.connectionLabelDark : null,
          !props.online ? styles.connectionLabelOffline : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ScreenIntro(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  light?: boolean;
}) {
  return (
    <View style={styles.screenIntro}>
      <View style={styles.screenIntroCopy}>
        {props.eyebrow ? (
          <Text style={[styles.eyebrow, props.light ? styles.textOnDarkMuted : null]}>
            {props.eyebrow}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          style={[styles.screenTitle, props.light ? styles.textOnDark : null]}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={[styles.screenSubtitle, props.light ? styles.textOnDarkMuted : null]}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.trailing ? <View style={styles.screenIntroTrailing}>{props.trailing}</View> : null}
    </View>
  );
}

export function IconButton(props: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  light?: boolean;
}) {
  const color = props.light ? colors.surface : colors.brand900;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      android_ripple={{ color: props.light ? glass.onDarkStrong : colors.brand100 }}
      hitSlop={4}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        props.light ? styles.iconButtonLight : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Ionicons name={props.icon} size={24} color={color} />
    </Pressable>
  );
}

const noticeTones = {
  info: { background: colors.brand50, border: colors.brand100, foreground: colors.brand700 },
  success: {
    background: colors.success100,
    border: "#B8E4CD",
    foreground: colors.success700,
  },
  warning: {
    background: colors.warning100,
    border: "#EFD98C",
    foreground: colors.warning700,
  },
  danger: {
    background: colors.danger100,
    border: "#F5C2BE",
    foreground: colors.danger700,
  },
} as const;

export function NoticeCard(props: {
  tone: keyof typeof noticeTones;
  icon: ComponentProps<typeof Ionicons>["name"];
  title?: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const tone = noticeTones[props.tone];
  return (
    <View
      accessibilityLiveRegion={props.tone === "danger" ? "polite" : "none"}
      style={[
        styles.notice,
        { backgroundColor: tone.background, borderColor: tone.border },
      ]}
    >
      <View style={[styles.noticeIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={props.icon} size={20} color={tone.foreground} />
      </View>
      <View style={styles.noticeCopy}>
        {props.title ? <Text style={[styles.noticeTitle, { color: tone.foreground }]}>{props.title}</Text> : null}
        <Text style={[styles.noticeBody, { color: tone.foreground }]}>{props.body}</Text>
        {props.actionLabel && props.onAction ? (
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: "rgba(255,255,255,0.5)" }}
            onPress={props.onAction}
            style={styles.noticeAction}
          >
            <Text style={[styles.noticeActionLabel, { color: tone.foreground }]}>
              {props.actionLabel}
            </Text>
            <Ionicons name="arrow-forward" size={17} color={tone.foreground} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState(props: {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={props.icon} size={30} color={colors.brand700} />
      </View>
      <Text accessibilityRole="header" style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyBody}>{props.body}</Text>
      {props.actionLabel && props.onAction ? (
        <PrimaryButton
          label={props.actionLabel}
          onPress={props.onAction}
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  );
}

export function FilterChip(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      android_ripple={{ color: colors.brand100 }}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.filterChip,
        props.selected ? styles.filterChipSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.filterChipLabel, props.selected ? styles.filterChipLabelSelected : null]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.75),
    gap: spacing(1.5),
  },
  chipIcon: { fontSize: 13, lineHeight: 17, fontWeight: "800" },
  chipLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  primaryButton: {
    minHeight: 56,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing(2),
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    overflow: "hidden",
    ...elevation.subtle,
  },
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
    flexDirection: "row",
    gap: spacing(2),
    overflow: "hidden",
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
    ...elevation.subtle,
    borderRadius: radius.card,
    padding: spacing(5),
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
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brand900,
    position: "relative",
    overflow: "hidden",
    ...elevation.subtle,
  },
  brandMarkLight: {
    backgroundColor: glass.onDark,
    borderWidth: 1,
    borderColor: glass.borderOnDark,
  },
  brandBar: {
    position: "absolute",
    bottom: 9,
    width: 5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: colors.surface,
  },
  brandBarOne: { left: 10, height: 10, opacity: 0.72 },
  brandBarTwo: { left: 17, height: 17 },
  brandBarThree: { left: 24, height: 23, backgroundColor: "#E78B57" },
  brandName: { fontSize: 18, lineHeight: 21, fontWeight: "800", letterSpacing: -0.4 },
  brandTagline: {
    marginTop: 1,
    color: colors.neutral500,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  brandTaglineLight: { color: "rgba(255,255,255,0.64)" },
  connectionPill: {
    minHeight: 34,
    maxWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing(1.5),
    paddingHorizontal: spacing(2.5),
    borderWidth: 1,
    borderColor: "#B8E4CD",
    borderRadius: radius.pill,
    backgroundColor: colors.success100,
  },
  connectionPillDark: {
    borderColor: glass.borderOnDark,
    backgroundColor: glass.onDark,
  },
  connectionPillOffline: {
    borderColor: "#EFD98C",
    backgroundColor: colors.warning100,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success700,
  },
  connectionDotOffline: { backgroundColor: colors.warning700 },
  connectionLabel: {
    flexShrink: 1,
    color: colors.success700,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  connectionLabelDark: { color: colors.surface },
  connectionLabelOffline: { color: colors.warning700 },
  screenIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing(4),
  },
  screenIntroCopy: { flex: 1, minWidth: 0 },
  screenIntroTrailing: { paddingTop: spacing(1) },
  eyebrow: {
    color: colors.accent700,
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
    textTransform: "uppercase",
    marginBottom: spacing(2),
  },
  screenTitle: {
    color: colors.brand900,
    fontSize: typography.pageTitle.fontSize,
    lineHeight: typography.pageTitle.lineHeight,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  screenSubtitle: {
    maxWidth: 520,
    marginTop: spacing(2),
    color: colors.neutral600,
    fontSize: typography.supporting.fontSize,
    lineHeight: typography.supporting.lineHeight,
  },
  textOnDark: { color: colors.surface },
  textOnDarkMuted: { color: "rgba(255,255,255,0.68)" },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  iconButtonLight: {
    borderColor: glass.borderOnDark,
    backgroundColor: glass.onDark,
  },
  pressed: { opacity: 0.82 },
  notice: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing(3),
    padding: spacing(4),
    borderWidth: 1,
    borderRadius: radius.control,
  },
  noticeIcon: {
    width: 36,
    height: 36,
    flex: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  noticeCopy: { flex: 1, minWidth: 0, gap: spacing(1) },
  noticeTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  noticeBody: { fontSize: 14, lineHeight: 21, fontWeight: "500" },
  noticeAction: {
    minHeight: TOUCH_TARGET,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    marginTop: spacing(1),
    paddingHorizontal: spacing(1),
  },
  noticeActionLabel: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  emptyState: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(9),
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.brand50,
    marginBottom: spacing(5),
  },
  emptyTitle: {
    color: colors.brand900,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    maxWidth: 360,
    marginTop: spacing(2),
    color: colors.neutral600,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  emptyAction: { minWidth: 210, marginTop: spacing(5) },
  filterChip: {
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  filterChipSelected: {
    borderColor: colors.brand900,
    backgroundColor: colors.brand900,
  },
  filterChipLabel: {
    color: colors.neutral700,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  filterChipLabelSelected: { color: colors.surface },
});
