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
import { colors } from "../src/ui/theme";

export default function RootLayout() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

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
  }, []);

  if (bootError) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootErrorTitle}>BuildFlow could not start</Text>
        <Text style={styles.bootErrorDetail}>{bootError}</Text>
      </View>
    );
  }

  if (!services) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.brand700} />
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
                contentStyle: { backgroundColor: colors.neutral50 },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="capture" options={{ presentation: "modal", headerShown: false }} />
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
    backgroundColor: colors.neutral50,
    padding: 24,
    gap: 12,
  },
  bootErrorTitle: { fontSize: 18, fontWeight: "600", color: colors.neutral950 },
  bootErrorDetail: { fontSize: 14, color: colors.neutral700, textAlign: "center" },
});
