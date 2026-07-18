// Session state: token in SecureStore, /me cached in SQLite for offline start.

import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { meResponse } from "@buildflow/contracts/v1";
import { fetchMe, login, type Me } from "../lib/api-client";
import {
  ME_CACHE_SETTING_KEY,
  SELECTED_PROJECT_SETTING_KEY,
  SESSION_TOKEN_KEY,
} from "../lib/config";
import { useServices } from "./services";
import { useSync } from "./sync";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

interface SessionState {
  status: SessionStatus;
  me: Me | null;
  selectedProjectId: string | null;
}

type SessionAction =
  | { type: "restored"; me: Me | null; hasToken: boolean; selectedProjectId: string | null }
  | { type: "signed-in"; me: Me }
  | { type: "me-refreshed"; me: Me }
  | { type: "project-selected"; projectId: string }
  | { type: "signed-out" };

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "restored":
      return {
        status: action.hasToken ? "signed-in" : "signed-out",
        me: action.me,
        selectedProjectId: action.selectedProjectId,
      };
    case "signed-in":
      return {
        status: "signed-in",
        me: action.me,
        selectedProjectId: action.me.projects[0]?.id ?? null,
      };
    case "me-refreshed":
      return { ...state, me: action.me };
    case "project-selected":
      return { ...state, selectedProjectId: action.projectId };
    case "signed-out":
      return { status: "signed-out", me: null, selectedProjectId: null };
    default:
      return state;
  }
}

export interface SessionApi extends SessionState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectProject: (projectId: string) => void;
  selectedProject: Me["projects"][number] | null;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider(props: { children: ReactNode }) {
  const { sql, apiBaseUrl } = useServices();
  const sync = useSync();
  const [state, dispatch] = useReducer(reducer, {
    status: "loading",
    me: null,
    selectedProjectId: null,
  });

  // Restore session on start: token from SecureStore, /me from the SQLite
  // cache so the Today screen works offline, then refresh in the background.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
      let me: Me | null = null;
      const cached = await sql.getSetting(ME_CACHE_SETTING_KEY);
      if (cached) {
        const parsed = meResponse.safeParse(JSON.parse(cached));
        if (parsed.success) me = parsed.data;
      }
      const selectedProjectId =
        (await sql.getSetting(SELECTED_PROJECT_SETTING_KEY)) ?? me?.projects[0]?.id ?? null;
      if (cancelled) return;
      dispatch({ type: "restored", me, hasToken: token !== null, selectedProjectId });

      if (token) {
        try {
          const fresh = await fetchMe(apiBaseUrl, token);
          await sql.setSetting(ME_CACHE_SETTING_KEY, JSON.stringify(fresh));
          if (!cancelled) dispatch({ type: "me-refreshed", me: fresh });
        } catch {
          // Offline or expired — the sync engine surfaces auth problems.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sql, apiBaseUrl]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await login(apiBaseUrl, email, password);
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, result.token);
      const me = await fetchMe(apiBaseUrl, result.token);
      await sql.setSetting(ME_CACHE_SETTING_KEY, JSON.stringify(me));
      const firstProject = me.projects[0]?.id;
      if (firstProject) await sql.setSetting(SELECTED_PROJECT_SETTING_KEY, firstProject);
      dispatch({ type: "signed-in", me });
      // A paused queue (401) resumes now that a fresh token exists.
      void sync.resumeAfterAuth();
    },
    [apiBaseUrl, sql, sync],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    // Local drafts stay on the device by design (offline-first); only the
    // session and cached profile go.
    await sql.setSetting(ME_CACHE_SETTING_KEY, "");
    dispatch({ type: "signed-out" });
  }, [sql]);

  const selectProject = useCallback(
    (projectId: string) => {
      dispatch({ type: "project-selected", projectId });
      void sql.setSetting(SELECTED_PROJECT_SETTING_KEY, projectId);
    },
    [sql],
  );

  const selectedProject = useMemo(() => {
    if (!state.me) return null;
    return state.me.projects.find((p) => p.id === state.selectedProjectId) ?? state.me.projects[0] ?? null;
  }, [state.me, state.selectedProjectId]);

  const api = useMemo<SessionApi>(
    () => ({ ...state, signIn, signOut, selectProject, selectedProject }),
    [state, signIn, signOut, selectProject, selectedProject],
  );

  return <SessionContext.Provider value={api}>{props.children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}
