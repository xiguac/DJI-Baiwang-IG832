import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui";
import { confirmDialog } from "../components/ui/MessageBox";
import { message } from "../components/ui/message";
import { lookupCarrier } from "../lib/carrier";
import { cx } from "../lib/utils";
import { action, apiMessage } from "../api";

/* ---------------------------------------------------------------------------
 * 运营商 / 选网
 * ------------------------------------------------------------------------- */

interface CopsState {
  mode: number | null;
  plmn: string;
  act: number | null;
}

interface ScanResponse {
  state: "idle" | "running" | "done" | "failed";
  output: string;
}

interface Operator {
  stat: number; // 0 unknown, 1 available, 2 current, 3 forbidden
  name: string;
  plmn: string;
  act: number | null;
}

const ACT_LABEL: Record<number, string> = { 0: "2G", 2: "3G", 7: "4G LTE" };
const STAT_LABEL: Record<number, string> = { 0: "未知", 1: "可用", 2: "当前", 3: "禁止" };

// +COPS: (2,"China Mobile","CMCC","46000",7),(1,...),,(0-4),(0-2)
function parseOperators(raw: string): Operator[] {
  const re = /\((\d),"([^"]*)","([^"]*)","(\d{5,6})"(?:,(\d))?\)/g;
  const list: Operator[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    list.push({ stat: Number(m[1]), name: m[2] || m[3], plmn: m[4], act: m[5] === undefined ? null : Number(m[5]) });
  }
  return list;
}

function plmnName(plmn: string): string {
  return lookupCarrier(plmn)?.name || plmn;
}

