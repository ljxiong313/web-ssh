import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from '@/ctx';
import AppLayout from '@/components/layout/AppLayout';
import SignIn from '@/pages/sign-in';
import Connections from '@/pages/connections';
import Profile from '@/pages/profile';
import Settings from '@/pages/settings';
import QuickCommands from '@/pages/quick-commands';
import CommandHistory from '@/pages/command-history';
import TerminalHistory from '@/pages/terminal-history';
import { ActivityIndicator, LoadingBlock } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/toast';

const ImportExport = React.lazy(() => import('@/pages/import-export'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <ActivityIndicator />
      </div>
    );
  }
  if (!session) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <ActivityIndicator />
      </div>
    );
  }
  if (session) return <Navigate to="/connections" replace />;
  return <>{children}</>;
}

function LazyRoute({ Component }: { Component: React.LazyExoticComponent<React.ComponentType<any>> }) {
  return (
    <Suspense fallback={<LoadingBlock label="加载页面…" minHeight={400} />}>
      <Component />
    </Suspense>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/connections" replace />} />
        <Route path="/sign-in" element={<PublicRoute><SignIn /></PublicRoute>} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/connections" element={<Connections />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/quick-commands" element={<QuickCommands />} />
          <Route path="/command-history" element={<CommandHistory />} />
          <Route path="/terminal-history" element={<TerminalHistory />} />
          <Route path="/import-export" element={<LazyRoute Component={ImportExport} />} />
        </Route>
        <Route path="*" element={<Navigate to="/connections" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
