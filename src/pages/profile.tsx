/**
 * 个人资料页：昵称、邮箱、密码就地编辑
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, Info } from 'lucide-react';
import { authApi, type User as ApiUser } from '@/client/api';
import { useSession } from '@/ctx';
import { ActivityIndicator } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type EditingField = 'username' | 'email' | 'password' | null;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title mb-3.5">{children}</h2>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="muted-xs">{label}</span>
      <span className="mono" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, setSessionDirect, signOut } = useSession();
  const [profile, setProfile] = useState<ApiUser | null>(session?.user ?? null);
  const [loading, setLoading] = useState(false);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setProfile(await authApi.getProfile());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '资料加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const startEdit = (field: Exclude<EditingField, null>) => {
    setEditingField(field);
    setEditValue(field === 'password' ? '' : (profile?.[field] ?? ''));
    setConfirmValue('');
    setError('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
    setConfirmValue('');
    setError('');
  };

  const validate = (): string => {
    if (editingField === 'username' && !editValue.trim()) return '昵称不能为空';
    if (editingField === 'email') {
      if (!editValue.trim()) return '邮箱不能为空';
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(editValue.trim())) return '邮箱格式不正确';
    }
    if (editingField === 'password') {
      if (!editValue) return '请输入新密码';
      if (editValue.length < 8) return '密码至少 8 位';
      if (!/[A-Z]/.test(editValue) || !/[a-z]/.test(editValue) || !/\d/.test(editValue)) {
        return '密码需同时包含大写字母、小写字母和数字';
      }
      if (editValue !== confirmValue) return '两次输入的密码不一致';
    }
    return '';
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');
    try {
      if (editingField === 'password') {
        await authApi.updateProfile({ password: editValue });
        toast.success('密码已更新，请重新登录');
        cancelEdit();
        setTimeout(() => {
          signOut();
          navigate('/sign-in');
        }, 1200);
        return;
      }

      const payload = editingField === 'username'
        ? { username: editValue.trim() }
        : { email: editValue.trim().toLowerCase() };
      await authApi.updateProfile(payload);
      const refreshed = await authApi.getProfile();
      setProfile(refreshed);
      if (session) setSessionDirect(session.token, session.refreshToken, refreshed);
      cancelEdit();
      toast.success(editingField === 'username' ? '昵称已更新' : '邮箱已更新');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '更新失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const editKeyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancelEdit();
  };

  const renderField = (
    label: string,
    field: Exclude<EditingField, null>,
    displayValue: string,
    inputType: 'text' | 'password' = 'text',
    placeholder = '',
  ) => {
    const isEditing = editingField === field;
    return (
      <div style={{ marginBottom: 14 }}>
        <span className="label-text">{label}</span>
        {isEditing ? (
          <form onSubmit={handleSave} className="flex items-center gap-2" onKeyDown={editKeyHandler}>
            <input
              className="input"
              style={{ borderColor: 'var(--brand)' }}
              type={inputType}
              value={editValue}
              placeholder={placeholder}
              autoComplete={inputType === 'password' ? 'new-password' : 'off'}
              onChange={(ev) => { setEditValue(ev.target.value); setError(''); }}
              autoFocus
            />
            <button type="submit" disabled={saving} className="btn-icon" title="保存" aria-label="保存">
              {saving ? <ActivityIndicator size="small" /> : <Check size={16} color="var(--success)" />}
            </button>
            <button type="button" onClick={cancelEdit} className="btn-icon" title="取消（Esc）" aria-label="取消">
              <X size={16} />
            </button>
          </form>
        ) : (
          <div className="row-hover flex items-center gap-2 rounded-md" style={{ padding: '6px 8px', marginLeft: -8 }}>
            <span style={{ color: displayValue ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayValue || '未设置'}
            </span>
            <button onClick={() => startEdit(field)} className="btn-icon row-actions" title={`修改${label}`} aria-label={`修改${label}`}>
              <Pencil size={15} />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center" style={{ flex: 1, minHeight: 320, backgroundColor: 'var(--page-bg)' }}>
        <ActivityIndicator size="large" />
      </div>
    );
  }

  const initials = (profile?.username || profile?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <span className="page-title">个人资料</span>
          {loading && <ActivityIndicator size="small" />}
        </div>
      </div>

      <div className="page-body">
        <div className="flex flex-col gap-4" style={{ maxWidth: 620 }}>
          {/* 头像卡片 */}
          <div className="card flex flex-col items-center" style={{ padding: 24 }}>
            <div className="mono flex items-center justify-center" style={{ width: 68, height: 68, borderRadius: '50%', fontSize: 26, fontWeight: 700, backgroundColor: 'var(--brand-soft)', color: 'var(--brand-fg)', border: '1px solid var(--brand)', marginBottom: 12 }}>
              {initials}
            </div>
            <span style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 700 }}>
              {profile?.username || profile?.email || '用户'}
            </span>
            <span className="muted-xs mt-1">{profile?.email}</span>
            {profile?.status && profile.status !== 'active' && (
              <div className="flex items-center gap-1.5 mt-3">
                <span className="chip chip-warning">{profile.status}</span>
              </div>
            )}
          </div>

          {/* 账户信息 */}
          <div className="card" style={{ padding: 20 }}>
            <SectionTitle>账户信息</SectionTitle>
            {renderField('昵称', 'username', profile?.username ?? '', 'text', '输入昵称')}
            {renderField('邮箱', 'email', profile?.email ?? '', 'text', 'your@email.com')}

            <div>
              <span className="label-text">密码</span>
              {editingField === 'password' ? (
                <form onSubmit={handleSave} className="flex flex-col gap-3 mt-2" onKeyDown={editKeyHandler}>
                  <label className="block">
                    <span className="label-text">新密码</span>
                    <input
                      className="input"
                      style={{ borderColor: 'var(--brand)' }}
                      type="password"
                      value={editValue}
                      placeholder="至少 8 位，含大小写字母和数字"
                      autoComplete="new-password"
                      onChange={(e) => { setEditValue(e.target.value); setError(''); }}
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="label-text">确认新密码</span>
                    <input
                      className={cn('input', confirmValue && confirmValue !== editValue && 'input-error')}
                      type="password"
                      value={confirmValue}
                      placeholder="再次输入新密码"
                      autoComplete="new-password"
                      onChange={(e) => { setConfirmValue(e.target.value); setError(''); }}
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2.5">
                    <button type="button" onClick={cancelEdit} className="btn btn-secondary">取消</button>
                    <button type="submit" disabled={saving} className="btn btn-primary">
                      {saving ? <ActivityIndicator size="small" /> : '保存新密码'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="row-hover flex items-center gap-2 rounded-md" style={{ padding: '6px 8px', marginLeft: -8 }}>
                  <span className="mono" style={{ color: 'var(--text-tertiary)', fontSize: 15, flex: 1, letterSpacing: '0.1em' }}>••••••••</span>
                  <button onClick={() => startEdit('password')} className="btn-icon row-actions" title="修改密码" aria-label="修改密码">
                    <Pencil size={15} />
                  </button>
                </div>
              )}
            </div>

            {error && <div className="banner banner-danger mt-2" role="alert">{error}</div>}
          </div>

          {/* 其他信息 */}
          <div className="card" style={{ padding: 20 }}>
            <SectionTitle><Info size={13} /> 其他信息</SectionTitle>
            {profile?.created_at && <InfoRow label="注册时间" value={new Date(profile.created_at).toLocaleDateString('zh-CN')} />}
            <p className="hint-text mt-2">修改密码后当前会话会失效，需要用新密码重新登录。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
