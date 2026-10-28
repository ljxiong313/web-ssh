import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/** 页码窗口：首尾常显，中间按 ±1 展开，缺口用省略号 */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...items].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, disabled }: PaginationProps) {
  if (totalPages <= 1 && !total) return null;
  const from = total && pageSize ? (page - 1) * pageSize + 1 : 0;
  const to = total && pageSize ? Math.min(total, page * pageSize) : 0;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label="分页"
      style={{ paddingTop: 12 }}
    >
      <span className="muted-xs tabular-nums">
        {total !== undefined && pageSize ? `第 ${from}-${to} 条 / 共 ${total} 条` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ padding: '0 8px' }}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
        </button>
        {pageWindow(page, Math.max(totalPages, 1)).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="muted-2xs" style={{ padding: '0 2px' }}>…</span>
          ) : (
            <button
              key={item}
              type="button"
              className={`btn btn-sm ${item === page ? 'btn-primary' : 'btn-secondary'}`}
              style={{ minWidth: 28, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}
              disabled={disabled || item === page}
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`第 ${item} 页`}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ padding: '0 8px' }}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
