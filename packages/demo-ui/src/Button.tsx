export interface ButtonProps {
  readonly label: string;
  readonly variant?: "primary" | "quiet";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}
export function Button({ label, variant = "primary", disabled = false, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      className={`sample-button sample-button--${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
