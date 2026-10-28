import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden="true" />;
}

/** 列表/卡片行的骨架屏 */
export function ListSkeleton({ rows = 6, rowHeight = 44, gap = 6, className }: { rows?: number; rowHeight?: number; gap?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)} style={{ gap }} role="status" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={{ height: rowHeight, width: '100%' }} />
      ))}
    </div>
  );
}

/** 表格骨架屏：表头 + 若干行单元格 */
export function TableSkeleton({ rows = 8, columns = 5, widths }: { rows?: number; columns?: number; widths?: number[] }) {
  const colWidth = (i: number) => (widths && widths[i] ? `${widths[i]}%` : `${100 / columns}%`);
  return (
    <div className="table-scroll" role="status" aria-label="加载中">
      <div className="flex flex-col">
        <div className="flex" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="p-3" style={{ width: colWidth(i) }}>
              <Skeleton style={{ height: 10, width: '60%' }} />
            </div>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex" style={{ borderBottom: r === rows - 1 ? 'none' : '1px solid var(--border-color)' }}>
            {Array.from({ length: columns }, (_, i) => (
              <div key={i} className="p-3" style={{ width: colWidth(i) }}>
                <Skeleton style={{ height: 10, width: i === 0 ? '80%' : `${40 + ((i * 17 + r * 7) % 40)}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
