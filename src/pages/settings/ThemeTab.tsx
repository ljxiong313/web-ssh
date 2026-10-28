/**
 * 主题设置：界面明暗、终端配色预设、字体与实时预览
 */
import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun, Save, RotateCcw, Terminal } from 'lucide-react';
import { terminalThemeApi, API_BASE, type TerminalTheme } from '@/client/api';
import { useTheme } from '@/contexts/theme-context';
import { ActivityIndicator } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import ColorPicker from './ColorPicker';

const FONT_STACK = "Consolas, 'Liberation Mono', Menlo, Courier, monospace";
const FONTS = ['monospace', 'Consolas', 'Menlo', 'Courier New', 'Fira Code'];
const SIZES = [11, 12, 13, 14, 15, 16, 18];

const DEFAULT_THEME: TerminalTheme = {
  font_family: FONT_STACK,
  font_size: 14,
  foreground_color: '#E6EDF3',
  background_color: '#0D1117',
  cursor_color: '#2F81F7',
  selection_color: 'rgba(47,129,247,0.3)',
};

const PRESETS: { name: string; theme: TerminalTheme }[] = [
  { name: 'GitHub Dark', theme: { ...DEFAULT_THEME, background_color: '#0D1117', foreground_color: '#E6EDF3', cursor_color: '#2F81F7', selection_color: 'rgba(47,129,247,0.3)' } },
  { name: 'Dracula', theme: { ...DEFAULT_THEME, background_color: '#282A36', foreground_color: '#F8F8F2', cursor_color: '#BD93F9', selection_color: 'rgba(189,147,249,0.3)' } },
  { name: 'Solarized Dark', theme: { ...DEFAULT_THEME, background_color: '#002B36', foreground_color: '#839496', cursor_color: '#268BD2', selection_color: 'rgba(38,139,210,0.3)' } },
  { name: 'One Dark', theme: { ...DEFAULT_THEME, background_color: '#282C34', foreground_color: '#ABB2BF', cursor_color: '#61AFEF', selection_color: 'rgba(97,175,239,0.3)' } },
  { name: 'Tokyo Night', theme: { ...DEFAULT_THEME, background_color: '#1A1B2E', foreground_color: '#A9B1D6', cursor_color: '#7AA2F7', selection_color: 'rgba(122,162,247,0.3)' } },
  { name: 'Solarized Light', theme: { ...DEFAULT_THEME, background_color: '#FDF6E3', foreground_color: '#657B83', cursor_color: '#268BD2', selection_color: 'rgba(38,139,210,0.25)' } },
  { name: 'Paper White', theme: { ...DEFAULT_THEME, background_color: '#FFFFFF', foreground_color: '#1F2328', cursor_color: '#0969DA', selection_color: 'rgba(9,105,218,0.2)' } },
];

/** 预览里的提示符颜色是 ANSI 语义色，与界面主题无关 */
const ANSI_GREEN = '#2EA043';
const ANSI_BLUE = '#2F81F7';

function Choice({ selected, onClick, children, title }: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} title={title} className={cn('btn btn-sm', selected ? 'btn-primary' : 'btn-secondary')}>
      {children}
    </button>
  );
}

function Fieldset({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span className="label-text">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint ? <span className="hint-text">{hint}</span> : null}
    </div>
  );
}

