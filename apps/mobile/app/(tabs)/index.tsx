// Today — current project, today's report state, the primary Record update
// action, sync status line, and pending local drafts with file progress.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../../src/lib/i18n";
import { describeLocalReport } from "../../src/lib/report-status";
import type { DraftSummary } from "../../src/lib/sync/types";
import { useSession } from "../../src/state/session";
import { useSync } from "../../src/state/sync";
import {
  BodyText,
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusChip,
  SupportingText,
} from "../../src/ui/components";
import { colors, radius, spacing, typography } from "../../src/ui/theme";

const todayIsoDate = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

function DraftRow(props: { draft: DraftSummary }) {
  const { draft } = props;
  const { t } = useI18n();
  const { online, submitDraft, retryReport } = useSync();
  const descriptor = describeLocalReport(draft, online);

  return (
    <Card style={styles.draftCard}>
      <View style={styles.draftHeader}>
        <BodyText strong>{draft.reportDate}</BodyText>
        <StatusChip
          icon={descriptor.icon}
          label={t(descriptor.key, descriptor.params)}
          tone={descriptor.tone}
        />
      </View>
      <SupportingText>
        {t("today.filesProgress", { done: draft.uploadedFiles, total: draft.totalFiles })}
      </SupportingText>
      {draft.note ? <SupportingText numberOfLines={1}>{draft.note}</SupportingText> : null}
      {draft.status === "failed" ? (
        <View style={styles.failureBlock}>
          <SupportingText style={{ color: colors.danger700 }}>
            {draft.lastError ?? t("status.needsAttention")}
          </SupportingText>
          <SupportingText>{t("status.dataSafe")}</SupportingText>
          <SecondaryButton label={t("common.retry")} onPress={() => void retryReport(draft.clientReportId)} />
        </View>
      ) : null}
      {draft.status === "draft" ? (
        <SecondaryButton
          label={t("today.submitDraft")}
          onPress={() => void submitDraft(draft.clientReportId)}
        />
      ) : null}
    </Card>
  );
}

export default function TodayScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const { online, summary } = useSync();

  const project = session.selectedProject;
  const today = todayIsoDate();
  const localDrafts = summary.reports.filter(
    (r) => r.status !== "synced" || r.serverStatus === "PROCESSING" || r.serverStatus === "SYNCING",
  );
  const todayReport = summary.reports.find((r) => r.reportDate === today);

  // One line answering "what is happening now?" (design.md §7).
  const statusLine = (() => {
    if (summary.authRequired) return null; // dedicated banner below
    const active =
      summary.reports.find((r) => r.status === "syncing") ??
      summary.reports.find((r) => r.status === "queued") ??
      todayReport;
    if (!active) return online ? null : t("common.offline");
    const descriptor = describeLocalReport(active, online);
    return t(descriptor.key, descriptor.params);
  })();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Project + date context */}
      <Card>
        <SupportingText>{t("today.project")}</SupportingText>
        {project ? (
          <>
            <BodyText strong>{project.name}</BodyText>
            {project.clientName ? <SupportingText>{project.clientName}</SupportingText> : null}
          </>
        ) : (
          <BodyText>{t("today.noProject")}</BodyText>
        )}
        <SupportingText>{today}</SupportingText>
        {session.me && session.me.projects.length > 1 ? (
          <View style={styles.projectPicker}>
            {session.me.projects.map((candidate) => {
              const selected = candidate.id === project?.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={candidate.name}
                  key={candidate.id}
                  onPress={() => session.selectProject(candidate.id)}
                  style={[styles.projectOption, selected ? styles.projectOptionSelected : null]}
                >
                  <Text
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
          </View>
        ) : null}
      </Card>

      {/* Session expired → calm, actionable banner (401 pauses the queue). */}
      {summary.authRequired ? (
        <Card style={styles.authCard}>
          <BodyText>{t("today.sessionExpired")}</BodyText>
          <SecondaryButton
            label={t("today.signInAgain")}
            onPress={() => {
              void session.signOut();
              router.replace("/sign-in");
            }}
          />
        </Card>
      ) : null}

      {/* Today's report expectation */}
      <BodyText muted>
        {todayReport ? t("today.reportStarted") : t("today.reportPending")}
      </BodyText>

      {/* THE primary action — the only accent-colored control in the app. */}
      <PrimaryButton
        accent
        icon={<Ionicons name="mic" size={24} color={colors.surface} />}
        label={t("today.recordUpdate")}
        onPress={() => router.push("/capture")}
        style={styles.recordButton}
      />

      {/* Sync status line */}
      {statusLine ? (
        <View accessibilityLiveRegion="polite" style={styles.statusLine}>
          <SupportingText style={styles.statusLineText}>{statusLine}</SupportingText>
        </View>
      ) : summary.pendingCommands === 0 && summary.reports.length > 0 ? (
        <View style={styles.statusLine}>
          <SupportingText style={styles.statusLineText}>{t("today.allSynced")}</SupportingText>
        </View>
      ) : null}

      {/* Pending local drafts */}
      {localDrafts.length > 0 ? (
        <View style={styles.draftsBlock}>
          <Text accessibilityRole="header" style={styles.draftsTitle}>
            {t("today.onThisDevice")}
          </Text>
          {localDrafts.map((draft) => (
            <DraftRow draft={draft} key={draft.clientReportId} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(4) },
  projectPicker: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginTop: spacing(2) },
  projectOption: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing(4),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
  },
  projectOptionSelected: { backgroundColor: colors.brand100, borderColor: colors.brand700 },
  projectOptionLabel: { fontSize: 16, color: colors.neutral700 },
  projectOptionLabelSelected: { color: colors.brand700, fontWeight: "600" },
  authCard: { backgroundColor: colors.warning100, borderColor: colors.warning700 },
  recordButton: { minHeight: 64 },
  statusLine: {
    backgroundColor: colors.brand100,
    borderRadius: radius.control,
    padding: spacing(3),
  },
  statusLineText: { color: colors.brand700, fontWeight: "600" },
  draftsBlock: { gap: spacing(3) },
  draftsTitle: {
    fontSize: typography.cardTitle.fontSize,
    lineHeight: typography.cardTitle.lineHeight,
    fontWeight: "600",
    color: colors.neutral950,
  },
  draftCard: { gap: spacing(2) },
  draftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
  },
  failureBlock: { gap: spacing(2) },
});
