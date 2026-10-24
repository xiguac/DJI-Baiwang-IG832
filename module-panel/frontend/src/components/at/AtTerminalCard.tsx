import { useState } from "react";
import { WindowConsoleRegular } from "@fluentui/react-icons";
import { action } from "../../api";
import { Button, Input, Select } from "../ui";
import { AT_COMMAND_GROUPS } from "./atCommands";
import { AtLogEntry, AtTypingBubble, type AtLogItem } from "./AtLogEntry";
import type { TextResult } from "../../types";

export function AtTerminalCard() {
  const [cmd, setCmd] = useState("");
  const [template, setTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<AtLogItem[]>([]);

  async function send() {
    const command = cmd.trim();
    if (!command) return;
    setSending(true);
    setCmd("");
    try {
      const res = await action<TextResult>("at", { method: "POST", params: { cmd: command } });
      setLog((prev) => [...prev, { ts: Date.now(), cmd: command, ok: true, response: res.output }]);
    } catch (err) {
      setLog((prev) => [
        ...prev,
        { ts: Date.now(), cmd: command, ok: false, response: err instanceof Error ? err.message : "请求异常" },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          <WindowConsoleRegular className="text-[22px]" />
        </div>
        <div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">AT 终端</div>
          <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">发送 AT 指令并查看回显（多行响应会完整返回）</div>
        </div>
      </div>
      <div className="ui-panel-muted relative mt-4 flex h-[320px] flex-col gap-3 overflow-auto rounded-xl border border-gray-100 p-4 dark:border-white/10">
        {log.length === 0 && !sending ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">暂无 AT 会话记录</div>
        ) : null}
        {log.map((item, i) => (
          <AtLogEntry key={`${item.ts}-${item.cmd}-${i}`} item={item} />
        ))}
        {sending ? <AtTypingBubble label="等待模组响应..." /> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[240px_1fr_auto]">
        <div className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">快捷指令模板</div>
          <Select
            value={template}
            onChange={(v) => {
              setTemplate(v);
              if (v) setCmd(v);
            }}
            placeholder="选择常用命令（可选）"
            options={AT_COMMAND_GROUPS.flatMap((g) => g.items.map((it) => ({ value: it.value, label: `${g.label} · ${it.label}` })))}
          />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">命令</div>
          <Input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="例如 AT+CSQ (可自由编辑)"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
        </div>
        <div className="space-y-1 self-end">
          <div className="select-none text-[11px] font-bold uppercase tracking-wider opacity-0">操作</div>
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setLog([])}>清空</Button>
            <Button variant="primary" loading={sending} disabled={!cmd} onClick={send} className="!border-0">
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
