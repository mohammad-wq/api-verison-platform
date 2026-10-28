import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAction } from "../hooks.js";
import { Icon } from "./icons.jsx";

const POLL_MS = 10000;

/**
 * Local mode only: the tracked README is not watched by the server, so this checks it (every few seconds and
 * when the tab regains focus) and offers to save the edited file as the next version. Hidden when nothing changed.
 */
export default function ReadmeSyncBanner({ onSaved }) {
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState(null); // the "changed since" version the user dismissed
  const { busy, error, run } = useAction();

  const check = useCallback(() => api.readmeStatus().then(setStatus).catch(() => {}), []);
  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  if (!status?.exists || !status.hasChanges || dismissed === status.latestVersionNumber) return null;
  const { summary } = status;
  const parts = summary
    ? [
        summary.endpointsAdded && `${summary.endpointsAdded} added`,
        summary.endpointsRemoved && `${summary.endpointsRemoved} removed`,
        summary.endpointsChanged && `${summary.endpointsChanged} changed`,
      ].filter(Boolean)
    : [];

  const save = async () => {
    const saved = await run(() => api.saveReadme(note));
    if (saved) {
      setNote("");
      await check();
      onSaved?.(saved);
    }
  };

  return (
    <div className="readme-sync" role="status">
      <Icon name="swap" />
      <span className="readme-sync-text">
        <strong>{status.path}</strong> changed
        {status.latestVersionNumber ? ` since ${status.latestVersionNumber}` : ""}
        {parts.length > 0 && <span className="muted"> · {parts.join(", ")}</span>}
        {error && <span className="readme-sync-error"> · {error.message}</span>}
      </span>
      <input
        className="readme-sync-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        aria-label="Version note"
        maxLength={190}
        onKeyDown={(event) => event.key === "Enter" && !busy && save()}
      />
      <button className="btn btn-small btn-primary" onClick={save} disabled={busy}>
        {busy ? "Saving…" : `Save as ${status.nextVersionNumber}`}
      </button>
      <button className="btn btn-small btn-ghost" onClick={() => setDismissed(status.latestVersionNumber)} aria-label="Dismiss until the next version">
        <Icon name="close" />
      </button>
    </div>
  );
}
