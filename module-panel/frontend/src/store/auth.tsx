import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api";

interface AuthContextValue {
  ready: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!api.getToken()) {
      setAuthenticated(false);
      setReady(true);
      return;
    }
    const ok = await api.authCheck();
    setAuthenticated(ok);
    setReady(true);
  }, []);

  const login = useCallback(async (token: string) => {
    api.setToken(token);
    const ok = await api.authCheck();
    setAuthenticated(ok);
    if (!ok) api.setToken("");
    return ok;
  }, []);

  const logout = useCallback(() => {
    api.setToken("");
    setAuthenticated(false);
  }, []);

  useEffect(() => {
    const unauthorized = () => setAuthenticated(false);
    window.addEventListener("panel:unauthorized", unauthorized);
    return () => window.removeEventListener("panel:unauthorized", unauthorized);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ ready, isAuthenticated: authenticated, login, logout, refresh }),
    [ready, authenticated, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
