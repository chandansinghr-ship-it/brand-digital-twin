import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  preferencesApi,
  type PreferencesPatch,
  type UserPreferences,
} from "./preferencesApi";

interface PreferencesContextValue {
  preferences: UserPreferences | null;
  loading: boolean;
  unauthorized: boolean;
  needsQuiz: boolean;
  refresh: () => Promise<void>;
  update: (patch: PreferencesPatch) => Promise<UserPreferences | null>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const out = await preferencesApi.get();
      setPreferences(out.preferences);
      setUnauthorized(false);
    } catch (e) {
      if (String(e).includes("401")) setUnauthorized(true);
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(async (patch: PreferencesPatch) => {
    try {
      const out = await preferencesApi.update(patch);
      setPreferences(out.preferences);
      setUnauthorized(false);
      return out.preferences;
    } catch (e) {
      if (String(e).includes("401")) setUnauthorized(true);
      return null;
    }
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      loading,
      unauthorized,
      needsQuiz:
        !unauthorized && !loading && (preferences?.quizCompletedAt ?? null) === null,
      refresh,
      update,
    }),
    [preferences, loading, unauthorized, refresh, update],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
