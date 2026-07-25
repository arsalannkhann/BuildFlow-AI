// Account — profile, language, connection/sync state and safe local cleanup.

import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n, type Language } from "../../src/lib/i18n";
import { useSession } from "../../src/state/session";
import { useSync } from "../../src/state/sync";
import {
  BodyText,
  BrandLockup,
  Card,
  ConnectionPill,
  NoticeCard,
  ScreenIntro,
  SecondaryButton,
  SectionTitle,
  SupportingText,
} from "../../src/ui/components";
import {
  TOUCH_TARGET,
  colors,
  elevation,
  glass,
  layout,
  radius,
  spacing,
  typography,
} from "../../src/ui/theme";

const initialsFor = (name: string): string => {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "BF";
};

export default function AccountScreen() {
  const { t, language, setLanguage } = useI18n();
  const session = useSession();
  const { clearSyncedData, online, refresh, summary } = useSync();
  const router = useRouter();
  const [clearNotice, setClearNotice] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "0.1.0";

  const languageOption = (value: Language, label: string) => {
    const selected = language === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        android_ripple={{ color: colors.brand100 }}
        onPress={() => setLanguage(value)}
        style={({ pressed }) => [
          styles.languageOption,
          selected ? styles.languageOptionSelected : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.languageLabel, selected ? styles.languageLabelSelected : null]}>
          {label}
        </Text>
        {selected ? (
          <Ionicons name="checkmark-circle" size={19} color={colors.surface} />
        ) : null}
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
              setClearBusy(true);
              setClearNotice(null);
              setClearError(null);
              try {
                const { deletedReports } = await clearSyncedData();
                await refresh();
                setClearNotice(
                  deletedReports > 0
                    ? t("account.clearSyncedDone", { count: deletedReports })
                    : t("account.clearSyncedNone"),
                );
              } catch {
                setClearError(t("account.clearSyncedError"));
              } finally {
                setClearBusy(false);
              }
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

  const syncLabel =
    summary.pendingCommands > 0
      ? t("account.pendingCount", { count: summary.pendingCommands })
      : t("account.noPending");

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <BrandLockup />
          <ConnectionPill
            offlineLabel={t("common.offlineShort")}
            online={online}
            onlineLabel={t("common.online")}
          />
        </View>

        <ScreenIntro
          eyebrow={session.me?.organizationName}
          subtitle={t("account.subtitle")}
          title={t("account.heading")}
        />

        {session.me ? (
          <View style={styles.profileCard}>
            <View pointerEvents="none" style={styles.profileRing} />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsFor(session.me.displayName)}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileLabel}>{t("account.signedInAs")}</Text>
              <Text style={styles.profileName}>{session.me.displayName}</Text>
              {session.me.email ? <Text style={styles.profileEmail}>{session.me.email}</Text> : null}
              <Text style={styles.profileOrganization}>{session.me.organizationName}</Text>
            </View>
          </View>
        ) : null}

        <Card style={styles.settingCard}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Ionicons name="sync-outline" size={22} color={colors.brand700} />
            </View>
            <View style={styles.settingHeading}>
              <SectionTitle style={styles.cardTitle}>{t("account.deviceAndSync")}</SectionTitle>
              <SupportingText>{syncLabel}</SupportingText>
            </View>
          </View>
          <View style={styles.syncSummary}>
            <View style={styles.syncSummaryItem}>
              <Text style={styles.syncSummaryValue}>{summary.pendingCommands}</Text>
              <Text style={styles.syncSummaryLabel}>{t("today.onThisDevice")}</Text>
            </View>
            <View style={styles.syncDivider} />
            <View style={styles.syncSummaryItem}>
              <Ionicons
                name={online ? "cloud-done-outline" : "cloud-offline-outline"}
                size={25}
                color={online ? colors.success700 : colors.warning700}
              />
              <Text style={styles.syncSummaryLabel}>
                {online ? t("common.online") : t("common.offlineShort")}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={styles.settingCard}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Ionicons name="language-outline" size={22} color={colors.brand700} />
            </View>
            <SectionTitle style={styles.cardTitle}>{t("account.language")}</SectionTitle>
          </View>
          <View style={styles.languageRow}>
            {languageOption("en", t("account.english"))}
            {languageOption("hi", t("account.hindi"))}
          </View>
        </Card>

        <Card style={styles.productCard}>
          <View style={styles.productIcon}>
            <View style={styles.productBarOne} />
            <View style={styles.productBarTwo} />
            <View style={styles.productBarThree} />
          </View>
          <View style={styles.productCopy}>
            <BodyText strong>{t("account.product")}</BodyText>
            <SupportingText>{t("account.productDetail")}</SupportingText>
            <Text style={styles.versionText}>
              {t("account.version")} · {appVersion}
            </Text>
          </View>
        </Card>

        <SecondaryButton
          icon="log-out-outline"
          label={t("account.signOut")}
          onPress={confirmSignOut}
        />

        <View style={styles.dangerSection}>
          <Text style={styles.dangerEyebrow}>{t("account.dangerZone")}</Text>
          <Card style={styles.dangerCard}>
            <View style={styles.settingHeader}>
              <View style={styles.dangerIcon}>
                <Ionicons name="trash-outline" size={21} color={colors.danger700} />
              </View>
              <View style={styles.settingHeading}>
                <SectionTitle style={styles.dangerTitle}>{t("account.clearSynced")}</SectionTitle>
                <SupportingText>{t("account.clearSyncedHelp")}</SupportingText>
              </View>
            </View>
            <SecondaryButton
              danger
              disabled={clearBusy}
              icon="trash-outline"
              label={clearBusy ? t("account.clearing") : t("account.clearSynced")}
              onPress={confirmClear}
            />
            {clearNotice ? (
              <NoticeCard body={clearNotice} icon="checkmark-circle-outline" tone="success" />
            ) : null}
            {clearError ? (
              <NoticeCard body={clearError} icon="alert-circle-outline" tone="danger" />
            ) : null}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.neutral50 },
  container: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.horizontal,
    paddingTop: spacing(4),
    paddingBottom: spacing(10),
    gap: spacing(5),
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  profileCard: {
    position: "relative",
    minHeight: 190,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
    padding: spacing(5),
    borderRadius: 24,
    backgroundColor: colors.brand900,
    ...elevation.raised,
  },
  profileRing: {
    position: "absolute",
    right: -55,
    bottom: -85,
    width: 190,
    height: 190,
    borderWidth: 28,
    borderColor: "rgba(255,255,255,0.045)",
    borderRadius: 95,
  },
  avatar: {
    zIndex: 1,
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: glass.borderOnDark,
    borderRadius: 22,
    backgroundColor: glass.onDarkStrong,
  },
  avatarText: {
    color: colors.surface,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  profileCopy: { zIndex: 1, flex: 1, minWidth: 0 },
  profileLabel: {
    color: "#EAA071",
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
    textTransform: "uppercase",
  },
  profileName: {
    marginTop: spacing(2),
    color: colors.surface,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  profileEmail: {
    marginTop: spacing(1),
    color: "rgba(255,255,255,0.67)",
    fontSize: 13,
    lineHeight: 19,
  },
  profileOrganization: {
    marginTop: spacing(2),
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  settingCard: { gap: spacing(4) },
  settingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  settingIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.brand50,
  },
  settingHeading: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 18, lineHeight: 24 },
  syncSummary: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing(3),
    borderRadius: radius.control,
    backgroundColor: colors.neutral50,
  },
  syncSummaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(1),
  },
  syncSummaryValue: {
    color: colors.brand900,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  syncSummaryLabel: {
    color: colors.neutral600,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  syncDivider: { width: 1, height: 45, backgroundColor: colors.neutral200 },
  languageRow: { flexDirection: "row", gap: spacing(2) },
  languageOption: {
    minHeight: TOUCH_TARGET,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.control,
    backgroundColor: colors.neutral50,
    paddingHorizontal: spacing(3),
    overflow: "hidden",
  },
  languageOptionSelected: {
    borderColor: colors.brand900,
    backgroundColor: colors.brand900,
  },
  languageLabel: { color: colors.neutral700, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  languageLabelSelected: { color: colors.surface },
  productCard: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  productIcon: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.brand900,
  },
  productBarOne: {
    position: "absolute",
    left: 12,
    bottom: 11,
    width: 5,
    height: 11,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  productBarTwo: {
    position: "absolute",
    left: 21,
    bottom: 11,
    width: 5,
    height: 19,
    borderRadius: 2,
    backgroundColor: colors.surface,
  },
  productBarThree: {
    position: "absolute",
    left: 30,
    bottom: 11,
    width: 5,
    height: 26,
    borderRadius: 2,
    backgroundColor: "#E78B57",
  },
  productCopy: { flex: 1, minWidth: 0 },
  versionText: {
    marginTop: spacing(2),
    color: colors.neutral500,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dangerSection: { marginTop: spacing(3), gap: spacing(2) },
  dangerEyebrow: {
    color: colors.danger700,
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
    textTransform: "uppercase",
  },
  dangerCard: { borderColor: "#F1C8C5", backgroundColor: "#FFFBFA", gap: spacing(4) },
  dangerIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.danger100,
  },
  dangerTitle: { color: colors.danger700, fontSize: 17, lineHeight: 23 },
  pressed: { opacity: 0.82 },
});
