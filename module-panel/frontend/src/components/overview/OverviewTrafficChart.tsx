import { useMemo } from "react";
import { EChart } from "../EChart";
import { formatBytes } from "../../lib/utils";
import type { TrafficReport } from "../../types";

export interface TrafficSample {
  t: number;
  rxBps: number;
  txBps: number;
}

const MAX_SAMPLES = 60; // ~2 minutes at 2s/sample

export function OverviewTrafficChart({
  report,
  history,
}: {
  report: TrafficReport | null;
  history: TrafficSample[];
}) {
  const samples = history.slice(-MAX_SAMPLES);

  const option = useMemo(() => ({
    animationDuration: 200,
    color: ["#0ea5e9", "#8b5cf6"],
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => `${formatBytes(value)}/s`,
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: "#64748b" },
      data: ["下载", "上传"],
    },
    grid: { top: 42, right: 18, bottom: 24, left: 62 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: samples.map((s) => new Date(s.t).toLocaleTimeString()),
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLabel: { color: "#64748b", formatter: (value: number) => `${formatBytes(value)}/s` },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    series: [
      {
        name: "下载",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: samples.map((s) => s.rxBps),
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.12 },
      },
      {
        name: "上传",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: samples.map((s) => s.txBps),
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.1 },
      },
    ],
  }), [samples]);

  const total = report?.total;

  return (
    <div className="ui-panel-muted p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-gray-900 dark:text-white">实时网速</div>
          <div className="mt-1 text-xs text-gray-500">最近约 2 分钟；累计流量跨重启保留</div>
        </div>
        <div className="flex gap-5 pr-1 text-xs">
          <div>
            <span className="text-gray-500">下载</span>
            <span className="ml-2 font-mono font-semibold text-sky-500">{formatBytes(total?.rx_bps ?? 0)}/s</span>
          </div>
          <div>
            <span className="text-gray-500">上传</span>
            <span className="ml-2 font-mono font-semibold text-violet-500">{formatBytes(total?.tx_bps ?? 0)}/s</span>
          </div>
        </div>
      </div>
      {samples.length < 2 ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">采样中...</div>
      ) : (
        <EChart option={option} className="mt-2 h-64 w-full" />
      )}
      <div className="mt-3 flex gap-5 border-t border-gray-100 pt-3 text-xs dark:border-white/5">
        <div>
          <span className="text-gray-500">累计下载</span>
          <span className="ml-2 font-mono font-semibold text-gray-700 dark:text-gray-200">{formatBytes(total?.cum_rx ?? 0)}</span>
        </div>
        <div>
          <span className="text-gray-500">累计上传</span>
          <span className="ml-2 font-mono font-semibold text-gray-700 dark:text-gray-200">{formatBytes(total?.cum_tx ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