export function OperatorCard() {
  const [cops, setCops] = useState<CopsState | null>(null);
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  async function load() {
    try {
      setCops(await action<CopsState>("cops-get"));
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  useEffect(() => {
    void load();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function poll() {
    timer.current = window.setTimeout(async () => {
      try {
        const res = await action<ScanResponse>("cops-scan-result");
        if (res.state === "running") {
          poll();
          return;
        }
        setScanning(false);
        if (res.state === "done") {
          const list = parseOperators(res.output);
          setOperators(list);
          if (list.length === 0) message.warning("搜网结束，但没有解析到运营商");
        } else {
          message.error("搜网失败或超时");
        }
        void load();
      } catch {
        // AT port is busy while the module scans; keep waiting.
        poll();
      }
    }, 4000);
  }

  async function startScan() {
    const ok = await confirmDialog(
      "搜索运营商需要 1~3 分钟，期间模块会断开蜂窝网络，数据连接会中断。确认开始？",
      "搜索运营商",
      { confirmText: "开始搜索", cancelText: "取消", type: "warning" },
    );
    if (!ok) return;
    try {
      await action("cops-scan-start", { method: "POST" });
      setOperators(null);
      setScanning(true);
      poll();
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  async function setAuto() {
    setBusy(true);
    try {
      await action("cops-set", { method: "POST", params: { mode: "auto" } });
      message.success("已切换为自动选网");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function choose(op: Operator) {
    const ok = await confirmDialog(
      `手动选择 ${op.name} (${op.plmn})？如果该网络不可用，模块可能无法联网，需要再切回"自动选网"。`,
      "手动选网",
      { confirmText: "确认选择", cancelText: "取消", type: "warning" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await action("cops-set", {
        method: "POST",
        params: { mode: "manual", plmn: op.plmn, act: op.act ?? undefined },
      });
      message.success("已下发手动选网");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = cops?.mode === 0 ? "自动" : cops?.mode === 1 ? "手动" : cops?.mode == null ? "--" : `模式 ${cops.mode}`;

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">运营商 / 选网</div>
      <div className="divide-y divide-slate-100 text-xs dark:divide-white/10">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-slate-500">选网模式</span>
          <span>{modeLabel}</span>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-slate-500">当前网络</span>
          <span className="font-mono">
            {cops?.plmn ? `${plmnName(cops.plmn)} (${cops.plmn})` : "--"}
            {cops?.act != null ? ` · ${ACT_LABEL[cops.act] ?? cops.act}` : ""}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button loading={busy} disabled={scanning || cops?.mode === 0} onClick={() => void setAuto()}>
          自动选网
        </Button>
        <Button variant="primary" loading={scanning} disabled={busy} onClick={() => void startScan()} className="!border-0">
          {scanning ? "搜索中（约 1~3 分钟）" : "搜索运营商"}
        </Button>
      </div>
      {operators && operators.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded border border-slate-200 dark:border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 font-medium">运营商</th>
                <th className="px-3 py-2 font-medium">网络</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {operators.map((op, i) => (
                <tr key={`${op.plmn}-${op.act}-${i}`}>
                  <td className="px-3 py-2">
                    {plmnName(op.plmn)} <span className="font-mono text-slate-400">{op.plmn}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{op.act != null ? ACT_LABEL[op.act] ?? op.act : "--"}</td>
                  <td className={cx("px-3 py-2", op.stat === 2 && "font-semibold text-blue-600", op.stat === 3 && "text-red-500")}>
                    {STAT_LABEL[op.stat] ?? op.stat}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="small" disabled={busy || op.stat === 3 || op.stat === 2} onClick={() => void choose(op)}>
                      选择
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 频段锁定
 * ------------------------------------------------------------------------- */

// LTE bands this module reports as enabled by default (decoded from
// AT+QCFG="band"). B66/B71 are reported too but the module only accepts a
// 63-bit mask, so they cannot be set and are not offered.
const BANDS = [1, 2, 3, 4, 5, 7, 8, 12, 13, 18, 19, 20, 25, 26, 28, 34, 38, 39, 40, 41];

function maskFromBands(bands: number[]): bigint {
  return bands.reduce((acc, b) => acc | (1n << BigInt(b - 1)), 0n);
}

function bandsFromMask(mask: bigint): number[] {
  return BANDS.filter((b) => (mask >> BigInt(b - 1)) & 1n);
}

export function BandCard() {
  const [current, setCurrent] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await action<{ lte: string }>("band-get");
      const bands = bandsFromMask(BigInt("0x" + (res.lte || "0")));
      setCurrent(bands);
      setSelected(bands);
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggle(b: number) {
    setSelected((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  async function apply(bands: number[]) {
    if (bands.length === 0) {
      message.warning("至少选择一个频段");
      return;
    }
    const ok = await confirmDialog(
      "修改频段后模块会重新搜网，数据连接会短暂中断。如果取消了当前正在使用的频段会立即断线，且只选了当地没有的频段会无法联网。确认应用？",
      "频段锁定",
      { confirmText: "确认应用", cancelText: "取消", type: "warning" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await action("band-set", { method: "POST", params: { lte: maskFromBands(bands).toString(16) } });
      message.success("频段已更新");
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    current !== null && (current.length !== selected.length || current.some((b) => !selected.includes(b)));

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">频段锁定 (LTE)</div>
      <div className="mb-3 text-xs text-slate-500">
        当前启用：{current === null ? "读取中..." : current.length ? current.map((b) => `B${b}`).join(" ") : "--"}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {BANDS.map((b) => {
          const on = selected.includes(b);
          return (
            <button
              key={b}
              type="button"
              disabled={busy || current === null}
              onClick={() => toggle(b)}
              className={cx(
                "rounded border px-2 py-1.5 font-mono text-xs transition-colors disabled:opacity-50",
                on
                  ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 text-slate-500 hover:border-slate-400 dark:border-white/10",
              )}
            >
              B{b}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty || selected.length === 0} onClick={() => void apply(selected)} className="!border-0">
          应用
        </Button>
        <Button disabled={busy || current === null} onClick={() => setSelected(BANDS)}>
          全选
        </Button>
        <Button disabled={busy || !dirty} onClick={() => setSelected(current ?? [])}>
          还原
        </Button>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">国内常用：B1/B3/B5/B8（FDD），B34/B38/B39/B40/B41（TDD）。</div>
    </div>
  );
}
