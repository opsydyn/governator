/* Private offline filesystem/HTML adapter: native promises and error handling keep the docs check dependency-free. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-naked-object-state-update */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Window } from "happy-dom";

// This reserved origin identifies relative URLs only; no network requests are made.
const localOrigin = "https://docs.invalid";
async function htmlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat().sort();
}
function pageUrl(path: string) {
  const route = path.replaceAll(sep, "/");
  return `${localOrigin}/${route.endsWith("index.html") ? route.slice(0, -10) : route}`;
}
function validatePath(href: string, source: string) {
  const rawPath = href.split(/[?#]/, 1)[0] ?? "";
  const decoded = decodeURIComponent(rawPath);
  if (
    /%(?:2f|5c)/i.test(rawPath) ||
    decoded.includes("\\") ||
    Array.from(decoded).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("malformed path");
  }
  const parts = rawPath.startsWith("/") ? [] : new URL(source).pathname.split("/").slice(1, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") {
      if (parts.length === 0) throw new Error("path escapes output root");
      parts.pop();
    } else if (part !== "" && part !== ".") parts.push(part);
  }
}
async function findTarget(root: string, pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const base = resolve(root, `.${decoded}`);
  const candidates = decoded.endsWith("/")
    ? [join(base, "index.html")]
    : [base, join(base, "index.html")];
  for (const candidate of candidates) {
    const metadata = await stat(candidate).catch(() => undefined);
    if (!metadata?.isFile()) continue;
    const actual = await realpath(candidate);
    if (actual !== root && !actual.startsWith(`${root}${sep}`))
      throw new Error("path escapes output root");
    return actual;
  }
  return undefined;
}
export async function checkDocsLinks(outputRoot: string): Promise<string[]> {
  const root = await realpath(outputRoot);
  const files = await htmlFiles(root);
  if (files.length === 0) throw new Error(`No built HTML found in ${root}`);
  const pages = new Map<string, { links: string[]; ids: Set<string> }>();
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
      handleDisabledFileLoadingAsSuccess: true,
    },
  });
  try {
    for (const file of files) {
      const document = new window.DOMParser().parseFromString(
        await readFile(file, "utf8"),
        "text/html",
      );
      pages.set(file, {
        links: Array.from(
          document.querySelectorAll("a[href], area[href]"),
          (node) => node.getAttribute("href") ?? "",
        ),
        ids: new Set(
          Array.from(
            document.querySelectorAll("[id], a[name]"),
            (node) => node.getAttribute("id") ?? node.getAttribute("name") ?? "",
          ),
        ),
      });
    }
    const issues: string[] = [];
    for (const [file, page] of pages) {
      const source = pageUrl(relative(root, file));
      for (const href of page.links) {
        try {
          const url = new URL(href, source);
          if (url.origin !== localOrigin || !["https:", "http:"].includes(url.protocol)) continue;
          validatePath(href, source);
          const target = await findTarget(root, url.pathname);
          if (!target) throw new Error("missing page");
          const fragment = decodeURIComponent(url.hash.slice(1));
          if (
            fragment &&
            fragment !== "top" &&
            pages.has(target) &&
            !pages.get(target)?.ids.has(fragment)
          )
            throw new Error(`missing fragment #${fragment}`);
        } catch (error) {
          issues.push(
            `${relative(root, file)}: ${JSON.stringify(href)}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return issues;
  } finally {
    await window.happyDOM.close();
  }
}
if (import.meta.main) {
  const root = resolve(process.argv[2] ?? join(dirname(import.meta.dir), "apps/docs/dist"));
  const issues = await checkDocsLinks(root);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Built docs internal page and fragment links passed (external URLs are not checked).",
    );
}
