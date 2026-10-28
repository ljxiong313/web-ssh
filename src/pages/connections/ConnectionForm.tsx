import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { connectionApi, type Connection, type Folder as FolderType } from '@/client/api';
import { ActivityIndicator } from '@/components/ui/spinner';
import { FolderTreeSelect } from './FolderTreeSelect';

type FieldKey = 'name' | 'host' | 'port' | 'username';

export function ConnectionForm({ initial, folders, onSave, onCancel }: { initial?: Connection | null; folders: FolderType[]; onSave: () => void; onCancel: () => void }) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial ? String(initial.port) : '22');
  const [sshUser, setSshUser] = useState(initial?.username ?? '');
  const [authType, setAuthType] = useState<'password' | 'key'>(initial?.auth_type ?? 'password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [folderId, setFolderId] = useState<number | null>(initial?.folder_id ?? null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey | 'form', string>>>({});

  const validate = () => {
    const next: Partial<Record<FieldKey | 'form', string>> = {};
    if (!name.trim()) next.name = '请输入连接名称';
    if (!host.trim()) next.host = '请输入主机地址';
    const portNum = parseInt(port, 10);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) next.port = '端口需为 1-65535';
    if (!sshUser.trim()) next.username = '请输入用户名';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      // 留空的凭据不提交：后端对空值保持原值，不会覆盖已保存的加密密码/私钥
      const payload = {
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port, 10),
        username: sshUser.trim(),
        auth_type: authType,
        password: authType === 'password' ? password : '',
        private_key: authType === 'key' ? privateKey : '',
        folder_id: folderId,
      };
      if (isEdit) await connectionApi.update(initial!.id, payload);
      else await connectionApi.create(payload);
      onSave();
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : '保存失败' });
    } finally { setLoading(false); }
  };

  const err = (key: FieldKey) => (errors[key] ? <span className="error-text" role="alert">{errors[key]}</span> : null);
  const invalidClass = (key: FieldKey) => (errors[key] ? ' input-error' : '');

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} noValidate>
      <div className="mb-3.5">
        <label className="label-text" htmlFor="conn-name">连接名称</label>
        <input
          id="conn-name"
          className={`input${invalidClass('name')}`}
          placeholder="例如：生产服务器"
          value={name}
          autoFocus
          aria-invalid={!!errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        {err('name')}
      </div>

      <div className="flex gap-3">
        <div className="flex-[3]">
          <label className="label-text" htmlFor="conn-host">主机地址</label>
          <input
            id="conn-host"
            className={`input mono${invalidClass('host')}`}
            placeholder="192.168.1.1 或 example.com"
            value={host}
            aria-invalid={!!errors.host}
            onChange={(e) => setHost(e.target.value)}
          />
          {err('host')}
        </div>
        <div className="flex-[1]">
          <label className="label-text" htmlFor="conn-port">端口</label>
          <input
            id="conn-port"
            className={`input${invalidClass('port')}`}
            inputMode="numeric"
            placeholder="22"
            value={port}
            aria-invalid={!!errors.port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
          />
          {err('port')}
        </div>
      </div>

      <div className="mb-3.5 mt-3.5">
        <label className="label-text" htmlFor="conn-user">用户名</label>
        <input
          id="conn-user"
          className={`input mono${invalidClass('username')}`}
          placeholder="root"
          autoComplete="username"
          value={sshUser}
          aria-invalid={!!errors.username}
          onChange={(e) => setSshUser(e.target.value)}
        />
        {err('username')}
      </div>

      <div className="mb-3.5">
        <span className="label-text">认证方式</span>
        <div className="segmented w-full" role="radiogroup" aria-label="认证方式">
          {(['password', 'key'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={authType === t}
              onClick={() => setAuthType(t)}
              className="segmented-item flex-1"
            >
              {t === 'password' ? '密码认证' : '私钥认证'}
            </button>
          ))}
        </div>
      </div>

      {authType === 'password' ? (
        <div className="mb-3.5">
          <label className="label-text" htmlFor="conn-pass">密码</label>
          <div style={{ position: 'relative' }}>
            <input
              id="conn-pass"
              className="input"
              style={{ paddingRight: 34 }}
              type={showPassword ? 'text' : 'password'}
              placeholder={isEdit ? '留空表示保持不变' : '输入 SSH 密码'}
              autoComplete={isEdit ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn-icon absolute"
              style={{ right: 3, top: '50%', transform: 'translateY(-50%)' }}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {isEdit && !password && <span className="hint-text">已保存的密码不会显示，留空即保持原值。</span>}
        </div>
      ) : (
        <div className="mb-3.5">
          <label className="label-text" htmlFor="conn-key">私钥内容</label>
          <textarea
            id="conn-key"
            className="input mono"
            style={{ height: 120, fontSize: 12 }}
            placeholder={isEdit ? '留空表示保持不变\n-----BEGIN OPENSSH PRIVATE KEY-----' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
          />
          {isEdit && !privateKey && <span className="hint-text">已保存的私钥不会显示，留空即保持原值。</span>}
        </div>
      )}

      <div className="mb-3.5">
        <span className="label-text">所属文件夹</span>
        <FolderTreeSelect label="选择所属文件夹" folders={folders} selectedId={folderId} onSelect={setFolderId} />
      </div>

      {errors.form && <div className="banner banner-danger mb-3.5" role="alert">{errors.form}</div>}

      <div className="flex gap-3 mt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={loading} className="btn-primary flex-[2]">
          {loading ? <ActivityIndicator size="small" /> : (isEdit ? '保存修改' : '添加连接')}
        </button>
      </div>
    </form>
  );
}
