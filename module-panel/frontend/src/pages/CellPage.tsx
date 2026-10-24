import { useState } from "react";
import { LockClosedRegular, LockOpenRegular, ArrowSyncRegular } from "@fluentui/react-icons";
import { PageHeader, Button, Input, EmptyState, ListSkeleton } from "../components/ui";
import { message } from "../components/ui/message";
import { confirmDialog } from "../components/ui/MessageBox";
import { cx } from "../lib/utils";
import { action, apiMessage } from "../api";
import type { ScanResult, ServingCell, NeighbourCell } from "../types";

type SignalLevel = "excellent" | "good" | "fair" | "poor" | "unknown";

const LEVEL_CLASS: Record<SignalLevel, string> = {
  excellent: "text-emerald-600 dark:text-emerald-400",
  good: "text-lime-600 dark:text-lime-400",
  fair: "text-amber-600 dark:text-amber-500",
  poor: "text-red-600 dark:text-red-400",
  unknown: "text-gray-500 dark:text-gray-400",
};

function parseSignalNum(v: string): number | null {
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Thresholds follow the common LTE signal-quality convention (matches most
// carrier/network-monitor tools): RSRP/RSRQ/SINR each split into 4 bands.
function rsrpLevel(v: string): SignalLevel {
  const n = parseSignalNum(v);
  if (n === null) return "unknown";
  if (n >= -80) return "excellent";
  if (n >= -90) return "good";
  if (n >= -100) return "fair";
  return "poor";
}

function rsrqLevel(v: string): SignalLevel {
  const n = parseSignalNum(v);
  if (n === null) return "unknown";
  if (n >= -10) return "excellent";
  if (n >= -15) return "good";
  if (n >= -20) return "fair";
  return "poor";
}

function sinrLevel(v: string): SignalLevel {
  const n = parseSignalNum(v);
  if (n === null) return "unknown";
  if (n >= 20) return "excellent";
  if (n >= 13) return "good";
  if (n >= 0) return "fair";
  return "poor";
}

function CellRow({
  label,
  cell,
  current,
  onLock,
}: {
  label: string;
  cell: ServingCell | NeighbourCell;
  current: boolean;
  onLock: (earfcn: string, pci: string) => void;
}) {
  const lockable = cell.pci !== "-" && cell.earfcn !== "-" && !!cell.pci && !!cell.earfcn;
  return (
    <div
      className={cx(
        "group flex items-center justify-between p-3 transition-colors",
        lockable ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" : "opacity-60",
      )}
      onClick={() => lockable && onLock(cell.earfcn, cell.pci)}
    >
      <div>
        <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
          {label}
          {current ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300">
              当前
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
          EARFCN {cell.earfcn} · PCI {cell.pci} · RSRP{" "}
          <span className={cx("font-semibold", LEVEL_CLASS[rsrpLevel(cell.rsrp)])}>{cell.rsrp}</span> · RSRQ{" "}
          <span className={cx("font-semibold", LEVEL_CLASS[rsrqLevel(cell.rsrq)])}>{cell.rsrq}</span> · SINR{" "}
          <span className={cx("font-semibold", LEVEL_CLASS[sinrLevel(cell.sinr)])}>{cell.sinr}</span>
        </div>
      </div>
      {lockable ? (
        <Button variant="text" size="small" className="opacity-0 transition-opacity group-hover:opacity-100">
          锁定
        </Button>
      ) : null}
    </div>
  );
}

export default function CellPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [locking, setLocking] = useState(false);
  const [earfcn, setEarfcn] = useState("");
  const [pci, setPci] = useState("");
  const [locked, setLocked] = useState<{ earfcn: string; pci: string } | null>(null);

  async function scan() {
    setScanning(true);
    try {
      const res = await action<ScanResult>("scan-cells");
      setResult(res);
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setScanning(false);
    }
  }

  async function lockTo(nextEarfcn: string, nextPci: string) {
    const ok = await confirmDialog(`锁定到 EARFCN ${nextEarfcn} / PCI ${nextPci}？`, "手动锁频", {
      confirmText: "锁定",
    });
    if (!ok) return;
    setLocking(true);
    try {
      await action("cell-lock", { method: "POST", params: { earfcn: nextEarfcn, pci: nextPci } });
      setLocked({ earfcn: nextEarfcn, pci: nextPci });
      message.success("已锁定，模组可能短暂重新驻网");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setLocking(false);
    }
  }

  async function unlock() {
    setLocking(true);
    try {
      await action("cell-unlock", { method: "POST" });
      setLocked(null);
      message.success("已解除锁定");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setLocking(false);
    }
  }

  async function manualLock() {
    if (!/^\d+$/.test(earfcn) || !/^\d+$/.test(pci)) {
      message.warning("EARFCN / PCI 必须是数字");
      return;
    }
    await lockTo(earfcn, pci);
  }

  return (
    <div>
      <PageHeader
        title="小区 / 频点"
        subtitle="服务小区与邻区扫描（AT+QENG），支持手动锁定 EARFCN/PCI（AT+QNWLOCK）"
        actions={
          <div className="flex gap-2">
            {locked ? (
              <Button variant="danger" plain icon={<LockOpenRegular />} loading={locking} onClick={unlock}>
                解除锁定 ({locked.earfcn}/{locked.pci})
              </Button>
            ) : null}
            <Button icon={<ArrowSyncRegular className={cx(scanning && "animate-spin")} />} loading={scanning} onClick={scan}>
              扫描
            </Button>
          </div>
        }
      />

      <div className="ui-panel-muted mb-4 p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">手动指定小区</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-32">
            <div className="mb-1 text-[11px] text-gray-500">EARFCN</div>
            <Input value={earfcn} onChange={(e) => setEarfcn(e.target.value)} placeholder="例如 1309" />
          </div>
          <div className="w-24">
            <div className="mb-1 text-[11px] text-gray-500">PCI</div>
            <Input value={pci} onChange={(e) => setPci(e.target.value)} placeholder="例如 6" />
          </div>
          <Button variant="primary" icon={<LockClosedRegular />} loading={locking} onClick={manualLock} className="!border-0">
            锁定
          </Button>
        </div>
      </div>

      {result === null ? (
        scanning ? <ListSkeleton /> : <EmptyState title="点击“扫描”查看当前服务小区与邻区" />
      ) : (
        <div className="ui-panel-muted divide-y divide-gray-100 dark:divide-white/5">
          {result.serving ? (
            <CellRow label={`服务小区 · ${result.serving.rat} ${result.serving.band ? `Band ${result.serving.band}` : ""}`} cell={result.serving} current onLock={lockTo} />
          ) : (
            <div className="p-3 text-sm text-gray-400">未获取到服务小区信息</div>
          )}
          {result.neighbours.map((n, i) => (
            <CellRow key={i} label={`邻区 (${n.type}) · ${n.rat}`} cell={n} current={false} onLock={lockTo} />
          ))}
        </div>
      )}
    </div>
  );
}
