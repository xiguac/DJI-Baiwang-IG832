import { EyeRegular, EyeOffRegular } from "@fluentui/react-icons";
import { FieldRow } from "./FieldRow";
import { useShowSensitive } from "./shared";
import { carrierIso, lookupCarrier } from "../../lib/carrier";
import { CountryFlag } from "../CountryFlag";
import type { PanelStatus } from "../../types";

const CBN_IMSI_PREFIX = "46015";

export function OverviewSimPanel({ status }: { status: PanelStatus | null }) {
  const [showSensitive, toggleSensitive] = useShowSensitive();
  const sensitive = !showSensitive;
  const carrier = lookupCarrier(status?.imsi);
  const carrierName = carrier?.name || status?.operator || "--";
  const iso = carrierIso(status?.imsi);
  const isCbn = !!status?.imsi && status.imsi.startsWith(CBN_IMSI_PREFIX);

  return (
    <div className="ui-panel-muted relative min-w-0 overflow-hidden p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">SIM / 设备</div>
        <div
          className="-mr-1 -mt-1 cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          onClick={toggleSensitive}
        >
          {showSensitive ? <EyeRegular className="text-[18px]" /> : <EyeOffRegular className="text-[18px]" />}
        </div>
      </div>
      <div className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
        <FieldRow label="IMEI" value={status?.imei} sensitive={sensitive} monospace copyable />
        <FieldRow label="ICCID" value={status?.iccid} sensitive={sensitive} monospace copyable />
        <FieldRow label="IMSI" value={status?.imsi} sensitive={sensitive} monospace copyable />
        <FieldRow label="SIM 状态" value={status?.sim_state} monospace />
        <FieldRow
          label="运营商"
          value={carrierName}
          prefix={carrierName !== "--" ? <CountryFlag countryCode={iso} /> : null}
          copyable
        />
        <FieldRow label="PLMN" value={status?.plmn} monospace copyable />
        <FieldRow label="固件版本" value={status?.fw_rev || status?.model} monospace copyable />
        <FieldRow label="型号" value={status?.model} monospace />
        <FieldRow label="运行时长" value={status ? formatUptime(status.uptime_s) : "--"} monospace />
        <FieldRow label="内网 IP" value={status?.local_ip} monospace copyable />
        <FieldRow label="DNS" value={status?.dns} monospace copyable />
      </div>
      {isCbn ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
          此卡为中国广电（192号段）VoLTE-only SIM，本固件的 IMS 短信不通，短信收发可能失败。建议更换移动/联通/电信卡。
        </div>
      ) : null}
    </div>
  );
}

function formatUptime(uptimeS: string): string {
  const seconds = parseInt(uptimeS, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}
