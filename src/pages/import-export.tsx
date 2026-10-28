/**
 * 导入/导出页面
 * 支持导出连接为 JSON，以及从 JSON 导入连接
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, FileJson, CheckSquare, Square, AlertCircle, CheckCircle2 } from 'lucide-react';
import { connectionApi, type Connection } from '@/client/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text as UiText } from '@/components/ui/text';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function ImportExportPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [importJson, setImportJson] = useState<string>('');
  const [previewConns, setPreviewConns] = useState<Partial<Connection>[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await connectionApi.list() || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载连接失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = connections.length > 0 && selectedIds.size === connections.length;
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(connections.map((c) => c.id)));
  };

  const handleExport = () => {
    const toExport = connections.filter((c) => selectedIds.has(c.id));
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssh-connections-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${toExport.length} 个连接`);
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setImportResult({ ok: false, text: '请选择 JSON 文件' });
      return;
    }
    const text = await file.text();
    setImportJson(text);
    try {
      const parsed = JSON.parse(text);
      const preview = await connectionApi.previewImport(parsed);
      setPreviewConns(preview.preview);
      setPreviewCount(preview.count);
      setPreviewOpen(true);
      setImportResult(null);
    } catch (e) {
      setImportResult({ ok: false, text: e instanceof Error ? e.message : '解析失败' });
    }
  };

  const handleConfirmImport = async () => {
    setImportLoading(true);
    try {
      const parsed = JSON.parse(importJson);
      const res = await connectionApi.import(parsed);
      setImportResult({ ok: true, text: `成功导入 ${res.imported} 条连接` });
      setPreviewOpen(false);
      toast.success(`已导入 ${res.imported} 条连接`);
      loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '导入失败';
      setImportResult({ ok: false, text: msg });
      toast.error(msg);
    } finally { setImportLoading(false); }
  };

  // 真实的拖拽上传：鼠标划过子元素不再误判为拖拽状态
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="page-title">导入/导出</h1>
          <span className="page-subtitle">{connections.length} 个连接</span>
        </div>
      </header>

      <div className="page-body">
        {/* 导出区域 */}
        <div className="card mb-4" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} color="var(--brand)" />
            <h2 className="item-title flex-1">导出连接</h2>
            <span className="muted-2xs">已选 {selectedIds.size}</span>
            <button onClick={toggleAll} className="btn btn-ghost btn-xs" disabled={connections.length === 0} aria-pressed={allSelected}>
              {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>

          {loading ? (
            <ListSkeleton rows={4} rowHeight={34} />
          ) : connections.length === 0 ? (
            <span className="muted-xs">暂无连接可导出</span>
          ) : (
            <div className="flex flex-col">
              {connections.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="row-hover row-checkable flex items-center gap-2.5 rounded px-2 py-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={`选择 ${c.name}`}
                    />
                    <span className="item-name flex-1">{c.name}</span>
                    <span className="mono muted-xs">{c.username}@{c.host}:{c.port}</span>
                  </label>
                );
              })}
            </div>
          )}

          <button onClick={handleExport} disabled={selectedIds.size === 0} className="btn btn-primary w-full mt-3">
            <Download size={14} />
            导出选中 ({selectedIds.size})
          </button>
        </div>

        {/* 导入区域 */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <Upload size={16} color="var(--success)" />
            <h2 className="item-title flex-1">导入连接</h2>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="选择或拖入 JSON 文件"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            data-dragover={dragOver}
            className="dropzone"
          >
            <FileJson size={30} />
            <span className="muted-xs mt-2.5">
              {dragOver ? '松手即可导入' : '点击选择或拖入 JSON 文件'}
            </span>
            <span className="muted-2xs mt-1">导入前会先显示预览，确认后才写入</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {importResult ? (
            <div className={cn('banner mt-3', importResult.ok ? 'banner-success' : 'banner-danger')}>
              {importResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{importResult.text}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 导入预览弹窗 */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) setPreviewOpen(false); }}>
        <DialogContent size="lg" style={{ maxHeight: '90%' }}>
          <DialogHeader>
            <DialogTitle><UiText>导入预览</UiText></DialogTitle>
          </DialogHeader>
          <span className="muted-xs mb-2 block">共解析到 {previewCount} 条连接</span>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {previewConns.map((c, idx) => (
              <div key={idx} className="row-card row-card--inset mb-1.5 flex items-center gap-2 px-3 py-2">
                <span className="item-name shrink-0 truncate" style={{ width: 130 }}>{c.name}</span>
                <span className="mono muted-xs flex-1">{c.username}@{c.host}:{c.port}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 mt-3">
            <button onClick={() => setPreviewOpen(false)} className="btn btn-secondary flex-1">取消</button>
            <button onClick={handleConfirmImport} disabled={importLoading || previewCount === 0} className="btn btn-primary flex-[2]">
              {importLoading ? <ActivityIndicator size="small" /> : null}确认导入
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
