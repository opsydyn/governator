import { Schema } from "effect";
const text = Schema.String.check(Schema.isMinLength(1));
export const ApiConfigSchema = Schema.Struct({
  packageId: text,
  packageVersion: text,
  components: Schema.NonEmptyArray(
    Schema.Struct({
      componentId: text,
      exportName: text,
      propsExport: text,
      contractVersion: text,
    }),
  ),
});
export const ApiSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  compilerVersion: text,
  packageId: text,
  packageVersion: text,
  declaration: text,
  exports: Schema.Array(text),
  components: Schema.Array(
    Schema.Struct({
      componentId: text,
      exportName: text,
      propsExport: text,
      contractVersion: text,
      present: Schema.Boolean,
      signature: Schema.String,
      props: Schema.Record(Schema.String, Schema.Struct({ optional: Schema.Boolean, type: text })),
    }),
  ),
});
export type ApiSnapshot = typeof ApiSnapshotSchema.Type;
