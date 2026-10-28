type Schema = {
  type?: string;
  enum?: unknown[];
  minLength?: number;
  anyOf?: Schema[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  items?: Schema;
};
/** Evaluate the checked subset of JSON Schema used by the generated report contract. */
export function validateSchema(schema: Schema, value: unknown): boolean {
  if (schema.anyOf && !schema.anyOf.some((item) => validateSchema(item, value))) return false;
  if (schema.enum && !schema.enum.some((item) => item === value)) return false;
  if (schema.type === "null" && value !== null) return false;
  if (schema.type === "string" && typeof value !== "string") return false;
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value)))
    return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.type === "array" && !Array.isArray(value)) return false;
  if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value)))
    return false;
  if (
    typeof value === "string" &&
    schema.minLength !== undefined &&
    [...value].length < schema.minLength
  )
    return false;
  if (Array.isArray(value) && schema.items)
    for (const item of value) if (!validateSchema(schema.items, item)) return false;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if (schema.required?.some((key) => object[key] === undefined)) return false;
    for (const key in object) {
      const child =
        schema.properties && Object.hasOwn(schema.properties, key)
          ? schema.properties[key]
          : undefined;
      if (!child && schema.additionalProperties === false) return false;
      if (child && object[key] !== undefined && !validateSchema(child, object[key])) return false;
    }
  }
  return true;
}
