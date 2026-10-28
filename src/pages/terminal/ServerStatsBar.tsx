import { Cpu, HardDrive, Network, Server } from 'lucide-react';
import { type ServerStats } from '@/ctx/terminal';

interface ServerStatsBarProps {
  stats: ServerStats | null | undefined;
}

/** 百分比阈值着色：不依赖颜色也能通过数值本身判读 */
function levelColor(raw: string | undefined): string {
  const n = parseFloat(String(raw ?? '').replace('%', ''));
  if (Number.isNaN(n)) return 'var(--text-secondary)';
  if (n >= 90) return 'var(--danger)';
  if (n >= 75) return 'var(--warning)';
  return 'var(--success)';
}

function Item({ icon, label, value, color }: { icon?: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="mono" style={{ color: color ?? 'var(--text-secondary)' }}>{value}</span>
    </span>
  );
}

export default function ServerStatsBar({ stats }: ServerStatsBarProps) {
  if (!stats) {
    return (
      <div
        className="flex items-center gap-1.5 px-4 py-1.5 text-[11px]"
        style={{ backgroundColor: 'var(--panel-bg)', borderTop: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)' }}
        role="status"
      >
        <Server size={11} />
        等待服务器指标…
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-4 px-4 py-1.5 text-[11px] flex-wrap"
      style={{ backgroundColor: 'var(--panel-bg)', borderTop: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}
    >
      <Item icon={<Cpu size={11} />} label="CPU" value={`${stats.cpu}%`} color={levelColor(stats.cpu)} />
      <Item icon={<HardDrive size={11} />} label="内存" value={`${stats.memory}%`} color={levelColor(stats.memory)} />
      <Item label="磁盘" value={stats.disk} color={levelColor(stats.disk)} />
      <Item icon={<Network size={11} />} label="↓" value={stats.net_rx} />
      <Item label="↑" value={stats.net_tx} />
      <Item label="读" value={stats.io_rx} />
      <Item label="写" value={stats.io_tx} />
    </div>
  );
}
