export interface ButtonProps {
  readonly label: string;
  readonly tone?: "primary" | "quiet";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}
export function Button({ label, tone = "primary", disabled = false, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      className={`sample-button sample-button--${tone}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
