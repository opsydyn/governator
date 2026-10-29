/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react";
import {
  buildRegistryComponent,
  registryArrays,
  registryFields,
  valuesOfRegistryComponent,
} from "./registry-form.ts";
import type { RegistryFields } from "./registry-form.ts";

type Draft = {
  revision: string;
  original: RegistryFields;
  values: Record<string, string>;
  requiresReview?: boolean;
  reviewLoaded?: boolean;
};
const drafts = new Map<string, Draft>();
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [registryPath, setRegistryPath] = useState<string>();
  const section = useRef<HTMLElement>(null);
  const latest = useRef<Draft>();
  const key = `${storyId}\0${componentId}`;
  const dirty =
    !!draft &&
    JSON.stringify(draft.values) !== JSON.stringify(valuesOfRegistryComponent(draft.original));
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
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      abort.abort();
      setMessage("Metadata request timed out. Retry to reload.");
    }, 10_000);
    setDraft(undefined);
    setConflict(false);
    setFieldErrors({});
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
        const original = value.component as RegistryFields;
        const next = {
          revision: value.revision,
          original,
          values: valuesOfRegistryComponent(original),
        };
        latest.current = next;
        if ("registryPath" in value && typeof value.registryPath === "string")
          setRegistryPath(value.registryPath);
        if (abort.signal.aborted) return;
        const saved = drafts.get(key);
        if (saved) {
          const restored = saved.requiresReview ? { ...saved, reviewLoaded: true } : saved;
          if (restored !== saved) drafts.set(key, restored);
          setDraft(restored);
          const changed = saved.revision !== next.revision || saved.requiresReview === true;
          setConflict(changed);
          setMessage(
            changed
              ? "Registry changed or a previous save had an unknown outcome. Compare your draft with the current registry."
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
    setFieldErrors((current) => {
      if (!(name in current)) return current;
      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });
    setMessage("Unsaved declaration changes.");
  };
  const save = async () => {
    if (!draft || saving || conflict || !dirty) return;
    const parsed = buildRegistryComponent(draft.original, draft.values);
    if (!parsed.component) {
      setFieldErrors(parsed.fieldErrors);
      setMessage("Correct the highlighted metadata fields before saving.");
      const first = Object.keys(parsed.fieldErrors)[0];
      if (first) document.getElementById(`gn-registry-${first}`)?.focus({ preventScroll: false });
      return;
    }
    const component = parsed.component;
    setFieldErrors({});
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
      const reviewDraft = { ...draft, requiresReview: true };
      drafts.set(key, reviewDraft);
      setDraft(reviewDraft);
      setMessage(
        "Save outcome is unknown. Load the current registry and compare it with your draft.",
      );
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
        if (response.status === 409) {
          const reviewDraft = { ...draft, requiresReview: true };
          drafts.set(key, reviewDraft);
          setDraft(reviewDraft);
          setConflict(true);
        }
        throw new Error(
          response.status === 409
            ? "Registry changed. Load the current registry and compare it with your draft."
            : "Could not save metadata. Review the highlighted values and repository paths.",
        );
      }
      const saved = {
        revision: result.revision,
        original: result.component as RegistryFields,
        values: valuesOfRegistryComponent(result.component as RegistryFields),
      };
      latest.current = saved;
      if ("registryPath" in result && typeof result.registryPath === "string")
        setRegistryPath(result.registryPath);
      if (drafts.get(key) === draft) drafts.delete(key);
      setDraft(saved);
      setMessage("Declaration saved. Commit the registry, regenerate and reload the report.");
    } catch (error) {
      if (!timedOut) {
        const registryConflict =
          error instanceof Error && error.message.startsWith("Registry changed");
        const unknown = !definiteRejection && !registryConflict;
        if (!definiteRejection) setConflict(true);
        if (unknown) {
          const reviewDraft = { ...draft, requiresReview: true };
          drafts.set(key, reviewDraft);
          setDraft(reviewDraft);
        }
        setMessage(
          definiteRejection || registryConflict
            ? error instanceof Error
              ? error.message
              : "Could not save metadata."
            : "Save outcome is unknown. Load the current registry and compare it with your draft.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (!timedOut) setSaving(false);
    }
  };
  const field = ([name, label]: (typeof registryFields)[number]) => {
    const error = fieldErrors[name];
    const common = {
      id: `gn-registry-${name}`,
      "aria-label": label,
      "aria-invalid": error ? (true as const) : undefined,
      "aria-describedby": error ? `gn-registry-${name}-error` : undefined,
      disabled: saving,
      value: draft?.values[name] ?? "",
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => update(name, event.currentTarget.value),
    };
    return (
      <label key={name}>
        {label}
        {name === "lifecycle" ? (
          <select {...common}>
            {["draft", "candidate", "stable", "deprecated", "retired"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        ) : registryArrays.has(name) ? (
          <textarea {...common} />
        ) : (
          <input {...common} />
        )}
        {error && (
          <span id={`gn-registry-${name}-error`} className="gn-field-error">
            {error}
          </span>
        )}
      </label>
    );
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
        <code>{componentId}</code>. Saving updates one declaration in{" "}
        <code>{registryPath ?? "configured registry file"}</code>.
      </p>
      {draft && (
        <>
          {Object.keys(fieldErrors).length > 0 && (
            <div role="alert" className="gn-note">
              <strong>Correct {Object.keys(fieldErrors).length} metadata fields</strong>
              <ul>
                {Object.entries(fieldErrors).map(([name, error]) => (
                  <li key={name}>
                    <a href={`#gn-registry-${name}`}>{error}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="gn-split gn-registry">
            {registryFields.filter((entry) => entry[2] === "basic").map(field)}
            {registryFields.filter((entry) => entry[2] === "ownership").map(field)}
          </div>
          <details
            className="gn-registry-group"
            open={
              registryFields.some(
                ([name, _label, group]) =>
                  (group === "contracts" || group === "links") && name in fieldErrors,
              ) || undefined
            }
          >
            <summary>Contracts and paths</summary>
            <div className="gn-split gn-registry">
              {registryFields.filter((entry) => entry[2] === "contracts").map(field)}
            </div>
            <h4>Reference links</h4>
            <div className="gn-split gn-registry">
              {registryFields.filter((entry) => entry[2] === "links").map(field)}
            </div>
          </details>
          <button disabled={saving || conflict || !dirty} onClick={() => void save()}>
            Save metadata
          </button>
          {conflict && (
            <div className="gn-note">
              <p>Your intended declaration is preserved for review.</p>
              <details>
                <summary>Compare intended and current declarations</summary>
                <p>
                  Intended: <code>{JSON.stringify(draft.values)}</code>
                </p>
                <p>
                  Current: <code>{JSON.stringify(latest.current?.values ?? {})}</code>
                </p>
              </details>
              <button
                type="button"
                onClick={() => {
                  void Promise.resolve()
                    .then(() => {
                      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
                      return navigator.clipboard.writeText(JSON.stringify(draft.values));
                    })
                    .then(
                      () => setMessage("Intended declaration copied."),
                      () => setMessage("Could not copy the intended declaration."),
                    );
                }}
              >
                Copy intended declaration
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  const current = latest.current;
                  if (!current || (draft.requiresReview && !draft.reviewLoaded)) {
                    setDraft(undefined);
                    setReload((value) => value + 1);
                    return;
                  }
                  const rebased = {
                    ...current,
                    values: draft.values,
                    requiresReview: false,
                  };
                  drafts.set(key, rebased);
                  setDraft(rebased);
                  setConflict(false);
                  setMessage(
                    "Draft retained against the current registry. Review it before saving.",
                  );
                }}
              >
                {draft.reviewLoaded ||
                (latest.current && latest.current.revision !== draft.revision)
                  ? "Reapply draft to current registry"
                  : "Load current registry and keep draft"}
              </button>
            </div>
          )}
          {(dirty || conflict) && (
            <button
              disabled={saving}
              onClick={(event) => {
                if (document.activeElement === event.currentTarget) section.current?.focus();
                drafts.delete(key);
                setDraft(undefined);
                setFieldErrors({});
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
