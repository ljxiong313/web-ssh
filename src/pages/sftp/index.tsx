/**
 * SFTP 文件管理面板（内联模式）
 * 支持：浏览目录、下载文件、删除文件、创建目录、上传文件、修改权限
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderOpen, File, Download, Trash2, Plus, X,
  Upload, Home, ChevronRight, ChevronDown, ClipboardCopy,
  RefreshCw, Settings, AlertCircle,
} from 'lucide-react';
import { sftpApi, type SFTPEntry } from '@/client/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Text as UiText } from '@/components/ui/text';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { formatSize, formatTime } from './styles';
import PermissionEditor from './PermissionEditor';

interface SFTPPanelProps {
  connId: number;
  initialPath?: string;
  onClose?: () => void;
}

export default function SFTPPanel({ connId, initialPath = '/', onClose }: SFTPPanelProps) {
  const [entries, setEntries] = useState<SFTPEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showMkdir, setShowMkdir] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [mkdirBusy, setMkdirBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<SFTPEntry | null>(null);
  const [protocol, setProtocol] = useState<'sftp' | 'scp'>('sftp');
  const [showProtocolMenu, setShowProtocolMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [chmodEntry, setChmodEntry] = useState<SFTPEntry | null>(null);
  const [chmodMode, setChmodMode] = useState('');
  const [chmodLoading, setChmodLoading] = useState(false);
  const protocolMenuRef = useRef<HTMLDivElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 最近一次请求的路径：加载失败时重试该路径，操作失败时重试当前目录 */
  const lastPathRef = useRef(initialPath);
  const uploading = actionLoading === 'upload';

  // Escape 依次收起：拖拽遮罩 → 上传中不响应 → 面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showUploadMenu) { setShowUploadMenu(false); return; }
      if (showProtocolMenu) { setShowProtocolMenu(false); return; }
      onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, showProtocolMenu, showUploadMenu]);

  // 点击菜单外部时收起：两个菜单共用一个监听，只在有菜单打开时挂载
  useEffect(() => {
    if (!showProtocolMenu && !showUploadMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showProtocolMenu && !protocolMenuRef.current?.contains(target)) setShowProtocolMenu(false);
      if (showUploadMenu && !uploadMenuRef.current?.contains(target)) setShowUploadMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProtocolMenu, showUploadMenu]);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    lastPathRef.current = path;
    try {
      const { entries } = await sftpApi.list(connId, path, protocol);
      setEntries(entries);
      setCurrentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : '目录加载失败');
    } finally { setLoading(false); }
  }, [connId, protocol]);

  useEffect(() => { loadDir(initialPath); }, [connId, loadDir]);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(currentPath);
      setCopied(true);
      toast.success('路径已复制');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败，浏览器未授权剪贴板');
    }
  };

  const handleNavigate = (entry: SFTPEntry) => {
    if (!entry.is_dir || loading) return;
    const path = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    loadDir(path);
  };

  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const parent = parts.length === 0 ? '/' : '/' + parts.slice(0, -1).join('/');
    loadDir(parent || '/');
  };

  const joinPath = (name: string) => `${currentPath}/${name}`.replace('//', '/');

  const startDownload = (url: string, filename: string, entryName: string) => {
    setActionLoading(`dl-${entryName}`);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } finally { setActionLoading(null); }
  };

  const handleDownload = (entry: SFTPEntry) =>
    startDownload(sftpApi.downloadUrl(connId, joinPath(entry.name), protocol), entry.name, entry.name);

  const handleDownloadDir = (entry: SFTPEntry) =>
    startDownload(sftpApi.downloadDirUrl(connId, joinPath(entry.name), protocol), `${entry.name}.zip`, entry.name);

  const handleDelete = async (entry: SFTPEntry) => {
    setActionLoading(`del-${entry.name}`);
    try {
      await sftpApi.delete(connId, joinPath(entry.name), protocol);
      setDeleteEntry(null);
      toast.success(`已删除 ${entry.name}`);
      loadDir(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally { setActionLoading(null); }
  };

  const handleMkdir = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDirName.trim();
    if (!name) return;
    setMkdirBusy(true);
    sftpApi.mkdir(connId, joinPath(name), protocol).then(() => {
      setShowMkdir(false);
      setNewDirName('');
      toast.success(`已创建目录 ${name}`);
      loadDir(currentPath);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : '创建目录失败');
    }).finally(() => setMkdirBusy(false));
  };

  const handleUpload = (uploadFiles: File[]) => {
    if (uploadFiles.length === 0) return;
    setUploadProgress({ current: 0, total: uploadFiles.length, name: uploadFiles[0].name });
    setActionLoading('upload');
    // Upload files sequentially to preserve order and avoid overwhelming the server
    const uploadSequential = async () => {
      let uploaded = 0;
      let failed = 0;
      let lastError = '';
      for (const file of uploadFiles) {
        setUploadProgress({ current: uploaded + failed, total: uploadFiles.length, name: file.name });
        try {
          await sftpApi.upload(connId, currentPath, [file], protocol);
          uploaded++;
        } catch (e: any) {
          failed++;
          lastError = e?.message || e?.error || String(e);
        }
      }
      setUploadProgress(null);
      setActionLoading(null);
      if (failed > 0 && uploaded === 0) {
        setError(`所有文件上传失败: ${lastError}`);
      } else if (failed > 0) {
        setError(`${uploaded} 个文件上传成功，${failed} 个失败：${lastError}`);
      } else {
        toast.success(`已上传 ${uploaded} 个文件`);
        loadDir(currentPath);
      }
    };
    uploadSequential();
  };

  const handleChmod = async () => {
    if (!chmodEntry || !chmodMode.trim()) return;
    setChmodLoading(true);
    try {
      await sftpApi.chmod(connId, joinPath(chmodEntry.name), chmodMode.trim(), protocol);
      setChmodEntry(null);
      setChmodMode('');
      toast.success('权限已更新');
      loadDir(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改权限失败');
    } finally { setChmodLoading(false); }
  };

  const openChmodDialog = (entry: SFTPEntry) => {
    // Extract octal permission from mode string like "drwxr-xr-x"
    const perms = entry.mode.replace(/^[dcbp-]/, ''); // remove type char
    let octal = 0;
    for (let i = 0; i < 9; i++) {
      const ch = perms[i];
      if ('rwxsStT'.includes(ch)) octal |= 1 << (8 - i);
    }
    setChmodMode(octal.toString(8));
    setChmodEntry(entry);
  };

  const pickFiles = (directory: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (directory) {
      (input as any).webkitdirectory = true;
      (input as any).directory = true;
    }
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      handleUpload(directory ? files.filter((f) => f.size > 0) : files);
    };
    input.click();
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (!items) return;

    const files: File[] = [];
    const traverseEntry = (entry: any, pathPrefix: string): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          entry.file(
            (file: File) => {
              // Preserve directory structure
              Object.defineProperty(file, 'webkitRelativePath', {
                value: pathPrefix + file.name,
                writable: false,
                enumerable: true,
                configurable: true,
              });
              files.push(file);
              resolve();
            },
            () => resolve() // Error handler: resolve anyway to avoid hanging
          );
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          const allEntries: any[] = [];
          const readBatch = () => {
            dirReader.readEntries((read: any[]) => {
              if (read.length === 0) {
                processEntries(0).then(resolve);
              } else {
                allEntries.push(...read);
                readBatch(); // Continue reading next batch
              }
            });
          };
          const processEntries = async (index: number): Promise<void> => {
            for (let i = index; i < allEntries.length; i++) {
              await traverseEntry(allEntries[i], pathPrefix + entry.name + '/');
            }
          };
          readBatch();
        } else {
          resolve();
        }
      });
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        promises.push(traverseEntry(entry, ''));
      } else if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    Promise.all(promises).then(() => {
      if (files.length > 0) {
        handleUpload(files);
      } else {
        setError('未能从拖拽内容中获取文件，请尝试使用上传按钮');
      }
    });
  };

  // 面包屑
  const breadcrumbs = currentPath === '/'
    ? [{ label: '/', path: '/' }]
    : [{ label: '/', path: '/' }, ...currentPath.split('/').filter(Boolean).map((part, i, arr) => ({
        label: part,
        path: '/' + arr.slice(0, i + 1).join('/'),
      }))];

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1;
    if (b.is_dir && !a.is_dir) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      ref={panelRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--page-bg)', display: 'flex', flexDirection: 'column', zIndex: 10 }}
    >
      {/* 顶栏 */}
      <div style={{ backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center px-3 py-1.5 gap-1.5">
          {/* 面包屑路径 */}
          <nav aria-label="目录路径" className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap flex-1 min-w-0 mr-2">
            {breadcrumbs.map((bc, i) => (
              <div key={bc.path} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && <ChevronRight size={11} color="var(--text-tertiary)" />}
                <button
                  type="button"
                  onClick={() => loadDir(bc.path)}
                  aria-current={i === breadcrumbs.length - 1 ? 'location' : undefined}
                  className="crumb"
                >
                  {bc.label}
                </button>
              </div>
            ))}
          </nav>

          <button onClick={handleCopyPath} className="btn-icon" aria-label="复制当前路径" title={copied ? '已复制' : '复制路径'}>
            <ClipboardCopy size={13} color={copied ? 'var(--success)' : undefined} />
          </button>
          <button onClick={() => loadDir(currentPath)} className="btn-icon" aria-label="刷新目录" title="刷新" disabled={loading}>
            {loading ? <ActivityIndicator size="small" /> : <RefreshCw size={13} />}
          </button>

          {/* 协议下拉框 */}
          <div ref={protocolMenuRef} className="popover-anchor">
            <button
              onClick={() => setShowProtocolMenu((v) => !v)}
              className="btn btn-xs btn-secondary"
              aria-haspopup="menu"
              aria-expanded={showProtocolMenu}
              title="传输协议"
            >
              <span className="mono">{protocol.toUpperCase()}</span>
              <ChevronDown size={11} />
            </button>
            {showProtocolMenu && (
              <div className="popover-panel popover-menu" role="menu" style={{ minWidth: 100 }}>
                {(['sftp', 'scp'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="menuitemradio"
                    aria-checked={p === protocol}
                    onClick={() => { setProtocol(p); setShowProtocolMenu(false); }}
                    className="menu-item"
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 上传 */}
          <div ref={uploadMenuRef} className="popover-anchor">
            <button
              onClick={() => setShowUploadMenu((v) => !v)}
              disabled={uploading}
              className="btn btn-xs btn-secondary"
              aria-haspopup="menu"
              aria-expanded={showUploadMenu}
            >
              {uploading ? <ActivityIndicator size="small" /> : <Upload size={12} />}
              上传
            </button>
            {showUploadMenu && (
              <div className="popover-panel popover-menu" role="menu">
                <button type="button" role="menuitem" className="menu-item" onClick={() => { setShowUploadMenu(false); pickFiles(false); }}>上传文件</button>
                <button type="button" role="menuitem" className="menu-item" onClick={() => { setShowUploadMenu(false); pickFiles(true); }}>上传文件夹</button>
              </div>
            )}
          </div>

          <button onClick={() => setShowMkdir(true)} className="btn btn-xs btn-secondary" disabled={uploading}>
            <Plus size={12} />新建目录
          </button>
          <button onClick={() => loadDir('/')} className="btn-icon" aria-label="回到根目录" title="回到根目录" disabled={loading}>
            <Home size={13} />
          </button>
          {onClose && (
            <button onClick={onClose} className="btn-icon ml-1" aria-label="关闭文件面板" title="关闭（Esc）">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div role="alert" className="banner banner-danger" style={{ borderRadius: 0, margin: 0 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1, wordBreak: 'break-word' }}>{error}</span>
          <button onClick={() => loadDir(lastPathRef.current)} className="btn btn-xs btn-secondary">重试</button>
          <button onClick={() => setError('')} className="btn-icon" aria-label="关闭提示"><X size={13} /></button>
        </div>
      )}

      {/* 上传进度 */}
      {uploadProgress && (
        <div className="flex flex-col gap-1 border-b px-3 py-2" style={{ borderBottomColor: 'var(--border-color)', backgroundColor: 'var(--brand-soft)' }}>
          <div className="flex items-center gap-2">
            <ActivityIndicator size="small" />
            <span className="muted-xs flex-1 truncate" style={{ color: 'var(--brand-fg)' }}>
              上传中: {uploadProgress.name}
            </span>
            <span className="mono muted-xs" style={{ color: 'var(--brand-fg)' }}>
              {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label={`上传 ${uploadProgress.name}`}
            aria-valuemin={0}
            aria-valuemax={uploadProgress.total}
            aria-valuenow={uploadProgress.current}
          >
            <div className="progress-bar" style={{ width: `${(uploadProgress.current / Math.max(uploadProgress.total, 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* 目录内容 */}
      {loading ? (
        <div className="flex-1 overflow-y-auto px-3 py-1.5"><ListSkeleton rows={8} rowHeight={30} gap={0} /></div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {currentPath !== '/' && (
            <button
              type="button"
              onClick={handleGoUp}
              aria-label="返回上级目录"
              className="row-hover flex w-full items-center gap-2 border-b px-3 py-1.5 text-left"
              style={{ borderBottomColor: 'var(--border-color)' }}
            >
              <FolderOpen size={13} color="var(--text-tertiary)" />
              <span className="mono muted-xs">..</span>
            </button>
          )}

          {/* 列标题 */}
          <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b px-3 py-1.5" style={{ borderBottomColor: 'var(--border-color)', backgroundColor: 'var(--panel-bg)' }}>
            <span className="col-head flex-1">名称</span>
            <span className="col-head" style={{ width: 60, textAlign: 'right' }}>用户</span>
            <span className="col-head" style={{ width: 60, textAlign: 'right' }}>用户组</span>
            <span className="col-head" style={{ width: 70 }}>权限</span>
            <span className="col-head" style={{ width: 80, textAlign: 'right' }}>大小</span>
            <span className="col-head" style={{ width: 110 }}>修改时间</span>
            <span className="col-head" style={{ width: 96, textAlign: 'right' }}>操作</span>
          </div>

          {sortedEntries.map((entry) => (
            <div
              key={entry.name}
              className="row-hover flex items-center gap-2.5 border-b px-3 py-1.5"
              style={{ borderBottomColor: 'var(--border-color)' }}
            >
              {entry.is_dir ? (
                <button
                  type="button"
                  onClick={() => handleNavigate(entry)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left"
                  title={`进入 ${entry.name}`}
                >
                  <FolderOpen size={13} color="var(--warning)" />
                  <span className="mono item-name text-xs">{entry.name}</span>
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <File size={13} color="var(--text-tertiary)" />
                  <span className="mono item-name text-xs">{entry.name}</span>
                </span>
              )}
              <span className="col-cell" style={{ width: 60, textAlign: 'right' }}>{entry.username}</span>
              <span className="col-cell" style={{ width: 60, textAlign: 'right' }}>{entry.groupname}</span>
              <span className="col-cell mono" style={{ width: 70 }}>{entry.mode.replace(/^[dcbp-]/, '')}</span>
              <span className="col-cell mono" style={{ width: 80, textAlign: 'right' }}>{entry.size > 0 ? formatSize(entry.size) : ''}</span>
              <span className="col-cell mono" style={{ width: 110 }}>{entry.mod_time ? formatTime(entry.mod_time) : ''}</span>
              <div className="row-actions flex items-center justify-end gap-0.5" style={{ width: 96, flexShrink: 0 }}>
                <button type="button" onClick={() => openChmodDialog(entry)} disabled={!!actionLoading} className="btn-icon btn-icon-xs" aria-label={`修改 ${entry.name} 的权限`} title="修改权限">
                  <Settings size={12} />
                </button>
                {entry.is_dir ? (
                  <button type="button" onClick={() => handleDownloadDir(entry)} disabled={actionLoading === `dl-${entry.name}`} className="btn-icon btn-icon-xs" aria-label={`下载目录 ${entry.name}（zip）`} title="下载为 zip">
                    {actionLoading === `dl-${entry.name}` ? <ActivityIndicator size="small" /> : <Download size={12} />}
                  </button>
                ) : (
                  <button type="button" onClick={() => handleDownload(entry)} disabled={actionLoading === `dl-${entry.name}`} className="btn-icon btn-icon-xs" aria-label={`下载 ${entry.name}`} title="下载">
                    {actionLoading === `dl-${entry.name}` ? <ActivityIndicator size="small" /> : <Download size={12} />}
                  </button>
                )}
                <button type="button" onClick={() => setDeleteEntry(entry)} disabled={!!actionLoading} className="btn-icon btn-icon-xs btn-icon-danger" aria-label={`删除 ${entry.name}`} title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          {sortedEntries.length === 0 && !error && (
            <div className="empty-state">
              <FolderOpen size={36} className="empty-state-icon" />
              <p className="empty-state-title">目录为空</p>
              <p className="empty-state-desc">拖拽文件或文件夹到此处上传，或新建目录</p>
            </div>
          )}
        </div>
      )}

      {/* 拖拽上传遮罩 */}
      {dragOver && (
        <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--brand-soft)', border: '2px dashed var(--brand)', borderRadius: 8, zIndex: 20, pointerEvents: 'none' }}>
          <div className="text-center">
            <Upload size={32} color="var(--brand)" style={{ marginBottom: 8 }} />
            <div style={{ color: 'var(--brand-fg)', fontSize: 14, fontWeight: 600 }}>释放以上传到 {currentPath}</div>
            <div className="muted-xs mt-1">支持拖拽文件和文件夹</div>
          </div>
        </div>
      )}

      {/* 新建目录弹窗 */}
      <Dialog open={showMkdir} onOpenChange={(o) => { setShowMkdir(o); if (!o) setNewDirName(''); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle><UiText>新建目录</UiText></DialogTitle></DialogHeader>
          <form onSubmit={handleMkdir} className="flex flex-col gap-3 py-1">
            <p className="muted-xs">在 <span className="mono">{currentPath}</span> 下创建新目录</p>
            <input
              className="input"
              placeholder="目录名"
              aria-label="目录名"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <button type="button" onClick={() => { setShowMkdir(false); setNewDirName(''); }} className="btn btn-secondary flex-1 justify-center">取消</button>
              <button type="submit" disabled={!newDirName.trim() || mkdirBusy} className="btn btn-primary flex-[2] justify-center">
                {mkdirBusy ? <ActivityIndicator size="small" /> : null}创建
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteEntry} onOpenChange={(o) => { if (!o) setDeleteEntry(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle><UiText>删除{deleteEntry?.is_dir ? '目录' : '文件'}</UiText></DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            确定删除「{deleteEntry?.name}」吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <button onClick={() => setDeleteEntry(null)} className="btn btn-secondary flex-1 justify-center">取消</button>
            <button
              onClick={() => { if (deleteEntry) handleDelete(deleteEntry); }}
              disabled={!!actionLoading}
              className="btn btn-danger flex-[2] justify-center"
            >
              {actionLoading === `del-${deleteEntry?.name}` ? <ActivityIndicator size="small" /> : <Trash2 size={13} color="var(--on-brand)" />}删除
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改权限弹窗 */}
      <PermissionEditor
        entry={chmodEntry}
        mode={chmodMode}
        loading={chmodLoading}
        onClose={() => { setChmodEntry(null); setChmodMode(''); }}
        onModeChange={setChmodMode}
        onApply={handleChmod}
      />
    </div>
  );
}
