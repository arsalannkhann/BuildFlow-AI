// /sign-in — a focused native entry point for the field workspace.

import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../src/lib/api-client";
import { useI18n } from "../src/lib/i18n";
import { useSession } from "../src/state/session";
import { useSync } from "../src/state/sync";
import {
  BrandLockup,
  ConnectionPill,
  NoticeCard,
  PrimaryButton,
} from "../src/ui/components";
import {
  TOUCH_TARGET,
  colors,
  elevation,
  glass,
  radius,
  spacing,
  typography,
} from "../src/ui/theme";

export default function SignInScreen() {
  const { t } = useI18n();
  const session = useSession();
  const { online } = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === "signed-in") return <Redirect href="/" />;

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t("signIn.missingFields"));
      return;
    }
    if (!online) {
      setError(t("signIn.offline"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.signIn(email.trim(), password);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError(t("signIn.invalid"));
      } else if (caught instanceof ApiError && caught.status === 0) {
        setError(t("signIn.unreachable"));
      } else {
        setError(t("signIn.unreachable"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.heroRing} />
            <View style={styles.brandRow}>
              <BrandLockup light />
              <ConnectionPill
                dark
                offlineLabel={t("common.offlineShort")}
                online={online}
                onlineLabel={t("common.online")}
              />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>{t("signIn.eyebrow")}</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {t("signIn.title")}
              </Text>
              <Text style={styles.subtitle}>{t("signIn.subtitle")}</Text>
              <View style={styles.workspaceNote}>
                <View style={styles.workspaceNoteIcon}>
                  <Ionicons name="shield-checkmark" size={19} color={colors.surface} />
                </View>
                <Text style={styles.workspaceNoteText}>{t("signIn.workspaceNote")}</Text>
              </View>
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.label} nativeID="email-label">
                {t("signIn.email")}
              </Text>
              <View style={styles.inputShell}>
                <Ionicons name="mail-outline" size={20} color={colors.neutral500} />
                <TextInput
                  accessibilityLabel={t("signIn.email")}
                  accessibilityLabelledBy="email-label"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!busy}
                  inputMode="email"
                  onChangeText={setEmail}
                  returnKeyType="next"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label} nativeID="password-label">
                {t("signIn.password")}
              </Text>
              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.neutral500} />
                <TextInput
                  accessibilityLabel={t("signIn.password")}
                  accessibilityLabelledBy="password-label"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  editable={!busy}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submit()}
                  returnKeyType="go"
                  secureTextEntry={!passwordVisible}
                  style={styles.input}
                  value={password}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible ? t("signIn.hidePassword") : t("signIn.showPassword")
                  }
                  android_ripple={{ color: colors.brand100, borderless: true }}
                  hitSlop={4}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  style={styles.passwordToggle}
                >
                  <Ionicons
                    name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color={colors.brand700}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <NoticeCard tone="danger" icon="alert-circle-outline" body={error} />
            ) : null}

            {!online && !error ? (
              <NoticeCard tone="warning" icon="cloud-offline-outline" body={t("common.offline")} />
            ) : null}

            <PrimaryButton
              busy={busy}
              disabled={!online}
              label={busy ? t("signIn.signingIn") : t("signIn.submit")}
              onPress={() => void submit()}
              style={styles.submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand900 },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(6),
    gap: spacing(6),
  },
  hero: {
    position: "relative",
    minHeight: 330,
    overflow: "hidden",
    padding: spacing(5),
    borderWidth: 1,
    borderColor: glass.borderOnDark,
    borderRadius: 28,
    backgroundColor: colors.brand950,
    justifyContent: "space-between",
    ...elevation.raised,
  },
  heroRing: {
    position: "absolute",
    right: -100,
    bottom: -125,
    width: 280,
    height: 280,
    borderWidth: 38,
    borderColor: "rgba(255,255,255,0.045)",
    borderRadius: 140,
  },
  brandRow: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  heroCopy: { zIndex: 1, maxWidth: 500, marginTop: spacing(10) },
  eyebrow: {
    color: "#E99666",
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
  },
  title: {
    marginTop: spacing(2),
    color: colors.surface,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: "800",
    letterSpacing: -1.1,
  },
  subtitle: {
    maxWidth: 450,
    marginTop: spacing(3),
    color: "rgba(255,255,255,0.75)",
    fontSize: 17,
    lineHeight: 26,
  },
  workspaceNote: {
    maxWidth: 470,
    marginTop: spacing(5),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  workspaceNoteIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: glass.onDarkStrong,
  },
  workspaceNoteText: {
    flex: 1,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  formCard: {
    padding: spacing(5),
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    gap: spacing(4),
    ...elevation.raised,
  },
  field: { gap: spacing(2) },
  label: {
    color: colors.neutral700,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    fontWeight: "700",
  },
  inputShell: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    paddingLeft: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    backgroundColor: colors.neutral50,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    paddingVertical: spacing(3),
    paddingRight: spacing(3),
    color: colors.neutral950,
    fontSize: typography.body.fontSize,
  },
  passwordToggle: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    overflow: "hidden",
  },
  submit: { marginTop: spacing(1) },
});
