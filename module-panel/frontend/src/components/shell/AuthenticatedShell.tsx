import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BoardRegular,
  GlobeRegular,
  MailRegular,
  WindowConsoleRegular,
  SettingsRegular,
  SignOutRegular,
  PowerRegular,
} from "@fluentui/react-icons";
import { useAuth } from "../../store/auth";
import { action, apiMessage } from "../../api";
import { message } from "../ui/message";
import { confirmDialog } from "../ui/MessageBox";
import { SwitchDark } from "../ui/SwitchDark";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { cx } from "../../lib/utils";
import { BrandLogo } from "./BrandLogo";

const NAV = [
  { to: "/", label: "状态监控", short: "状态", icon: BoardRegular, end: true },
  { to: "/network", label: "网络设置", short: "网络", icon: GlobeRegular },
  { to: "/sms", label: "短信管理", short: "短信", icon: MailRegular },
  { to: "/diagnostics", label: "设备诊断", short: "诊断", icon: WindowConsoleRegular },
  { to: "/system", label: "系统配置", short: "系统", icon: SettingsRegular },
];

// Desktop (>=768px): fixed 200px flat sidebar. Mobile: compact top bar + bottom tab bar.
export function AuthenticatedShell({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  async function onLogout() {
    const ok = await confirmDialog("确认退出登录？", "提示", {
      confirmText: "退出",
      cancelText: "取消",
      type: "warning",
    });
    if (ok) {
      logout();
      navigate("/login");
    }
  }

  async function onReboot() {
    const ok = await confirmDialog("确认重启模块？面板将断开约 15-30 秒。", "重启设备", {
      confirmText: "重启",
      cancelText: "取消",
      type: "warning",
    });
    if (!ok) return;
    try {
      await action("reboot", { method: "POST" });
      message.success("模块正在重启");
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  const logoutButton = (
    <button
      type="button"
      onClick={onLogout}
      aria-label="退出登录"
      title="退出登录"
      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
    >
      <SignOutRegular className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <div className="flex h-full">
      <aside className="sidebar-shell hidden h-full w-[200px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-white/10 dark:bg-[#17171c] md:flex">
        <div className="flex h-14 items-center px-4">
          <BrandLogo className="sidebar-brand-logo" />
          <div className="ml-3">
            <div className="sidebar-brand-title">模块面板</div>
            <div className="text-[10px] font-medium leading-tight tracking-wide text-gray-400 dark:text-gray-500">DJI/Baiwang 4G</div>
          </div>
        </div>
        <nav className="sidebar-menu mt-2" aria-label="主导航">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx("panel-menu-item", isActive && "is-active")}
              >
                <span className="panel-menu-icon">
                  <Icon />
                </span>
                <span className="sidebar-menu-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-white/10 dark:bg-[#17171c] sm:px-5">
          <div className="flex items-center gap-3">
            <BrandLogo className="sidebar-brand-logo md:hidden" />
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">4G LTE USB 管理平台</h1>
            <div className="hidden h-3.5 w-px bg-slate-200 dark:bg-white/10 sm:block" />
            <span className="hidden text-xs text-slate-500 sm:inline">{current?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <SwitchDark isDark={isDark} onToggle={onToggleTheme} />
            {logoutButton}
            <button
              type="button"
              onClick={() => void onReboot()}
              className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <PowerRegular className="text-[14px]" />
              <span className="hidden sm:inline">重启设备</span>
            </button>
          </div>
        </header>
        <main className={cx("flex-1 overflow-auto bg-[#F4F5F7] dark:bg-[#101014]", location.pathname.startsWith("/sms") ? "pb-[56px] md:pb-0" : "p-4 pb-[calc(56px+1.5rem)] sm:p-6 md:pb-6")}>
          <div className="main-inner mx-auto w-full">
            <ErrorBoundary title="页面渲染失败">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <nav className="bottom-tabbar md:hidden" aria-label="主导航">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx(isActive && "is-active")}
            >
              <Icon />
              <span>{item.short}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
