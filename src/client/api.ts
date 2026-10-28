/**
 * Go 后端 API 客户端
 * 所有 HTTP 请求统一走此模块，JWT Token 自动携带
 */

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:37580';

let _token: string | null = null;
let _refreshToken: string | null = null;
let _onAuthError: (() => void) | null = null;
let _isHandlingAuthError = false;
let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;

export function setToken(token: string | null) {
  _token = token;
  if (token) {
    _isHandlingAuthError = false;
  }
}

export function getToken(): string | null {
  return _token;
}

export function setRefreshToken(token: string | null) {
  _refreshToken = token;
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

export function setOnAuthError(callback: (() => void) | null) {
  _onAuthError = callback;
}

function handleAuthError(status: number) {
  if (_isHandlingAuthError || status !== 401 || !_token) return;
  _isHandlingAuthError = true;
  _onAuthError?.();
}

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function doRefreshToken(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: _refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    const { token, refresh_token } = data as { token?: string; refresh_token?: string };
    if (!token) return false;
    _token = token;
    if (refresh_token) _refreshToken = refresh_token;
    return true;
  } catch {
    return false;
  }
}

async function tryRefreshToken(): Promise<boolean> {
  if (_isRefreshing && _refreshPromise) {
    return _refreshPromise;
  }
  _isRefreshing = true;
  _refreshPromise = doRefreshToken().finally(() => {
    _isRefreshing = false;
    _refreshPromise = null;
  });
  return _refreshPromise;
}

export async function maybeRefreshTokenBeforeRequest(): Promise<void> {
  if (!_token || !_refreshToken) return;
  const expiry = getTokenExpiry(_token);
  if (!expiry) return;
  const timeLeft = expiry - Date.now();
  if (timeLeft < 5 * 60 * 1000) {
    await tryRefreshToken();
  }
}

// ── 通用请求 ──────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  await maybeRefreshTokenBeforeRequest();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `请求失败 (${res.status})`;
    if (res.status === 401 && _refreshToken) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(method, path, body, extraHeaders);
      }
    }
    handleAuthError(res.status);
    throw new Error(message);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

// ── WebSocket URL 生成 ────────────────────────────

