import { useEffect, useId, useRef, useState } from 'react';
import { Folder, ChevronDown } from 'lucide-react';
import { type Folder as FolderType } from '@/client/api';

const MAX_DEPTH = 5;

export function flattenFolders(folders: FolderType[], depth = 0): (FolderType & { depth: number })[] {
  if (!Array.isArray(folders)) return [];
  const result: (FolderType & { depth: number })[] = [];
  for (const f of folders) {
    result.push({ ...f, depth });
    if (Array.isArray(f.children) && f.children.length) result.push(...flattenFolders(f.children, depth + 1));
  }
  return result;
}

export function FolderTreeSelect({
  folders,
  selectedId,
  onSelect,
  excludeId,
  maxDepth = MAX_DEPTH,
  label = '选择文件夹',
}: {
  folders: FolderType[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  excludeId?: number;
  maxDepth?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: { id: number | null; name: string; depth: number }[] = [
    { id: null, name: '根目录', depth: 0 },
    ...flattenFolders(folders)
      .filter((f) => f.id !== excludeId && f.depth < maxDepth)
      .map((f) => ({ id: f.id, name: f.name, depth: f.depth })),
  ];

  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === selectedId));
  const selectedName = options[selectedIndex].name;

  useEffect(() => {
    if (!open) return;
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    items?.[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  const choose = (id: number | null) => { onSelect(id); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (items.length === 0) return;
    const current = items.findIndex((el) => el === document.activeElement);
    let next = current;
    if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    if (e.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    items[next]?.focus();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="input flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Folder size={13} color="var(--warning)" style={{ flexShrink: 0 }} />
          <span className="truncate">{selectedName}</span>
        </span>
        <ChevronDown size={13} color="var(--text-secondary)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 140ms' }} />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          id={labelId}
          aria-label={label}
          className="popover-panel absolute left-0 right-0 fade-in"
          style={{ top: '100%', marginTop: 4, zIndex: 50, maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}
        >
          {options.map((o) => {
            const active = o.id === selectedId;
            return (
              <button
                key={o.id ?? 'root'}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                onClick={() => choose(o.id)}
                className={`menu-item${o.id === null ? ' menu-item--muted' : ''}`}
                style={{ paddingLeft: 10 + o.depth * 16 }}
              >
                <Folder size={12} color={o.id === null ? 'var(--text-secondary)' : 'var(--warning)'} style={{ flexShrink: 0 }} />
                <span className="truncate">{o.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FolderTreeSelect;
