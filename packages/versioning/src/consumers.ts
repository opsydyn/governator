import ts from "typescript";
/** Compile contained owner-selected consumer fixtures against declarations read from the tarball. */
export function checkConsumers(
  packageId: string,
  declaration: string,
  fixtures: readonly string[],
): string[] {
  const root = ts.sys.getCurrentDirectory() + "/.governanator-consumers";
  const api = root + "/api.ts";
  const files = new Map([
    [api, declaration],
    ...fixtures.map((source, i) => [`${root}/consumer-${i}.tsx`, source] as [string, string]),
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    types: [],
    baseUrl: ts.sys.getCurrentDirectory(),
    paths: { [packageId]: [api] },
  };
  const host = ts.createCompilerHost(options),
    source = host.getSourceFile.bind(host),
    exists = host.fileExists.bind(host),
    directory = host.directoryExists?.bind(host);
  host.getSourceFile = (name, language, onError, create) =>
    files.has(name)
      ? ts.createSourceFile(
          name,
          files.get(name) ?? "",
          ts.ScriptTarget.Latest,
          true,
          name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        )
      : source(name, language, onError, create);
  host.fileExists = (name) => files.has(name) || exists(name);
  host.directoryExists = (name) => name === root || (directory?.(name) ?? false);
  const program = ts.createProgram([...files.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}
