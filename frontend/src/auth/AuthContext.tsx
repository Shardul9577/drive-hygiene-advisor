import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  googleConfigured: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Fetch separately so a session miss never hides OAuth status.
      const status = await api.getAuthStatus();
      setGoogleConfigured(status.googleConfigured);
    } catch {
      setGoogleConfigured(false);
    }

    try {
      const me = await api.getMe();
      setUser(me.authenticated ? me.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const loginWithGoogle = useCallback(() => {
    window.location.href = api.googleLoginUrl();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      googleConfigured,
      refresh,
      logout,
      loginWithGoogle,
    }),
    [user, loading, googleConfigured, refresh, logout, loginWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
