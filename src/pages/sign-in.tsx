/**
 * 登录 / 注册入口页
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Terminal } from 'lucide-react';
import { useSession } from '@/ctx';
import { authApi } from '@/client/api';
import { ActivityIndicator } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'register';

/** 注册密码强度：0–4 分，仅用于提示，不替代服务端策略 */
function scorePassword(pwd: string) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: '太短', color: 'var(--danger)' },
  { label: '较弱', color: 'var(--danger)' },
  { label: '一般', color: 'var(--warning)' },
  { label: '较强', color: 'var(--success)' },
  { label: '很强', color: 'var(--success)' },
];

function PasswordInput({ value, onChange, show, onToggle, refEl, autoComplete, placeholder, testid, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  refEl?: React.RefObject<HTMLInputElement | null>;
  autoComplete: string;
  placeholder?: string;
  testid?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="auth-field">
      <input
        ref={refEl}
        data-testid={testid}
        className="auth-input"
        type={show ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={onToggle} className="btn-icon" style={{ marginRight: 4 }} aria-label={show ? '隐藏密码' : '显示密码'} aria-pressed={show}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, setSessionDirect } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allowRegistration, setAllowRegistration] = useState(true);

  const confirmRef = useRef<HTMLInputElement>(null);

  // 是否开放注册由服务端公开设置决定（无需鉴权）
  useEffect(() => {
    authApi.publicSettings()
      .then((settings) => setAllowRegistration(settings.allow_registration))
      .catch(() => {
        // 拿不到设置时按允许注册处理
      });
  }, []);

  // 注册页关闭后仍停留在 register 模式会提交无效表单，退回登录
  useEffect(() => {
    if (!allowRegistration && mode === 'register') setMode('login');
  }, [allowRegistration, mode]);

  const strength = useMemo(() => scorePassword(password), [password]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setShowPassword(false);
  };

  const validate = () => {
    if (mode === 'register') {
      if (!email.trim()) return '请输入邮箱';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return '邮箱格式不正确';
      if (!password) return '请输入密码';
      if (password.length < 8) return '密码至少 8 位';
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        return '密码需同时包含大写字母、小写字母和数字';
      }
      if (password !== confirmPassword) return '两次输入的密码不一致';
      if (!agreed) return '请先勾选同意用户协议和隐私政策';
    } else {
      if (!email.trim()) return '请输入邮箱';
      if (!password) return '请输入密码';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        const defaultUsername = username.trim() || email.trim().split('@')[0];
        const res = await authApi.register(email.trim().toLowerCase(), password, defaultUsername);
        setSessionDirect(res.token, res.refresh_token, res.user);
        navigate('/');
      } else {
        await signIn(email.trim().toLowerCase(), password);
        navigate('/');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败，请重试';
      if (msg.includes('已注册')) setError('该邮箱已注册，请直接登录');
      else if (msg.includes('邮箱或密码')) setError('邮箱或密码错误');
      else if (msg.includes('Account disabled')) setError('账号已被禁用，请联系管理员');
      else if (msg.includes('Account locked')) setError('账号已锁定，请稍后再试或联系管理员解锁');
      else setError(msg);
    } finally { setLoading(false); }
  };

  const authError = error ? (
    <div data-testid="auth-error" className="banner banner-danger mb-4" role="alert">{error}</div>
  ) : null;

  const tabs: { key: Mode; label: string; testid?: string }[] = [
    { key: 'login', label: '登录', testid: 'tab-login' },
    ...(allowRegistration ? [{ key: 'register' as Mode, label: '注册', testid: 'tab-register' }] : []),
  ];

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--page-bg)', padding: 24 }}>
      <div className="card w-full max-w-[420px]" style={{ padding: 32 }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="flex items-center justify-center rounded-[10px] mb-4" style={{ width: 52, height: 52, backgroundColor: 'var(--brand-soft)', border: '1px solid var(--brand)' }}>
            <Terminal size={26} color="var(--brand)" />
          </div>
          <h1 className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>SSH 连接管理器</h1>
          <p className="muted-xs mt-1.5">随时随地管理你的远程服务器</p>
        </div>

        {/* 模式切换 */}
        {tabs.length > 1 && (
          <div className="segmented w-full mb-6" role="tablist" aria-label="登录方式">
            {tabs.map((t) => (
              <button
                key={t.key}
                data-testid={t.testid}
                role="tab"
                aria-selected={mode === t.key}
                className="segmented-item"
                style={{ flex: 1, height: 32 }}
                onClick={() => switchMode(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block mb-4">
            <span className="label-text">邮箱</span>
            <input
              autoFocus
              data-testid="input-email"
              className="input input-lg"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
            />
          </label>

          {mode === 'register' && (
            <label className="block mb-4">
              <span className="label-text">昵称（可选）</span>
              <input
                data-testid="input-username"
                className="input input-lg"
                autoComplete="nickname"
                placeholder="显示名称，默认取邮箱前缀"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          )}

          <div className="mb-3">
            <span className="label-text">密码</span>
            <PasswordInput
              testid="input-password"
              value={password}
              onChange={(v) => { setPassword(v); setError(''); }}
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? '至少 8 位，含大小写字母和数字' : '输入密码'}
            />
            {mode === 'register' && password.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-1" style={{ flex: 1 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < strength ? STRENGTH[strength].color : 'var(--border-secondary)', transition: 'background-color var(--dur) var(--ease)' }} />
                  ))}
                </div>
                <span className="muted-2xs" style={{ color: STRENGTH[strength].color, minWidth: 28 }}>{STRENGTH[strength].label}</span>
              </div>
            )}
          </div>

          {mode === 'register' && (
            <label className="block mb-4">
              <span className="label-text">确认密码</span>
              <input
                ref={confirmRef}
                data-testid="input-confirm"
                className={cn('input input-lg', confirmPassword && confirmPassword !== password && 'input-error')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
              />
              {confirmPassword && confirmPassword !== password && (
                <span className="error-text">两次输入的密码不一致</span>
              )}
            </label>
          )}

          {authError}

          {mode === 'register' && (
            <label data-testid="agree-terms" className="flex items-start gap-2.5 mb-4" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => { setAgreed(e.target.checked); setError(''); }}
                style={{ accentColor: 'var(--brand)', marginTop: 2 }}
              />
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                我已阅读并同意用户协议和隐私政策
              </span>
            </label>
          )}

          <button type="submit" data-testid={mode === 'login' ? 'submit-login' : 'submit-register'} disabled={loading} className="btn btn-primary btn-lg w-full">
            {loading ? <ActivityIndicator size="small" /> : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>
      </div>
    </div>
  );
}
