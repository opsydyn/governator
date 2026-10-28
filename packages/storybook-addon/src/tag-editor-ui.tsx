/** @jsxRuntime classic */
import React, { useEffect, useState } from "react";

type EditorData = { path: string; revision: string; tags: string[] };
const endpoint = () => new URL("./__governator/tag-editor", document.baseURI);
const tagPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/;
const reserved = new Set(["dev", "test", "autodocs", "manifest", "play-fn", "test-fn"]);

/** Editing is optional and available only when the local dev adapter is enabled. */
export function TagEditor({ storyId }: { storyId: string }) {
  const [data, setData] = useState<EditorData>();
  const [draft, setDraft] = useState<string[]>([]);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("Loading tags…");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setStoryTags([]);
    setMessage("Loading tags…");
    void (async () => {
      try {
        const index = await fetch(new URL("./index.json", document.baseURI), {
          signal: controller.signal,
        });
        if (!index.ok) throw new Error("Story index unavailable");
        const parsed: unknown = await index.json();
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !("entries" in parsed) ||
          !parsed.entries ||
          typeof parsed.entries !== "object" ||
          !(storyId in parsed.entries)
        )
          throw new Error("Story source unavailable");
        const entry = (parsed.entries as Record<string, { importPath?: unknown; tags?: unknown }>)[
          storyId
        ];
        if (!entry || typeof entry.importPath !== "string")
          throw new Error("Story source unavailable");
        if (Array.isArray(entry.tags) && !controller.signal.aborted)
          setStoryTags(
            entry.tags.filter(
              (tag: unknown): tag is string =>
                typeof tag === "string" &&
                !reserved.has(tag) &&
                !tag.startsWith("!") &&
                !tag.startsWith("governator:component:"),
            ),
          );
        const url = endpoint();
        url.searchParams.set("path", entry.importPath);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
          throw new Error(
            "Tag editing is unavailable. Enable the local Storybook tag editor to make changes.",
          );
        const result: unknown = await response.json().catch(() => {
          throw new Error(
            "Tag editing is unavailable. Enable the local Storybook tag editor to make changes.",
          );
        });
        if (
          !result ||
          typeof result !== "object" ||
          !("tags" in result) ||
          !Array.isArray(result.tags) ||
          result.tags.some((tag: unknown) => typeof tag !== "string") ||
          !("revision" in result) ||
          typeof result.revision !== "string"
        )
          throw new Error("Invalid tag response");
        if (!controller.signal.aborted) {
          setData({ path: entry.importPath, revision: result.revision, tags: result.tags });
          setDraft(result.tags);
          setMessage("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : "Tag editing unavailable");
      }
    })();
    return () => controller.abort();
  }, [storyId, reload]);
  const add = () => {
    const tag = input.trim();
    if (!tagPattern.test(tag) || reserved.has(tag) || tag.startsWith("governator:component:")) {
      setMessage("Enter a descriptive tag; built-in Storybook tags cannot be edited here.");
      return;
    }
    if (draft.includes(tag)) {
      setMessage("This tag is already present.");
      return;
    }
    if (draft.length >= 50) {
      setMessage("A component can have at most 50 descriptive tags.");
      return;
    }
    setDraft([...draft, tag]);
    setInput("");
    setMessage("Unsaved changes");
  };
  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    setMessage("Saving tags…");
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: data.path, revision: data.revision, tags: draft }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("revision" in result) ||
        typeof result.revision !== "string"
      )
        throw new Error(
          response.status === 409
            ? "Story changed. Reload tags before saving."
            : "Could not save tags.",
        );
      setData({ ...data, tags: draft, revision: result.revision });
      setMessage("Tags saved to the story file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save tags.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="gn-card" aria-label="Descriptive tags">
      <h3>Descriptive tags</h3>
      <p className="gn-small">
        These tags apply to stories in this file. They organise components; they do not approve
        governance or releases.
      </p>
      {data && (
        <>
          <ul className="gn-tag-list">
            {draft.map((tag) => (
              <li key={tag}>
                {tag}{" "}
                <button
                  aria-label={`Remove ${tag}`}
                  disabled={saving}
                  onClick={() => {
                    setDraft(draft.filter((item) => item !== tag));
                    setMessage("Unsaved changes");
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <label className="gn-tag-label">
            New descriptive tag{" "}
            <input
              value={input}
              disabled={saving}
              onChange={(event) => setInput(event.currentTarget.value)}
            />
          </label>{" "}
          <button onClick={add} disabled={saving}>
            Add tag
          </button>{" "}
          <button
            onClick={() => void save()}
            disabled={saving || JSON.stringify(draft) === JSON.stringify(data.tags)}
          >
            Save tags
          </button>
        </>
      )}
      {!data && storyTags.length > 0 && <p>Story tags: {storyTags.join(", ")}</p>}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {message.includes("changed") && (
        <button onClick={() => setReload(reload + 1)}>Reload tags</button>
      )}
    </section>
  );
}
