import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Terminal, Server, LogOut, User,
  Zap, FileText, History, Settings, Command,
  ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useSession } from '@/ctx';
import { useTerminalState } from '@/ctx/terminal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { User as ApiUser } from '@/client/api';

const COLLAPSE_KEY = 'webssh.sidebar.collapsed';
/** 视口窄于此宽度时自动收折侧栏 */
const NARROW_QUERY = '(max-width: 900px)';

interface SidebarProps {
  user: ApiUser | null;
}

const NAV_ITEMS = [
  { path: '/connections',   label: '连接列表',   icon: Server },
  { path: '/quick-commands',label: '快捷命令',   icon: Zap },
  { path: '/command-history',label: '命令历史',  icon: Command },
  { path: '/terminal-history',label: '终端历史', icon: History },
  { path: '/import-export',  label: '导入/导出',  icon: FileText },
  { path: '/settings',      label: '设置',       icon: Settings },
];

interface NavButtonProps {
  item: { path: string; label: string; icon: typeof Server };
  collapsed: boolean;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

function NavButton({ item, collapsed, active, badge, onClick }: NavButtonProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      data-collapsed={collapsed}
      className={`nav-item mx-2 ${collapsed ? 'w-12 justify-center' : 'w-[calc(100%-16px)] gap-2.5 px-3'}`}
    >
      {/* 当前页另有左侧竖条，不只靠颜色区分 */}
      <Icon size={15} style={{ flexShrink: 0 }} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="chip chip-success chip-sm">{badge}</span>
      )}
      {collapsed && badge !== undefined && badge > 0 && (
        <span
          className="status-dot"
          role="img"
          aria-label={`${badge} 个活跃会话`}
          style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'var(--success)' }}
        />
      )}
    </button>
  );
}

function useDismissOnEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export default function Sidebar({ user }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useSession();
  const { tabs } = useTerminalState();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = location.pathname;

  const activeSessions = tabs.filter((t) => t.status === 'connected').length;

  // 窄屏自动收折（用户手动切换后仍记住偏好）
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const apply = () => setCollapsed(mq.matches || localStorage.getItem(COLLAPSE_KEY) === '1');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  // 点击菜单外部时收起
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const closeUserMenu = useCallback(() => setMenuOpen(false), []);
  useDismissOnEscape(menuOpen, closeUserMenu);

  const isActive = (path: string) => pathname === path;

  const handleLogout = () => {
    signOut();
    navigate('/');
  };

  return (
    <div
      className={`flex flex-col h-full border-r transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}
      style={{ backgroundColor: 'var(--panel-bg)', borderRightColor: 'var(--border-color)' }}
    >
      {/* Logo */}
      <div className={`flex items-center justify-between h-14 border-b shrink-0 ${collapsed ? 'px-2' : 'px-3'}`} style={{ borderBottomColor: 'var(--border-color)' }}>
        <div className={`flex items-center overflow-hidden ${collapsed ? 'gap-0' : 'gap-2.5'}`}>
          <div className={`rounded-md flex items-center justify-center shrink-0 ${collapsed ? 'w-7 h-7' : 'w-8 h-8'}`} style={{ backgroundColor: 'var(--page-bg)', border: '1px solid var(--brand)' }}>
            <Terminal size={collapsed ? 15 : 17} color="var(--brand)" />
          </div>
          {!collapsed && (
            <span className="font-bold text-[14px] font-mono whitespace-nowrap" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>SSH 管理器</span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '展开菜单' : '收折菜单'}
          aria-expanded={!collapsed}
          className="btn-icon shrink-0"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.path}
            item={item}
            collapsed={collapsed}
            active={isActive(item.path)}
            badge={item.path === '/connections' ? activeSessions : undefined}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      {/* 用户信息 */}
      <div className={`border-t shrink-0 ${collapsed ? 'p-2' : 'p-2.5'}`} style={{ borderTopColor: 'var(--border-color)' }}>
        <div className="popover-anchor">
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="用户菜单"
              className="popover-panel side-popover overflow-y-auto"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                className="menu-item"
              >
                <User size={14} color="var(--text-secondary)" />
                <span>个人资料</span>
              </button>
              <div className="divider" style={{ margin: '4px 0' }} />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setLogoutOpen(true); }}
                className="menu-item menu-item-danger"
              >
                <LogOut size={14} />
                <span>退出登录</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={collapsed ? user?.username || user?.email || '用户' : undefined}
            className={`side-trigger ${collapsed ? 'justify-center gap-0 p-1.5' : 'p-1.5'}`}
          >
            <div className="size-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--panel-bg)', border: '1.5px solid var(--brand)' }}>
              <User size={13} color="var(--brand)" />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {user?.username || user?.email || '用户'}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{user?.email}</div>
                </div>
                {menuOpen ? <ChevronUp size={13} color="var(--text-secondary)" /> : <ChevronDown size={13} color="var(--text-secondary)" />}
              </>
            )}
          </button>
        </div>

        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>退出登录</AlertDialogTitle>
              <AlertDialogDescription>确定要退出当前账号吗？已打开的终端会话将断开。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout}>退出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
