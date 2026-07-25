// Reports — server records merged with durable local work, with functional
// views for attention and on-device items.

import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchReports, type ServerReport } from "../../src/lib/api-client";
import { SESSION_TOKEN_KEY } from "../../src/lib/config";
import { useI18n, type Language } from "../../src/lib/i18n";
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
  BrandLockup,
  Card,
  ConnectionPill,
  EmptyState,
  FilterChip,
  NoticeCard,
  ScreenIntro,
  SecondaryButton,
  StatusChip,
  SupportingText,
} from "../../src/ui/components";
import {
  colors,
  layout,
  radius,
  spacing,
  typography,
} from "../../src/ui/theme";

interface ReportListItem {
  id: string;
  reportDate: string;
  note: string | null;
  descriptor: StatusDescriptor;
  source: "local" | "server";
  fileLine?: string;
}

type ReportFilter = "all" | "attention" | "device";

const formatReportDate = (value: string, language: Language): string => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

export default function ReportsScreen() {
  const { t, language } = useI18n();
  const { apiBaseUrl } = useServices();
  const router = useRouter();
  const session = useSession();
  const { online, summary } = useSync();

  const [serverReports, setServerReports] = useState<ServerReport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>("all");

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

  const items = useMemo(() => {
    const localItems: ReportListItem[] = summary.reports
      .filter((report) => report.status !== "synced")
      .map((report) => ({
        id: `local-${report.clientReportId}`,
        reportDate: report.reportDate,
        note: report.note,
        descriptor: describeLocalReport(report, online),
        source: "local",
        fileLine: t("today.filesProgress", {
          done: report.uploadedFiles,
          total: report.totalFiles,
        }),
      }));
    const unsyncedServerIds = new Set(
      summary.reports
        .filter((report) => report.status !== "synced" && report.serverReportId !== null)
        .map((report) => report.serverReportId),
    );
    const serverItems: ReportListItem[] = serverReports
      .filter((report) => !unsyncedServerIds.has(report.id))
      .map((report) => ({
        id: `server-${report.id}`,
        reportDate: report.reportDate,
        note: report.note,
        descriptor: describeServerStatus(report.status),
        source: "server",
      }));

    return [...localItems, ...serverItems].sort((left, right) => {
      const dateOrder = right.reportDate.localeCompare(left.reportDate);
      if (dateOrder !== 0) return dateOrder;
      return left.source === "local" ? -1 : 1;
    });
  }, [online, serverReports, summary.reports, t]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "device") return item.source === "local";
        if (filter === "attention") {
          return item.descriptor.tone === "danger" || item.descriptor.tone === "warning";
        }
        return true;
      }),
    [filter, items],
  );

  const renderItem = ({ item }: { item: ReportListItem }) => (
    <Card style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.dateBlock}>
          <View style={styles.reportIcon}>
            <Ionicons
              name={item.source === "local" ? "phone-portrait-outline" : "document-text-outline"}
              size={21}
              color={colors.brand700}
            />
          </View>
          <View style={styles.dateCopy}>
            <BodyText strong>{formatReportDate(item.reportDate, language)}</BodyText>
            <View style={styles.sourceLine}>
              <Ionicons
                name={item.source === "local" ? "phone-portrait-outline" : "cloud-done-outline"}
                size={13}
                color={colors.neutral500}
              />
              <Text style={styles.sourceText}>
                {item.source === "local" ? t("reports.onThisDevice") : t("reports.fromServer")}
              </Text>
            </View>
          </View>
        </View>
        <StatusChip
          icon={item.descriptor.icon}
          label={t(item.descriptor.key, item.descriptor.params)}
          tone={item.descriptor.tone}
        />
      </View>
      {item.note ? <SupportingText numberOfLines={3}>{item.note}</SupportingText> : null}
      {item.fileLine ? (
        <View style={styles.fileLine}>
          <Ionicons name="attach-outline" size={16} color={colors.neutral500} />
          <SupportingText>{item.fileLine}</SupportingText>
        </View>
      ) : null}
    </Card>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.topBar}>
          <BrandLockup />
          <ConnectionPill
            offlineLabel={t("common.offlineShort")}
            online={online}
            onlineLabel={t("common.online")}
          />
        </View>
        <ScreenIntro
          eyebrow={session.selectedProject?.name ?? t("today.fieldWorkspace")}
          subtitle={t("reports.subtitle")}
          title={t("reports.heading")}
        />
      </View>

      <FlatList
        contentContainerStyle={[
          styles.container,
          filteredItems.length === 0 ? styles.containerEmpty : null,
        ]}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.filters}>
              <FilterChip
                label={t("reports.filterAll")}
                onPress={() => setFilter("all")}
                selected={filter === "all"}
              />
              <FilterChip
                label={t("reports.filterAttention")}
                onPress={() => setFilter("attention")}
                selected={filter === "attention"}
              />
              <FilterChip
                label={t("reports.filterDevice")}
                onPress={() => setFilter("device")}
                selected={filter === "device"}
              />
            </View>
            {loadFailed ? (
              <NoticeCard
                actionLabel={t("common.retry")}
                body={t("reports.loadError")}
                icon="cloud-offline-outline"
                onAction={() => void load()}
                tone="warning"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading && items.length === 0 ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.brand700} />
              <SupportingText>{t("common.loading")}</SupportingText>
            </View>
          ) : (
            <EmptyState
              actionLabel={filter === "all" ? t("today.recordUpdate") : undefined}
              body={filter === "all" ? t("reports.empty") : t("reports.emptyFilter")}
              icon={filter === "all" ? "document-text-outline" : "filter-outline"}
              onAction={filter === "all" ? () => router.push("/capture") : undefined}
              title={filter === "all" ? t("reports.emptyTitle") : t("reports.emptyFilter")}
            />
          )
        }
        ListFooterComponent={
          nextCursor && filter === "all" ? (
            <SecondaryButton
              disabled={loading}
              icon="chevron-down"
              label={t("reports.loadMore")}
              onPress={() => void load(nextCursor)}
              style={styles.loadMore}
            />
          ) : (
            <View style={styles.footerSpace} />
          )
        }
        onRefresh={online ? () => void load() : undefined}
        refreshing={online && loading}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.neutral50 },
  header: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.horizontal,
    paddingTop: spacing(4),
    paddingBottom: spacing(4),
    gap: spacing(6),
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
  },
  container: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.horizontal,
    paddingBottom: spacing(8),
    gap: spacing(3),
  },
  containerEmpty: { flexGrow: 1 },
  listHeader: { gap: spacing(4), marginBottom: spacing(2) },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(2),
  },
  row: { gap: spacing(3) },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing(3),
    flexWrap: "wrap",
  },
  dateBlock: {
    flex: 1,
    minWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  reportIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.brand50,
  },
  dateCopy: { flex: 1, minWidth: 0 },
  sourceLine: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
  },
  sourceText: {
    color: colors.neutral500,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  fileLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
  },
  loadingState: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(4),
  },
  loadMore: { marginTop: spacing(3) },
  footerSpace: { height: spacing(4) },
});
