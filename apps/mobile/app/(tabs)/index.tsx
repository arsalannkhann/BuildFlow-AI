// Today — the field engineer's project context, report state, capture action
// and honest offline/sync feedback.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n, type Language } from "../../src/lib/i18n";
import { describeLocalReport } from "../../src/lib/report-status";
import type { DraftSummary } from "../../src/lib/sync/types";
import { useSession } from "../../src/state/session";
import { useSync } from "../../src/state/sync";
import {
  BodyText,
  BrandLockup,
  Card,
  ConnectionPill,
  EmptyState,
  NoticeCard,
  SecondaryButton,
  StatusChip,
  SupportingText,
} from "../../src/ui/components";
import {
  TOUCH_TARGET,
  colors,
  elevation,
  layout,
  radius,
  spacing,
  typography,
} from "../../src/ui/theme";

const todayIsoDate = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const formatToday = (language: Language): string =>
  new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

function DraftRow(props: { draft: DraftSummary }) {
  const { draft } = props;
  const { t } = useI18n();
  const { online, submitDraft, retryReport } = useSync();
  const descriptor = describeLocalReport(draft, online);
  const progress =
    draft.totalFiles > 0 ? Math.min(1, draft.uploadedFiles / draft.totalFiles) : 0;

  return (
    <Card style={styles.draftCard}>
      <View style={styles.draftHeader}>
        <View style={styles.draftIdentity}>
          <View style={styles.documentIcon}>
            <Ionicons name="document-text-outline" size={21} color={colors.brand700} />
          </View>
          <View style={styles.draftIdentityCopy}>
            <BodyText strong>{draft.reportDate}</BodyText>
            <SupportingText>
              {t("today.filesProgress", { done: draft.uploadedFiles, total: draft.totalFiles })}
            </SupportingText>
          </View>
        </View>
        <StatusChip
          icon={descriptor.icon}
          label={t(descriptor.key, descriptor.params)}
          tone={descriptor.tone}
        />
      </View>

      {draft.totalFiles > 0 ? (
        <View
          accessible
          accessibilityLabel={t("today.filesProgress", {
            done: draft.uploadedFiles,
            total: draft.totalFiles,
          })}
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      {draft.note ? <SupportingText numberOfLines={2}>{draft.note}</SupportingText> : null}

      {draft.status === "failed" ? (
        <View style={styles.failureBlock}>
          <NoticeCard
            body={`${draft.lastError ?? t("status.needsAttention")} ${t("status.dataSafe")}`}
            icon="alert-circle-outline"
            tone="danger"
          />
          <SecondaryButton
            icon="refresh"
            label={t("common.retry")}
            onPress={() => void retryReport(draft.clientReportId)}
          />
        </View>
      ) : null}

      {draft.status === "draft" ? (
        <SecondaryButton
          icon="paper-plane-outline"
          label={t("today.submitDraft")}
          onPress={() => void submitDraft(draft.clientReportId)}
        />
      ) : null}
    </Card>
  );
}

export default function TodayScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const session = useSession();
  const { online, summary } = useSync();

  const project = session.selectedProject;
  const today = todayIsoDate();
  const localDrafts = summary.reports.filter(
    (report) =>
      report.status !== "synced" ||
      report.serverStatus === "PROCESSING" ||
      report.serverStatus === "SYNCING",
  );
  const todayReport = summary.reports.find((report) => report.reportDate === today);
  const todayDescriptor = todayReport ? describeLocalReport(todayReport, online) : null;

  const syncBody = !online
    ? t("common.offline")
    : summary.pendingCommands > 0
      ? t("today.syncQueue", { count: summary.pendingCommands })
      : t("today.noPendingSync");

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

        <View style={styles.projectCard}>
          <View pointerEvents="none" style={styles.projectRing} />
          <View style={styles.projectTop}>
            <Text style={styles.projectEyebrow}>{t("today.siteRecord")}</Text>
            <Text style={styles.projectDate}>{formatToday(language)}</Text>
          </View>
          {project ? (
            <>
              <Text style={styles.projectName}>{project.name}</Text>
              {project.clientName ? (
                <Text style={styles.projectClient}>{project.clientName}</Text>
              ) : null}
              <View style={styles.reportState}>
                <View
                  style={[
                    styles.reportStateIcon,
                    todayReport ? styles.reportStateIconActive : null,
                  ]}
                >
                  <Ionicons
                    name={todayReport ? "checkmark" : "time-outline"}
                    size={18}
                    color={todayReport ? colors.success700 : colors.accent700}
                  />
                </View>
                <View style={styles.reportStateCopy}>
                  <Text style={styles.reportStateLabel}>
                    {todayReport ? t("today.reportStarted") : t("today.reportPending")}
                  </Text>
                  {todayDescriptor ? (
                    <Text style={styles.reportStateDetail}>
                      {t(todayDescriptor.key, todayDescriptor.params)}
                    </Text>
                  ) : (
                    <Text style={styles.reportStateDetail}>{today}</Text>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noProjectCopy}>
              <Text style={styles.projectName}>{t("today.fieldWorkspace")}</Text>
              <Text style={styles.projectClient}>{t("today.noProject")}</Text>
            </View>
          )}
        </View>

        {session.me && session.me.projects.length > 1 ? (
          <View style={styles.projectPickerBlock}>
            <Text style={styles.sectionLabel}>{t("today.project")}</Text>
            <ScrollView
              horizontal
              contentContainerStyle={styles.projectPicker}
              showsHorizontalScrollIndicator={false}
            >
              {session.me.projects.map((candidate) => {
                const selected = candidate.id === project?.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={candidate.name}
                    android_ripple={{ color: colors.brand100 }}
                    key={candidate.id}
                    onPress={() => session.selectProject(candidate.id)}
                    style={({ pressed }) => [
                      styles.projectOption,
                      selected ? styles.projectOptionSelected : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Ionicons
                      name={selected ? "business" : "business-outline"}
                      size={17}
                      color={selected ? colors.surface : colors.brand700}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.projectOptionLabel,
                        selected ? styles.projectOptionLabelSelected : null,
                      ]}
                    >
                      {candidate.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {project ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("today.recordUpdate")}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            onPress={() => router.push("/capture")}
            style={({ pressed }) => [
              styles.captureAction,
              pressed ? styles.captureActionPressed : null,
            ]}
          >
            <View style={styles.captureIcon}>
              <Ionicons name="mic" size={26} color={colors.surface} />
            </View>
            <View style={styles.captureCopy}>
              <Text style={styles.captureTitle}>{t("today.recordUpdate")}</Text>
              <Text style={styles.captureHint}>{t("today.captureHint")}</Text>
            </View>
            <Ionicons name="arrow-forward" size={23} color={colors.surface} />
          </Pressable>
        ) : (
          <EmptyState
            body={t("today.noProject")}
            icon="business-outline"
            title={t("today.fieldWorkspace")}
          />
        )}

        {summary.authRequired ? (
          <NoticeCard
            actionLabel={t("today.signInAgain")}
            body={t("today.sessionExpired")}
            icon="key-outline"
            onAction={() => {
              void session.signOut();
              router.replace("/sign-in");
            }}
            tone="warning"
          />
        ) : (
          <NoticeCard
            body={syncBody}
            icon={
              !online
                ? "cloud-offline-outline"
                : summary.pendingCommands > 0
                  ? "sync"
                  : "cloud-done-outline"
            }
            tone={!online ? "warning" : summary.pendingCommands > 0 ? "info" : "success"}
          />
        )}

        {localDrafts.length > 0 ? (
          <View style={styles.draftsBlock}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionLabel}>{t("today.onThisDevice")}</Text>
                <Text accessibilityRole="header" style={styles.draftsTitle}>
                  {t("today.localWork", { count: localDrafts.length })}
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{localDrafts.length}</Text>
              </View>
            </View>
            {localDrafts.map((draft) => (
              <DraftRow draft={draft} key={draft.clientReportId} />
            ))}
          </View>
        ) : null}
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
  projectCard: {
    position: "relative",
    minHeight: 280,
    overflow: "hidden",
    padding: spacing(5),
    borderRadius: 26,
    backgroundColor: colors.brand900,
    ...elevation.raised,
  },
  projectRing: {
    position: "absolute",
    right: -75,
    bottom: -100,
    width: 230,
    height: 230,
    borderWidth: 32,
    borderColor: "rgba(255,255,255,0.045)",
    borderRadius: 115,
  },
  projectTop: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  projectEyebrow: {
    flex: 1,
    color: "#F0A578",
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
    textTransform: "uppercase",
  },
  projectDate: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  projectName: {
    zIndex: 1,
    maxWidth: "88%",
    marginTop: spacing(7),
    color: colors.surface,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  projectClient: {
    zIndex: 1,
    maxWidth: "82%",
    marginTop: spacing(2),
    color: "rgba(255,255,255,0.66)",
    fontSize: 14,
    lineHeight: 21,
  },
  reportState: {
    zIndex: 1,
    marginTop: "auto",
    paddingTop: spacing(6),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  reportStateIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.accent100,
  },
  reportStateIconActive: { backgroundColor: colors.success100 },
  reportStateCopy: { flex: 1, minWidth: 0 },
  reportStateLabel: {
    color: colors.surface,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  reportStateDetail: {
    marginTop: 2,
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    lineHeight: 17,
  },
  noProjectCopy: { zIndex: 1, flex: 1 },
  projectPickerBlock: { gap: spacing(2) },
  projectPicker: { gap: spacing(2), paddingRight: spacing(5) },
  projectOption: {
    minHeight: TOUCH_TARGET,
    maxWidth: 230,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    paddingHorizontal: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  projectOptionSelected: {
    borderColor: colors.brand900,
    backgroundColor: colors.brand900,
  },
  projectOptionLabel: {
    flexShrink: 1,
    color: colors.neutral700,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  projectOptionLabelSelected: { color: colors.surface },
  sectionLabel: {
    color: colors.neutral500,
    fontSize: typography.overline.fontSize,
    lineHeight: typography.overline.lineHeight,
    fontWeight: "800",
    letterSpacing: typography.overline.letterSpacing,
    textTransform: "uppercase",
  },
  captureAction: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    padding: spacing(4),
    borderRadius: 20,
    backgroundColor: colors.accent600,
    overflow: "hidden",
    ...elevation.raised,
  },
  captureActionPressed: { opacity: 0.9 },
  captureIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.23)",
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  captureCopy: { flex: 1, minWidth: 0 },
  captureTitle: {
    color: colors.surface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  captureHint: {
    marginTop: 2,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  draftsBlock: { marginTop: spacing(2), gap: spacing(3) },
  sectionHeading: {
    marginBottom: spacing(1),
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  draftsTitle: {
    marginTop: spacing(1),
    color: colors.brand900,
    fontSize: typography.sectionTitle.fontSize,
    lineHeight: typography.sectionTitle.lineHeight,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.brand100,
  },
  countBadgeText: {
    color: colors.brand700,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  draftCard: { gap: spacing(3) },
  draftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing(3),
    flexWrap: "wrap",
  },
  draftIdentity: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  documentIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.brand50,
  },
  draftIdentityCopy: { flex: 1, minWidth: 0 },
  progressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: colors.neutral100,
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.brand700,
  },
  failureBlock: { gap: spacing(3) },
  pressed: { opacity: 0.82 },
});
