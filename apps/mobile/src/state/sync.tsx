// Sync state for the UI: engine summary, connectivity, and drain triggers.
// React context + reducer only — no state-management library (rules).

import NetInfo from "@react-native-community/netinfo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { SyncEngine } from "../lib/sync/engine";
import type { CaptureInput, SyncSummary } from "../lib/sync/types";
import { useServices } from "./services";

interface SyncState {
  online: boolean;
  summary: SyncSummary;
}

type SyncAction =
  | { type: "summary"; summary: SyncSummary }
  | { type: "online"; online: boolean };

const initialState: SyncState = {
  online: true,
  summary: { pendingCommands: 0, authRequired: false, reports: [] },
};

function reducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "summary":
      return { ...state, summary: action.summary };
    case "online":
      return { ...state, online: action.online };
    default:
      return state;
  }
}

export interface SyncApi extends SyncState {
  engine: SyncEngine;
  submitCapture: (input: CaptureInput) => Promise<{ clientReportId: string }>;
  saveDraft: (input: CaptureInput) => Promise<{ clientReportId: string }>;
  submitDraft: (clientReportId: string) => Promise<void>;
  retryReport: (clientReportId: string) => Promise<void>;
  clearSyncedData: () => Promise<{ deletedReports: number }>;
  resumeAfterAuth: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SyncContext = createContext<SyncApi | null>(null);

const DRAIN_INTERVAL_MS = 30_000;

export function SyncProvider(props: { children: ReactNode }) {
  const { engine } = useServices();
  const [state, dispatch] = useReducer(reducer, initialState);

  const refresh = useCallback(async () => {
    const summary = await engine.getSummary();
    dispatch({ type: "summary", summary });
  }, [engine]);

  // Engine state changes → UI summary.
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      void refresh();
    });
    void refresh();
    void engine.drain(); // resume queue from wherever SQLite left it
    return unsubscribe;
  }, [engine, refresh]);

  // Connectivity changes → drain when the network returns.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const online = netState.isConnected === true;
      dispatch({ type: "online", online });
      if (online) void engine.drain();
    });
    return unsubscribe;
  }, [engine]);

  // Gentle periodic retry while work is pending (backoff between drains).
  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        const summary = await engine.getSummary();
        if (summary.pendingCommands > 0 && !summary.authRequired) void engine.drain();
      })();
    }, DRAIN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [engine]);

  const api = useMemo<SyncApi>(
    () => ({
      ...state,
      engine,
      submitCapture: async (input) => {
        const result = await engine.submitCapture(input);
        void engine.drain(); // background; the ack already happened locally
        return result;
      },
      saveDraft: (input) => engine.saveDraft(input),
      submitDraft: async (clientReportId) => {
        await engine.submitDraft(clientReportId);
        void engine.drain();
      },
      retryReport: async (clientReportId) => {
        await engine.retryReport(clientReportId);
        void engine.drain();
      },
      clearSyncedData: () => engine.clearSyncedData(),
      resumeAfterAuth: async () => {
        await engine.resumeAfterAuth();
      },
      refresh,
    }),
    [state, engine, refresh],
  );

  return <SyncContext.Provider value={api}>{props.children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  const sync = useContext(SyncContext);
  if (!sync) throw new Error("useSync must be used inside SyncProvider");
  return sync;
}
