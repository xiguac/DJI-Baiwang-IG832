// Flat JSON shapes returned by module-panel/www/cgi-bin/api. Keys match the
// shell script's emit_*_json functions exactly (see that file for the
// authoritative field list/order).

export interface PanelStatus {
  iccid: string;
  imsi: string;
  imei: string;
  sim_state: string;
  operator: string;
  plmn: string;
  reg_status: string;
  reg_status_ps: string;
  network_mode: string;
  radio_band: string;
  radio_channel: string;
  rat: string;
  duplex: string;
  mcc: string;
  mnc: string;
  cell_id: string;
  pci: string;
  earfcn: string;
  tac: string;
  rsrp: string;
  rsrq: string;
  rssi: string;
  sinr: string;
  csq_rssi: string;
  csq_ber: string;
  uptime_s: string;
  local_ip: string;
  dns: string;
  model: string;
  fw_rev: string;
}

export interface TrafficIface {
  rx_bytes: number;
  tx_bytes: number;
  rx_bps: number;
  tx_bps: number;
  cum_rx: number;
  cum_tx: number;
}

export interface TrafficReport {
  ifaces: Record<string, TrafficIface>;
  total: { rx_bps: number; tx_bps: number; cum_rx: number; cum_tx: number };
}

export interface ServingCell {
  state: string;
  rat: string;
  duplex: string;
  mcc: string;
  mnc: string;
  cell_id: string;
  pci: string;
  earfcn: string;
  band: string;
  tac: string;
  rsrp: string;
  rsrq: string;
  rssi: string;
  sinr: string;
}

export interface NeighbourCell {
  type: string;
  rat: string;
  earfcn: string;
  pci: string;
  rsrq: string;
  rsrp: string;
  rssi: string;
  sinr: string;
}

export interface ScanResult {
  serving: ServingCell | null;
  neighbours: NeighbourCell[];
}

export interface SmsMessage {
  id: string;
  direction: string;
  peer: string;
  timestamp: string;
  body: string;
}

export interface TextResult {
  ok: true;
  output: string;
}
