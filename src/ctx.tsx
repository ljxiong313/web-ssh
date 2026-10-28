/**
 * 认证上下文 - 基于 Go 后端 JWT Token
 * 使用 localStorage 持久化 Token，支持 Refresh Token 自动刷新
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setToken, setRefreshToken, setOnAuthError, getRefreshToken, type User } from '@/client/api';

const TOKEN_KEY = 'ssh_manager_token';
const REFRESH_TOKEN_KEY = 'ssh_manager_refresh_token';
const USER_KEY = 'ssh_manager_user';

type AuthSession = {
  token: string;
  refreshToken: string;
  user: User;
};

type SessionContextType = {
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  setSessionDirect: (token: string, refreshToken: string, user: User) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
  signIn: async () => {},
  setSessionDirect: () => {},
  signOut: () => {},
});

function loadStored(): AuthSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (token && refreshToken && userStr) {
      const user = JSON.parse(userStr) as User;
      return { token, refreshToken, user };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveStored(session: AuthSession) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } catch {
    // ignore
  }
}

function clearStored() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setToken(stored.token);
      setRefreshToken(stored.refreshToken);
      setSession(stored);
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const newSession: AuthSession = { token: res.token, refreshToken: res.refresh_token, user: res.user };
    setToken(res.token);
    setRefreshToken(res.refresh_token);
    saveStored(newSession);
    setSession(newSession);
  }, []);

  const setSessionDirect = useCallback((token: string, refreshToken: string, user: User) => {
    const newSession: AuthSession = { token, refreshToken, user };
    setToken(token);
    setRefreshToken(refreshToken);
    saveStored(newSession);
    setSession(newSession);
  }, []);

  const signOut = useCallback(() => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      authApi.logout(refreshToken).catch(() => {});
    }
    setToken(null);
    setRefreshToken(null);
    clearStored();
    setSession(null);
  }, []);

  useEffect(() => {
    setOnAuthError(() => {
      signOut();
      navigate('/sign-in', { replace: true });
    });
    return () => setOnAuthError(null);
  }, [navigate, signOut]);

  return (
    <SessionContext.Provider value={{ session, isLoading, signIn, setSessionDirect, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
