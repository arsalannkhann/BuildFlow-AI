// Root layout: boots services (SQLite + sync engine) once, then mounts the
// provider tree and the navigation stack.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { I18nProvider, LANGUAGE_SETTING_KEY } from "../src/lib/i18n";
import { SessionProvider } from "../src/state/session";
import { ServicesProvider, bootServices, type AppServices } from "../src/state/services";
import { SyncProvider } from "../src/state/sync";
import { BrandLockup, PrimaryButton } from "../src/ui/components";
import { colors, radius, spacing } from "../src/ui/theme";

export default function RootLayout() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    bootServices()
      .then((booted) => {
        if (!cancelled) setServices(booted);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBootError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  if (bootError) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" backgroundColor={colors.brand900} />
        <BrandLockup light />
        <View style={styles.bootErrorCard}>
          <Text accessibilityRole="header" style={styles.bootErrorTitle}>
            BuildFlow could not start
          </Text>
          <Text style={styles.bootErrorDetail}>
            Your on-device workspace could not be opened. Your existing server records are not affected.
          </Text>
          {__DEV__ ? <Text style={styles.bootDebug}>{bootError}</Text> : null}
          <PrimaryButton
            label="Try again"
            onPress={() => {
              setBootError(null);
              setServices(null);
              setBootAttempt((attempt) => attempt + 1);
            }}
          />
        </View>
      </View>
    );
  }

  if (!services) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" backgroundColor={colors.brand900} />
        <BrandLockup light />
        <ActivityIndicator size="large" color={colors.surface} />
        <Text style={styles.bootLoading}>Opening your field workspace…</Text>
      </View>
    );
  }

  return (
    <ServicesProvider services={services}>
      <I18nProvider
        initialLanguage={services.initialLanguage}
        onLanguageChange={(language) => {
          void services.sql.setSetting(LANGUAGE_SETTING_KEY, language);
        }}
      >
        <SyncProvider>
          <SessionProvider>
            <StatusBar style="light" backgroundColor={colors.brand900} />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.brand900 },
                headerTintColor: colors.surface,
                headerTitleStyle: { fontWeight: "700" },
                contentStyle: { backgroundColor: colors.paper },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen
                name="capture"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                  gestureEnabled: false,
                  headerShown: false,
                }}
              />
            </Stack>
          </SessionProvider>
        </SyncProvider>
      </I18nProvider>
    </ServicesProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand900,
    padding: spacing(6),
    gap: spacing(6),
  },
  bootLoading: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 21,
  },
  bootErrorCard: {
    width: "100%",
    maxWidth: 460,
    padding: spacing(5),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    gap: spacing(3),
  },
  bootErrorTitle: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors.brand900 },
  bootErrorDetail: { fontSize: 15, lineHeight: 23, color: colors.neutral700 },
  bootDebug: {
    color: colors.danger700,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "monospace",
  },
});
