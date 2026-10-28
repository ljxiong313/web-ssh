/**
 * 终端历史页面
 * 列出所有保存的终端会话，支持查看内容
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Trash2, Eye } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalSessionApi, type TerminalSession } from '@/client/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, SearchField } from '@/components/filters';
import { toast } from '@/components/ui/toast';
import { readTerminalTheme } from '@/lib/terminalTheme';

function SessionViewer({ session }: { session: TerminalSession }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "Consolas, 'Liberation Mono', Menlo, Courier, monospace",
      theme: readTerminalTheme(),
      allowProposedApi: true,
      scrollback: 10000,
      disableStdin: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // 保存的会话内容可能包含 ANSI 转义序列
    if (session.content) term.write(session.content);

    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* 容器尚未布局 */ }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [session]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: 460, backgroundColor: 'var(--page-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN');
}

export default function TerminalHistoryPage() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewSession, setViewSession] = useState<TerminalSession | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setSessions((await terminalSessionApi.list()) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载终端历史失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleView = async (id: number) => {
    setViewLoadingId(id);
    try {
      setViewSession(await terminalSessionApi.get(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '读取会话内容失败');
    } finally { setViewLoadingId(null); }
  };

  const handleDelete = async (id: number) => {
    try {
      await terminalSessionApi.delete(id);
      toast.success('会话记录已删除');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.conn_name.toLowerCase().includes(q));
  }, [sessions, search]);

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="page-title">终端历史</h1>
          <span className="page-subtitle">{sessions.length} 个会话</span>
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="搜索连接名..." ariaLabel="搜索会话" />
      </header>

      {loading ? (
        <div className="page-body"><ListSkeleton rows={6} rowHeight={64} gap={8} /></div>
      ) : (
        <div className="page-body">
          {filtered.length === 0 ? (
            <EmptyState
              matched={search.trim().length > 0}
              query={search.trim()}
              onClear={() => setSearch('')}
              label="还没有保存的终端会话"
              desc="在终端工具栏点击「保存会话」即可在此回看。"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="row-hover row-card group flex items-center gap-3 px-4 py-3"
                >
                  <div className="icon-tile icon-tile--sm" data-tone="brand">
                    <History size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="item-name font-semibold">{s.conn_name}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>保存于 {formatTime(s.saved_at ?? s.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => handleView(s.id)} disabled={viewLoadingId !== null} className="btn-secondary btn-sm">
                      {viewLoadingId === s.id ? <ActivityIndicator size="small" /> : <Eye size={13} />}
                      <span>查看</span>
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" aria-label="删除会话" className="btn-icon btn-icon-danger"><Trash2 size={14} /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除会话</AlertDialogTitle>
                          <AlertDialogDescription>确定删除「{s.conn_name}」的会话记录吗？此操作不可恢复。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(s.id)}>删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={viewSession !== null} onOpenChange={(o) => { if (!o) setViewSession(null); }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{viewSession?.conn_name} — 终端记录</DialogTitle>
          </DialogHeader>
          {viewSession && <SessionViewer session={viewSession} />}
          <button type="button" onClick={() => setViewSession(null)} className="btn-secondary w-full">关闭</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
