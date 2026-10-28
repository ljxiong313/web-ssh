/**
 * 列表/日志页共用的筛选控件：搜索框、带标签字段、日期范围、重置按钮、空态
 */
import { Search, X, FileSearch } from 'lucide-react';

export function SearchField({
  value, onChange, onEnter, placeholder, ariaLabel, width = 170,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder: string;
  ariaLabel: string;
  width?: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2.5" style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-secondary)', height: 'var(--control-h-md)' }}>
      <Search size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
      <input
        className="bg-transparent text-[13px]"
        style={{ color: 'var(--text-primary)', width, border: 'none', outline: 'none' }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
          if (e.key === 'Escape') onChange('');
        }}
      />
      {value && (
        <button type="button" aria-label="清除" className="btn-icon btn-icon-xxs" onClick={() => onChange('')}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="label-text" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </label>
  );
}

export function DateRangeFields({ start, end, onChange, width = 190 }: {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  width?: number;
}) {
  return (
    <>
      <FilterField label="开始时间">
        <input type="datetime-local" className="input" style={{ width }} value={start} onChange={(e) => onChange({ start: e.target.value, end })} />
      </FilterField>
      <FilterField label="结束时间">
        <input type="datetime-local" className="input" style={{ width }} value={end} onChange={(e) => onChange({ start, end: e.target.value })} />
      </FilterField>
    </>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-ghost btn-sm">
      <X size={13} /><span>重置</span>
    </button>
  );
}

/** 空态：区分「有筛选但无结果」与「本身没有数据」 */
export function EmptyState({ matched, query, onClear, label, desc, action, icon }: {
  matched: boolean;
  query: string;
  onClear: () => void;
  label: string;
  desc?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  if (matched) {
    return (
      <div className="empty-state">
        {icon ?? <Search size={40} className="empty-state-icon" />}
        <p className="empty-state-title">没有匹配「{query}」的记录</p>
        <p className="empty-state-desc">试试调整关键字、筛选项或时间范围。</p>
        <button type="button" onClick={onClear} className="btn btn-secondary" style={{ marginTop: 16 }}>清除筛选</button>
      </div>
    );
  }
  return (
    <div className="empty-state">
      {icon ?? <FileSearch size={44} className="empty-state-icon" />}
      <p className="empty-state-title">{label}</p>
      <p className="empty-state-desc">{desc ?? '产生新的记录后会自动出现在这里。'}</p>
      {action}
    </div>
  );
}
