/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react";

type Fields = Record<string, unknown> & { id: string };
type Draft = { revision: string; original: Fields; values: Record<string, string> };
const drafts = new Map<string, Draft>();
const fields = [
  ["name", "Name"],
  ["package", "Package"],
  ["owners", "Owners, one per line"],
  ["lifecycle", "Lifecycle"],
  ["source", "Source path"],
  ["stories", "Story paths, one per line"],
  ["contractVersion", "Contract version"],
  ["exportPath", "Export path"],
  ["packageVersion", "Package version (optional)"],
  ["replacementId", "Replacement ID (optional)"],
  ["documentationUrl", "Documentation URL (optional)"],
  ["figmaUrl", "Figma URL (optional)"],
] as const;
const arrays = new Set(["owners", "stories"]);
const optional = new Set(["packageVersion", "replacementId", "documentationUrl", "figmaUrl"]);
function valuesOf(component: Fields): Record<string, string> {
  return Object.fromEntries(
    fields.map(([key]) => [
      key,
      arrays.has(key) && Array.isArray(component[key])
        ? (component[key] as string[]).join("\n")
        : typeof component[key] === "string"
          ? component[key]
          : "",
    ]),
  );
}
function endpoint(storyId: string, componentId: string): URL {
  const url = new URL("/__governator/registry-editor", window.location.href);
  url.searchParams.set("storyId", storyId);
  url.searchParams.set("componentId", componentId);
  return url;
}
export function RegistryEditor({
  storyId,
  componentId,
  onDirtyChange,
}: {
  storyId: string;
  componentId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [message, setMessage] = useState("Loading declared metadata…");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const section = useRef<HTMLElement>(null);
  const key = `${storyId}\0${componentId}`;
  const dirty =
    !!draft && JSON.stringify(draft.values) !== JSON.stringify(valuesOf(draft.original));
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      abort.abort();
      setMessage("Metadata request timed out. Retry to reload.");
    }, 10_000);
    setDraft(undefined);
    setConflict(false);
    setMessage("Loading declared metadata…");
    void fetch(endpoint(storyId, componentId), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Local governance editing is unavailable for this story.");
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== "object" ||
          !("revision" in value) ||
          typeof value.revision !== "string" ||
          !("component" in value) ||
          !value.component ||
          typeof value.component !== "object" ||
          !("id" in value.component) ||
          value.component.id !== componentId
        )
          throw new Error("Invalid metadata response.");
        const original = value.component as Fields;
        const next = { revision: value.revision, original, values: valuesOf(original) };
        if (abort.signal.aborted) return;
        const saved = drafts.get(key);
        if (saved) {
          setDraft(saved);
          setConflict(saved.revision !== next.revision);
          setMessage(
            saved.revision !== next.revision
              ? "Registry changed. Discard the draft and reload."
              : "Unsaved metadata draft restored.",
          );
        } else {
          setDraft(next);
          setMessage("");
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Local governance editing is unavailable.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      abort.abort();
      clearTimeout(timeout);
    };
  }, [storyId, componentId, key, reload]);
  const update = (name: string, value: string) => {
    if (!draft) return;
    const next = { ...draft, values: { ...draft.values, [name]: value } };
    drafts.set(key, next);
    setDraft(next);
    setMessage("Unsaved declaration changes.");
  };
  const save = async () => {
    if (!draft || saving || conflict || !dirty) return;
    const component: Fields = { ...draft.original };
    const originalValues = valuesOf(draft.original);
    for (const [name] of fields) {
      const text = draft.values[name] ?? "";
      if (text === originalValues[name]) continue;
      if (arrays.has(name))
        component[name] = text
          .split("\n")
          .map((part) => part.trim())
          .filter(Boolean);
      else if (optional.has(name) && !text.trim()) {
        if (draft.original[name] !== null) delete component[name];
      } else component[name] = text.trim();
    }
    setSaving(true);
    setMessage("Saving declaration…");
    window.dispatchEvent(new Event("governator:registry-changed"));
    const controller = new AbortController();
    let timedOut = false;
    let definiteRejection = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      setSaving(false);
      setConflict(true);
      setMessage("Save outcome is unknown. Discard the draft and reload to inspect the registry.");
    }, 10_000);
    try {
      const response = await fetch(endpoint(storyId, componentId), {
        method: "POST",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, componentId, revision: draft.revision, component }),
      });
      definiteRejection = !response.ok && response.status !== 409;
      const result: unknown = await response.json();
      if (response.ok) window.dispatchEvent(new Event("governator:registry-changed"));
      if (timedOut) return;
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("revision" in result) ||
        typeof result.revision !== "string" ||
        !("component" in result) ||
        !result.component ||
        typeof result.component !== "object" ||
        !("id" in result.component) ||
        result.component.id !== componentId
      ) {
        if (response.status === 409) setConflict(true);
        throw new Error(
          response.status === 409
            ? "Registry changed. Discard the draft and reload."
            : "Could not save metadata. Check values and paths.",
        );
      }
      const saved = {
        revision: result.revision,
        original: result.component as Fields,
        values: valuesOf(result.component as Fields),
      };
      if (drafts.get(key) === draft) drafts.delete(key);
      setDraft(saved);
      setMessage("Declaration saved. Commit the registry, regenerate and reload the report.");
    } catch (error) {
      if (!timedOut) {
        if (!definiteRejection) setConflict(true);
        setMessage(
          definiteRejection ||
            (error instanceof Error && error.message.startsWith("Registry changed"))
            ? error instanceof Error
              ? error.message
              : "Could not save metadata."
            : "Save outcome is unknown. Discard the draft and reload to inspect the registry.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (!timedOut) setSaving(false);
    }
  };
  return (
    <section
      ref={section}
      tabIndex={-1}
      className="gn-card"
      aria-label="Declared governance metadata"
    >
      <h3>Declared governance metadata</h3>
      <p className="gn-small">
        Declarations require review and do not grant readiness or release approval. Component ID:{" "}
        <code>{componentId}</code>.
      </p>
      {draft && (
        <>
          <div className="gn-split gn-registry">
            {fields.map(([name, label]) => (
              <label key={name}>
                {label}
                {name === "lifecycle" ? (
                  <select
                    aria-label={label}
                    disabled={saving}
                    value={draft.values[name]}
                    onChange={(event) => update(name, event.currentTarget.value)}
                  >
                    {["draft", "candidate", "stable", "deprecated", "retired"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : arrays.has(name) ? (
                  <textarea
                    aria-label={label}
                    disabled={saving}
                    value={draft.values[name]}
                    onChange={(event) => update(name, event.currentTarget.value)}
                  />
                ) : (
                  <input
                    aria-label={label}
                    disabled={saving}
                    value={draft.values[name]}
                    onChange={(event) => update(name, event.currentTarget.value)}
                  />
                )}
              </label>
            ))}
          </div>
          <button disabled={saving || conflict || !dirty} onClick={() => void save()}>
            Save metadata
          </button>
          {(dirty || conflict) && (
            <button
              disabled={saving}
              onClick={(event) => {
                if (document.activeElement === event.currentTarget) section.current?.focus();
                drafts.delete(key);
                setDraft(undefined);
                setReload((value) => value + 1);
              }}
            >
              Discard draft and reload
            </button>
          )}
        </>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!draft && !message.startsWith("Loading") && (
        <button onClick={() => setReload((value) => value + 1)}>Retry metadata</button>
      )}
    </section>
  );
}
