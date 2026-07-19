// Account — language toggle (en/hi), sign out, app version, and the
// "clear synced local data" danger action (deletes only fully-synced drafts).

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n, type Language } from "../../src/lib/i18n";
import { useSession } from "../../src/state/session";
import { useSync } from "../../src/state/sync";
import {
  BodyText,
  Card,
  SecondaryButton,
  SectionTitle,
  SupportingText,
} from "../../src/ui/components";
import { TOUCH_TARGET, colors, radius, spacing } from "../../src/ui/theme";

export default function AccountScreen() {
  const { t, language, setLanguage } = useI18n();
  const session = useSession();
  const { clearSyncedData, refresh } = useSync();
  const router = useRouter();
  const [clearNotice, setClearNotice] = useState<string | null>(null);

  const appVersion = Constants.expoConfig?.version ?? "0.1.0";

  const languageOption = (value: Language, label: string) => {
    const selected = language === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPress={() => setLanguage(value)}
        style={[styles.languageOption, selected ? styles.languageOptionSelected : null]}
      >
        <Text
          style={[styles.languageLabel, selected ? styles.languageLabelSelected : null]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const confirmClear = () => {
    Alert.alert(
      t("account.clearSyncedConfirmTitle"),
      t("account.clearSyncedConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.ok"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { deletedReports } = await clearSyncedData();
              await refresh();
              setClearNotice(
                deletedReports > 0
                  ? t("account.clearSyncedDone", { count: deletedReports })
                  : t("account.clearSyncedNone"),
              );
            })();
          },
        },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert(t("account.signOutConfirmTitle"), t("account.signOutConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.signOut"),
        onPress: () => {
          void (async () => {
            await session.signOut();
            router.replace("/sign-in");
          })();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {session.me ? (
        <Card>
          <SupportingText>{t("account.signedInAs")}</SupportingText>
          <BodyText strong>{session.me.displayName}</BodyText>
          {session.me.email ? <SupportingText>{session.me.email}</SupportingText> : null}
          <SupportingText>{session.me.organizationName}</SupportingText>
        </Card>
      ) : null}

      <Card>
        <SectionTitle style={styles.cardTitle}>{t("account.language")}</SectionTitle>
        <View style={styles.languageRow}>
          {languageOption("en", t("account.english"))}
          {languageOption("hi", t("account.hindi"))}
        </View>
      </Card>

      <Card>
        <SupportingText>{t("account.version")}</SupportingText>
        <BodyText strong>{appVersion}</BodyText>
      </Card>

      <Card style={styles.aboutCard}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Tenvor"
          source={require("../../assets/wordmark.png")}
          style={styles.aboutWordmark}
          resizeMode="contain"
        />
        <BodyText strong>{t("account.builtBy")}</BodyText>
        <SupportingText>{t("account.builtByDetail")}</SupportingText>
      </Card>

      <SecondaryButton label={t("account.signOut")} onPress={confirmSignOut} />

      <Card style={styles.dangerCard}>
        <SectionTitle style={styles.dangerTitle}>{t("account.dangerZone")}</SectionTitle>
        <SupportingText>{t("account.clearSyncedHelp")}</SupportingText>
        <SecondaryButton danger label={t("account.clearSynced")} onPress={confirmClear} />
        {clearNotice ? (
          <View accessibilityLiveRegion="polite">
            <SupportingText>{clearNotice}</SupportingText>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(4) },
  cardTitle: { fontSize: 18, lineHeight: 26 },
  languageRow: { flexDirection: "row", gap: spacing(2) },
  languageOption: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET * 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing(4),
  },
  languageOptionSelected: { backgroundColor: colors.brand100, borderColor: colors.brand700 },
  languageLabel: { fontSize: 16, color: colors.neutral700 },
  languageLabelSelected: { color: colors.brand700, fontWeight: "600" },
  aboutCard: { alignItems: "center", gap: spacing(2) },
  aboutWordmark: { width: 160, height: 56 },
  dangerCard: { borderColor: colors.danger100 },
  dangerTitle: { fontSize: 18, lineHeight: 26, color: colors.danger700 },
});
