import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: string;
  invalid?: boolean;
  label?: string;
}

/** Number input that lets the user type freely and commits valid numbers. */
export function NumberField({ value, onChange, min, max, step = 1, width = '4.5rem', invalid, label }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label={label}
      className={invalid ? 'invalid' : undefined}
      style={{ width }}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
