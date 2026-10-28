/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react";

type EditorData = { path: string; revision: string; tags: string[] };
export type TagDraft = { data: EditorData; draft: string[]; input: string };
const endpoint = () => new URL("./__governator/tag-editor", document.baseURI);
const tagPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/;
const reserved = new Set(["dev", "test", "autodocs", "manifest", "play-fn", "test-fn"]);

/** Editing is optional and available only when the local dev adapter is enabled. */
export function TagEditor({
  storyId,
  onDirtyChange,
  drafts,
}: {
  storyId: string;
  onDirtyChange?: (dirty: boolean) => void;
  drafts?: Map<string, TagDraft>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const latestData = useRef<EditorData | undefined>(undefined);
  const [data, setData] = useState<EditorData>();
  const [draft, setDraft] = useState<string[]>([]);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("Loading tags…");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty =
    !!data && (JSON.stringify(draft) !== JSON.stringify(data.tags) || input.trim().length > 0);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!data || !drafts) return;
    if (dirty) drafts.set(storyId, { data, draft, input });
    else drafts.delete(storyId);
  }, [data, draft, input, dirty, drafts, storyId]);
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
                typeof tag === "string" && !reserved.has(tag) && !tag.startsWith("!"),
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
          const current = { path: entry.importPath, revision: result.revision, tags: result.tags };
          latestData.current = current;
          const saved = drafts?.get(storyId);
          if (saved) {
            const changed =
              saved.data.path !== current.path || saved.data.revision !== current.revision;
            setData(saved.data);
            setDraft(saved.draft);
            setInput(saved.input);
            setConflict(changed);
            setMessage(changed ? "" : "Unsaved tag edits restored.");
          } else {
            drafts?.delete(storyId);
            setData(current);
            setDraft(result.tags);
            setInput("");
            setConflict(false);
            setMessage("");
          }
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : "Tag editing unavailable");
      }
    })();
    return () => controller.abort();
  }, [storyId, reload, drafts]);
  const add = () => {
    const tag = input.trim();
    if (!tagPattern.test(tag) || reserved.has(tag)) {
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
    setMessage(`Added ${tag}. Unsaved changes.`);
  };
  const save = async () => {
    if (!data || saving || conflict) return;
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
      ) {
        if (response.status === 409) setConflict(true);
        throw new Error(
          response.status === 409
            ? "Story changed. Your draft is unsaved; discard it and reload to continue."
            : "Could not save tags.",
        );
      }
      const saved = { ...data, tags: draft, revision: result.revision };
      const pending = drafts?.get(storyId);
      if (
        pending &&
        pending.data.path === data.path &&
        pending.data.revision === data.revision &&
        JSON.stringify(pending.draft) === JSON.stringify(draft) &&
        pending.input === input
      ) {
        if (input.trim()) drafts?.set(storyId, { data: saved, draft, input });
        else drafts?.delete(storyId);
      }
      latestData.current = saved;
      setData(saved);
      setMessage("Tags saved to the story file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save tags.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section ref={sectionRef} tabIndex={-1} className="gn-card" aria-label="Descriptive tags">
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
                  onClick={(event) => {
                    if (document.activeElement === event.currentTarget) inputRef.current?.focus();
                    setDraft(draft.filter((item) => item !== tag));
                    setMessage(`Removed ${tag}. Unsaved changes.`);
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
              ref={inputRef}
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
            disabled={saving || conflict || JSON.stringify(draft) === JSON.stringify(data.tags)}
          >
            Save tags
          </button>
          {dirty && (
            <button
              disabled={saving}
              onClick={(event) => {
                const current = latestData.current ?? data;
                if (conflict && current.revision === data.revision) {
                  if (document.activeElement === event.currentTarget) sectionRef.current?.focus();
                  drafts?.delete(storyId);
                  setData(undefined);
                  setDraft([]);
                  setInput("");
                  setConflict(false);
                  setReload(reload + 1);
                  return;
                }
                if (document.activeElement === event.currentTarget) inputRef.current?.focus();
                setData(current);
                setDraft(current.tags);
                setInput("");
                setConflict(false);
                setMessage("Tag edits discarded.");
              }}
            >
              Discard changes
            </button>
          )}
        </>
      )}
      {!data && storyTags.length > 0 && <p>Story tags: {storyTags.join(", ")}</p>}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {conflict && (
        <p role="status">
          Story changed. Your draft is unsaved; discard it and reload to continue.
        </p>
      )}
      {conflict && (
        <button
          onClick={(event) => {
            if (document.activeElement === event.currentTarget) sectionRef.current?.focus();
            drafts?.delete(storyId);
            setData(undefined);
            setDraft([]);
            setInput("");
            setConflict(false);
            setReload(reload + 1);
          }}
        >
          Discard draft and reload tags
        </button>
      )}
    </section>
  );
}
