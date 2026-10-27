import type { GovernanceReport as ReportShape } from "./generated.ts";

type Immutable<T> = T extends readonly (infer Item)[]
  ? readonly Immutable<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: Immutable<T[Key]> }
    : T;

export type GovernanceReport = Immutable<ReportShape>;

import type { QueryResult as QueryResultShape } from "./query-generated.ts";
export type QueryResult = Immutable<QueryResultShape>;
