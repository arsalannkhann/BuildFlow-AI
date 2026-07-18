// Tab navigation: Today, Reports, Account (design.md §5 — max four primary
// destinations; capture stays a prominent action on Today, not a fifth tab).

import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useI18n } from "../../src/lib/i18n";
import { useSession } from "../../src/state/session";
import { colors } from "../../src/ui/theme";

export default function TabsLayout() {
  const { t } = useI18n();
  const session = useSession();

  if (session.status === "loading") return null; // root layout already showed boot UI
  if (session.status === "signed-out") return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand900 },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.neutral500,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: { backgroundColor: colors.surface, height: 64, paddingBottom: 8 },
        sceneStyle: { backgroundColor: colors.neutral50 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("today.title"),
          tabBarIcon: ({ color }) => <Ionicons name="sunny-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("reports.title"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="document-text-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("account.title"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle-outline" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
