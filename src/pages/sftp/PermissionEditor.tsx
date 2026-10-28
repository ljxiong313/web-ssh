import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Text as UiText } from '@/components/ui/text';
import { ActivityIndicator } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { SFTPEntry } from '@/client/api';

interface PermissionEditorProps {
  entry: SFTPEntry | null;
  mode: string;
  loading: boolean;
  onClose: () => void;
  onModeChange: (mode: string) => void;
  onApply: () => void;
}

const GROUPS = [
  { key: 'owner', label: '属主' },
  { key: 'group', label: '属组' },
  { key: 'other', label: '其他' },
] as const;

/** 八进制转 rwx 文本，用于即时预览 */
function toSymbolic(mode: string): string {
  const num = parseInt(mode || '0', 8);
  if (Number.isNaN(num)) return '---------';
  const s = (n: number) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  return `${s((num >> 6) & 7)}${s((num >> 3) & 7)}${s(num & 7)}`;
}

export default function PermissionEditor({ entry, mode, loading, onClose, onModeChange, onApply }: PermissionEditorProps) {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading && mode.trim()) onApply();
  };

  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle><UiText>修改权限</UiText></DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3 py-1">
          <p className="mono muted-xs truncate">{entry?.name}</p>

          <div className="flex gap-2">
            {GROUPS.map((group, idx) => (
              <div key={group.key} className="flex-1">
                <div className="muted-2xs text-center mb-1">{group.label}</div>
                <div className="flex gap-1 justify-center" role="group" aria-label={`${group.label}权限`}>
                  {['r', 'w', 'x'].map((perm, pIdx) => {
                    const bit = 8 - idx * 3 - pIdx;
                    const checked = ((parseInt(mode || '0', 8) || 0) >> bit) & 1;
                    return (
                      <button
                        key={perm}
                        type="button"
                        aria-pressed={!!checked}
                        aria-label={`${group.label} ${perm}`}
                        onClick={() => {
                          const val = parseInt(mode || '0', 8) || 0;
                          const newVal = checked ? val & ~(1 << bit) : val | (1 << bit);
                          onModeChange(newVal.toString(8).padStart(3, '0'));
                        }}
                        className={cn('btn btn-xs aspect-square justify-center p-0', checked ? 'btn-primary' : 'btn-secondary')}
                      >
                        {perm}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              className="input mono flex-1"
              placeholder="八进制权限 (如 755)"
              aria-label="八进制权限"
              inputMode="numeric"
              maxLength={4}
              value={mode}
              onChange={(e) => onModeChange(e.target.value.replace(/[^0-7]/g, ''))}
            />
            <span className="mono" aria-live="polite" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{toSymbolic(mode)}</span>
          </div>

          <DialogFooter>
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">取消</button>
            <button type="submit" disabled={loading || !mode.trim()} className="btn btn-primary flex-[2] justify-center">
              {loading ? <ActivityIndicator size="small" /> : null}应用
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