export function wsUrl(path: string): string {
  const base = API_BASE.replace(/^http/, 'ws');
  const token = _token ?? '';
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

// ── 类型定义 ──────────────────────────────────────

export interface User {
  id: number;
  email: string;
  username: string;
  status?: string;
  created_at: string;
}

export interface Connection {
  id: number;
  user_id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  password?: string;
  private_key?: string;
  folder_id?: number | null;
  workspace_id?: number | null;
  sort_order: number;
  created_at: string;
}

export interface Folder {
  id: number;
  user_id: number;
  name: string;
  parent_id?: number | null;
  sort_order: number;
  children?: Folder[];
}

export interface QuickCommand {
  id: number;
  user_id: number;
  name: string;
  command: string;
  use_count: number;
}

export interface CommandHistory {
  id: number;
  user_id: number;
  connection_id: number;
  command: string;
  session_id: string;
  created_at: string;
}

export interface TerminalSession {
  id: number;
  connection_id: number;
  conn_name: string;
  content?: string;
  saved_at: string;
  created_at: string;
}

export interface TerminalTheme {
  user_id?: number;
  font_family: string;
  font_size: number;
  foreground_color: string;
  background_color: string;
  cursor_color: string;
  selection_color: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── 认证 ──────────────────────────────────────────

export const authApi = {
  publicSettings: () => get<{ allow_registration: boolean }>('/api/settings/public'),

  register: (email: string, password: string, username?: string) =>
    post<{ token: string; refresh_token: string; user: User }>('/api/auth/register', { email, password, username }),

  login: (email: string, password: string) =>
    post<{ token: string; refresh_token: string; user: User }>('/api/auth/login', { email, password }),


  refreshToken: (refresh_token: string) =>
    post<{ token: string; refresh_token: string }>('/api/auth/refresh', { refresh_token }),

  logout: (refresh_token?: string) =>
    post<{ message: string }>('/api/auth/logout', { refresh_token }),

  getProfile: () => get<User>('/api/profile'),

  updateProfile: (data: { username?: string; email?: string; password?: string }) =>
    put<{ message: string }>('/api/profile', data),
};




// ── 文件夹 ────────────────────────────────────────

export const folderApi = {
  list: () => get<Folder[]>('/api/folders'),
  create: (data: Partial<Folder>) => post<Folder>('/api/folders', data),
  update: (id: number, data: Partial<Folder>) => put<Folder>(`/api/folders/${id}`, data),
  delete: (id: number) => del<{ message: string }>(`/api/folders/${id}`),
  reorder: (orders: { id: number; sort_order: number; parent_id?: number | null }[]) =>
    post('/api/folders/reorder', orders),
};

// ── 连接 ──────────────────────────────────────────

export const connectionApi = {
  list: () => get<Connection[]>('/api/connections'),
  get: (id: number) => get<Connection>(`/api/connections/${id}`),
  create: (data: Partial<Connection>) => post<Connection>('/api/connections', data),
  update: (id: number, data: Partial<Connection>) => put<Connection>(`/api/connections/${id}`, data),
  delete: (id: number) => del<{ message: string }>(`/api/connections/${id}`),
  move: (id: number, folder_id: number | null) =>
    post<{ message: string }>(`/api/connections/${id}/move`, { folder_id }),
  reorder: (orders: { id: number; sort_order: number }[]) =>
    post('/api/connections/reorder', orders),
  exportAll: () => get<Connection[]>('/api/connections/export'),
  import: (conns: Partial<Connection>[]) =>
    post<{ message: string; imported: number }>('/api/connections/import', conns),
  previewImport: (conns: unknown) =>
    post<{ preview: Partial<Connection>[]; count: number }>('/api/connections/import/preview', conns),
};

// ── 快捷命令 ──────────────────────────────────────

export const quickCommandApi = {
  list: () => get<QuickCommand[]>('/api/quick-commands'),
  create: (data: Partial<QuickCommand>) => post<QuickCommand>('/api/quick-commands', data),
  update: (id: number, data: Partial<QuickCommand>) => put<QuickCommand>(`/api/quick-commands/${id}`, data),
  delete: (id: number) => del<{ message: string }>(`/api/quick-commands/${id}`),
  use: (id: number) => post<{ message: string }>(`/api/quick-commands/${id}/use`),
};

// ── 命令历史 ──────────────────────────────────────

export const commandHistoryApi = {
  list: (params?: { connection_id?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.connection_id) qs.set('connection_id', String(params.connection_id));
    if (params?.q) qs.set('q', params.q);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return get<CommandHistory[]>(`/api/command-history${query}`);
  },
  clear: () => del<{ message: string }>('/api/command-history'),
};

// ── 终端会话 ──────────────────────────────────────

export const terminalSessionApi = {
  list: (name?: string) => {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    return get<TerminalSession[]>(`/api/terminal-sessions${query}`);
  },
  get: (id: number) => get<TerminalSession>(`/api/terminal-sessions/${id}`),
  save: (data: Partial<TerminalSession>) =>
    post<TerminalSession>('/api/terminal-sessions', data),
  delete: (id: number) => del<{ message: string }>(`/api/terminal-sessions/${id}`),
};

// ── 终端主题 ──────────────────────────────────────

export const terminalThemeApi = {
  get: () => get<TerminalTheme>('/api/terminal-theme'),
  save: (data: TerminalTheme) => post<TerminalTheme>('/api/terminal-theme', data),
};

// ── SFTP ──────────────────────────────────────────

export interface SFTPEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mode: string;
  mod_time: string;
  username: string;
  groupname: string;
}

export const sftpApi = {
  /** 列出远程目录 */
  list: (connId: number, path: string, protocol: string = 'sftp') =>
    get<{ path: string; entries: SFTPEntry[] }>(
      `/api/sftp/${connId}/list?path=${encodeURIComponent(path)}&protocol=${encodeURIComponent(protocol)}`,
    ),
  /** 直接下载文件 URL（携带 token，供 window.open / <a> 使用） */
  downloadUrl: (connId: number, path: string, protocol: string = 'sftp'): string => {
    const base = API_BASE;
    const token = _token ?? '';
    return `${base}/api/sftp/${connId}/download?path=${encodeURIComponent(path)}&protocol=${encodeURIComponent(protocol)}&token=${encodeURIComponent(token)}`;
  },
  /** 下载目录为 zip 的 URL */
  downloadDirUrl: (connId: number, path: string, protocol: string = 'sftp'): string => {
    const base = API_BASE;
    const token = _token ?? '';
    return `${base}/api/sftp/${connId}/download-dir?path=${encodeURIComponent(path)}&protocol=${encodeURIComponent(protocol)}&token=${encodeURIComponent(token)}`;
  },
  /** 删除文件或目录 */
  delete: (connId: number, path: string, protocol: string = 'sftp') =>
    request<{ message: string }>('DELETE', `/api/sftp/${connId}/delete`, { path, protocol }),
  /** 新建目录 */
  mkdir: (connId: number, path: string, protocol: string = 'sftp') =>
    post<{ message: string }>(`/api/sftp/${connId}/mkdir`, { path, protocol }),
  /** 修改权限 */
  chmod: (connId: number, path: string, mode: string, protocol: string = 'sftp') =>
    post<{ message: string }>(`/api/sftp/${connId}/chmod`, { path, protocol, mode }),
  /** 上传文件（支持多文件和文件夹，走 fetch 直传） */
  upload: async (connId: number, dir: string, files: File[], protocol: string = 'sftp'): Promise<{ message: string }> => {
    const form = new FormData();
    form.append('path', dir);
    form.append('protocol', protocol);
    for (const file of files) {
      // Preserve directory structure for folder uploads
      const relPath = (file as any).webkitRelativePath;
      if (relPath) {
        // webkitRelativePath includes the root folder name, strip it
        const parts = relPath.split('/');
        const relWithoutRoot = parts.slice(1).join('/');
        form.append('file', file, relWithoutRoot);
      } else {
        form.append('file', file);
      }
    }
    const headers: Record<string, string> = {};
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${API_BASE}/api/sftp/${connId}/upload`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data as { error?: string }).error || `上传失败 (${res.status})`;
      handleAuthError(res.status);
      throw new Error(message);
    }
    return data as { message: string };
  },
};
