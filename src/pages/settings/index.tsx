/**
 * 设置页面 - 主题设置
 */
import ThemeTab from './ThemeTab';

export default function SettingsPage() {
  return (
    <div className="page-shell">
      <header className="page-header">
        <h1 className="page-title">设置</h1>
      </header>

      <div className="page-body">
        <div className="max-w-[720px]">
          <ThemeTab />
        </div>
      </div>
    </div>
  );
}
