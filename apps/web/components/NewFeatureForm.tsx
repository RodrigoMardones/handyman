"use client";

import { useEffect, useId, useState } from "react";
import { announce } from "../lib/announce";
import { formatFeatureName } from "../lib/featureName";
import { submitNewFeature } from "../lib/submitNewFeature";
import styles from "./NewFeatureForm.module.css";

/**
 * Compose-a-request view for /harness/[name]/new (feature 71,
 * new_feataure_view).
 *
 * One place that orders the whole "create a request" space AddFeatureForm and
 * RunPanel used to split across two independent panels: name/title/
 * acceptance (AddFeatureForm's fields), a workspace-file picker sourced from
 * GET /api/files (the same tag picker IntakeClient uses for /intake), and an
 * opt-in "run agent" toggle that chains POST /api/run onto the feature this
 * form just registered (RunPanel's action, invoked here instead of picked by
 * hand from the queue).
 *
 * Refs travel inside `description` as a plain "Refs:" section, one relative
 * path per line - no schema change, no new field on POST /api/feature (it
 * already accepts description). No refs selected -> no Refs section, so a
 * request with no attachments looks exactly like one made before this
 * feature existed.
 *
 * Register -> run is client-side and sequential: the toggle only ever POSTs
 * /api/run after /api/feature replies ok, and only when TOOLBOX_RUNNER=1 (the
 * `enabled` prop, read server-side per request exactly like RunPanel). With
 * the runner off the toggle is not offered at all, just the opt-in hint -
 * same reasoning as RunPanel's guaranteed-403 avoidance.
 *
 * A plain React tree, like AddFeatureForm/RunPanel/IntakeClient: nothing here
 * writes into HarnessLive's dangerouslySetInnerHTML region.
 */

interface TagFile {
  path: string;
  size: number;
}

function buildDescription(refs: string[]): string | null {
  if (refs.length === 0) {
    return null;
  }
  return `Refs:\n${refs.join("\n")}`;
}

