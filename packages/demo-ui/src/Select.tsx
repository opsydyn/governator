import { useId } from "react";
export interface SelectProps {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value?: string;
  readonly onChange?: (value: string) => void;
}
export function Select({ label, options, value, onChange }: SelectProps) {
  const id = useId();
  return (
    <div className="sample-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange?.(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
