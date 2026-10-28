/**
 * 快捷命令页面
 * 支持：添加/编辑/删除常用命令，按使用频次排序
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Zap, Copy } from 'lucide-react';
import { quickCommandApi, type QuickCommand } from '@/client/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text as UiText } from '@/components/ui/text';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { SearchField, EmptyState } from '@/components/filters';
import { toast } from '@/components/ui/toast';

function CmdForm({ initial, onSave, onCancel }: {
  initial?: QuickCommand | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('请输入名称'); return; }
    if (!command.trim()) { setError('请输入命令'); return; }
    setLoading(true);
    setError('');
    try {
      if (initial?.id) {
        await quickCommandApi.update(initial.id, { name: name.trim(), command: command.trim() });
      } else {
        await quickCommandApi.create({ name: name.trim(), command: command.trim() });
      }
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3.5 py-1">
      <div className="flex flex-col">
        <label className="label-text" htmlFor="qc-name">命令名称 *</label>
        <input id="qc-name" className="input" placeholder="eg. 查看内存" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="flex flex-col">
        <label className="label-text" htmlFor="qc-command">命令内容 *</label>
        <textarea
          id="qc-command"
          className="input mono"
          style={{ height: 80 }}
          placeholder="free -h"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <span className="hint-text">发送时会自动追加换行，无需在末尾输入回车</span>
      </div>
      {error ? <span role="alert" className="error-text" style={{ fontSize: 12 }}>{error}</span> : null}
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-secondary flex-1">取消</button>
        <button type="submit" disabled={loading} className="btn btn-primary flex-[2]">
          {loading ? <ActivityIndicator size="small" /> : null}{initial ? '保存修改' : '添加命令'}
        </button>
      </div>
    </form>
  );
}

export default function QuickCommandsPage() {
  const [cmds, setCmds] = useState<QuickCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCmd, setEditCmd] = useState<QuickCommand | null | undefined>(undefined);
  const [query, setQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setCmds(await quickCommandApi.list() || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    try {
      await quickCommandApi.delete(id);
      toast.success('命令已删除');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...cmds].sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0));
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q)) : sorted;
  }, [cmds, query]);

  const copyCommand = async (cmd: QuickCommand) => {
    try {
      await navigator.clipboard.writeText(cmd.command);
      toast.success('命令已复制');
    } catch {
      toast.error('复制失败，浏览器未授权剪贴板');
    }
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="page-title">快捷命令</h1>
          <span className="page-subtitle">{filtered.length}{query ? ` / ${cmds.length}` : ''} 个命令</span>
        </div>
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} placeholder="搜索名称或命令..." ariaLabel="搜索快捷命令" width={200} />
          <button onClick={() => setEditCmd(null)} className="btn btn-primary"><Plus size={15} />添加</button>
        </div>
      </header>

      {loading ? (
        <div className="page-body"><ListSkeleton rows={6} rowHeight={70} /></div>
      ) : (
        <div className="page-body">
          {filtered.length === 0 && (
            <EmptyState
              matched={!!query.trim()}
              query={query}
              onClear={() => setQuery('')}
              label="还没有快捷命令"
              desc="添加后可在终端底部快捷命令面板中一键执行"
              icon={<Zap size={44} className="empty-state-icon" />}
              action={<button onClick={() => setEditCmd(null)} className="btn btn-primary mt-4"><Plus size={15} />添加命令</button>}
            />
          )}
          {filtered.map((cmd) => (
            <div key={cmd.id} className="row-hover row-card mb-2 p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="item-title flex-1">{cmd.name}</span>
                {cmd.use_count > 0 && <span className="chip chip-brand">使用 {cmd.use_count} 次</span>}
                <button onClick={() => copyCommand(cmd)} className="btn-icon" aria-label="复制命令" title="复制命令"><Copy size={13} /></button>
                <button onClick={() => setEditCmd(cmd)} className="btn-icon" aria-label={`编辑 ${cmd.name}`} title="编辑"><Edit2 size={13} /></button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="btn-icon btn-icon-danger" aria-label={`删除 ${cmd.name}`} title="删除"><Trash2 size={13} /></button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle><UiText>删除命令</UiText></AlertDialogTitle>
                      <AlertDialogDescription><UiText>确定删除「{cmd.name}」吗？</UiText></AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel><UiText>取消</UiText></AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(cmd.id)}><UiText>删除</UiText></AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <pre className="code-block">
                {cmd.command}
              </pre>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editCmd !== undefined} onOpenChange={(o) => { if (!o) setEditCmd(undefined); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle><UiText>{editCmd ? '编辑命令' : '添加快捷命令'}</UiText></DialogTitle>
          </DialogHeader>
          {editCmd !== undefined && (
            <CmdForm
              initial={editCmd}
              onSave={() => { setEditCmd(undefined); loadData(); toast.success('命令已保存'); }}
              onCancel={() => setEditCmd(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
