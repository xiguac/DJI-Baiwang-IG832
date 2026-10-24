import { useState } from "react";
import { PageHeader, Button, Input } from "../components/ui";
import { message } from "../components/ui/message";
import { AtTerminalCard } from "../components/at/AtTerminalCard";
import { action, apiMessage } from "../api";
import type { TextResult } from "../types";

export default function DiagnosticsPage() {
  return (
    <div>
      <PageHeader title="设备诊断" subtitle="网络诊断 · AT 终端" />
      <div className="grid gap-4">
        <PingCard />
        <div className="ui-panel-muted p-4">
          <AtTerminalCard />
        </div>
      </div>
    </div>
  );
}

function PingCard() {
  const [target, setTarget] = useState("baidu.com");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    const t = target.trim();
    if (!t) {
      message.warning("请输入目标地址");
      return;
    }
    setBusy(true);
    setOutput("");
    try {
      const res = await action<TextResult>("ping", { params: { target: t } });
      setOutput(res.output);
    } catch (err) {
      message.error(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-panel-muted p-4">
      <div className="mb-3 text-sm font-bold">网络诊断</div>
      <div className="flex gap-2">
        <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="域名或 IP，例如 8.8.8.8" />
        <Button variant="primary" loading={busy} onClick={() => void run()} className="!border-0 shrink-0">
          开始
        </Button>
      </div>
      <div className="mt-1 text-xs text-gray-400">执行 ping 4 次，并尝试一次 HTTP 访问</div>
      <pre className="mt-3 max-h-72 min-h-[8rem] overflow-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
        {busy ? "诊断中，最长约 15 秒..." : output || "点击“开始”运行诊断"}
      </pre>
    </div>
  );
}
