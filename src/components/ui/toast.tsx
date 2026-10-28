import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
  closing?: boolean;
}

type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let seq = 0;

function push(message: string, variant: ToastVariant, duration: number) {
  seq += 1;
  const item: ToastItem = { id: seq, message, variant, duration };
  listeners.forEach((fn) => fn(item));
}

/** 全局轻提示：任何模块可直接调用，无需 context。 */
export const toast = {
  success: (message: string, duration = 2600) => push(message, 'success', duration),
  error: (message: string, duration = 5200) => push(message, 'error', duration),
  info: (message: string, duration = 3200) => push(message, 'info', duration),
};

const ICONS = {
  success: { Icon: CheckCircle2, color: 'var(--success)' },
  error: { Icon: AlertCircle, color: 'var(--danger)' },
  info: { Icon: Info, color: 'var(--brand-fg)' },
} as const;

const MAX_VISIBLE = 4;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const scheduled = useRef(new Set<number>());

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
    };
    listeners.add(listener);
    const pending = timers.current;
    return () => {
      listeners.delete(listener);
      pending.forEach((handle) => window.clearTimeout(handle));
      pending.clear();
      scheduled.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, closing: true } : i)));
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 160);
  }, []);

  useEffect(() => {
    items.forEach((item) => {
      if (item.closing || item.duration <= 0 || scheduled.current.has(item.id)) return;
      scheduled.current.add(item.id);
      timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), item.duration));
    });
  }, [items, dismiss]);

  if (!items.length) return null;

  return (
    <div className="toast-stack" role="region" aria-label="通知" aria-live="polite">
      {items.map(({ id, message, variant, closing }) => {
        const { Icon, color } = ICONS[variant];
        return (
          <div key={id} className={`toast toast-${variant}`} data-state={closing ? 'closing' : 'open'}>
            <Icon size={14} style={{ color, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span style={{ flex: 1, lineHeight: 1.45, wordBreak: 'break-word' }}>{message}</span>
            <button
              type="button"
              className="btn-icon btn-icon-xxs"
              style={{ marginLeft: 2 }}
              aria-label="关闭通知"
              onClick={() => dismiss(id)}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
