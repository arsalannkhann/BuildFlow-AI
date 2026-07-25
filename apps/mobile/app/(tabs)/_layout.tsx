// Tab navigation: Today, Reports, Account (design.md §5 — max four primary
// destinations; capture stays a prominent action on Today, not a fifth tab).

import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Platform } from "react-native";
import { useI18n } from "../../src/lib/i18n";
import { useSession } from "../../src/state/session";
import { colors, elevation } from "../../src/ui/theme";

export default function TabsLayout() {
  const { t } = useI18n();
  const session = useSession();

  if (session.status === "loading") return null; // root layout already showed boot UI
  if (session.status === "signed-out") return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.brand900,
        tabBarInactiveTintColor: colors.neutral500,
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 15,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarItemStyle: {
          minHeight: 56,
          paddingVertical: 4,
        },
        tabBarStyle: {
          minHeight: Platform.OS === "android" ? 72 : 78,
          paddingTop: 7,
          paddingBottom: Platform.OS === "android" ? 9 : 7,
          borderTopWidth: 1,
          borderTopColor: "rgba(11,34,51,0.09)",
          backgroundColor: colors.surface,
          ...elevation.floating,
        },
        sceneStyle: { backgroundColor: colors.neutral50 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("today.title"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "today" : "today-outline"} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("reports.title"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "document-text" : "document-text-outline"} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("account.title"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={23} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
