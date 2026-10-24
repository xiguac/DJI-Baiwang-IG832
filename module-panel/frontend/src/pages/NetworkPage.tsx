import { useEffect, useState } from "react";
import { PageHeader, Button, Input, Select, Switch } from "../components/ui";
import { confirmDialog } from "../components/ui/MessageBox";
import { message } from "../components/ui/message";
import { action, apiMessage } from "../api";
import CellPage from "./CellPage";
import { BandCard, OperatorCard } from "./NetworkCards";

export default function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="网络设置" subtitle="网络参数 · APN · 选网 · 频段 · DNS · 小区扫描与锁频" />
        <NetworkSettings />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <OperatorCard />
          <BandCard />
        </div>
      </div>
      <CellPage />
    </div>
  );
}

function NetworkSettings() {
  const [apn, setApn] = useState("");
  const [iptype, setIptype] = useState("IPV4V6");
  const [auth, setAuth] = useState("0");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dns1, setDns1] = useState("");
  const [dns2, setDns2] = useState("");
  const [apnBusy, setApnBusy] = useState(false);
  const [dnsBusy, setDnsBusy] = useState(false);

  useEffect(() => {
    action<{ apn: string; iptype: string; auth: number | null }>("apn-get")
      .then((cur) => {
        setApn(cur.apn);
        if (["IP", "IPV6", "IPV4V6"].includes(cur.iptype)) setIptype(cur.iptype);
        if (cur.auth !== null) setAuth(String(cur.auth));
      })
      .catch((err) => message.error(apiMessage(err)));
    action<{ output: string }>("dns-query")
      .then((cur) => {
        const servers = cur.output.replace(/^\s*\+SYSDNS:/, "").trim().split(/\s+/).filter((s) => s && s !== "-");
        setDns1(servers[0] ?? "");
        setDns2(servers[1] ?? "");
      })
      .catch((err) => message.error(apiMessage(err)));
  }, []);

  async function saveApn() {
    if (!apn.trim()) {
      message.warning("请输入 APN");
      return;
    }
    if (auth !== "0" && !username.trim() && !password) {
      message.warning("已选择认证方式，请填写用户名和密码");
      return;
    }
    setApnBusy(true);
    try {
      await action("apn-set", {
        method: "POST",
        params: {
          apn: apn.trim(),
          iptype,
          auth,
          username: auth === "0" ? undefined : username.trim(),
          password: auth === "0" ? undefined : password,
        },
      });
      message.success("APN 已下发，可能需要重启模块或重新附着网络才会生效");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setApnBusy(false);
    }
  }

  async function saveDns() {
    if (!dns1.trim()) {
      message.warning("请至少填写一个首选 DNS");
      return;
    }
    setDnsBusy(true);
    try {
      await action("dns-set", { method: "POST", params: { dns1: dns1.trim(), dns2: dns2.trim() || undefined } });
      message.success("DNS 已更新");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setDnsBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NetParams />
      <div className="ui-panel-muted p-4">
        <div className="mb-3 text-sm font-bold">APN (接入点)</div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-gray-500">APN 名称</div>
            <Input value={apn} onChange={(e) => setApn(e.target.value)} placeholder="例如 cmnet" />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">IP 类型</div>
            <Select
              value={iptype}
              onChange={setIptype}
              options={[
                { value: "IPV4V6", label: "IPV4V6" },
                { value: "IP", label: "IPV4" },
                { value: "IPV6", label: "IPV6" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">认证方式</div>
            <Select
              value={auth}
              onChange={setAuth}
              options={[
                { value: "0", label: "无" },
                { value: "1", label: "PAP" },
                { value: "2", label: "CHAP" },
                { value: "3", label: "PAP 或 CHAP" },
              ]}
            />
          </div>
          {auth !== "0" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs text-gray-500">用户名</div>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-500">密码</div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          ) : null}
          {auth !== "0" ? <div className="text-[11px] text-gray-400">用户名和密码写入后模块不会回读，下次打开需要重新填写。</div> : null}
          <Button variant="primary" loading={apnBusy} onClick={saveApn} className="!border-0">
            保存 APN
          </Button>
        </div>
      </div>
      <div className="ui-panel-muted p-4">
        <div className="mb-3 text-sm font-bold">DNS</div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-gray-500">首选 DNS</div>
            <Input value={dns1} onChange={(e) => setDns1(e.target.value)} placeholder="例如 8.8.8.8" />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">备用 DNS (可选)</div>
            <Input value={dns2} onChange={(e) => setDns2(e.target.value)} placeholder="例如 223.5.5.5" />
          </div>
          <Button variant="primary" loading={dnsBusy} onClick={saveDns} className="!border-0">
            保存 DNS
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NetSettings {
  nwscanmode: number | null;
  roamservice: number | null;
  ims: number | null;
  qcautoconnect: number | null;
}

// Values follow AT+QCFG on this module: nwscanmode 0=自动 3=仅 LTE,
// roamservice 1=关 2=开 255=自动, ims 0=关 1=开 2=自动, qcautoconnect 0/1.
function NetParams() {
  const [cfg, setCfg] = useState<NetSettings | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCfg(await action<NetSettings>("net-settings"));
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function apply(key: keyof NetSettings, value: number, warn?: string) {
    if (warn) {
      const ok = await confirmDialog(warn, "修改网络参数", { confirmText: "确认修改", cancelText: "取消", type: "warning" });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await action("net-settings-set", { method: "POST", params: { key, value } });
      message.success("已保存");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">网络参数</div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs text-gray-500">网络模式</div>
          <Select
            value={cfg?.nwscanmode == null ? undefined : String(cfg.nwscanmode)}
            placeholder={cfg ? "读取失败" : "读取中..."}
            disabled={busy || cfg?.nwscanmode == null}
            onChange={(v) => void apply("nwscanmode", Number(v), "切换网络模式会让模块重新搜网，数据连接可能短暂中断。确认修改？")}
            options={[
              { value: "0", label: "自动" },
              { value: "3", label: "仅 LTE" },
              ...(cfg?.nwscanmode != null && ![0, 3].includes(cfg.nwscanmode)
                ? [{ value: String(cfg.nwscanmode), label: `当前值 ${cfg.nwscanmode}`, disabled: true }]
                : []),
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">数据漫游</div>
          <Select
            value={cfg?.roamservice == null ? undefined : String(cfg.roamservice)}
            placeholder={cfg ? "读取失败" : "读取中..."}
            disabled={busy || cfg?.roamservice == null}
            onChange={(v) => void apply("roamservice", Number(v))}
            options={[
              { value: "255", label: "自动" },
              { value: "2", label: "开启" },
              { value: "1", label: "关闭" },
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">IMS (VoLTE)</div>
          <Select
            value={cfg?.ims == null ? undefined : String(cfg.ims)}
            placeholder={cfg ? "读取失败" : "读取中..."}
            disabled={busy || cfg?.ims == null}
            onChange={(v) => void apply("ims", Number(v), "IMS 设置会影响短信和语音通道，修改后可能需要重启模块才生效。确认修改？")}
            options={[
              { value: "0", label: "关闭" },
              { value: "1", label: "开启" },
              { value: "2", label: "自动" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <div>开机自动拨号</div>
            <div className="text-xs text-gray-400">模块上电后自动建立数据连接</div>
          </div>
          <Switch
            checked={cfg?.qcautoconnect === 1}
            disabled={busy || cfg?.qcautoconnect == null}
            onChange={(v) => void apply("qcautoconnect", v ? 1 : 0)}
            ariaLabel="开机自动拨号"
          />
        </div>
      </div>
    </div>
  );
}
