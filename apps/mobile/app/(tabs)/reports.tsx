// Reports — server reports (GET /api/v1/reports) merged with local pending
// drafts. Status chips are icon + label, never color-only.

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { fetchReports, type ServerReport } from "../../src/lib/api-client";
import { SESSION_TOKEN_KEY } from "../../src/lib/config";
import { useI18n } from "../../src/lib/i18n";
import {
  describeLocalReport,
  describeServerStatus,
  type StatusDescriptor,
} from "../../src/lib/report-status";
import { useServices } from "../../src/state/services";
import { useSession } from "../../src/state/session";
import { useSync } from "../../src/state/sync";
import {
  BodyText,
  Card,
  SecondaryButton,
  StatusChip,
  SupportingText,
} from "../../src/ui/components";
import { colors, radius, spacing } from "../../src/ui/theme";

interface ReportListItem {
  id: string;
  reportDate: string;
  note: string | null;
  descriptor: StatusDescriptor;
  source: "local" | "server";
  fileLine?: string;
}

export default function ReportsScreen() {
  const { t } = useI18n();
  const { apiBaseUrl } = useServices();
  const session = useSession();
  const { online, summary } = useSync();

  const [serverReports, setServerReports] = useState<ServerReport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const projectId = session.selectedProject?.id;

  const load = useCallback(
    async (cursor?: string) => {
      const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
      if (!token) return;
      setLoading(true);
      try {
        const page = await fetchReports(apiBaseUrl, token, {
          ...(projectId ? { projectId } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setServerReports((existing) => (cursor ? [...existing, ...page.reports] : page.reports));
        setNextCursor(page.nextCursor);
        setLoadFailed(false);
      } catch {
        // Offline is a state, not an error — keep showing local data calmly.
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, projectId],
  );

  useEffect(() => {
    if (online) void load();
  }, [load, online]);

  // Local pending work first, then server history (deduped by server id).
  const localItems: ReportListItem[] = summary.reports
    .filter((r) => r.status !== "synced")
    .map((r) => ({
      id: `local-${r.clientReportId}`,
      reportDate: r.reportDate,
      note: r.note,
      descriptor: describeLocalReport(r, online),
      source: "local",
      fileLine: t("today.filesProgress", { done: r.uploadedFiles, total: r.totalFiles }),
    }));
  const unsyncedServerIds = new Set(
    summary.reports
      .filter((r) => r.status !== "synced" && r.serverReportId !== null)
      .map((r) => r.serverReportId),
  );
  const serverItems: ReportListItem[] = serverReports
    .filter((r) => !unsyncedServerIds.has(r.id))
    .map((r) => ({
      id: `server-${r.id}`,
      reportDate: r.reportDate,
      note: r.note,
      descriptor: describeServerStatus(r.status),
      source: "server",
    }));
  const items = [...localItems, ...serverItems];

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        loadFailed ? (
          <View style={styles.noticeBox}>
            <SupportingText style={{ color: colors.warning700 }}>
              {t("reports.loadError")}
            </SupportingText>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Card>
          <BodyText muted>{t("reports.empty")}</BodyText>
        </Card>
      }
      renderItem={({ item }) => (
        <Card style={styles.row}>
          <View style={styles.rowHeader}>
            <BodyText strong>{item.reportDate}</BodyText>
            <StatusChip
              icon={item.descriptor.icon}
              label={t(item.descriptor.key, item.descriptor.params)}
              tone={item.descriptor.tone}
            />
          </View>
          {item.note ? <SupportingText numberOfLines={2}>{item.note}</SupportingText> : null}
          {item.fileLine ? <SupportingText>{item.fileLine}</SupportingText> : null}
          <SupportingText style={{ color: colors.neutral500 }}>
            {item.source === "local" ? t("reports.onThisDevice") : t("reports.fromServer")}
          </SupportingText>
        </Card>
      )}
      ListFooterComponent={
        nextCursor ? (
          <SecondaryButton
            disabled={loading}
            label={t("reports.loadMore")}
            onPress={() => void load(nextCursor)}
            style={styles.loadMore}
          />
        ) : null
      }
      refreshing={loading}
      onRefresh={() => void load()}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(3) },
  noticeBox: {
    backgroundColor: colors.warning100,
    borderRadius: radius.control,
    padding: spacing(3),
  },
  row: { gap: spacing(2) },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    flexWrap: "wrap",
  },
  loadMore: { marginTop: spacing(2) },
});
