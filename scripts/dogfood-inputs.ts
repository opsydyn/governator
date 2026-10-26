import { ensure } from "../packages/core/src/domain.ts";
import type { Registry } from "../packages/core/src/domain.ts";
import type { ApiConfig } from "../packages/versioning/src/api.ts";
export function validateDogfoodInputs(
  config: ApiConfig,
  manifest: { name: string; version: string },
  registry: Registry,
): void {
  ensure(
    config.packageId === manifest.name && config.packageVersion === manifest.version,
    "API config must match the actual candidate package manifest",
  );
  const components = registry.components.filter((c) => c.package === manifest.name);
  ensure(
    components.length === config.components.length,
    "API configuration must cover every registered package component",
  );
  for (const component of components) {
    const mapped = config.components.find((c) => c.componentId === component.id);
    ensure(
      !!mapped &&
        mapped.contractVersion === component.contractVersion &&
        component.packageVersion === manifest.version,
      "API config, registry and candidate package versions must agree",
    );
  }
}
