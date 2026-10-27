import { Button, Select, Alert } from "@example/ui";
const button = <Button label="Migrated consumer" variant="primary" />;
const select = (
  <Select label="Consumer environment" options={[{ value: "preview", label: "Preview" }]} />
);
const alert = <Alert message="Local consumer fixture" />;
export { button, select, alert };
