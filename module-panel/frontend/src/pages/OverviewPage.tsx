import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRegular,
  ArrowUpRegular,
  CellularData1Regular,
  ChatRegular,
  EyeOffRegular,
  EyeRegular,
  GlobeRegular,
  LinkRegular,
  SearchRegular,
  SimRegular,
  TopSpeedRegular,
  WindowConsoleRegular,
  WifiSettingsRegular,
} from "@fluentui/react-icons";
import { Badge, Card, KV, KVList, Metric } from "../components/flat";
import { csqToDbm, signalLevel, useShowSensitive } from "../components/overview/shared";
import { usePolling } from "../lib/usePolling";
import { cx, formatBytes } from "../lib/utils";
import { lookupCarrier } from "../lib/carrier";
import { action, apiMessage } from "../api";
import { message } from "../components/ui/message";
import type { PanelStatus, TrafficReport } from "../types";

interface Sample {
  t: number;
  rxBps: number;
  txBps: number;
}

const MAX_SAMPLES = 60;
const BAR_H = ["h-2", "h-3.5", "h-5", "h-6"];

function qualityOf(rsrp: number | null): { label: string; tone: "green" | "amber" | "red" | "slate"; hint: string } {
  if (rsrp === null) return { label: "--", tone: "slate", hint: "暂无信号数据" };
  if (rsrp >= -85) return { label: "优", tone: "green", hint: "信号强度良好" };
  if (rsrp >= -100) return { label: "良", tone: "amber", hint: "信号一般" };
  return { label: "差", tone: "red", hint: "信号较弱" };
}

