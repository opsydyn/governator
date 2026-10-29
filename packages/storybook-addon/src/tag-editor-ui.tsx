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
  const ownedDrafts = useRef(new Map<string, TagDraft>());
  const draftStore = drafts ?? ownedDrafts.current;
  const [data, setData] = useState<EditorData>();
  const [draft, setDraft] = useState<string[]>([]);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("Loading tags…");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [readState, setReadState] = useState<"loading" | "editable" | "read-only" | "error">(
    "loading",
  );
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const dirty =
    !!data && (JSON.stringify(draft) !== JSON.stringify(data.tags) || input.trim().length > 0);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!data) return;
    if (dirty) draftStore.set(storyId, { data, draft, input });
    else draftStore.delete(storyId);
  }, [data, draft, input, dirty, draftStore, storyId]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) {
        setReadState("error");
        setMessage("Tag request timed out. Check the local adapter, then retry.");
      }
    }, 10_000);
    setData(undefined);
    setStoryTags([]);
    setReadState("loading");
    setUnknownOutcome(false);
    setMessage("Loading tags…");
    void (async () => {
      try {
        const index = await fetch(new URL("./index.json", document.baseURI), {
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
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
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
        });
        if (!response.ok) {
          if (response.status === 404) {
            setReadState("read-only");
            setMessage("Read-only tags. Local tag editing is not enabled for this Storybook.");
            return;
          }
          throw new Error(`Tag editor unavailable (HTTP ${response.status}).`);
        }
        const result: unknown = await response.json().catch(() => undefined);
        if (result === undefined) {
          setReadState("read-only");
          setMessage("Read-only tags. Local tag editing is not enabled for this Storybook.");
          return;
        }
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
          const saved = draftStore.get(storyId);
          if (saved) {
            const changed =
              saved.data.path !== current.path || saved.data.revision !== current.revision;
            setData(saved.data);
            setDraft(saved.draft);
            setInput(saved.input);
            setConflict(changed);
            setReadState("editable");
            setMessage(changed ? "" : "Unsaved tag edits restored.");
          } else {
            draftStore.delete(storyId);
            setData(current);
            setDraft(result.tags);
            setInput("");
            setConflict(false);
            setReadState("editable");
            setMessage("");
          }
        }
      } catch (error) {
        if (active && !timedOut) {
          setReadState("error");
          setMessage(error instanceof Error ? error.message : "Tag editing unavailable");
        }
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [storyId, reload, draftStore]);
  const add = (candidate = input) => {
    const tag = candidate.trim();
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
    setUnknownOutcome(false);
    setMessage("Saving tags…");
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: data.path, revision: data.revision, tags: draft }),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
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
      const pending = draftStore.get(storyId);
      if (
        pending &&
        pending.data.path === data.path &&
        pending.data.revision === data.revision &&
        JSON.stringify(pending.draft) === JSON.stringify(draft) &&
        pending.input === input
      ) {
        if (input.trim()) draftStore.set(storyId, { data: saved, draft, input });
        else draftStore.delete(storyId);
      }
      latestData.current = saved;
      setData(saved);
      setMessage("Tags saved to the story file.");
    } catch (error) {
      if (timedOut) {
        setConflict(true);
        setUnknownOutcome(true);
        setMessage(
          "Save outcome unknown. The request timed out after it may have reached the local editor. Load the current file and compare before saving again.",
        );
      } else setMessage(error instanceof Error ? error.message : "Could not save tags.");
    } finally {
      clearTimeout(timeout);
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(event.currentTarget.value);
                }
              }}
              aria-describedby="gn-tag-format"
            />
          </label>{" "}
          <button onClick={() => add()} disabled={saving}>
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
                  draftStore.delete(storyId);
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
                setUnknownOutcome(false);
                setMessage("Tag edits discarded.");
              }}
            >
              Discard changes
            </button>
          )}
          <p id="gn-tag-format" className="gn-small">
            Letters, numbers, colon, underscore and hyphen; 1–64 characters. Saving updates all
            stories in <code>{data.path}</code>.
          </p>
        </>
      )}
      {!data && storyTags.length > 0 && <p>Story tags: {storyTags.join(", ")}</p>}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {conflict && (
        <div className="gn-note">
          <p role="status">
            {unknownOutcome
              ? "Your intended tags are preserved while the save outcome is unknown."
              : "Story changed. Your draft is preserved for comparison with the current file."}
          </p>
          <p>
            Your intended tags: <code>{JSON.stringify(draft)}</code>
          </p>
          <button
            type="button"
            onClick={() => {
              void Promise.resolve()
                .then(() => {
                  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
                  return navigator.clipboard.writeText(JSON.stringify(draft));
                })
                .then(
                  () => setMessage("Intended tags copied."),
                  () => setMessage("Could not copy intended tags."),
                );
            }}
          >
            Copy intended tags
          </button>
          {latestData.current &&
            (latestData.current.path !== data?.path ||
              latestData.current.revision !== data?.revision) && (
              <p>
                Current file tags: <code>{JSON.stringify(latestData.current.tags)}</code>
              </p>
            )}
        </div>
      )}
      {conflict && (
        <>
          <button
            onClick={() => {
              const current = latestData.current;
              if (
                !current ||
                (current.path === data?.path && current.revision === data?.revision)
              ) {
                setData(undefined);
                setReload((value) => value + 1);
                setMessage("Loading the current story file while keeping your draft…");
                return;
              }
              setData(current);
              draftStore.set(storyId, { data: current, draft, input });
              setConflict(false);
              setUnknownOutcome(false);
              setMessage("Draft retained against the current file. Review it before saving.");
            }}
          >
            {latestData.current &&
            (latestData.current.path !== data?.path ||
              latestData.current.revision !== data?.revision)
              ? "Reapply draft to current file"
              : "Load current file and keep draft"}
          </button>{" "}
          <button
            onClick={(event) => {
              if (document.activeElement === event.currentTarget) sectionRef.current?.focus();
              draftStore.delete(storyId);
              setData(undefined);
              setDraft([]);
              setInput("");
              setConflict(false);
              setUnknownOutcome(false);
              setReload((value) => value + 1);
            }}
          >
            Discard draft and reload tags
          </button>
        </>
      )}
      {!data && readState === "error" && (
        <button onClick={() => setReload((value) => value + 1)}>Retry loading tags</button>
      )}
    </section>
  );
}
