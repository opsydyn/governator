export interface AlertProps {
  readonly message: string;
  readonly tone?: "info" | "warning";
}
export function Alert({ message, tone = "info" }: AlertProps) {
  return (
    <div role="status" className={`sample-alert sample-alert--${tone}`}>
      {message}
    </div>
  );
}
/** @deprecated Use Alert; retained for existing consumers during the migration window. */
export function LegacyAlert(props: AlertProps) {
  return <Alert {...props} />;
}