export default function ThemeTab() {
  const { theme, setTheme } = useTheme();
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>(DEFAULT_THEME);
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    terminalThemeApi.get()
      .then((t) => { setTerminalTheme(t); setInitial(JSON.stringify(t)); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const dirty = useMemo(() => JSON.stringify(terminalTheme) !== initial, [terminalTheme, initial]);
  const activePreset = PRESETS.find((p) => p.theme.background_color === terminalTheme.background_color && p.theme.foreground_color === terminalTheme.foreground_color)?.name;

  const update = (key: keyof TerminalTheme, value: string | number) =>
    setTerminalTheme((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (preset: TerminalTheme) =>
    setTerminalTheme({ ...preset, font_family: terminalTheme.font_family, font_size: terminalTheme.font_size });

  const handleSave = async () => {
    setSaving(true);
    try {
      await terminalThemeApi.save(terminalTheme);
      setInitial(JSON.stringify(terminalTheme));
      toast.success('终端主题已保存，新开的连接立即生效');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center" style={{ minHeight: 280 }}><ActivityIndicator size="large" /></div>;
  }

  if (failed) {
    return (
      <div className="empty-state">
        <Terminal size={44} className="empty-state-icon" />
        <p className="empty-state-title">终端主题加载失败</p>
        <p className="empty-state-desc">可能是网络异常或服务暂时不可用。</p>
        <button onClick={load} className="btn btn-secondary" style={{ marginTop: 16 }}>重试</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-end gap-2.5 sticky top-0 z-10" style={{ padding: '4px 0', backgroundColor: 'var(--page-bg)' }}>
        {dirty && <span className="muted-2xs mr-auto">有未保存的修改</span>}
        {dirty && (
          <button onClick={() => setTerminalTheme(JSON.parse(initial))} className="btn btn-ghost btn-sm">
            <RotateCcw size={13} /> 放弃修改
          </button>
        )}
        <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary">
          {saving ? <ActivityIndicator size="small" /> : <Save size={14} />}
          <span>保存设置</span>
        </button>
      </div>

      {/* 界面主题 */}
      <section className="card" style={{ padding: 18 }}>
        <h3 className="section-title mb-3">界面主题</h3>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          {([
            { key: 'dark', label: '深色模式', desc: '夜间值守更舒适', icon: <Moon size={20} /> },
            { key: 'light', label: '浅色模式', desc: '白天与投屏演示更清晰', icon: <Sun size={20} /> },
          ] as const).map((opt) => {
            const selected = theme === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setTheme(opt.key)}
                aria-pressed={selected}
                className="pick-card pick-card--stack flex-1"
                style={{ minWidth: 170 }}
              >
                <span>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                <span className="muted-2xs">{opt.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="hint-text">界面主题立即生效，不需要保存。</p>
      </section>

      {/* 终端配色预设 */}
      <section className="card" style={{ padding: 18 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">终端配色预设</h3>
          {activePreset && <span className="chip chip-brand">{activePreset}</span>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {PRESETS.map((p) => {
            const selected = activePreset === p.name;
            return (
              <button
                key={p.name}
                onClick={() => applyPreset(p.theme)}
                aria-pressed={selected}
                className="flex flex-col items-center gap-1.5 rounded"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span
                  className="mono flex flex-col justify-center rounded-md"
                  style={{
                    width: 92, height: 56, padding: 8, fontSize: 10, overflow: 'hidden', lineHeight: 1.5,
                    backgroundColor: p.theme.background_color, color: p.theme.foreground_color,
                    border: `2px solid ${selected ? 'var(--brand)' : 'var(--border-secondary)'}`,
                  }}
                >
                  <span><span style={{ color: ANSI_GREEN }}>$</span> ls</span>
                  <span style={{ color: p.theme.cursor_color }}>▍ file.txt</span>
                </span>
                <span className="muted-2xs" style={{ color: selected ? 'var(--brand-fg)' : undefined, fontWeight: selected ? 600 : 400 }}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <p className="hint-text">预设只改配色，字体与字号保持不变；套用后仍可继续微调下面的颜色。</p>
      </section>

      {/* 颜色配置 */}
      <section className="card" style={{ padding: 18 }}>
        <h3 className="section-title mb-3.5">颜色配置</h3>
        <div className="grid gap-x-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div>
            <ColorPicker label="前景色（文字）" value={terminalTheme.foreground_color} onChange={(v) => update('foreground_color', v)} />
            <ColorPicker label="光标颜色" value={terminalTheme.cursor_color} onChange={(v) => update('cursor_color', v)} />
          </div>
          <div>
            <ColorPicker label="背景色" value={terminalTheme.background_color} onChange={(v) => update('background_color', v)} />
            <ColorPicker label="选中背景色" value={terminalTheme.selection_color} onChange={(v) => update('selection_color', v)} />
          </div>
        </div>
        <p className="hint-text">前景/背景对比度低于 4.5:1 时长时间阅读会很容易疲劳，可参考预览判断效果。</p>
      </section>

      {/* 字体配置 */}
      <section className="card" style={{ padding: 18 }}>
        <h3 className="section-title mb-3.5">字体</h3>
        <Fieldset label="字体族" hint="仅列出常见等宽字体；系统未安装时会自动回退。">
          {FONTS.map((f) => (
            <Choice key={f} selected={terminalTheme.font_family === f} onClick={() => update('font_family', f)} title={`使用 ${f}`}>
              <span className="mono" style={{ fontFamily: f }}>{f}</span>
            </Choice>
          ))}
        </Fieldset>
        <Fieldset label={`字号 ${terminalTheme.font_size}px`} hint="1080p 建议 14px，笔记本屏幕建议 12–13px。">
          {SIZES.map((s) => (
            <Choice key={s} selected={terminalTheme.font_size === s} onClick={() => update('font_size', s)}>
              <span className="mono">{s}</span>
            </Choice>
          ))}
        </Fieldset>
      </section>

      {/* 实时预览 */}
      <section className="card" style={{ padding: 18 }}>
        <h3 className="section-title mb-3">实时预览</h3>
        <div className="overflow-hidden rounded-md" style={{ backgroundColor: terminalTheme.background_color, border: '1px solid var(--border-secondary)' }}>
          <div className="flex items-center gap-2" style={{ backgroundColor: 'var(--panel-bg)', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <span className="flex gap-1.5">
              {['var(--danger)', 'var(--warning)', 'var(--success)'].map((c) => (
                <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: c }} />
              ))}
            </span>
            <span className="muted-2xs mono" style={{ marginLeft: 6 }}>user@server — ssh</span>
          </div>
          <div className="mono" style={{ padding: 14, fontFamily: terminalTheme.font_family, fontSize: terminalTheme.font_size, lineHeight: 1.45, color: terminalTheme.foreground_color, minHeight: 190 }}>
            {[
              { cmd: 'cat /etc/os-release', out: ['NAME="Ubuntu"', 'VERSION="22.04 LTS"', 'ID=ubuntu'] },
              { cmd: 'uptime', out: ['10:32:45 up 14 days, 3:22, 2 users, load: 0.10'] },
            ].map((row) => (
              <div key={row.cmd} style={{ marginBottom: 10 }}>
                <div>
                  <span style={{ color: ANSI_GREEN }}>user@server</span>
                  <span>:</span>
                  <span style={{ color: ANSI_BLUE }}>~</span>
                  <span>$ </span>
                  <span>{row.cmd}</span>
                </div>
                {row.out.map((line) => <div key={line}>{line}</div>)}
              </div>
            ))}
            <div className="flex items-center" style={{ gap: 2 }}>
              <span style={{ color: ANSI_GREEN }}>user@server</span>
              <span>:</span>
              <span style={{ color: ANSI_BLUE }}>~</span>
              <span>$ </span>
              <span style={{ display: 'inline-block', width: 8, height: terminalTheme.font_size * 1.25, backgroundColor: terminalTheme.cursor_color }} />
            </div>
          </div>
        </div>
      </section>

      {/* 后端服务地址 */}
      <section className="card" style={{ padding: 18 }}>
        <h3 className="section-title mb-2">后端服务地址</h3>
        <div className="mono" style={{ color: 'var(--brand-fg)', fontSize: 13, wordBreak: 'break-all' }}>
          {API_BASE}
        </div>
        <p className="hint-text mt-2">如需修改，请在项目根目录的 .env 文件中设置 VITE_API_URL，然后重新构建前端。</p>
      </section>
    </div>
  );
}
