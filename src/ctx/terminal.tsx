import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Terminal } from '@xterm/xterm';
import type { Connection, QuickCommand, TerminalTheme } from '@/client/api';
import { connectionApi, wsUrl, maybeRefreshTokenBeforeRequest } from '@/client/api';

export type TabStatus = 'connecting' | 'connected' | 'failed' | 'disconnected' | 'auth_required';
export interface Tab { id: string; connId: number; conn: Connection | null; status: TabStatus; ws: WebSocket | null; }

export interface ServerStats {
  cpu: string;
  memory: string;
  disk: string;
  net_rx: string;
  net_tx: string;
  io_rx: string;
  io_tx: string;
}

interface TerminalState {
  tabs: Tab[];
  activeTabId: string;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  openTab: (connId: number) => Promise<void>;
  closeTab: (tabId: string) => void;
  showConnections: boolean;
  setShowConnections: React.Dispatch<React.SetStateAction<boolean>>;
  wsRefs: React.MutableRefObject<Map<string, WebSocket>>;
  termRefs: React.MutableRefObject<Map<string, Terminal>>;
  sessionLines: React.MutableRefObject<Map<string, string[]>>;
  openingConnIds: React.MutableRefObject<Set<number>>;
  quickCmds: QuickCommand[];
  setQuickCmds: React.Dispatch<React.SetStateAction<QuickCommand[]>>;
  theme: TerminalTheme;
  setTheme: React.Dispatch<React.SetStateAction<TerminalTheme>>;
  showPasswordDialog: boolean;
  setShowPasswordDialog: React.Dispatch<React.SetStateAction<boolean>>;
  passwordInput: string;
  setPasswordInput: React.Dispatch<React.SetStateAction<string>>;
  authTabId: string;
  setAuthTabId: React.Dispatch<React.SetStateAction<string>>;
  savePassword: boolean;
  setSavePassword: React.Dispatch<React.SetStateAction<boolean>>;
  passwordFailed: boolean;
  setPasswordFailed: React.Dispatch<React.SetStateAction<boolean>>;
  /** 需要重试密码的 tab（按 tab 隔离，避免一个会话的提示阻塞其它会话输入） */
  retryPromptTabId: string | null;
  retryAuth: (tabId: string) => void;
  savingSession: boolean;
  setSavingSession: React.Dispatch<React.SetStateAction<boolean>>;
  /** 认证通过后把密码写回连接配置（勾选“保存密码”时调用） */
  queuePasswordSave: (tabId: string, connId: number, password: string) => void;
  showQuickCmds: boolean;
  setShowQuickCmds: React.Dispatch<React.SetStateAction<boolean>>;
  showNewConnDialog: boolean;
  setShowNewConnDialog: React.Dispatch<React.SetStateAction<boolean>>;
  showSftp: boolean;
  setShowSftp: React.Dispatch<React.SetStateAction<boolean>>;
  sftpConnId: number;
  setSftpConnId: React.Dispatch<React.SetStateAction<number>>;
  stats: Record<string, ServerStats>;
  setStats: React.Dispatch<React.SetStateAction<Record<string, ServerStats>>>;
}

const TerminalContext = createContext<TerminalState | null>(null);

export function useTerminalState() {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminalState must be used within TerminalProvider');
  return ctx;
}

const defaultTheme: TerminalTheme = {
  font_family: "Consolas, 'Liberation Mono', Menlo, Courier, monospace", font_size: 14,
  foreground_color: '#E6EDF3', background_color: '#0D1117',
  cursor_color: '#2F81F7', selection_color: 'rgba(47,129,247,0.3)',
};

