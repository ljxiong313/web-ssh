import type { TerminalTheme } from '@/client/api';

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 深色终端面板主题，取自当前 CSS 令牌（切换明暗后重新打开即生效） */
export function readTerminalTheme(): XtermTheme {
  return {
    background: cssVar('--page-bg', '#0d1117'),
    foreground: cssVar('--text-primary', '#e6edf3'),
    cursor: cssVar('--brand', '#2f81f7'),
    selectionBackground: cssVar('--brand-soft', 'rgba(47,129,247,0.3)'),
  };
}

/** 用户/服务端配置的终端主题优先，缺失字段回落到令牌 */
export function buildXtermTheme(theme?: Partial<TerminalTheme> | null): XtermTheme {
  const base = readTerminalTheme();
  return {
    background: theme?.background_color || base.background,
    foreground: theme?.foreground_color || base.foreground,
    cursor: theme?.cursor_color || base.cursor,
    selectionBackground: theme?.selection_color || base.selectionBackground,
  };
}
