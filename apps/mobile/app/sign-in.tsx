// /sign-in — email + password against POST /api/v1/auth/login.

import { Redirect } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
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
import { BodyText, PrimaryButton } from "../src/ui/components";
import { TOUCH_TARGET, colors, radius, spacing, typography } from "../src/ui/theme";

export default function SignInScreen() {
  const { t } = useI18n();
  const session = useSession();
  const { online } = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      // Redirect happens via the session.status branch above on re-render.
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError(t("signIn.invalid"));
      } else if (caught instanceof ApiError && caught.status === 0) {
        setError(t("signIn.unreachable"));
      } else {
        setError(caught instanceof Error ? caught.message : t("signIn.unreachable"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Image
              accessibilityIgnoresInvertColors
              source={require("../assets/icon.png")}
              style={styles.mark}
              resizeMode="contain"
            />
            <Text accessibilityRole="header" style={styles.appName}>
              {t("app.name")}
            </Text>
            <Text style={styles.subtitle}>{t("signIn.subtitle")}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label} nativeID="email-label">
              {t("signIn.email")}
            </Text>
            <TextInput
              accessibilityLabel={t("signIn.email")}
              accessibilityLabelledBy="email-label"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!busy}
              inputMode="email"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />
            <Text style={styles.label} nativeID="password-label">
              {t("signIn.password")}
            </Text>
            <TextInput
              accessibilityLabel={t("signIn.password")}
              accessibilityLabelledBy="password-label"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {error ? (
              <View accessibilityLiveRegion="polite" style={styles.errorBox}>
                <BodyText style={{ color: colors.danger700 }}>{error}</BodyText>
              </View>
            ) : null}

            {!online ? (
              <View style={styles.offlineBox}>
                <BodyText style={{ color: colors.warning700 }}>{t("common.offline")}</BodyText>
              </View>
            ) : null}

            <PrimaryButton
              busy={busy}
              label={busy ? t("signIn.signingIn") : t("signIn.submit")}
              onPress={() => void submit()}
            />
          </View>
          <View style={styles.creditBlock}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel="Tenvor"
              source={require("../assets/wordmark.png")}
              style={styles.wordmark}
              resizeMode="contain"
            />
            <Text style={styles.credit}>{t("app.credit")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand900 },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing(6), gap: spacing(8) },
  brandBlock: { gap: spacing(2), alignItems: "flex-start" },
  mark: { width: 88, height: 88, marginBottom: spacing(1) },
  creditBlock: {
    marginTop: spacing(8),
    alignItems: "center",
    gap: spacing(2),
    opacity: 0.9,
  },
  wordmark: { width: 132, height: 46, tintColor: colors.surface },
  credit: {
    color: colors.brand100,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  appName: {
    color: colors.surface,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.brand100,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing(5),
    gap: spacing(2),
  },
  label: {
    color: colors.neutral700,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    fontWeight: "600",
    marginTop: spacing(2),
  },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    paddingHorizontal: spacing(3),
    fontSize: typography.body.fontSize,
    color: colors.neutral950,
    backgroundColor: colors.surface,
  },
  errorBox: {
    backgroundColor: colors.danger100,
    borderRadius: radius.control,
    padding: spacing(3),
    marginTop: spacing(2),
  },
  offlineBox: {
    backgroundColor: colors.warning100,
    borderRadius: radius.control,
    padding: spacing(3),
    marginTop: spacing(2),
  },
});
