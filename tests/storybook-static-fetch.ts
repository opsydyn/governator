import { vi } from "vitest";
/** Model a static Storybook that has no local registry verification endpoint. */
export function stubStorybookGlobal(name: string, value: unknown): void {
  if (name === "fetch" && typeof value === "function") {
    vi.stubGlobal(
      name,
      vi.fn((url: string | URL, ...args: unknown[]) =>
        String(url).includes("/__governator/registry-source")
          ? Promise.resolve(new Response("", { status: 404 }))
          : value(url, ...args),
      ),
    );
  } else vi.stubGlobal(name, value);
}