function num(v?: string): number | null {
  if (v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function formatUptime(s?: string): string {
  const sec = parseInt(s ?? "", 10);
  if (!Number.isFinite(sec) || sec < 0) return "--";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d} 天 ${h} 小时` : h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`;
}

function regLabel(stat?: string): string {
  switch (stat) {
    case "1":
      return "已驻网";
    case "5":
      return "已驻网 (漫游)";
    case "2":
      return "正在搜索";
    case "3":
      return "驻网被拒";
    case "0":
      return "未驻网";
    default:
      return "未知";
  }
}

export default function OverviewPage() {
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [traffic, setTraffic] = useState<TrafficReport | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const errorShown = useRef(false);
  const [showSensitive, toggleSensitive] = useShowSensitive();

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await action<PanelStatus>("status"));
      setUpdatedAt(Date.now());
      errorShown.current = false;
    } catch (err) {
      if (!errorShown.current) {
        message.error(apiMessage(err));
        errorShown.current = true;
      }
    }
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const result = await action<TrafficReport>("traffic");
      setTraffic(result);
      setHistory((prev) => {
        const next = [...prev, { t: Date.now(), rxBps: result.total.rx_bps, txBps: result.total.tx_bps }];
        return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next;
      });
    } catch {
      /* transient; next poll retries */
    }
  }, []);

  usePolling(() => void loadStatus(), 5000);
  usePolling(() => void loadTraffic(), 2000);

  const rsrp = num(status?.rsrp);
  const quality = qualityOf(rsrp);
  const bars = signalLevel(csqToDbm(status?.csq_rssi) ?? rsrp);
  const barCount = Math.min(4, Math.max(0, Math.round((bars / 5) * 4)));
  const registered = status?.reg_status_ps === "1" || status?.reg_status_ps === "5";
  const csDenied = registered && status?.reg_status === "3";
  const carrier = lookupCarrier(status?.imsi);
  const total = traffic?.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">状态监控</h2>
        {status ? (
          <>
            <Badge tone={registered ? "green" : "amber"} dot>
              {registered ? "已驻网" : regLabel(status.reg_status_ps)}
            </Badge>
            <Badge mono>已运行 {formatUptime(status.uptime_s)}</Badge>
          </>
        ) : null}
        <span className="ml-auto font-mono text-[11px] text-slate-400">
          {updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString()}` : "加载中..."}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          icon={<CellularData1Regular />}
          title="信号质量"
          badge={<Badge tone={quality.tone}>{quality.label === "--" ? "无信号" : quality.label}</Badge>}
          footer={
            <>
              <span>{quality.hint}</span>
              <span className="font-mono text-[10px] text-slate-400">RSRP 判定</span>
            </>
          }
        >
          <div className="my-4 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{quality.label}</span>
              <span className="font-mono text-xs text-slate-500">{status?.rat || status?.network_mode || "--"}</span>
            </div>
            <div className="flex h-6 items-end gap-1">
              {BAR_H.map((h, i) => (
                <div key={i} className={cx("w-1.5", h, i < barCount ? "bg-blue-600" : "bg-slate-200 dark:bg-white/15")} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/10">
            <Metric label="RSRP (参考信号功率)" value={status?.rsrp || "--"} unit="dBm" />
            <Metric label="RSRQ (接收质量)" value={status?.rsrq || "--"} unit="dB" />
            <Metric label="SINR (信噪比)" value={status?.sinr || "--"} unit="dB" />
            <Metric label="RSSI (信号强度)" value={status?.rssi || "--"} unit="dBm" />
          </div>
        </Card>

        <Card
          icon={<WifiSettingsRegular />}
          title="蜂窝网络信息"
          badge={status?.plmn ? <Badge tone="blue" mono>PLMN {status.plmn}</Badge> : undefined}
          footer={
            <>
              <span>双工模式: {status?.duplex || "--"}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">TAC {status?.tac || "--"}</span>
            </>
          }
        >
          <KVList>
            <KV label="网络制式" value={status?.network_mode || status?.rat} />
            <KV label="工作频段" value={status?.radio_band} />
            <KV label="运营商" value={carrier?.name || status?.operator} mono={false} />
            <KV label="物理小区 ID (PCI)" value={status?.pci} />
            <KV label="频点编号 (EARFCN)" value={status?.earfcn || status?.radio_channel} />
            <KV label="小区 ID (Cell ID)" value={status?.cell_id} copy />
          </KVList>
        </Card>

        <Card
          icon={<LinkRegular />}
          title="数据连接"
          badge={
            <Badge tone={registered ? "green" : status ? "amber" : "slate"} dot>
              {status ? (registered ? "已联网" : regLabel(status.reg_status_ps)) : "--"}
            </Badge>
          }
          footer={
            <>
              <span>型号: {status?.model || "--"}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">{status?.fw_rev || ""}</span>
            </>
          }
        >
          <KVList>
            <KV label="本地 IPv4 地址" value={status?.local_ip} copy />
            <KV label="主/副 DNS" value={status?.dns} copy />
            <KV label="注册状态 (数据/PS)" value={regLabel(status?.reg_status_ps)} mono={false} />
            <KV
              label="注册状态 (语音/CS)"
              value={csDenied ? "被拒 (VoLTE-only SIM，不影响数据)" : regLabel(status?.reg_status)}
              mono={false}
            />
          </KVList>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          icon={<TopSpeedRegular />}
          title="流量与实时速率"
          badge={
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
              <span className="inline-flex items-center">
                <span className="mr-1.5 h-0.5 w-2 bg-blue-600" />
                下行 (RX)
              </span>
              <span className="inline-flex items-center">
                <span className="mr-1.5 h-0.5 w-2 bg-slate-400" />
                上行 (TX)
              </span>
            </div>
          }
          footer={
            <>
              <span>
                累计下载 <span className="font-mono font-medium text-slate-800 dark:text-slate-100">{formatBytes(total?.cum_rx ?? 0)}</span>
              </span>
              <span>
                累计上传 <span className="font-mono font-medium text-slate-800 dark:text-slate-100">{formatBytes(total?.cum_tx ?? 0)}</span>
              </span>
            </>
          }
        >
          <div className="my-4 grid grid-cols-2 gap-3">
            <Metric
              large
              tone="blue"
              label="当前下行速率"
              value={
                <span className="inline-flex items-center">
                  <ArrowDownRegular className="mr-0.5 text-[14px]" />
                  {formatBytes(total?.rx_bps ?? 0)}/s
                </span>
              }
            />
            <Metric
              large
              label="当前上行速率"
              value={
                <span className="inline-flex items-center">
                  <ArrowUpRegular className="mr-0.5 text-[14px]" />
                  {formatBytes(total?.tx_bps ?? 0)}/s
                </span>
              }
            />
          </div>
          <SpeedChart samples={history} />
        </Card>

        <div className="space-y-4">
          <Card
            icon={<SimRegular />}
            title="SIM 卡与设备信息"
            badge={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSensitive}
                  title={showSensitive ? "隐藏敏感信息" : "显示敏感信息"}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showSensitive ? <EyeRegular className="text-[16px]" /> : <EyeOffRegular className="text-[16px]" />}
                </button>
                <Badge tone={status?.sim_state === "READY" ? "green" : "amber"} mono>
                  {status?.sim_state || "--"}
                </Badge>
              </div>
            }
          >
            <KVList>
              <KV label="IMEI" value={status?.imei} sensitive copy />
              <KV label="ICCID" value={status?.iccid} sensitive copy />
              <KV label="IMSI" value={status?.imsi} sensitive copy />
              <KV label="运营商" value={carrier?.name || status?.operator} mono={false} />
            </KVList>
          </Card>

          <Card icon={<GlobeRegular />} title="快捷操作">
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuickLink to="/sms" icon={<ChatRegular />} label="发送短信" />
              <QuickLink to="/network" icon={<SearchRegular />} label="扫描小区" />
              <QuickLink to="/network" icon={<WifiSettingsRegular />} label="APN / 锁频" />
              <QuickLink to="/diagnostics" icon={<WindowConsoleRegular />} label="网络诊断" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:border-blue-600 hover:text-blue-600 dark:border-white/10 dark:text-slate-200"
    >
      <span className="flex text-[16px]">{icon}</span>
      {label}
    </Link>
  );
}

// Flat two-line SVG chart: hairline grid, square joins, no gradient fill.
function SpeedChart({ samples }: { samples: Sample[] }) {
  if (samples.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded border border-slate-100 text-xs text-slate-400 dark:border-white/10">
        采样中...
      </div>
    );
  }
  const max = Math.max(1024, ...samples.map((s) => Math.max(s.rxBps, s.txBps)));
  const pts = (pick: (s: Sample) => number) =>
    samples
      .map((s, i) => {
        const x = (i / (MAX_SAMPLES - 1)) * 500;
        const y = 98 - (pick(s) / max) * 94;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  // Right-align so new samples enter from the right edge.
  const shift = 500 - ((samples.length - 1) / (MAX_SAMPLES - 1)) * 500;
  return (
    <div className="rounded border border-slate-100 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-slate-400">
        <span>实时吞吐量 (最近约 2 分钟)</span>
        <span>峰值: {formatBytes(max)}/s</span>
      </div>
      <div className="relative h-28 w-full">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="h-0 w-full border-b border-dashed border-slate-100 dark:border-white/10" />
          <div className="h-0 w-full border-b border-dashed border-slate-100 dark:border-white/10" />
          <div className="h-0 w-full border-b border-dashed border-slate-100 dark:border-white/10" />
          <div className="h-0 w-full border-b border-slate-200 dark:border-white/15" />
        </div>
        <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 100">
          <g transform={`translate(${shift} 0)`}>
            <polyline fill="none" points={pts((s) => s.rxBps)} stroke="#2563EB" strokeWidth="1.75" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
            <polyline fill="none" points={pts((s) => s.txBps)} stroke="#94A3B8" strokeWidth="1.25" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 font-mono text-[10px] text-slate-400 dark:border-white/10">
        <span>-2 分钟</span>
        <span>-1 分钟</span>
        <span>实时</span>
      </div>
    </div>
  );
}
