import type { ReactNode } from "react";
import { cx } from "../../lib/utils";
import { copyText, useShowSensitive } from "../overview/shared";

// Flat design kit matching the Stitch mock: slate palette, 1px hairline borders,
// small dense type, no shadows. Dark variants keep the same structure.

export function Card({
  icon,
  title,
  badge,
  footer,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex flex-col justify-between rounded border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17171c]", className)}>
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {icon ? <span className="flex text-[16px] text-blue-600 dark:text-sky-400">{icon}</span> : null}
            <span>{title}</span>
          </div>
          {badge}
        </div>
        {children}
      </div>
      {footer ? (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

type Tone = "green" | "blue" | "slate" | "amber" | "red";
const BADGE_TONE: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  slate: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};

export function Badge({ tone = "slate", dot, mono, children }: { tone?: Tone; dot?: boolean; mono?: boolean; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium", mono && "font-mono", BADGE_TONE[tone])}>
      {dot ? <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

// Key/value row used inside cards (divide-y list).
export function KV({
  label,
  value,
  mono = true,
  sensitive,
  copy,
}: {
  label: ReactNode;
  value?: ReactNode;
  mono?: boolean;
  sensitive?: boolean;
  copy?: boolean;
}) {
  const [show] = useShowSensitive();
  const empty = value === undefined || value === null || value === "";
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const masked = sensitive && !show && raw;
  const shown = empty ? "--" : masked ? raw.slice(0, 3) + "•".repeat(Math.max(raw.length - 5, 3)) + raw.slice(-2) : value;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cx(
          "min-w-0 break-all text-right text-slate-900 dark:text-slate-100",
          mono && "font-mono",
          copy && raw && !masked && "cursor-pointer hover:text-blue-600",
        )}
        onClick={copy && raw && !masked ? () => void copyText(raw) : undefined}
      >
        {shown}
      </span>
    </div>
  );
}

export function KVList({ children }: { children: ReactNode }) {
  return <div className="mt-1 divide-y divide-slate-100 dark:divide-white/10">{children}</div>;
}

export function Metric({
  label,
  value,
  unit,
  tone,
  large,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  tone?: "blue" | "default";
  large?: boolean;
}) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div
        className={cx(
          "mt-0.5 font-mono font-semibold tabular-nums",
          large ? "text-base" : "text-xs",
          tone === "blue" ? "text-blue-600 dark:text-sky-400" : "text-slate-800 dark:text-slate-100",
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span> : null}
      </div>
    </div>
  );
}
