// App-wide service container: opens the SQLite store and builds the sync
// engine once, before any screen renders.

import { createContext, useContext, type ReactNode } from "react";
import { API_BASE_URL } from "../lib/config";
import type { Language } from "../lib/i18n";
import { LANGUAGE_SETTING_KEY, isLanguage } from "../lib/i18n";
import type { SyncEngine } from "../lib/sync/engine";
import { createExpoSyncServices, type ExpoSqlAdapter } from "../lib/sync/expo-adapters";

export interface AppServices {
  engine: SyncEngine;
  sql: ExpoSqlAdapter;
  apiBaseUrl: string;
  initialLanguage: Language;
}

export async function bootServices(): Promise<AppServices> {
  const { engine, sql } = await createExpoSyncServices(API_BASE_URL);
  const storedLanguage = await sql.getSetting(LANGUAGE_SETTING_KEY);
  return {
    engine,
    sql,
    apiBaseUrl: API_BASE_URL,
    initialLanguage: isLanguage(storedLanguage) ? storedLanguage : "en",
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider(props: { services: AppServices; children: ReactNode }) {
  return (
    <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>
  );
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside ServicesProvider");
  return services;
}
