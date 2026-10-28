import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, X, Plus, WifiOff, RotateCcw, Save, FolderOpen, Lock, Server, Zap } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { connectionApi, terminalSessionApi, quickCommandApi, terminalThemeApi, type Connection } from '@/client/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Text as UiText } from '@/components/ui/text';
import { ActivityIndicator } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { buildXtermTheme } from '@/lib/terminalTheme';
import { useTerminalState } from '@/ctx/terminal';
import SFTPPanel from '../sftp/index';
import ServerStatsBar from './ServerStatsBar';
import AddConnectionPanel from './AddConnectionPanel';

// Individual xterm container for a single tab
function XtermContainer({ tabId, theme }: { tabId: string; theme: ReturnType<typeof useTerminalState>['theme'] }) {
  const { termRefs, wsRefs, activeTabId, retryPromptTabId, retryAuth } = useTerminalState();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isActive = tabId === activeTabId;
  const showRetryPrompt = retryPromptTabId === tabId;
  const showRetryPromptRef = useRef(showRetryPrompt);

  // 保持 ref 同步最新值
  useEffect(() => {
    showRetryPromptRef.current = showRetryPrompt;
  }, [showRetryPrompt]);

  // Initialize xterm once per tab
  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let ro: ResizeObserver | null = null;

    // Delay init to ensure container has proper dimensions in Chrome
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (disposed || !container) return;
      term = new Terminal({
        cursorBlink: true, cursorStyle: 'bar',
        fontSize: theme.font_size, fontFamily: theme.font_family,
        letterSpacing: 1,
        lineHeight: 1.2,
        scrollback: 5000,
        theme: buildXtermTheme(theme),
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      // Force reflow then fit
      void container.offsetWidth;
      fitAddon.fit();
      // Send resize immediately so backend PTY matches actual terminal size
      const sendResize = () => {
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN && term && term.cols && term.rows) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };
      sendResize();
      // Additional fit passes for layout stability
      requestAnimationFrame(() => {
        if (disposed || !term) return;
        fitAddon.fit();
        sendResize();
        term.refresh(0, term.rows - 1);
        setTimeout(() => {
          if (disposed || !term) return;
          fitAddon.fit();
          sendResize();
          term.refresh(0, term.rows - 1);
        }, 100);
      });

      termRef.current = term;
      fitRef.current = fitAddon;
      termRefs.current.set(tabId, term);

      term.onData((data) => {
        // 重试提示期间，阻止该 tab 的终端数据发送（其它会话不受影响）
        if (showRetryPromptRef.current) return;
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      // 右键：有选区时复制到剪贴板，无选区时粘贴剪贴板内容。
      // 不再把选区直接写入 stdin——选中输出文本后右键会误注入命令。
      term.element?.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        if (!term) return;
        const selection = term.getSelection();
        if (selection) {
          try {
            await navigator.clipboard.writeText(selection);
          } catch {
            toast.error('无法写入剪贴板，请手动 Ctrl+C 复制');
          }
          return;
        }
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState !== WebSocket.OPEN) return;
        try {
          const text = await navigator.clipboard.readText();
          if (text) ws.send(JSON.stringify({ type: 'data', data: text }));
        } catch {
          toast.error('浏览器未授权读取剪贴板，请在终端内直接粘贴');
        }
      });

      // 拦截回车键，当显示重试提示时触发重试
      term.onKey(({ key, domEvent }) => {
        if (showRetryPromptRef.current && key === '\r') {
          domEvent.preventDefault();
          // 不修改 ref，保持 true 以阻止 onData 发送数据
          // retryAuth 会清空 retryPromptTabId，useEffect 会在下次渲染时同步 ref
          retryAuth(tabId);
        }
      });

      ro = new ResizeObserver(() => {
        if (!term) return;
        try {
          fitAddon.fit();
          term.refresh(0, term.rows - 1);
        } catch {}
        setTimeout(sendResize, 100);
      });
      ro.observe(container);
    }, 100);

    return () => {
      disposed = true;
      clearTimeout(timer);
      ro?.disconnect();
      termRefs.current.delete(tabId);
      term?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // theme 仅用于首次创建，后续通过下面的 effect 更新
  }, [tabId]);

  // Update theme
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = theme.font_size;
      termRef.current.options.fontFamily = theme.font_family;
      termRef.current.options.letterSpacing = 1;
      termRef.current.options.lineHeight = 1.2;
      termRef.current.options.theme = buildXtermTheme(theme);
      setTimeout(() => {
        try { fitRef.current?.fit(); } catch {}
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN && termRef.current?.cols && termRef.current?.rows) {
          ws.send(JSON.stringify({ type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows }));
        }
      }, 150);
    }
  }, [theme, tabId, wsRefs]);

  // Focus when tab becomes active
  useEffect(() => {
    if (isActive) {
      setTimeout(() => termRef.current?.focus(), 100);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="flex-1"
      style={{
        backgroundColor: 'var(--term-bg)',
        overflow: 'hidden',
        position: 'absolute',
        inset: 0,
        visibility: isActive ? 'visible' : 'hidden',
        pointerEvents: isActive ? 'auto' : 'none',
        width: '100%',
        height: '100%',
        paddingLeft: 8,
      }}
    />
  );
}

export default function TerminalPage() {
  const { activeTabId, tabs, setActiveTabId, theme, setTheme, quickCmds, setQuickCmds,
    showQuickCmds, setShowQuickCmds, setShowNewConnDialog,
    showPasswordDialog, setShowPasswordDialog, passwordInput, setPasswordInput,
    authTabId, setAuthTabId, savePassword, setSavePassword,
    retryPromptTabId, retryAuth,
    savingSession, setSavingSession, queuePasswordSave,
    openTab, closeTab, setShowConnections,
    showNewConnDialog, wsRefs, termRefs, sessionLines,
    showSftp, setShowSftp, sftpConnId, setSftpConnId,
    stats } = useTerminalState();
  const [dialogConns, setDialogConns] = useState<Connection[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [showAddConnForm, setShowAddConnForm] = useState(false);
  const [sftpInitialPath, setSftpInitialPath] = useState('/');
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  // 加载失败时回落到默认值，但要提示，避免用户误以为"没有数据"
  useEffect(() => {
    terminalThemeApi.get().then(setTheme).catch(() => toast.error('终端主题加载失败，已使用默认设置'));
  }, [setTheme]);
  useEffect(() => {
    quickCommandApi.list().then(setQuickCmds).catch(() => toast.error('快捷命令加载失败'));
  }, [setQuickCmds]);


  // Load connections when dialog opens
  useEffect(() => {
    if (showNewConnDialog) {
      setDialogLoading(true);
      connectionApi.list().then((conns) => {
        setDialogConns(conns);
        setDialogLoading(false);
      }).catch(() => {
        setDialogConns([]);
        setDialogLoading(false);
        toast.error('连接列表加载失败');
      });
    }
  }, [showNewConnDialog]);

  // Close SFTP panel when switching to a different tab
  useEffect(() => {
    if (showSftp) {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab && activeTab.connId !== sftpConnId) {
        setShowSftp(false);
      }
    }
  }, [activeTabId]);

  // 会话进行中关闭标签会直接断开 SSH，先确认；已断开/失败的标签直接关闭
  const requestCloseTab = useCallback((tabId: string) => {
    const t = tabs.find((x) => x.id === tabId);
    if (!t) return;
    if (t.status === 'connected' || t.status === 'connecting' || t.status === 'auth_required') {
      setPendingCloseTabId(tabId);
    } else {
      closeTab(tabId);
    }
  }, [closeTab, tabs]);

  const handleSelectConn = (connId: number) => {
    setShowNewConnDialog(false);
    openTab(connId);
  };

  const handleAddNew = () => {
    setShowNewConnDialog(false);
    setShowAddConnForm(true);
  };

  const handleAddConnSaved = async () => {
    try {
      const conns = await connectionApi.list();
      const latest = conns.reduce<Connection | null>((a, b) => (a === null || b.id > a.id ? b : a), null);
      if (!latest) {
        toast.error('连接已保存，但列表中找不到它');
        return;
      }
      openTab(latest.id);
    } catch {
      toast.error('连接已保存，但打开终端失败');
    }
  };

  const sendToTerminal = useCallback((data: string) => {
    const ws = wsRefs.current.get(activeTabId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  }, [activeTabId, wsRefs]);

  const handleQuickCmd = (cmd: string) => {
    sendToTerminal(cmd + '\n');
    setShowQuickCmds(false);
  };

  // Get current working directory by sending a hidden command through the interactive session
  // The backend writes to the existing session's stdin and captures stdout without showing in terminal
  const getCwd = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const ws = wsRefs.current.get(activeTabId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve('/');
        return;
      }
      // Prefix with space to mark as hidden command (backend handles it specially)
      const cmd = ' pwd\n';
      const handleHiddenOutput = (ev: MessageEvent) => {
        let msg: { type: string; data: string } | null = null;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg?.type === 'hidden_output') {
          ws.removeEventListener('message', handleHiddenOutput);
          const path = msg.data.trim();
          if (path.startsWith('/')) {
            resolve(path);
          } else {
            resolve('/');
          }
        }
      };
      ws.addEventListener('message', handleHiddenOutput);
      ws.send(JSON.stringify({ type: 'data', data: cmd }));
      // Fallback timeout
      setTimeout(() => {
        ws.removeEventListener('message', handleHiddenOutput);
        resolve('/');
      }, 1500);
    });
  }, [activeTabId, wsRefs]);

  const handleSaveSession = async () => {
    const t = tabs.find((t) => t.id === activeTabId);
    if (!t?.conn) return;
    setSavingSession(true);
    try {
      const content = (sessionLines.current.get(activeTabId) ?? []).join('');
      if (!content.trim()) {
        toast.info('会话还没有输出内容');
        return;
      }
      await terminalSessionApi.save({ connection_id: t.connId, conn_name: t.conn.name, content, saved_at: new Date().toISOString() });
      toast.success('会话已保存');
    } catch {
      toast.error('会话保存失败');
    } finally { setSavingSession(false); }
  };

  const handleSubmitPassword = (e?: React.FormEvent) => {
    e?.preventDefault();
    const pwd = passwordInput.trim();
    if (!pwd || !authTabId) return;
    const ws = wsRefs.current.get(authTabId);
    if (ws?.readyState !== WebSocket.OPEN) {
      toast.error('连接已断开，请重连后再输入密码');
      setShowPasswordDialog(false); setPasswordInput(''); setAuthTabId('');
      return;
    }
    ws.send(JSON.stringify({ type: 'auth_password', data: pwd }));
    termRefs.current.get(authTabId)?.write('正在验证密码...\r\n');
    if (savePassword) {
      const tab = tabs.find((t) => t.id === authTabId);
      if (tab) queuePasswordSave(authTabId, tab.connId, pwd);
    }
    setShowPasswordDialog(false); setPasswordInput(''); setAuthTabId(''); setSavePassword(false);
  };

  // Alt 组合键快捷操作（Ctrl/Cmd+T、Ctrl/Cmd+W 被浏览器保留，无法可靠拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') { e.preventDefault(); setShowNewConnDialog(true); }
      else if (key === 'w') { e.preventDefault(); if (activeTabId) requestCloseTab(activeTabId); }
      else if (key === 'q') { e.preventDefault(); setShowQuickCmds((v) => !v); }
      else if (key >= '1' && key <= '9') {
        e.preventDefault();
        const target = tabs[Number(key) - 1];
        if (target) setActiveTabId(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTabId, requestCloseTab, setActiveTabId, setShowNewConnDialog, setShowQuickCmds, tabs]);

  const handleCancelPassword = () => {
    const tabId = authTabId;
    // 发送取消消息给后端，后端会返回 auth_retry 消息触发重试提示
    const ws = wsRefs.current.get(tabId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel' }));
    }
    setShowPasswordDialog(false); setPasswordInput(''); setAuthTabId(''); setSavePassword(false);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const statusColor: Record<string, string> = { connecting: 'var(--warning)', connected: 'var(--success)', failed: 'var(--danger)', disconnected: 'var(--text-secondary)', auth_required: 'var(--warning)' };
  const statusLabel: Record<string, string> = { connecting: '连接中', connected: '已连接', failed: '连接失败', disconnected: '已断开', auth_required: '需要密码' };
  const terminalBg = theme.background_color || 'var(--page-bg)';

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: terminalBg }}>
        <p className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>打开一个连接开始使用</p>
        <button onClick={() => setShowNewConnDialog(true)} className="btn btn-primary">选择或新建连接</button>
        <p className="muted-2xs">Alt+N 选择连接 · Alt+1-9 切换标签 · Alt+W 关闭标签</p>
      </div>
    );
  }

  const displayTabId = activeTab?.id ?? tabs[0].id;
  const displayTab = tabs.find((t) => t.id === displayTabId);
  const sftpActive = showSftp && displayTab !== undefined && sftpConnId === displayTab.connId;
  const authConn = tabs.find((t) => t.id === authTabId)?.conn;
  const authConnLabel = authConn ? `${authConn.username}@${authConn.host}` : '';

  return (
    <div
      className="flex-1 flex flex-col h-full"
      style={{ '--term-bg': terminalBg, backgroundColor: 'var(--term-bg)' } as React.CSSProperties}
    >
      {/* Tab bar */}
      <div style={{ backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>
        <div
          role="tablist"
          aria-label="终端会话"
          className="flex items-center px-2 pt-1.5 overflow-x-auto"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const idx = tabs.findIndex((t) => t.id === displayTabId);
            const next = e.key === 'ArrowRight'
              ? tabs[(idx + 1 + tabs.length) % tabs.length]
              : tabs[(idx - 1 + tabs.length) % tabs.length];
            if (next) setActiveTabId(next.id);
          }}
        >
          <button onClick={() => setShowConnections(true)} className="btn-icon mr-1 shrink-0" aria-label="返回连接列表" title="返回连接列表"><ArrowLeft size={16} /></button>
          {tabs.map((t) => {
            const active = t.id === displayTabId;
            const label = t.conn ? `${t.conn.username}@${t.conn.host}` : '连接中...';
            return (
              <div
                key={t.id}
                role="presentation"
                data-active={active}
                className="term-tab"
                onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); requestCloseTab(t.id); } }}
              >
                <button
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTabId(t.id)}
                  className="term-tab-btn"
                  title={`${label} · ${statusLabel[t.status]}`}
                  style={{ fontFamily: theme.font_family }}
                >
                  <span className="status-dot" style={{ backgroundColor: statusColor[t.status] }} />
                  <span className="max-w-[16ch] truncate">{label}</span>
                </button>
                <button onClick={() => requestCloseTab(t.id)} className="btn-icon btn-icon-xs mr-1" aria-label={`关闭 ${label}`} title="关闭标签（Alt+W）"><X size={12} /></button>
              </div>
            );
          })}
          <button onClick={() => setShowNewConnDialog(true)} className="btn-icon mx-1 shrink-0" aria-label="新建终端标签" title="新建标签（Alt+N）"><Plus size={15} /></button>
        </div>
        {/* Status bar */}
        {displayTab && (
          <div className="flex items-center px-3 py-1.5 gap-2">
            <span className="flex items-center gap-1.5 mr-auto" style={{ color: statusColor[displayTab.status], fontSize: 11 }}>
              <span className="status-dot" style={{ backgroundColor: statusColor[displayTab.status] }} />
              {statusLabel[displayTab.status]}
            </span>
            <button
              onClick={() => setShowQuickCmds((v) => !v)}
              className="btn btn-xs btn-ghost"
              aria-pressed={showQuickCmds}
              title="快捷命令（Alt+Q）"
            >
              <Zap size={12} />快捷命令
            </button>
            {displayTab.status === 'connected' && displayTab.conn && (
              <button
                onClick={async () => {
                  if (sftpActive) {
                    setShowSftp(false);
                  } else {
                    const cwd = await getCwd();
                    setSftpInitialPath(cwd);
                    setSftpConnId(displayTab.connId);
                    setShowSftp(true);
                  }
                }}
                className="btn btn-xs btn-ghost"
                aria-pressed={sftpActive}
              >
                <FolderOpen size={12} />SFTP
              </button>
            )}
            {displayTab.status === 'connected' && (
              <button onClick={handleSaveSession} disabled={savingSession} className="btn btn-xs btn-secondary" title="保存当前会话输出到终端历史">
                {savingSession ? <ActivityIndicator size="small" /> : <Save size={12} />}{savingSession ? '保存中' : '保存会话'}
              </button>
            )}
            {(displayTab.status === 'failed' || displayTab.status === 'auth_required' || displayTab.status === 'disconnected') && (
              <button onClick={() => { closeTab(displayTab.id); openTab(displayTab.connId); }} className="btn btn-xs btn-primary">
                <RotateCcw size={12} />重连
              </button>
            )}
            {displayTab.status === 'connected' && (
              <button onClick={() => requestCloseTab(displayTab.id)} className="btn btn-xs btn-danger-soft">
                <WifiOff size={12} />断开
              </button>
            )}
          </div>
        )}
      </div>

      {/* Terminal area with optional SFTP panel overlay */}
      <div className="flex-1" style={{ position: 'relative', backgroundColor: terminalBg }}>
        {tabs.map((t) => (
          <XtermContainer key={t.id} tabId={t.id} theme={theme} />
        ))}
        {showSftp && <SFTPPanel connId={sftpConnId} initialPath={sftpInitialPath} onClose={() => setShowSftp(false)} />}
      </div>

      {/* Bottom bars and dialogs */}
      {displayTab?.status === 'connected' && <ServerStatsBar stats={stats[displayTab.id]} />}
      {showQuickCmds && (
        <div className="max-h-[180px] overflow-y-auto p-2 flex flex-wrap gap-1.5" style={{ backgroundColor: 'var(--panel-bg)', borderTop: '1px solid var(--border-secondary)' }}>
          {quickCmds.length === 0 ? (
            <span className="muted-xs p-1">暂无快捷命令，可在「快捷命令」页面添加</span>
          ) : (
            quickCmds.map((cmd) => (
              <button key={cmd.id} onClick={() => handleQuickCmd(cmd.command)} className="btn btn-xs btn-secondary mono" title={cmd.command}>{cmd.name}</button>
            ))
          )}
        </div>
      )}
      {displayTab?.status === 'connecting' && (
        <div role="status" className="term-statusbar">
          <ActivityIndicator size="small" />
          <span style={{ color: 'var(--text-secondary)' }}>正在建立 SSH 连接...</span>
        </div>
      )}
      {retryPromptTabId === displayTabId && (
        <div role="alert" className="term-statusbar">
          <Lock size={14} color="var(--danger)" />
          <span style={{ color: 'var(--danger)' }}>密码错误，按回车重试</span>
          <button onClick={() => retryAuth(displayTabId)} className="btn btn-xs btn-secondary">重试</button>
        </div>
      )}
      {displayTab?.status === 'auth_required' && retryPromptTabId !== displayTabId && (
        <div role="status" className="term-statusbar">
          <Lock size={14} color="var(--warning)" />
          <span style={{ color: 'var(--warning)' }}>需要密码进行身份验证</span>
          <button onClick={() => { setAuthTabId(displayTab.id); setShowPasswordDialog(true); }} className="btn btn-xs btn-primary">输入密码</button>
        </div>
      )}
      {displayTab?.status === 'failed' && (
        <div role="alert" className="term-statusbar">
          <span style={{ color: 'var(--danger)' }}>连接失败</span>
          <button onClick={() => setShowConnections(true)} className="btn btn-xs btn-secondary">返回</button>
        </div>
      )}
      <AddConnectionPanel open={showAddConnForm} onClose={() => setShowAddConnForm(false)} onSaved={handleAddConnSaved} />
      <Dialog open={showNewConnDialog} onOpenChange={setShowNewConnDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle><UiText>选择连接</UiText></DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2 max-h-[400px] overflow-y-auto">
            {dialogLoading ? (
              <ListSkeleton rows={4} rowHeight={54} />
            ) : dialogConns.length === 0 ? (
              <p className="muted-xs py-8 text-center">暂无连接</p>
            ) : (
              dialogConns.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => handleSelectConn(conn.id)}
                  className="row-hover row-card row-card--inset flex items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  <Server size={16} color="var(--text-secondary)" />
                  <div className="flex-1 min-w-0">
                    <div className="item-name">{conn.name}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{conn.username}@{conn.host}:{conn.port}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex gap-2.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button onClick={handleAddNew} className="btn btn-primary flex-1 justify-center">
              <Plus size={14} />新建连接
            </button>
            <button onClick={() => setShowNewConnDialog(false)} className="btn btn-secondary flex-1 justify-center">取消</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle><UiText>输入 SSH 密码</UiText></DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitPassword} className="flex flex-col gap-3 py-1">
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>连接 {authConnLabel} 需要密码验证</p>
            <div className="flex flex-col gap-1.5">
              <label className="label-text" htmlFor="ssh-password-input">SSH 密码</label>
              <input
                id="ssh-password-input"
                type="password"
                className="input input-lg"
                autoComplete="current-password"
                placeholder="输入 SSH 密码"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={savePassword}
                onChange={(e) => setSavePassword(e.target.checked)}
                style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>保存密码到连接配置（认证通过后写入）</span>
            </label>
            <div className="flex gap-2.5 mt-1">
              <button type="button" onClick={handleCancelPassword} className="btn btn-secondary flex-1 justify-center">取消</button>
              <button type="submit" disabled={!passwordInput.trim()} className="btn btn-primary flex-[2] justify-center">确认连接</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingCloseTabId !== null}
        onOpenChange={(o) => { if (!o) setPendingCloseTabId(null); }}
        title="关闭标签将断开会话"
        description={(() => {
          const t = tabs.find((x) => x.id === pendingCloseTabId);
          if (!t?.conn) return '该标签的会话仍在进行中，关闭后将断开连接。';
          return `${t.conn.username}@${t.conn.host} 的会话仍在进行中，关闭后将断开连接。`;
        })()}
        confirmText="断开并关闭"
        onConfirm={() => { if (pendingCloseTabId) closeTab(pendingCloseTabId); }}
      />
    </div>
  );
}
