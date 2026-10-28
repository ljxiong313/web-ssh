/**
 * 颜色字段：色块取色器 + 十六进制输入，两者双向同步
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function toFullHex(value: string) {
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
}

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  const valid = HEX.test(text.trim());

  const handleText = (next: string) => {
    setText(next);
    if (HEX.test(next.trim())) onChange(next.trim());
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <span className="label-text">{label}</span>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          className="swatch"
          value={toFullHex(valid ? text : value)}
          aria-label={`${label} 取色器`}
          onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
        />
        <input
          className={cn('input mono', !valid && text.length > 0 && 'input-error')}
          style={{ flex: 1 }}
          value={text}
          spellCheck={false}
          onChange={(e) => handleText(e.target.value)}
          onBlur={() => { if (!valid) setText(value); }}
          placeholder="#000000"
          maxLength={7}
        />
      </div>
      {!valid && text.length > 0 && <span className="error-text">需为 #RGB 或 #RRGGBB 格式</span>}
    </div>
  );
}
