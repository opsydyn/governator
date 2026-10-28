type Schema = Record<string, unknown>;
const keys = new Set([
  "$schema",
  "type",
  "enum",
  "minLength",
  "anyOf",
  "required",
  "properties",
  "additionalProperties",
  "items",
]);
/** Refuse schema changes that the compact report interpreter does not implement. */
export function assertSupportedReportSchema(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unsupported report schema");
  const schema = value as Schema;
  if (Object.keys(schema).some((key) => !keys.has(key)))
    throw new Error("Unsupported schema keyword");
  if (
    schema.type !== undefined &&
    !["object", "array", "string", "number", "boolean", "null"].includes(schema.type as string)
  )
    throw new Error("Unsupported schema type");
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) ||
      schema.enum.some(
        (item) => item !== null && !["string", "number", "boolean"].includes(typeof item),
      ))
  )
    throw new Error("Unsupported schema enum");
  if (
    schema.minLength !== undefined &&
    (!Number.isInteger(schema.minLength) || (schema.minLength as number) < 0)
  )
    throw new Error("Unsupported schema minLength");
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean")
    throw new Error("Unsupported additionalProperties");
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string"))
  )
    throw new Error("Unsupported required");
  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf)) throw new Error("Unsupported anyOf");
    schema.anyOf.forEach(assertSupportedReportSchema);
  }
  if (schema.items !== undefined) assertSupportedReportSchema(schema.items);
  if (schema.properties !== undefined) {
    if (
      !schema.properties ||
      typeof schema.properties !== "object" ||
      Array.isArray(schema.properties)
    )
      throw new Error("Unsupported properties");
    Object.values(schema.properties).forEach(assertSupportedReportSchema);
  }
}