/** 单个会话保存在内存中的输出行数上限 */
const MAX_SESSION_LINES = 2000;

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [quickCmds, setQuickCmds] = useState<QuickCommand[]>([]);
  const [theme, setTheme] = useState<TerminalTheme>(defaultTheme);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authTabId, setAuthTabId] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [retryPromptTabId, setRetryPromptTabId] = useState<string | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showNewConnDialog, setShowNewConnDialog] = useState(false);
  const [showSftp, setShowSftp] = useState(false);
  const [sftpConnId, setSftpConnId] = useState(0);
  const [stats, setStats] = useState<Record<string, ServerStats>>({});

  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const termRefs = useRef<Map<string, Terminal>>(new Map());
  const sessionLines = useRef<Map<string, string[]>>(new Map());
  const heartbeatTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const openingConnIds = useRef<Set<number>>(new Set());
  const pendingPasswordSaves = useRef<Map<string, { connId: number; password: string }>>(new Map());
  const activeTabIdRef = useRef<string>(activeTabId);

  // 会话缓存上限：长时间运行的会话不再无界增长（保存会话时取最近若干行）
  const appendSessionLine = useCallback((tabId: string, chunk: string) => {
    const prev = sessionLines.current.get(tabId) ?? [];
    prev.push(chunk);
    if (prev.length > MAX_SESSION_LINES) prev.splice(0, prev.length - MAX_SESSION_LINES);
    sessionLines.current.set(tabId, prev);
  }, []);

  const queuePasswordSave = useCallback((tabId: string, connId: number, password: string) => {
    pendingPasswordSaves.current.set(tabId, { connId, password });
  }, []);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // 刷新前保存当前打开的 tabs 到 sessionStorage，以便刷新后自动恢复
  // 若有活跃连接，则弹出浏览器确认框提示用户
  useEffect(() => {
    const hasActive = tabs.some((t) => t.status === 'connected');
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const connIds = tabs.map((t) => t.connId);
      if (connIds.length > 0) {
        sessionStorage.setItem('terminal_tabs', JSON.stringify(connIds));
      } else {
        sessionStorage.removeItem('terminal_tabs');
      }
      if (hasActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tabs]);

  const updateTab = useCallback((tabId: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, ...patch } : t));
  }, []);

  const openTab = useCallback(async (connId: number) => {
    if (openingConnIds.current.has(connId)) return;
    openingConnIds.current.add(connId);

    const newTabId = `tab-${connId}-${Date.now()}`;
    const newTab: Tab = { id: newTabId, connId, conn: null, status: 'connecting', ws: null };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    setShowConnections(false);
    sessionLines.current.set(newTabId, []);

    let conn: Connection | null = null;
    try { conn = await connectionApi.get(connId); updateTab(newTabId, { conn }); } catch { openingConnIds.current.delete(connId); updateTab(newTabId, { status: 'failed' }); return; }

    // 创建 WebSocket 前确保 token 未过期，若即将过期则先刷新
    await maybeRefreshTokenBeforeRequest();

    const url = wsUrl(`/ws/terminal/${connId}`); const ws = new WebSocket(url);
    wsRefs.current.set(newTabId, ws);

    // 心跳保活：穿透 NAT/代理空闲超时，死连接也能被 onclose 感知
    const stopHeartbeat = () => {
      const timer = heartbeatTimers.current.get(newTabId);
      if (timer) { clearInterval(timer); heartbeatTimers.current.delete(newTabId); }
    };
    heartbeatTimers.current.set(newTabId, setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 30000));

    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      let msg: { type: string; data: string } | null = null;
      try { msg = JSON.parse(data); } catch {
        const term = termRefs.current.get(newTabId);
        if (term) term.write(data);
        appendSessionLine(newTabId, data);
        return;
      }
      if (!msg) return;
      switch (msg.type) {
        case 'connected': {
          openingConnIds.current.delete(connId);
          updateTab(newTabId, { status: 'connected', ws });
          setRetryPromptTabId((prev) => (prev === newTabId ? null : prev));
          const pending = pendingPasswordSaves.current.get(newTabId);
          if (pending) {
            pendingPasswordSaves.current.delete(newTabId);
            // 认证通过后才落盘密码，避免把错误密码写进连接配置
            connectionApi.update(pending.connId, { password: pending.password }).catch(() => {});
          }
          const term = termRefs.current.get(newTabId);
          if (term) {
            // Send resize immediately so backend PTY width matches terminal
            if (ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
              ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            }
            term.write('\r\n');
            term.focus();
          }
          break;
        }
        case 'auth_required': {
          updateTab(newTabId, { status: 'auth_required' });
          const term = termRefs.current.get(newTabId);
          if (term) term.write('\r\n需要密码进行身份验证\r\n');
          setAuthTabId(newTabId);
          setPasswordFailed(false);
          setRetryPromptTabId(null);
          setShowPasswordDialog(true);
          break;
        }
        case 'auth_retry': {
          // 5次失败或取消后，显示重试提示
          updateTab(newTabId, { status: 'failed' });
          setShowPasswordDialog(false);
          setPasswordInput('');
          setAuthTabId('');
          setPasswordFailed(true);
          setRetryPromptTabId(newTabId);
          const term = termRefs.current.get(newTabId);
          if (term) term.write(`\r\n${msg.data}\r\n`);
          break;
        }
        case 'data': case 'stderr': {
          const term = termRefs.current.get(newTabId);
          if (term) term.write(msg.data);
          appendSessionLine(newTabId, msg.data);
          break;
        }
        case 'error': {
          openingConnIds.current.delete(connId);
          updateTab(newTabId, { status: 'failed' });
          const term = termRefs.current.get(newTabId);
          if (term) term.write(`\r\n${msg.data}\r\n`);
          break;
        }
        case 'disconnect': {
          openingConnIds.current.delete(connId);
          stopHeartbeat();
          wsRefs.current.delete(newTabId);
          updateTab(newTabId, { status: 'disconnected' });
          const term = termRefs.current.get(newTabId);
          if (term) term.write('\r\n[连接已断开]\r\n');
          break;
        }
        case 'stats': {
          try {
            const s = JSON.parse(msg.data) as ServerStats;
            // 只更新当前 activeTab 的 stats，避免后台 tab 数据干扰
            if (newTabId === activeTabIdRef.current) {
              setStats((prev) => ({ ...prev, [newTabId]: s }));
            }
          } catch {}
          break;
        }
        case 'recording': {
          // 录制状态变更，由页面组件处理
          break;
        }
      }
    };
    ws.onerror = () => { stopHeartbeat(); };
    // 握手失败（如 401 升级被拒）可能只有 close 没有 error，必须在此释放 openingConnIds；
    // 重连场景旧 ws 的 close 事件会晚于新 tab 打开，须确认 wsRefs 仍指向本连接才清理
    ws.onclose = () => {
      if (wsRefs.current.get(newTabId) !== ws) return;
      openingConnIds.current.delete(connId);
      stopHeartbeat();
      wsRefs.current.delete(newTabId);
      updateTab(newTabId, { status: 'disconnected' });
    };
  }, [updateTab, appendSessionLine, setAuthTabId, setShowPasswordDialog]);

  // 页面刷新后自动恢复之前打开的 SSH 连接
  useEffect(() => {
    const raw = sessionStorage.getItem('terminal_tabs');
    if (raw) {
      try {
        const connIds = JSON.parse(raw) as number[];
        connIds.forEach((connId) => openTab(connId));
      } catch {}
      sessionStorage.removeItem('terminal_tabs');
    }
  }, [openTab]);

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) openingConnIds.current.delete(tab.connId);
    const timer = heartbeatTimers.current.get(tabId);
    if (timer) { clearInterval(timer); heartbeatTimers.current.delete(tabId); }
    wsRefs.current.get(tabId)?.close();
    wsRefs.current.delete(tabId);
    termRefs.current.delete(tabId);
    sessionLines.current.delete(tabId);
    pendingPasswordSaves.current.delete(tabId);
    setRetryPromptTabId((prev) => (prev === tabId ? null : prev));
    setStats((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabIdRef.current === tabId && next.length > 0) {
        const newActive = idx < next.length ? next[idx] : next[next.length - 1];
        setActiveTabId(newActive.id);
      }
      return next;
    });
  }, [tabs]);

  const retryAuth = useCallback((tabId: string) => {
    const ws = wsRefs.current.get(tabId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'retry_auth' }));
    }
    setRetryPromptTabId(null);
    setPasswordFailed(false);
  }, []);

  return (
    <TerminalContext.Provider value={{
      tabs, activeTabId, setActiveTabId, openTab, closeTab,
      showConnections, setShowConnections,
      wsRefs, termRefs, sessionLines, openingConnIds,
      quickCmds, setQuickCmds, theme, setTheme,
      showPasswordDialog, setShowPasswordDialog,
      passwordInput, setPasswordInput,
      authTabId, setAuthTabId,
      savePassword, setSavePassword,
      passwordFailed, setPasswordFailed,
      retryPromptTabId,
      retryAuth,
      savingSession, setSavingSession,
      queuePasswordSave,
      showQuickCmds, setShowQuickCmds,
      showNewConnDialog, setShowNewConnDialog,
      showSftp, setShowSftp, sftpConnId, setSftpConnId,
      stats, setStats,
    }}>
      {children}
    </TerminalContext.Provider>
  );
}