export function NewFeatureForm({
  root,
  runnerEnabled,
  filesUrl,
}: {
  root: string;
  runnerEnabled: boolean;
  filesUrl: string;
}) {
  const nameId = useId();
  const titleId = useId();
  const acceptanceId = useId();

  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [title, setTitle] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [runAgent, setRunAgent] = useState(false);

  const [tagFiles, setTagFiles] = useState<TagFile[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);

  const [phase, setPhase] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [runPhase, setRunPhase] = useState<"idle" | "ok" | "error">("idle");
  const [runMessage, setRunMessage] = useState("");

  // Same picker source as /intake: GET /api/files?root= against the
  // registered root this page already resolved server-side.
  useEffect(() => {
    if (!root) {
      setTagFiles([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ root });
    fetch(`${filesUrl}?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => r.json())
      .then((data: { files?: TagFile[] }) => {
        if (!cancelled) {
          setTagFiles(Array.isArray(data.files) ? data.files : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTagFiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [root, filesUrl]);

  // Auto-derives name from title (formatFeatureName, lib/featureName.ts)
  // while the user has not edited name by hand. Editing name directly sets
  // nameEdited and stops this effect from overwriting it.
  useEffect(() => {
    if (!nameEdited) {
      setName(formatFeatureName(title));
    }
  }, [title, nameEdited]);

  const toggleRef = (path: string): void => {
    setSelectedRefs((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };
  const removeRef = (path: string): void =>
    setSelectedRefs((prev) => prev.filter((p) => p !== path));
  const filteredTags = tagFiles.filter((f) =>
    f.path.toLowerCase().includes(tagQuery.toLowerCase()),
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPhase("sending");
    setMessage("");
    setRunPhase("idle");
    setRunMessage("");
    const trimmedName = name.trim();
    try {
      const result = await submitNewFeature({
        root,
        name: trimmedName,
        title: title.trim() || null,
        acceptance: acceptance.split("\n"),
        description: buildDescription(selectedRefs),
        runnerEnabled,
        runAgent,
      });
      if (!result.feature.ok) {
        setPhase("error");
        setMessage(result.feature.error);
        return;
      }
      setPhase("ok");
      setMessage(`registered feature ${result.feature.id} '${trimmedName}' (pending)`);
      announce.polite(`feature ${result.feature.id} registered`);

      if (result.run) {
        if (result.run.ok) {
          setRunPhase("ok");
          setRunMessage(`agent launched on '${trimmedName}'`);
          announce.polite(`agent run started on ${trimmedName}`);
        } else {
          setRunPhase("error");
          setRunMessage(`Feature registered, but agent was not launched: ${result.run.error}`);
        }
      }

      setName("");
      setNameEdited(false);
      setTitle("");
      setAcceptance("");
      setSelectedRefs([]);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "request failed");
    }
  };

  const busy = phase === "sending";

  return (
    <section className={styles.panel} aria-labelledby={`${nameId}-heading`}>
      <h2 className={styles.heading} id={`${nameId}-heading`}>
        New request
      </h2>
      <p className={styles.hint}>
        Registers a feature in this harness&rsquo;s <code>feature_list.json</code>, with optional
        references to workspace files and an optional agent run.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor={nameId}>
          Name
          <input
            className={styles.input}
            id={nameId}
            name="name"
            value={name}
            onChange={(event) => {
              setNameEdited(true);
              setName(event.target.value);
            }}
            placeholder="harness_verb_write_contract"
            pattern="[A-Za-z0-9_\-]+"
            title="letters, digits, underscore and hyphen only"
            required
            disabled={busy}
          />
        </label>
        <label className={styles.label} htmlFor={titleId}>
          Title <span className={styles.optional}>(optional)</span>
          <input
            className={styles.input}
            id={titleId}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="One line describing the outcome"
            disabled={busy}
          />
        </label>
        <label className={styles.label} htmlFor={acceptanceId}>
          Acceptance <span className={styles.optional}>(one criterion per line)</span>
          <textarea
            className={styles.textarea}
            id={acceptanceId}
            name="acceptance"
            value={acceptance}
            onChange={(event) => setAcceptance(event.target.value)}
            rows={5}
            placeholder={"node dist/x.js does Y and exits 0\nbash tests/run_tests.sh passes"}
            required
            disabled={busy}
          />
        </label>

        <div className={styles.label}>
          <span>References</span>
          <div className={styles.tagPicker}>
            <div className={styles.tagChips}>
              {selectedRefs.length === 0 ? (
                <span className={styles.optional}>no files referenced</span>
              ) : (
                selectedRefs.map((p) => (
                  <span key={p} className={styles.tagChip}>
                    {p}
                    <button
                      type="button"
                      className={styles.tagX}
                      aria-label={`remove ${p}`}
                      onClick={() => removeRef(p)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              type="search"
              className={styles.input}
              aria-label="Search reference files"
              placeholder={tagsOpen ? "filter files..." : "add files..."}
              value={tagQuery}
              onFocus={() => setTagsOpen(true)}
              onChange={(event) => {
                setTagQuery(event.target.value);
                setTagsOpen(true);
              }}
              disabled={busy}
            />
            {tagsOpen && tagFiles.length > 0 ? (
              <ul className={styles.tagList}>
                {filteredTags.slice(0, 200).map((f) => (
                  <li key={f.path}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedRefs.includes(f.path)}
                        onChange={() => toggleRef(f.path)}
                        disabled={busy}
                      />
                      <span className={styles.tagPath}>{f.path}</span>
                      <span className={styles.tagSize}>{f.size} B</span>
                    </label>
                  </li>
                ))}
                {filteredTags.length === 0 ? (
                  <li className={styles.optional}>no files match &ldquo;{tagQuery}&rdquo;</li>
                ) : null}
              </ul>
            ) : null}
            {tagsOpen && tagFiles.length === 0 ? (
              <p className={styles.optional}>no taggable files found in this workspace</p>
            ) : null}
            {tagsOpen ? (
              <button type="button" className={styles.tagDone} onClick={() => setTagsOpen(false)}>
                done ({selectedRefs.length})
              </button>
            ) : null}
          </div>
        </div>

        {runnerEnabled ? (
          <label className={styles.checkboxLabel} htmlFor={`${nameId}-run`}>
            <input
              type="checkbox"
              id={`${nameId}-run`}
              checked={runAgent}
              onChange={(event) => setRunAgent(event.target.checked)}
              disabled={busy}
            />
            Run agent on this feature after registering
          </label>
        ) : (
          <p className={styles.hint}>
            The runner is off (the observer default). Start the observer with{" "}
            <code>TOOLBOX_RUNNER=1</code> to assign this request to an agent from here.
          </p>
        )}

        <div className={styles.actions}>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "registering..." : "Register"}
          </button>
        </div>
      </form>
      {phase === "ok" || phase === "error" ? (
        <p
          className={phase === "ok" ? styles.ok : styles.error}
          role={phase === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
      {runMessage ? (
        <p
          className={runPhase === "error" ? styles.error : styles.ok}
          role={runPhase === "error" ? "alert" : "status"}
        >
          {runMessage}
        </p>
      ) : null}
    </section>
  );
}
