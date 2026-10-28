/**
 * 命令历史页面
 * 显示所有执行过的命令记录，支持搜索、复制与清空
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Terminal, Trash2, Clock, Copy } from 'lucide-react';
import { commandHistoryApi, type CommandHistory } from '@/client/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, SearchField } from '@/components/filters';
import { toast } from '@/components/ui/toast';

const PAGE_SIZE = 30;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CommandHistoryPage() {
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setHistory((await commandHistoryApi.list()) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载命令历史失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => { setPage(1); }, [search]);

  const handleClear = async () => {
    try {
      await commandHistoryApi.clear();
      toast.success('命令历史已清空');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '清空失败');
    }
  };

  const handleCopy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('命令已复制');
    } catch {
      toast.error('复制失败，请手动选择命令文本');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => h.command.toLowerCase().includes(q) || String(h.connection_id).includes(q));
  }, [history, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="page-title">命令历史</h1>
          <span className="page-subtitle">共 {filtered.length} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="搜索命令或连接ID..." ariaLabel="搜索命令历史" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="btn-danger" disabled={history.length === 0}>
                <Trash2 size={14} /><span>清空</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清空历史</AlertDialogTitle>
                <AlertDialogDescription>将删除所有命令历史记录，此操作不可撤销。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleClear}>清空</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {loading ? (
        <div className="page-body"><ListSkeleton rows={8} rowHeight={92} gap={8} /></div>
      ) : (
        <div className="page-body">
          {filtered.length === 0 ? (
            <EmptyState
              matched={search.trim().length > 0}
              query={search.trim()}
              onClear={() => setSearch('')}
              label="暂无命令历史"
              desc="在终端中执行命令后会自动记录在这里。"
            />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {rows.map((h) => (
                  <div
                    key={h.id}
                    className="row-hover row-card group px-4 py-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal size={13} color="var(--text-secondary)" />
                      <span className="item-name font-semibold">连接 #{h.connection_id}</span>
                      <span className="flex items-center gap-1 text-[11px] tabular-nums ml-auto" style={{ color: 'var(--text-secondary)' }}>
                        <Clock size={11} />{formatTime(h.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(h.command)}
                        className="btn-icon btn-icon-xs row-actions"
                        aria-label="复制命令"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                    <pre className="code-block">
                      {h.command}
                    </pre>
                    <span className="muted-2xs mono" style={{ display: 'block', marginTop: 6 }}>会话 {h.session_id}</span>
                  </div>
                ))}
              </div>
              <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
