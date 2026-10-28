export function ActivityIndicator({ size = 'default', label = '加载中' }: { size?: 'small' | 'default' | 'large'; label?: string }) {
  const sizeMap = { small: 16, default: 24, large: 40 };
  const s = sizeMap[size];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: s, height: s, borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
    />
  );
}

/** 整页/整块加载态：居中 spinner + 文案 */
export function LoadingBlock({ label = '加载中…', minHeight = 320 }: { label?: string; minHeight?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight, color: 'var(--text-secondary)', fontSize: 12 }}
    >
      <ActivityIndicator size="large" label={label} />
      <span>{label}</span>
    </div>
  );
}
