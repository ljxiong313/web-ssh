import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Terminal from '@/pages/terminal';
import { useSession } from '@/ctx';
import { useTerminalState } from '@/ctx/terminal';

function TerminalOrOutlet() {
  const location = useLocation();
  const { tabs, showConnections } = useTerminalState();
  const hasOpenTabs = tabs.length > 0;

  // Terminal is always rendered here (never via routes), show it when:
  // - showConnections is false AND we're on /connections with open tabs
  const showTerminal = !showConnections && location.pathname === '/connections' && hasOpenTabs;

  return (
    <div className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        visibility: showTerminal ? 'visible' : 'hidden',
        pointerEvents: showTerminal ? 'auto' : 'none',
      }}>
        <Terminal />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        visibility: showTerminal ? 'hidden' : 'visible',
        pointerEvents: showTerminal ? 'none' : 'auto',
      }}>
        <Outlet />
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { session } = useSession();

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <Sidebar user={session?.user ?? null} />
      <TerminalOrOutlet />
    </div>
  );
}
