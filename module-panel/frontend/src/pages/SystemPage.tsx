import { useEffect, useState } from "react";
import { PageHeader, Button, Input, Switch } from "../components/ui";
import { confirmDialog } from "../components/ui/MessageBox";
import { message } from "../components/ui/message";
import { action, changeToken, apiMessage } from "../api";
import type { PanelStatus, TextResult } from "../types";

interface PinStatus {
  pin_saved: boolean;
  sim_state: string;
  attempts_remaining: number | null;
}

export default function SystemPage() {
  const [newToken, setNewToken] = useState("");
  const [confirmToken, setConfirmToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (newToken.length < 8 || newToken.length > 128) {
      message.warning("令牌长度需为 8-128");
      return;
    }
    if (newToken.includes(" ")) {
      message.warning("令牌不能包含空格");
      return;
    }
    if (newToken !== confirmToken) {
      message.warning("两次输入的令牌不一致");
      return;
    }
    setSaving(true);
    try {
      await changeToken(newToken);
      message.success("令牌已更新，请使用新令牌登录");
      setNewToken("");
      setConfirmToken("");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="系统配置" subtitle="访问令牌 · SIM PIN 码 · USB 模式 · 重启" />
      <div className="grid gap-4 md:grid-cols-2">
      <div className="ui-panel-muted p-4">
        <div className="mb-3 text-sm font-bold">访问令牌</div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-gray-500">新令牌 (8-128 位，不含空格)</div>
            <Input type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">确认新令牌</div>
            <Input type="password" value={confirmToken} onChange={(e) => setConfirmToken(e.target.value)} />
          </div>
          <Button variant="primary" loading={saving} onClick={save} className="!border-0">
            保存
          </Button>
        </div>
      </div>
        <PinSettings />
        <UsbModeCard />
        <DeviceInfoCard />
        <div className="md:col-span-2">
          <LogCard />
        </div>
        <RebootCard />
      </div>
    </div>
  );
}

function PinSettings() {
  const [status, setStatus] = useState<PinStatus | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const s = await action<PinStatus>("pin-status");
      setStatus(s);
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function unlock() {
    if (!/^[0-9]{4,8}$/.test(pin)) {
      message.warning("PIN 码应为 4-8 位数字");
      return;
    }
    setBusy(true);
    try {
      await action("pin-unlock", { method: "POST", params: { pin } });
      message.success("PIN 校验成功，已保存，下次开机会自动尝试");
      setPin("");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    try {
      await action("pin-forget", { method: "POST" });
      message.success("已清除保存的 PIN 码");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const locked = status?.sim_state === "SIM PIN";
  const dangerLow = typeof status?.attempts_remaining === "number" && status.attempts_remaining <= 1;

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">SIM PIN 码</div>
      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="text-gray-500">
            SIM 状态：<span className="font-mono">{status?.sim_state ?? "未知"}</span>
            {typeof status?.attempts_remaining === "number" ? (
              <span className={dangerLow ? "ml-2 font-bold text-red-500" : "ml-2"}>
                剩余尝试次数：{status.attempts_remaining}
              </span>
            ) : null}
          </div>
          <div className="text-gray-500">
            已保存密码：{status?.pin_saved ? "是（开机会自动尝试解锁一次）" : "否"}
          </div>
          {dangerLow ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/25 dark:bg-red-500/10">
              只剩 {status?.attempts_remaining} 次尝试机会，输错会导致 SIM 卡被永久锁定（需要 PUK 码才能解锁）。请务必确认密码正确后再输入。
            </div>
          ) : null}
          {locked ? (
            <>
              <div>
                <div className="mb-1 text-xs text-gray-500">输入 PIN 码 (4-8 位数字)</div>
                <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
              </div>
              <Button variant="primary" loading={busy} onClick={unlock} className="!border-0">
                解锁
              </Button>
            </>
          ) : (
            <div className="text-gray-400">SIM 当前不需要 PIN 码。</div>
          )}
          {status?.pin_saved ? (
            <Button variant="text" loading={busy} onClick={forget}>
              清除已保存的密码
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface UsbAutoStatus {
  enabled: boolean;
  last_mode: string | null;
  log_tail: string;
}

function UsbModeCard() {
  const [mode, setMode] = useState<string>("");
  const [auto, setAuto] = useState<UsbAutoStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const m = await action<{ mode: string }>("usbnet-query");
      setMode(m.mode);
      setAuto(await action<UsbAutoStatus>("usbauto-status"));
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function switchTo(target: "rndis" | "ecm") {
    const ok = await confirmDialog(
      "切换 USB 模式会重启整个模块，面板连接将中断，约 15 秒后恢复。确认切换？",
      "切换 USB 模式",
      { confirmText: "切换并重启", cancelText: "取消", type: "warning" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await action("usbnet-set", { method: "POST", params: { mode: target } });
      message.success("已下发，模块正在重启");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAuto(next: boolean) {
    try {
      await action(next ? "usbauto-enable" : "usbauto-disable", { method: "POST" });
      setAuto(await action<UsbAutoStatus>("usbauto-status"));
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">USB 模式</div>
      <div className="mb-3 text-sm text-gray-500">
        当前：<span className="font-mono">{mode ? mode.toUpperCase() : "读取中"}</span>
      </div>
      <div className="flex gap-2">
        <Button variant={mode === "rndis" ? "primary" : "default"} loading={busy} disabled={mode === "rndis"} onClick={() => void switchTo("rndis")}>
          RNDIS (电脑)
        </Button>
        <Button variant={mode === "ecm" ? "primary" : "default"} loading={busy} disabled={mode === "ecm"} onClick={() => void switchTo("ecm")}>
          ECM (手机)
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm dark:border-white/10">
        <div>
          <div>开机自动协商 USB 模式</div>
          <div className="text-xs text-gray-400">下次开机时是否运行自动切换脚本</div>
        </div>
        <Switch checked={auto?.enabled ?? false} disabled={!auto} onChange={(v) => void toggleAuto(v)} ariaLabel="开机自动协商 USB 模式" />
      </div>
    </div>
  );
}

function RebootCard() {
  const [busy, setBusy] = useState(false);

  async function reboot() {
    const ok = await confirmDialog("确认重启模块？面板将断开约 15-30 秒。", "重启模块", {
      confirmText: "重启",
      cancelText: "取消",
      type: "warning",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await action("reboot", { method: "POST" });
      message.success("模块正在重启");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-panel-muted border-red-200 p-4 dark:border-red-500/30">
      <div className="mb-1 text-sm font-bold text-red-600 dark:text-red-400">危险操作</div>
      <div className="mb-3 text-xs text-gray-500">重启整个模块，期间网络和面板都会中断。</div>
      <Button variant="danger" plain loading={busy} onClick={() => void reboot()}>
        重启模块
      </Button>
    </div>
  );
}

function DeviceInfoCard() {
  const [st, setSt] = useState<PanelStatus | null>(null);

  useEffect(() => {
    action<PanelStatus>("status")
      .then(setSt)
      .catch((err) => message.error(apiMessage(err)));
  }, []);

  const sec = parseInt(st?.uptime_s ?? "", 10);
  const uptime = Number.isFinite(sec)
    ? `${Math.floor(sec / 86400)} 天 ${Math.floor((sec % 86400) / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`
    : "--";
  const rows: [string, string][] = [
    ["型号", st?.model || "--"],
    ["固件版本", st?.fw_rev || "--"],
    ["运行时间", uptime],
  ];
  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">设备信息</div>
      <div className="divide-y divide-slate-100 text-xs dark:divide-white/10">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-1.5">
            <span className="text-slate-500">{k}</span>
            <span className="break-all text-right font-mono">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogCard() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const res = await action<TextResult>("syslog");
      setText(res.output);
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
        <div className="text-xs font-bold">系统日志</div>
        <Button size="small" loading={busy} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] text-gray-700 dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
        {text || "暂无日志"}
      </pre>
    </div>
  );
}
