type Schema = Record<string, unknown>;

/** Share repeated sub-schemas without moving schemas that contain reference scopes. */
export function deduplicateSchemas(input: Schema): Schema {
  const serialized = JSON.stringify(input);
  if (/"\$(?:ref|dynamicRef|recursiveRef|id|anchor|dynamicAnchor|defs)"\s*:/.test(serialized))
    return structuredClone(input);
  const root = structuredClone(input);
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  const definitions: Record<string, Schema> = {};
  const isSchema = (value: unknown): value is Schema =>
    !!value && typeof value === "object" && !Array.isArray(value);
  const children = (schema: Schema, visit: (item: Schema) => Schema) => {
    if (isSchema(schema.properties)) {
      for (const [key, value] of Object.entries(schema.properties))
        if (isSchema(value)) schema.properties[key] = visit(value);
    }
    for (const key of ["items", "additionalProperties"]) {
      const value = schema[key];
      if (isSchema(value)) schema[key] = visit(value);
    }
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      const value = schema[key];
      if (Array.isArray(value))
        schema[key] = value.map((item) => (isSchema(item) ? visit(item) : item));
    }
  };
  const count = (schema: Schema): Schema => {
    const key = JSON.stringify(schema);
    if (key.length >= 10) counts.set(key, (counts.get(key) ?? 0) + 1);
    children(schema, count);
    return schema;
  };
  count(root);
  const replace = (schema: Schema): Schema => {
    const key = JSON.stringify(schema);
    if ((counts.get(key) ?? 0) > 1) {
      let name = names.get(key);
      if (!name) {
        name = `shared${names.size}`;
        names.set(key, name);
        const definition = structuredClone(schema);
        children(definition, replace);
        definitions[name] = definition;
      }
      return { $ref: `#/$defs/${name}` };
    }
    children(schema, replace);
    return schema;
  };
  children(root, replace);
  if (Object.keys(definitions).length) root.$defs = definitions;
  return root;
}
