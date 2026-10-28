import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Server, Folder, FolderOpen, Trash2, Edit2, X,
  Upload, Download, ChevronRight, ChevronDown, Search,
  Move,
} from 'lucide-react';
import { connectionApi, folderApi, type Connection, type Folder as FolderType } from '@/client/api';
import { useTerminalState, type TabStatus } from '@/ctx/terminal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ConnectionForm } from './ConnectionForm';
import { FolderTreeSelect, flattenFolders } from './FolderTreeSelect';

const MAX_DEPTH = 5;
const EXPAND_KEY = 'webssh.folderExpanded';

const STATUS_DOT: Record<TabStatus, { color: string; label: string }> = {
  connected: { color: 'var(--success)', label: '已连接' },
  connecting: { color: 'var(--warning)', label: '连接中' },
  auth_required: { color: 'var(--brand)', label: '等待认证' },
  failed: { color: 'var(--danger)', label: '连接失败' },
  disconnected: { color: 'var(--text-tertiary)', label: '已断开' },
};

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="label-text">
      {children}
      {hint && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> {hint}</span>}
    </span>
  );
}

// Folder form (create/edit)
function FolderForm({
  initial,
  folders,
  onSave,
  onCancel,
}: {
  initial?: FolderType | null;
  folders: FolderType[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [parentId, setParentId] = useState<number | null>(initial?.parent_id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initial?.id;

  const handleSave = async () => {
    if (!name.trim()) { setError('请输入文件夹名称'); return; }
    setLoading(true); setError('');
    try {
      const payload = { name: name.trim(), parent_id: parentId };
      if (isEdit) await folderApi.update(initial.id, payload);
      else await folderApi.create(payload);
      onSave();
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setLoading(false); }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault(); }}
    >
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>文件夹名称</FieldLabel>
        <input
          className="input"
          placeholder="例如：生产环境"
          value={name}
          autoFocus
          aria-invalid={!!error && !name.trim()}
          onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel hint={`（最大深度 ${MAX_DEPTH} 层）`}>父文件夹</FieldLabel>
        <FolderTreeSelect
          label="选择父文件夹"
          folders={folders}
          selectedId={parentId}
          onSelect={setParentId}
          excludeId={isEdit ? initial.id : undefined}
        />
      </div>

      {error && <div className="banner banner-danger mb-3" role="alert">{error}</div>}

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={loading} className="btn-primary flex-[2]">
          {loading ? <ActivityIndicator size="small" /> : (isEdit ? '保存修改' : '创建文件夹')}
        </button>
      </div>
    </form>
  );
}

// Move folder form
function MoveFolderForm({
  folder,
  folders,
  onSave,
  onCancel,
}: {
  folder: FolderType;
  folders: FolderType[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [parentId, setParentId] = useState<number | null>(folder.parent_id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true); setError('');
    try { await folderApi.update(folder.id, { parent_id: parentId }); onSave(); }
    catch (e) { setError(e instanceof Error ? e.message : '移动失败'); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
      <span className="muted-xs" style={{ display: 'block', marginBottom: 12 }}>
        将「<b style={{ color: 'var(--text-primary)' }}>{folder.name}</b>」移动到：
      </span>

      <FolderTreeSelect
        label="选择目标父文件夹"
        folders={folders}
        selectedId={parentId}
        onSelect={setParentId}
        excludeId={folder.id}
        maxDepth={MAX_DEPTH}
      />

      {error && <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={loading} className="btn-primary flex-[2]">
          {loading ? <ActivityIndicator size="small" /> : '确认移动'}
        </button>
      </div>
    </form>
  );
}

// Connection list item row
function ConnectionRow({ conn, status, onEdit, onDelete, onConnect }: {
  conn: Connection;
  status?: TabStatus;
  onEdit: () => void;
  onDelete: () => void;
  onConnect: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dot = status ? STATUS_DOT[status] : null;
  return (
    <div className="row-hover row-card group relative flex items-center gap-2.5 mb-0.5 px-3 h-[52px] w-full text-left">
      {/* 整行可点击且键盘可达：主按钮覆盖内容区，操作按钮叠在上层 */}
      <button
        type="button"
        onClick={onConnect}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-md"
        style={{ height: '100%' }}
        title={`连接 ${conn.name}`}
      >
        <span
          className="status-dot"
          aria-label={dot ? dot.label : '未连接'}
          title={dot ? dot.label : '未连接'}
          style={{ backgroundColor: dot ? dot.color : 'var(--border-secondary)', boxShadow: dot ? `0 0 0 3px color-mix(in srgb, ${dot.color} 18%, transparent)` : 'none', marginLeft: 2 }}
        />
        <Server size={15} color={dot ? 'var(--brand-fg)' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{conn.name}</span>
          <span className="block text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{conn.username}@{conn.host}:{conn.port}</span>
        </span>
      </button>

      <div className="row-actions flex items-center gap-0.5 shrink-0 group-hover:opacity-100">
        <button type="button" aria-label="编辑连接" className="btn-icon" onClick={onEdit}><Edit2 size={14} /></button>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger asChild>
            <button type="button" aria-label="删除连接" className="btn-icon btn-icon-danger" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /></button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除连接</AlertDialogTitle>
              <AlertDialogDescription>确定要删除「{conn.name}」吗？该操作无法撤销。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// Folder tree node with connections
function FolderNode({
  folder,
  connections,
  statusByConn,
  expandedIds,
  onToggle,
  onEdit,
  onDelete,
  onConnect,
  onEditFolder,
  onDeleteFolder,
  onMoveFolder,
}: {
  folder: FolderType;
  connections: Connection[];
  statusByConn: Map<number, TabStatus>;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (c: Connection) => void;
  onDelete: (id: number) => void;
  onConnect: (c: Connection) => void;
  onEditFolder: (f: FolderType) => void;
  onDeleteFolder: (f: FolderType) => void;
  onMoveFolder: (f: FolderType) => void;
}) {
  const expanded = expandedIds.has(folder.id);
  const folderConns = connections.filter((c) => c.folder_id === folder.id);
  const children = folder.children ?? [];
  return (
    <div className="mb-1">
      <div className="row-hover group flex items-center gap-1 rounded-md px-2 h-8" style={{ marginBottom: 1 }}>
        <button
          type="button"
          onClick={() => onToggle(folder.id)}
          aria-expanded={expanded}
          aria-label={expanded ? `收起 ${folder.name}` : `展开 ${folder.name}`}
          className="btn-icon"
          style={{ height: 22, width: 22 }}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {expanded && children.length > 0 ? (
          <FolderOpen size={14} color="var(--warning)" style={{ marginRight: 5, flexShrink: 0 }} />
        ) : (
          <Folder size={14} color="var(--warning)" style={{ marginRight: 5, flexShrink: 0 }} />
        )}

        <button
          type="button"
          onClick={() => onToggle(folder.id)}
          className="flex items-center min-w-0 rounded-sm cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }} className="truncate">{folder.name}</span>
          <span className="chip chip-sm" style={{ marginLeft: 8 }}>
            {folderConns.length + children.length}
          </span>
        </button>

        <div className="row-actions flex items-center gap-0.5 ml-auto shrink-0">
          <button type="button" aria-label="移动文件夹" className="btn-icon btn-icon-xs" onClick={() => onMoveFolder(folder)}><Move size={12} /></button>
          <button type="button" aria-label="编辑文件夹" className="btn-icon btn-icon-xs" onClick={() => onEditFolder(folder)}><Edit2 size={12} /></button>
          <button type="button" aria-label="删除文件夹" className="btn-icon btn-icon-xs btn-icon-danger" onClick={() => onDeleteFolder(folder)}><Trash2 size={12} /></button>
        </div>
      </div>

      {expanded && (
        <div className="pl-5">
          {folderConns.length === 0 && children.length === 0 && (
            <div className="muted-2xs" style={{ padding: '4px 10px 4px 28px' }}>空文件夹</div>
          )}
          {folderConns.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              status={statusByConn.get(c.id)}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c.id)}
              onConnect={() => onConnect(c)}
            />
          ))}
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              connections={connections}
              statusByConn={statusByConn}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onConnect={onConnect}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Import connection dialog
function ImportDialog({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<Partial<Connection>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const handlePreview = async () => {
    setError('');
    try {
      const data = JSON.parse(json);
      const arr = Array.isArray(data) ? data : [data];
      const res = await connectionApi.previewImport(arr);
      setPreview(res.preview);
      setStep('preview');
    } catch { setError('JSON 格式不正确，请检查内容'); }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const data = JSON.parse(json);
      const arr = Array.isArray(data) ? data : [data];
      await connectionApi.import(arr);
      toast.success(`已导入 ${arr.length} 条连接`);
      onImported();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败'); } finally { setLoading(false); }
  };

  if (step === 'preview') {
    return (
      <div>
        <p className="muted-xs mb-3">将导入以下 {preview.length} 条连接：</p>
        <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
          {preview.map((c, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <Server size={13} color="var(--text-secondary)" />
              <span className="text-[13px] flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{c.host}:{c.port}</span>
            </div>
          ))}
        </div>
        {error && <div className="banner banner-danger" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        <div className="flex gap-2.5 mt-4">
          <button type="button" onClick={() => setStep('input')} className="btn-secondary flex-1">返回</button>
          <button type="button" onClick={handleImport} disabled={loading || preview.length === 0} className="btn-primary flex-[2]">
            {loading ? <ActivityIndicator size="small" /> : '确认导入'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="label-text" htmlFor="import-json">粘贴 JSON 格式的连接配置：</label>
      <textarea
        id="import-json"
        className="input mono"
        style={{ fontSize: 12, height: 180, resize: 'vertical' }}
        placeholder={'[\n  {\n    "name": "服务器1",\n    "host": "1.2.3.4",\n    "port": 22,\n    "username": "root"\n  }\n]'}
        value={json}
        autoFocus
        onChange={(e) => { setJson(e.target.value); if (error) setError(''); }}
      />
      {error && <div className="banner banner-danger" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div className="flex gap-2.5 mt-4">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
        <button type="button" onClick={handlePreview} disabled={!json.trim()} className="btn-primary flex-[2]">预览</button>
      </div>
    </div>
  );
}

// Main component
export default function ConnectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabs, setActiveTabId, openTab, closeTab, setShowConnections } = useTerminalState();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editConn, setEditConn] = useState<Connection | null | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editFolder, setEditFolder] = useState<FolderType | null | undefined>(undefined);
  const [moveFolder, setMoveFolder] = useState<FolderType | null>(null);
  const [deleteFolderItem, setDeleteFolderItem] = useState<FolderType | null>(null);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch { return new Set(); }
  });

  const toggleFolder = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(EXPAND_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [conns, fols] = await Promise.all([connectionApi.list(), folderApi.list()]);
      setConnections(Array.isArray(conns) ? conns : []);
      setFolders(Array.isArray(fols) ? fols : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载连接失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditConn(null);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // "/" 聚焦搜索框
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await connectionApi.delete(id);
      toast.success('连接已删除');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderItem) return;
    try {
      await folderApi.delete(deleteFolderItem.id);
      setDeleteFolderOpen(false);
      setDeleteFolderItem(null);
      toast.success('文件夹已删除');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除文件夹失败');
    }
  };

  const handleConnect = (conn: Connection) => {
    const connected = tabs.find((t) => t.connId === conn.id && t.status === 'connected');
    if (connected) {
      setActiveTabId(connected.id);
      setShowConnections(false);
      return;
    }
    const staleTabs = tabs.filter((t) => t.connId === conn.id && t.status !== 'connected');
    staleTabs.forEach((t) => closeTab(t.id));
    openTab(conn.id);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await connectionApi.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ssh_connections.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${Array.isArray(data) ? data.length : 0} 条连接`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败');
    } finally { setExporting(false); }
  };

  const filtered = search ? (connections || []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.host.toLowerCase().includes(search.toLowerCase())) : (connections || []);
  const unfoldered = filtered.filter((c) => !c.folder_id);
  const totalFolders = useMemo(() => {
    const count = (list: FolderType[]): number => list.reduce((acc, f) => acc + 1 + (f.children?.length ? count(f.children) : 0), 0);
    return count(folders);
  }, [folders]);

  // 首次加载时默认展开全部文件夹
  useEffect(() => {
    if (localStorage.getItem(EXPAND_KEY) === null && folders.length > 0) {
      setExpandedIds(new Set(flattenFolders(folders).map((f) => f.id)));
    }
  }, [folders]);

  const statusByConn = useMemo(() => {
    const map = new Map<number, TabStatus>();
    tabs.forEach((t) => { if (!map.has(t.connId)) map.set(t.connId, t.status); });
    return map;
  }, [tabs]);

  const hasActiveFilter = search.trim().length > 0;

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="page-title">连接列表</h1>
          <span className="page-subtitle">{filtered.length} 连接 · {totalFolders} 文件夹</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md px-2.5" style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-secondary)', height: 32 }}>
            <Search size={14} color="var(--text-secondary)" />
            <input
              ref={searchRef}
              className="bg-transparent border-none outline-none text-[13px]"
              style={{ color: 'var(--text-primary)', width: 170 }}
              placeholder="搜索连接名或主机..."
              aria-label="搜索连接"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
            />
            {search ? (
              <button type="button" aria-label="清除搜索" className="btn-icon btn-icon-xxs" onClick={() => setSearch('')}><X size={12} /></button>
            ) : (
              <span className="kbd" aria-hidden="true">/</span>
            )}
          </div>
          <button type="button" onClick={() => setEditFolder(null)} className="btn-secondary"><Folder size={14} /><span>新建文件夹</span></button>
          <button type="button" onClick={() => setShowImport(true)} className="btn-secondary"><Upload size={14} /><span>导入</span></button>
          <button type="button" onClick={handleExport} disabled={exporting || connections.length === 0} className="btn-secondary">
            {exporting ? <ActivityIndicator size="small" /> : <Download size={14} />}
            <span>导出</span>
          </button>
          <button type="button" onClick={() => setEditConn(null)} className="btn-primary"><Plus size={15} /><span>添加连接</span></button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 overflow-y-auto p-5"><ListSkeleton rows={6} rowHeight={52} gap={4} /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          {(folders || []).map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              connections={filtered}
              statusByConn={statusByConn}
              expandedIds={expandedIds}
              onToggle={toggleFolder}
              onEdit={setEditConn}
              onDelete={handleDelete}
              onConnect={handleConnect}
              onEditFolder={setEditFolder}
              onDeleteFolder={(f) => { setDeleteFolderItem(f); setDeleteFolderOpen(true); }}
              onMoveFolder={setMoveFolder}
            />
          ))}
          {unfoldered.length > 0 && (
            <div>
              {(folders || []).length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                  <Folder size={14} color="var(--text-tertiary)" />
                  <span className="muted-2xs" style={{ letterSpacing: '0.02em' }}>未分组</span>
                </div>
              )}
              {unfoldered.map((c) => (
                <ConnectionRow
                  key={c.id}
                  conn={c}
                  status={statusByConn.get(c.id)}
                  onEdit={() => setEditConn(c)}
                  onDelete={() => handleDelete(c.id)}
                  onConnect={() => handleConnect(c)}
                />
              ))}
            </div>
          )}
          {filtered.length === 0 && hasActiveFilter && (
            <div className="empty-state">
              <Search size={40} className="empty-state-icon" />
              <p className="empty-state-title">没有匹配「{search.trim()}」的连接</p>
              <p className="empty-state-desc">搜索会匹配连接名称与主机地址。</p>
              <button type="button" onClick={() => setSearch('')} className="btn-secondary mt-4">清除搜索</button>
            </div>
          )}
          {filtered.length === 0 && !hasActiveFilter && folders.length === 0 && (
            <div className="empty-state">
              <Server size={44} className="empty-state-icon" />
              <p className="empty-state-title">还没有 SSH 连接</p>
              <p className="empty-state-desc">添加第一个连接后即可在浏览器中打开终端。</p>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setEditFolder(null)} className="btn-secondary"><Folder size={14} /><span>新建文件夹</span></button>
                <button type="button" onClick={() => setEditConn(null)} className="btn-primary"><Plus size={15} /><span>添加连接</span></button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={editConn !== undefined} onOpenChange={(o) => { if (!o) setEditConn(undefined); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editConn ? '编辑连接' : '添加连接'}</DialogTitle></DialogHeader>
          <ConnectionForm initial={editConn} folders={folders} onSave={() => { setEditConn(undefined); loadData(); }} onCancel={() => setEditConn(undefined)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>导入连接配置</DialogTitle></DialogHeader>
          <ImportDialog onImported={loadData} onClose={() => setShowImport(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editFolder !== undefined} onOpenChange={(o) => { if (!o) setEditFolder(undefined); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editFolder ? '编辑文件夹' : '新建文件夹'}</DialogTitle></DialogHeader>
          <FolderForm initial={editFolder} folders={folders} onSave={() => { setEditFolder(undefined); loadData(); }} onCancel={() => setEditFolder(undefined)} />
        </DialogContent>
      </Dialog>

      <Dialog open={moveFolder !== null} onOpenChange={(o) => { if (!o) setMoveFolder(null); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>移动文件夹</DialogTitle></DialogHeader>
          {moveFolder && <MoveFolderForm folder={moveFolder} folders={folders} onSave={() => { setMoveFolder(null); loadData(); }} onCancel={() => setMoveFolder(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹</AlertDialogTitle>
            <AlertDialogDescription>确定要删除「{deleteFolderItem?.name}」吗？此操作将同时删除其所有子文件夹，且无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteFolderItem(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
