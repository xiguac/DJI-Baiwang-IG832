import { useEffect, useState, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./store/auth";
import { LanguageProvider } from "./lib/i18n";
import { AuthenticatedShell } from "./components/shell/AuthenticatedShell";
import { UnauthenticatedShell } from "./components/shell/UnauthenticatedShell";
import { MessageHost } from "./components/ui/message";
import { ConfirmHost } from "./components/ui/MessageBox";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import SmsPage from "./pages/SmsPage";
import NetworkPage from "./pages/NetworkPage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import SystemPage from "./pages/SystemPage";

const THEME_KEY = "theme";

function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [isDark]);
  return { isDark, toggle: () => setIsDark((value) => !value) };
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingScreen />;
  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return children;
}

function LoginLayout({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const { ready, isAuthenticated } = useAuth();
  if (ready && isAuthenticated) return <Navigate to="/" replace />;
  return <UnauthenticatedShell isDark={isDark} onToggleTheme={onToggleTheme} />;
}

function AppRoot() {
  const { isDark, toggle } = useTheme();
  const { ready } = useAuth();

  if (!ready) return <LoadingScreen />;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F4F5F7] font-sans text-xs text-gray-900 transition-colors duration-300 selection:bg-indigo-500 selection:text-white dark:bg-[#101014] dark:text-gray-100">
      <Routes>
        <Route path="/login" element={<LoginLayout isDark={isDark} onToggleTheme={toggle} />}>
          <Route index element={<LoginPage />} />
        </Route>
        <Route
          path="/"
          element={
            <RequireAuth>
              <AuthenticatedShell isDark={isDark} onToggleTheme={toggle} />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="sms" element={<SmsPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="diagnostics" element={<DiagnosticsPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <MessageHost />
        <ConfirmHost />
        <AppRoot />
      </LanguageProvider>
    </AuthProvider>
  );
}
