import { useEffect, useState } from 'react';

/** 输入防抖：搜索框改动后 delay 毫秒才驱动请求，避免逐字符重取 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
