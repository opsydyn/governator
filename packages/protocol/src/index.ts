import type { GovernanceReport as ReportShape } from "./generated.ts";

type Immutable<T> = T extends readonly (infer Item)[]
  ? readonly Immutable<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: Immutable<T[Key]> }
    : T;

import type { GovernanceReportV2 as ReportV2Shape } from "./generated-v2.ts";
export type GovernanceReportV1 = Immutable<ReportShape>;
export type GovernanceReportV2 = Immutable<ReportV2Shape>;
export type GovernanceReport = GovernanceReportV1 | GovernanceReportV2;

import type { QueryResult as QueryResultShape } from "./query-generated.ts";
export type QueryResult = Immutable<QueryResultShape>;

export { reportSemanticsValid } from "./report-semantics.ts";
