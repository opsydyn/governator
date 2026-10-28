import ts from "typescript";
import { decode, digest, ensure, unique, SemVer } from "@governator/core";
import { ApiSnapshotSchema, ApiConfigSchema } from "./api-schema.ts";
import type { ApiSnapshot } from "./api-schema.ts";
import { assessVersion, requiredPackageBump } from "./versions.ts";
import type { Bump } from "./versions.ts";
export type { ApiSnapshot } from "./api-schema.ts";

export interface ApiConfig {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly components: readonly {
    readonly componentId: string;
    readonly exportName: string;
    readonly propsExport: string;
    readonly contractVersion: string;
  }[];
}
type Module = { exports: Map<string, ts.Symbol>; source: ts.SourceFile };
function requiredModule(module: Module | undefined): Module {
  ensure(!!module, "Missing declaration module");
  return module;
}
function inspect(declarations: readonly string[]) {
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const names = declarations.map(
    (_, i) => `${ts.sys.getCurrentDirectory()}/.governator-api/input-${i}.ts`,
  );
  for (const declaration of declarations) {
    const ast = ts.createSourceFile("api.ts", declaration, ts.ScriptTarget.Latest, true);
    function forbidAugmentation(node: ts.Node): void {
      ensure(
        !(
          ts.isModuleDeclaration(node) &&
          ((node.flags & ts.NodeFlags.GlobalAugmentation) !== 0 || ts.isStringLiteral(node.name))
        ),
        "Global and module augmentations are unsupported for isolated API comparison",
      );
      ts.forEachChild(node, forbidAugmentation);
    }
    forbidAugmentation(ast);
  }
  const files = new Map(names.map((name, i) => [name, declarations[i] ?? ""]));
  const host = ts.createCompilerHost(options);
  const originalSource = host.getSourceFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  host.getSourceFile = (name, language, onError, createNew) =>
    files.has(name)
      ? ts.createSourceFile(name, files.get(name) ?? "", ts.ScriptTarget.Latest, true)
      : originalSource(name, language, onError, createNew);
  host.fileExists = (name) => files.has(name) || originalExists(name);
  const exists = host.directoryExists?.bind(host);
  host.directoryExists = (path) => path.endsWith("/.governator-api") || (exists?.(path) ?? false);
  const program = ts.createProgram(names, options, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
  ensure(
    diagnostics.length === 0,
    `TypeScript declaration analysis failed: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`,
  );
  const checker = program.getTypeChecker();
  function moduleFor(name: string): Module {
    const source = program.getSourceFile(name);
    ensure(!!source, "Missing declaration source");
    const symbol = checker.getSymbolAtLocation(source);
    ensure(!!symbol, "Declaration must be an exported module");
    return {
      source,
      exports: new Map(
        checker
          .getExportsOfModule(symbol)
          .map((item) => [
            item.name,
            item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item,
          ]),
      ),
    };
  }
  const modules = names.map(moduleFor);
  return { checker, modules };
}
function properties(checker: ts.TypeChecker, module: Module, name: string) {
  const symbol = module.exports.get(name);
  ensure(!!symbol, `Missing public props export: ${name}`);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  ensure((type.flags & ts.TypeFlags.Any) === 0, `Unsupported props export: ${name}`);
  return new Map(
    checker
      .getPropertiesOfType(type)
      .map((prop) => [
        prop.name,
        { symbol: prop, type: checker.getTypeOfSymbolAtLocation(prop, module.source) },
      ]),
  );
}
export function snapshotApi(declaration: string, rawConfig: ApiConfig): ApiSnapshot {
  const config = decode(ApiConfigSchema, rawConfig);
  decode(SemVer, config.packageVersion);
  unique(
    config.components.map((c) => c.componentId),
    "API component ID",
  );
  const { checker, modules } = inspect([declaration]);
  const module = requiredModule(modules[0]);
  function extractComponent(entry: ApiConfig["components"][number]) {
    decode(SemVer, entry.contractVersion);
    const symbol = module.exports.get(entry.exportName);
    const props: Record<string, { optional: boolean; type: string }> = {};
    if (symbol)
      for (const [name, prop] of properties(checker, module, entry.propsExport))
        props[name] = {
          optional: !!(prop.symbol.flags & ts.SymbolFlags.Optional),
          type: checker.typeToString(
            prop.type,
            module.source,
            ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
          ),
        };
    return {
      ...entry,
      present: !!symbol,
      signature: symbol
        ? checker.typeToString(
            checker.getTypeOfSymbolAtLocation(symbol, module.source),
            module.source,
            ts.TypeFormatFlags.NoTruncation,
          )
        : "",
      props,
    };
  }
  const components = config.components.map(extractComponent);
  return {
    schemaVersion: 1,
    compilerVersion: ts.version,
    packageId: config.packageId,
    packageVersion: config.packageVersion,
    declaration,
    exports: [...module.exports.keys()].sort(),
    components: components.sort((a, b) => (a.componentId < b.componentId ? -1 : 1)),
  };
}
export function decodeApiSnapshot(raw: unknown): ApiSnapshot {
  const snapshot = decode(ApiSnapshotSchema, raw);
  ensure(
    snapshot.compilerVersion === ts.version,
    `API snapshot compiler mismatch: expected ${ts.version}`,
  );
  const extracted = snapshotApi(snapshot.declaration, {
    packageId: snapshot.packageId,
    packageVersion: snapshot.packageVersion,
    components: snapshot.components.map((c) => ({
      componentId: c.componentId,
      exportName: c.exportName,
      propsExport: c.propsExport,
      contractVersion: c.contractVersion,
    })),
  });
  ensure(
    digest(extracted) === digest(snapshot),
    "API snapshot metadata does not match its actual declarations",
  );
  return snapshot;
}
export interface ApiChange {
  readonly componentId: string | null;
  readonly exportName: string;
  readonly prop?: string;
  readonly bump: "major" | "minor" | "unknown";
  readonly message: string;
}
export function diffApi(
  rawBaseline: unknown,
  rawCandidate: unknown,
  expectedBaselineDigest: string,
) {
  ensure(digest(rawBaseline) === expectedBaselineDigest, "API baseline digest mismatch");
  const baseline = decodeApiSnapshot(rawBaseline);
  const candidate = decodeApiSnapshot(rawCandidate);
  ensure(
    baseline.components.every((c) => c.present),
    "Baseline component exports must exist",
  );
  ensure(baseline.packageId === candidate.packageId, "API snapshots refer to different packages");
  const { checker, modules } = inspect([baseline.declaration, candidate.declaration]);
  const old = modules[0];
  const next = modules[1];
  ensure(!!old && !!next, "Missing comparison modules");
  const changes: ApiChange[] = [];
  const componentExports = new Set(
    baseline.components.flatMap((c) => [c.exportName, c.propsExport]),
  );
  for (const name of baseline.exports)
    if (!candidate.exports.includes(name))
      changes.push({
        componentId:
          baseline.components.find((c) => c.exportName === name || c.propsExport === name)
            ?.componentId ?? null,
        exportName: name,
        bump: "major",
        message: `Removed public export ${name}`,
      });
  for (const name of candidate.exports)
    if (!baseline.exports.includes(name))
      changes.push({
        componentId: null,
        exportName: name,
        bump: "minor",
        message: `Added public export ${name}`,
      });
  for (const entry of baseline.components) {
    const counterpart = candidate.components.find((c) => c.componentId === entry.componentId);
    if (!counterpart || !next.exports.has(entry.exportName)) {
      if (candidate.exports.includes(entry.exportName))
        changes.push({
          componentId: entry.componentId,
          exportName: entry.exportName,
          bump: "unknown",
          message: "Component mapping changed; owner review required",
        });
      continue;
    }
    const oldProps = properties(checker, old, entry.propsExport);
    const newProps = properties(checker, next, counterpart.propsExport);
    const oldShape = checker.getDeclaredTypeOfSymbol(old.exports.get(entry.propsExport)!);
    const newShape = checker.getDeclaredTypeOfSymbol(next.exports.get(counterpart.propsExport)!);
    if (!checker.isTypeAssignableTo(oldShape, newShape))
      changes.push({
        componentId: entry.componentId,
        exportName: entry.exportName,
        bump: "major",
        message: "Full props type no longer accepts the previous public contract",
      });
    else if (!checker.isTypeAssignableTo(newShape, oldShape))
      changes.push({
        componentId: entry.componentId,
        exportName: entry.exportName,
        bump: "minor",
        message: "Full props type accepts additional public values",
      });
    for (const [name, prop] of oldProps) {
      const value = newProps.get(name);
      const base = { componentId: entry.componentId, exportName: entry.exportName, prop: name };
      if (!value) changes.push({ ...base, bump: "major", message: `Removed public prop ${name}` });
      else if (
        prop.symbol.flags & ts.SymbolFlags.Optional &&
        !(value.symbol.flags & ts.SymbolFlags.Optional)
      )
        changes.push({ ...base, bump: "major", message: `Prop ${name} is newly required` });
      else if (!checker.isTypeAssignableTo(prop.type, value.type))
        changes.push({
          ...base,
          bump: "major",
          message: `Prop ${name} no longer accepts the previous public type`,
        });
      else if (
        !checker.isTypeAssignableTo(value.type, prop.type) ||
        !!(prop.symbol.flags & ts.SymbolFlags.Optional) !==
          !!(value.symbol.flags & ts.SymbolFlags.Optional)
      )
        changes.push({ ...base, bump: "minor", message: `Prop ${name} accepts additional values` });
    }
    for (const [name, prop] of newProps)
      if (!oldProps.has(name))
        changes.push({
          componentId: entry.componentId,
          exportName: entry.exportName,
          prop: name,
          bump: prop.symbol.flags & ts.SymbolFlags.Optional ? "minor" : "major",
          message: `Added ${prop.symbol.flags & ts.SymbolFlags.Optional ? "optional" : "required"} prop ${name}`,
        });
    const oldCallable = checker.getTypeOfSymbolAtLocation(
      old.exports.get(entry.exportName)!,
      old.source,
    );
    const newCallable = checker.getTypeOfSymbolAtLocation(
      next.exports.get(entry.exportName)!,
      next.source,
    );
    const oldCalls = checker.getSignaturesOfType(oldCallable, ts.SignatureKind.Call);
    const newCalls = checker.getSignaturesOfType(newCallable, ts.SignatureKind.Call);
    function unsupportedCalls(
      calls: readonly ts.Signature[],
      shape: ts.Type,
      source: ts.SourceFile,
    ) {
      function unsupportedCall(call: ts.Signature) {
        if (call.typeParameters?.length || call.parameters.length !== 1) return true;
        const parameter = call.parameters[0];
        if (!parameter) return true;
        const actual = checker.getTypeOfSymbolAtLocation(parameter, source);
        return (
          !!(actual.flags & ts.TypeFlags.Any) ||
          !checker.isTypeAssignableTo(actual, shape) ||
          !checker.isTypeAssignableTo(shape, actual)
        );
      }
      return !calls.length || calls.some(unsupportedCall);
    }
    function changedReturn(call: ts.Signature, index: number) {
      const other = newCalls[index];
      if (!other) return true;
      const a = checker.getReturnTypeOfSignature(call);
      const b = checker.getReturnTypeOfSignature(other);
      return !checker.isTypeAssignableTo(a, b) || !checker.isTypeAssignableTo(b, a);
    }
    const returnChanged = oldCalls.length !== newCalls.length || oldCalls.some(changedReturn);
    if (
      entry.signature !== counterpart.signature ||
      returnChanged ||
      unsupportedCalls(oldCalls, oldShape, old.source) ||
      unsupportedCalls(newCalls, newShape, next.source)
    )
      changes.push({
        componentId: entry.componentId,
        exportName: entry.exportName,
        bump: "unknown",
        message:
          "Public callable signature changed beyond the prop report; explicit classification required",
      });
  }
  for (const name of baseline.exports.filter(
    (name) => candidate.exports.includes(name) && !componentExports.has(name),
  )) {
    const a = old.exports.get(name);
    const b = next.exports.get(name);
    if (!a || !b) continue;
    const oldType =
      a.flags & ts.SymbolFlags.Type
        ? checker.getDeclaredTypeOfSymbol(a)
        : checker.getTypeOfSymbolAtLocation(a, old.source);
    const newType =
      b.flags & ts.SymbolFlags.Type
        ? checker.getDeclaredTypeOfSymbol(b)
        : checker.getTypeOfSymbolAtLocation(b, next.source);
    if (
      !checker.isTypeAssignableTo(oldType, newType) ||
      !checker.isTypeAssignableTo(newType, oldType)
    )
      changes.push({
        componentId: null,
        exportName: name,
        bump: "unknown",
        message: `Public export ${name} changed; explicit classification required`,
      });
  }
  const minimumBump: Bump = changes.some((c) => c.bump === "major")
    ? "major"
    : changes.some((c) => c.bump === "unknown")
      ? "unknown"
      : changes.some((c) => c.bump === "minor")
        ? "minor"
        : "none";
  return {
    schemaVersion: 1 as const,
    packageId: baseline.packageId,
    baselineVersion: baseline.packageVersion,
    candidateVersion: candidate.packageVersion,
    baselineDigest: expectedBaselineDigest,
    candidateDigest: digest(candidate),
    minimumBump,
    requiresReview: changes.some((c) => c.bump === "unknown"),
    changes,
    limitations: [
      "Static declarations do not prove behavior, visual, focus or accessibility compatibility",
      "Baseline is a local fixture unless independently authenticated as a published release",
    ],
  };
}
export function checkApiVersions(
  baseline: ApiSnapshot,
  candidate: ApiSnapshot,
  diff: ReturnType<typeof diffApi>,
) {
  const packageDecision = assessVersion({
    previous: baseline.packageVersion,
    proposed: candidate.packageVersion,
    minimum: diff.minimumBump,
    classified: !diff.requiresReview,
    majorRequirementsVerified: false,
  });
  const reasons = packageDecision.reasons.map((reason) => `Package: ${reason}`);
  for (const previous of baseline.components) {
    const proposed = candidate.components.find((c) => c.componentId === previous.componentId);
    if (!proposed) continue;
    const bumps: Bump[] = diff.changes
      .filter((c) => c.componentId === previous.componentId)
      .map((c) => c.bump);
    const decision = assessVersion({
      previous: previous.contractVersion,
      proposed: proposed.contractVersion,
      minimum: requiredPackageBump(bumps),
      classified: !bumps.includes("unknown"),
      majorRequirementsVerified: false,
    });
    reasons.push(...decision.reasons.map((reason) => `${previous.componentId}: ${reason}`));
  }
  return { gate: reasons.length ? ("blocked" as const) : ("ready" as const), reasons };
}
