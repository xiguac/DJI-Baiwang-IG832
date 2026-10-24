import { useEffect, useMemo, useState } from "react";
import {
  AddRegular,
  ArrowLeftRegular,
  ArrowSyncRegular,
  DeleteRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { Button, Input, Textarea, EmptyState, ListSkeleton } from "../components/ui";
import { message } from "../components/ui/message";
import { confirmDialog } from "../components/ui/MessageBox";
import { usePolling } from "../lib/usePolling";
import { cx, decodeSmsBody } from "../lib/utils";
import { action, apiMessage } from "../api";
import type { SmsMessage } from "../types";

// GSM 03.38 basic character set; anything outside it means the message needs
// UCS2 encoding, which halves the per-segment character budget.
const GSM7_BASIC = new Set(
  Array.from(`@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`),
);
function estimateSegments(text: string): { encoding: "GSM7" | "UCS2"; parts: number } {
  let gsm = true;
  for (const ch of Array.from(text)) {
    if (!GSM7_BASIC.has(ch)) {
      gsm = false;
      break;
    }
  }
  const len = Array.from(text).length;
  if (gsm) return { encoding: "GSM7", parts: len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153) };
  return { encoding: "UCS2", parts: len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67) };
}

function toTs(timestamp: string): number {
  // AT+CMGL timestamp format: yy/MM/dd,HH:mm:ss+zz
  const m = /^(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})/.exec(timestamp);
  if (!m) {
    const asNum = Number(timestamp.replace(/^OUT-/, ""));
    return Number.isFinite(asNum) ? asNum * 1000 : 0;
  }
  const [, yy, mm, dd, hh, mi, ss] = m;
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)).getTime();
}

// "+8613800138000", "008613800138000" and "13800138000" are the same contact
// (a +86 SIM stores sent numbers as typed but receives them with the prefix),
// so threads are keyed by the number without the China country code.
function peerKey(peer: string): string {
  const n = peer.replace(/[\s-]/g, "");
  if (n.startsWith("+86")) return n.slice(3);
  if (n.startsWith("0086")) return n.slice(4);
  if (/^86\d{11}$/.test(n)) return n.slice(2);
  return n;
}

interface Thread {
  key: string;
  peer: string;
  lastTs: number;
  lastBody: string;
  unread: boolean;
  messages: SmsMessage[];
}

function buildThreads(messages: SmsMessage[]): Thread[] {
  const byPeer = new Map<string, SmsMessage[]>();
  for (const m of messages) {
    const key = peerKey(m.peer);
    const list = byPeer.get(key) ?? [];
    list.push(m);
    byPeer.set(key, list);
  }
  const threads: Thread[] = [];
  for (const [key, list] of byPeer) {
    const sorted = [...list].sort((a, b) => toTs(a.timestamp) - toTs(b.timestamp));
    const last = sorted[sorted.length - 1];
    threads.push({
      key,
      peer: last.peer,
      lastTs: toTs(last.timestamp),
      lastBody: last.body,
      unread: sorted.some((m) => m.direction.toUpperCase().includes("UNREAD")),
      messages: sorted,
    });
  }
  return threads.sort((a, b) => b.lastTs - a.lastTs);
}

function shortTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SmsPage() {
  const [messages, setMessages] = useState<SmsMessage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toNumber, setToNumber] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);

  async function load() {
    try {
      const list = await action<SmsMessage[]>("sms-list");
      setMessages(list.map((m) => ({ ...m, body: decodeSmsBody(m.body) })));
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  usePolling(() => void load(), 10000);

  const threads = useMemo(() => buildThreads(messages ?? []), [messages]);
  const unreadCount = threads.filter((t) => t.unread).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter(
      (t) =>
        (!onlyUnread || t.unread) &&
        (!q || t.peer.toLowerCase().includes(q) || t.messages.some((m) => m.body.toLowerCase().includes(q))),
    );
  }, [threads, query, onlyUnread]);
  const activeThread = threads.find((t) => t.key === selected) ?? null;

  // Desktop auto-selects the newest thread; mobile starts on the list.
  useEffect(() => {
    if (!selected && threads.length && window.matchMedia("(min-width: 1024px)").matches) setSelected(threads[0].key);
  }, [threads, selected]);

  async function sync() {
    setSyncing(true);
    try {
      await action("sms-sync");
      await load();
      message.success("已同步");
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function send() {
    const number = (composeOpen ? toNumber : activeThread?.peer ?? "").trim();
    const text = body.trim();
    if (!number) {
      message.warning("请输入号码");
      return;
    }
    if (!text) {
      message.warning("请输入短信内容");
      return;
    }
    setSending(true);
    try {
      await action("sms-send", { method: "POST", params: { number, message: text } });
      message.success("已发送");
      setBody("");
      setComposeOpen(false);
      setSelected(peerKey(number));
      setMobileDetail(true);
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(id: string) {
    const ok = await confirmDialog("删除这条短信？", "提示", { type: "danger", confirmText: "删除" });
    if (!ok) return;
    try {
      await action("sms-delete", { method: "POST", params: { index: id } });
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  async function deleteThread() {
    if (!activeThread) return;
    const ok = await confirmDialog(
      `删除与 ${activeThread.peer} 的全部 ${activeThread.messages.length} 条短信？`,
      "提示",
      { type: "danger", confirmText: "全部删除" },
    );
    if (!ok) return;
    try {
      for (const m of activeThread.messages) {
        await action("sms-delete", { method: "POST", params: { index: m.id } });
      }
      setSelected(null);
      setMobileDetail(false);
      await load();
    } catch (err) {
      message.error(apiMessage(err));
    }
  }

  const segInfo = estimateSegments(body);

  const listPane = (
    <section
      className={cx(
        "flex min-h-0 flex-1 flex-col border-slate-200 bg-white dark:border-white/10 dark:bg-[#17171c] lg:w-[340px] lg:flex-none lg:shrink-0 lg:border-r",
        mobileDetail && "hidden lg:flex",
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <AddRegular className="text-[16px]" />
          新短信
        </button>
        <button
          type="button"
          onClick={() => void sync()}
          title="拉取 SIM 短信"
          className="flex items-center justify-center rounded border border-slate-200 px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <ArrowSyncRegular className={cx("text-[16px]", syncing && "animate-spin")} />
        </button>
      </div>
      <div className="border-b border-slate-100 p-2.5 dark:border-white/10">
        <div className="relative flex items-center">
          <SearchRegular className="absolute left-2.5 text-[16px] text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索号码或短信内容..."
            className="w-full rounded border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-white/10 dark:bg-transparent dark:text-slate-100"
          />
        </div>
      </div>
      <div className="flex gap-4 border-b border-slate-200 px-3 pt-2 text-xs font-medium text-slate-500 dark:border-white/10">
        <button
          type="button"
          onClick={() => setOnlyUnread(false)}
          className={cx("border-b-2 pb-1.5", !onlyUnread ? "border-blue-600 font-semibold text-blue-600" : "border-transparent hover:text-slate-700")}
        >
          全部 ({threads.length})
        </button>
        <button
          type="button"
          onClick={() => setOnlyUnread(true)}
          className={cx("flex items-center gap-1 border-b-2 pb-1.5", onlyUnread ? "border-blue-600 font-semibold text-blue-600" : "border-transparent hover:text-slate-700")}
        >
          未读
          {unreadCount ? <span className="rounded bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">{unreadCount}</span> : null}
        </button>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/10">
        {messages === null ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title={threads.length ? "没有匹配的会话" : "暂无短信"}
            subtitle={threads.length ? undefined : "点击上方同步按钮从模组拉取短信"}
          />
        ) : (
          visible.map((t) => {
            const active = t.key === activeThread?.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setSelected(t.key);
                  setMobileDetail(true);
                }}
                className={cx(
                  "block w-full border-l-2 p-3 text-left transition-colors",
                  active ? "border-blue-600 bg-blue-50/60 dark:bg-blue-500/10" : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {t.unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" /> : null}
                    <span className="font-mono">{t.peer}</span>
                    {t.unread ? <span className="rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-700">未读</span> : null}
                  </span>
                  <span className={cx("text-[11px] tabular-nums", t.unread ? "font-semibold text-blue-600" : "text-slate-400")}>
                    {shortTime(t.lastTs)}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{t.lastBody}</p>
              </button>
            );
          })
        )}
      </div>
    </section>
  );

  const detailPane = (
    <section className={cx("flex min-h-0 flex-1 flex-col bg-[#F8FAFC] dark:bg-[#101014]", !mobileDetail && "hidden lg:flex")}>
      {activeThread ? (
        <>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-[#17171c]">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                aria-label="返回会话列表"
                className="-ml-1 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
              >
                <ArrowLeftRegular className="text-[18px]" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{activeThread.peer}</h1>
                <p className="text-[11px] tabular-nums text-slate-400">共 {activeThread.messages.length} 条</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void deleteThread()}
              className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:text-slate-300"
            >
              <DeleteRegular className="text-[14px]" />
              删除对话
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {activeThread.messages.map((m) => {
              const outbound = m.direction.toUpperCase() === "OUT";
              return (
                <div key={m.id} className={cx("flex w-full", outbound ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[85%] rounded px-3 py-2 text-xs lg:max-w-[70%]",
                      outbound
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-[#17171c] dark:text-slate-200",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                    <div className={cx("mt-1 flex items-center gap-2 text-[10px]", outbound ? "text-blue-100" : "text-slate-400")}>
                      <span className="font-mono">{m.timestamp.replace(/^OUT-/, "")}</span>
                      <button
                        type="button"
                        onClick={() => void deleteMessage(m.id)}
                        aria-label="删除这条短信"
                        className={outbound ? "hover:text-white" : "hover:text-red-500"}
                      >
                        <DeleteRegular className="text-[12px]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#17171c]">
            <div className="flex items-end gap-2">
              <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="回复短信..." className="flex-1" />
              <Button variant="primary" loading={sending} disabled={!body.trim()} onClick={() => void send()} className="!border-0">
                发送
              </Button>
            </div>
            <div className="mt-1 text-right text-[10px] text-slate-400">
              {segInfo.encoding} · {Array.from(body).length} 字 · {segInfo.parts || 0} 条短信
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="选择左侧会话查看短信" />
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-[calc(100dvh-3rem-56px)] min-h-0 flex-col overflow-hidden bg-white dark:bg-[#17171c] md:h-[calc(100dvh-3rem)] lg:flex-row">
      {listPane}
      {detailPane}

      {composeOpen ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4">
          <div className="glass-modal w-full max-w-sm rounded p-5">
            <div className="mb-4 text-sm font-bold text-gray-900 dark:text-white">新建短信</div>
            <div className="space-y-3">
              <Input value={toNumber} onChange={(e) => setToNumber(e.target.value)} placeholder="收件号码，例如 +8613800138000" />
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="短信内容" />
              <div className="text-right text-[10px] text-gray-400">
                {segInfo.encoding} · {segInfo.parts || 0} 条短信
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <Button onClick={() => setComposeOpen(false)}>取消</Button>
              <Button variant="primary" loading={sending} onClick={() => void send()}>
                发送
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
