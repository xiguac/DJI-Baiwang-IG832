import { cx } from "../../lib/utils";
import { StatusDot } from "../ui";
import { FieldRow } from "./FieldRow";
import { signalLevel, signalTone, csqToDbm } from "./shared";
import type { PanelStatus } from "../../types";

const BAR_HEIGHTS = ["h-[28%]", "h-[46%]", "h-[64%]", "h-[82%]", "h-full"];
const TEXT_TONE = {
  green: "text-emerald-500 dark:text-emerald-400",
  amber: "text-amber-500 dark:text-amber-400",
  red: "text-red-500 dark:text-red-400",
  gray: "text-gray-400 dark:text-gray-500",
} as const;
const BAR_TONE = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-300 dark:bg-gray-600",
} as const;

// <stat> from CREG/CEREG: 0=not registered 1=home 2=searching 3=denied
// 4=unknown 5=roaming.
function regLabel(stat?: string): string {
  switch (stat) {
    case "1":
      return "已驻网";
    case "5":
      return "已驻网（漫游）";
    case "2":
      return "正在搜索网络";
    case "3":
      return "驻网被拒";
    case "0":
      return "未驻网";
    default:
      return "未知";
  }
}

export function OverviewNetworkCard({ status }: { status: PanelStatus | null }) {
  // Use the packet-switched (CEREG/LTE data) registration as the headline
  // status, not the circuit-switched (CREG) one: this device only does data
  // + SMS-over-PS, and a VoLTE-only SIM (e.g. 中国广电/CBN) is routinely
  // CREG-denied while fully registered and working on CEREG - showing CREG
  // as "驻网被拒" here was actively misleading (signal/data both fine).
  const registered = status?.reg_status_ps === "1" || status?.reg_status_ps === "5";
  const csDenied = registered && status?.reg_status === "3";
  const online = !!status;
  const tone = online ? (registered ? "success" : "warning") : "danger";
  const dbm = csqToDbm(status?.csq_rssi);
  const level = signalLevel(dbm);
  const sigTone = signalTone(dbm);
  // network_mode (from AT+QNWINFO) already reads like "FDD LTE"/"TDD LTE" -
  // it already includes duplex, so don't prepend status.duplex again.
  const netMode = status?.network_mode || "";

  return (
    <>
      <div
        className={cx(
          "mb-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
          registered
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
            : online
              ? "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
              : "border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5",
        )}
      >
        <StatusDot tone={tone} size="sm" animated={registered} />
        <div className="min-w-0 flex-1">
          <div
            className={cx(
              "text-sm font-bold leading-tight",
              registered ? "text-emerald-700 dark:text-emerald-300" : online ? "text-amber-700 dark:text-amber-300" : "text-gray-500 dark:text-gray-400",
            )}
          >
            {registered ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{status?.operator || "--"}</span>
                {status?.network_mode ? <span className="opacity-70">· {netMode}</span> : null}
              </span>
            ) : online ? (
              regLabel(status?.reg_status_ps)
            ) : (
              "离线"
            )}
          </div>
        </div>
      </div>
      <div className="mb-3 rounded-xl border border-gray-200 px-3.5 py-3 dark:border-white/10">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">信号强度</div>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className={cx("text-2xl font-extrabold tabular-nums leading-none", TEXT_TONE[sigTone])}>
                {dbm ?? "--"}
              </span>
              <span className="text-xs text-gray-400">dBm</span>
            </div>
            <div className="mt-1 text-[10px] text-gray-400">
              RSRP {status?.rsrp ?? "--"} · RSRQ {status?.rsrq ?? "--"} · SINR {status?.sinr ?? "--"}
            </div>
          </div>
          <div className="ml-auto flex h-7 items-end gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cx("w-1.5 rounded-sm", BAR_HEIGHTS[i - 1], i <= level ? BAR_TONE[sigTone] : "bg-gray-200 dark:bg-white/10")} />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
        <FieldRow label="网络模式" value={netMode || "--"} monospace />
        <FieldRow label="频段" value={status?.radio_band} monospace />
        <FieldRow label="信道 (EARFCN)" value={status?.earfcn || status?.radio_channel} monospace />
        <FieldRow label="小区 ID" value={status?.cell_id} monospace copyable />
        <FieldRow label="PCI" value={status?.pci} monospace />
        <FieldRow label="TAC" value={status?.tac} monospace />
        <FieldRow label="注册状态 (数据/PS)" value={regLabel(status?.reg_status_ps)} monospace />
        {csDenied ? (
          <FieldRow
            label="注册状态 (语音/CS)"
            value="驻网被拒 — VoLTE-only SIM，不影响数据/短信"
            monospace
          />
        ) : null}
      </div>
    </>
  );
}
