import { api } from "../api.js";
import { discardDraft, useAction, usePersistentState } from "../hooks.js";
import { DEFAULT_HEADER_FORMAT, DEFAULT_HEADER_NAME } from "../lib/auth-config.js";
import { ErrorBanner } from "./ui.jsx";

const METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];

/** Project name and description (saved on the server; editors only). */
export function ProjectDetailsForm({ project, canEdit, onSaved, onCancel }) {
  const draftKey = `project.${project.id}.details`;
  const [form, setForm] = usePersistentState(draftKey, () => ({ name: project.name, description: project.description ?? "" }));
  const save = useAction();
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    const updated = await save.run(() => api.updateProject(project.id, { name: form.name.trim(), description: form.description.trim() }));
    if (updated) {
      discardDraft(draftKey);
      onSaved();
    }
  };

  return (
    <form className="api-auth-settings stack" onSubmit={submit}>
      {!canEdit && <p className="muted">Only project editors can change these details.</p>}
      <div className="form-row">
        <label>
          Project name
          <input value={form.name} onChange={set("name")} required maxLength={191} disabled={!canEdit} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={set("description")} rows={3} maxLength={5000} disabled={!canEdit} placeholder="What this API does and who uses it" />
        </label>
      </div>
      <ErrorBanner error={save.error} onDismiss={() => save.setError(null)} />
      {canEdit && (
        <div className="form-actions">
          <button className="btn btn-primary btn-small" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save details"}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                discardDraft(draftKey);
                onCancel();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * Login settings for the API under test. By default they come from the README; "Custom" overrides them.
 * Saved in this browser only, so every project member can adjust them for their own testing.
 */
export default function ApiAuthSettings({ project, detected, onSaved }) {
  const draftKey = `project.${project.id}.auth-settings`;
  const overrides = project.authOverrides;
  const [form, setForm] = usePersistentState(draftKey, () => ({
    authSource: overrides ? "custom" : "readme",
    authRequired: overrides?.authRequired ?? detected.authRequired,
    loginMethod: overrides?.loginMethod ?? detected.loginMethod ?? "POST",
    loginPath: overrides?.loginPath ?? "",
    tokenPath: overrides?.tokenPath ?? "",
    headerName: overrides?.headerName ?? "",
    headerFormat: overrides?.headerFormat ?? "",
  }));
  const set = (key) => (event) =>
    setForm({ ...form, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
  const custom = form.authSource === "custom";

  const submit = (event) => {
    event.preventDefault();
    api.saveAuthSettings(project.id, form);
    discardDraft(draftKey);
    onSaved();
  };

  return (
    <form className="api-auth-settings stack" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Where login settings come from">
        {[
          ["readme", "Use README settings"],
          ["custom", "Custom"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            role="radio"
            aria-checked={form.authSource === id}
            className={form.authSource === id ? "active" : ""}
            onClick={() => setForm({ ...form, authSource: id })}
          >
            {label}
          </button>
        ))}
      </div>
      {custom ? (
        <>
          <label className="check">
            <input type="checkbox" checked={form.authRequired} onChange={set("authRequired")} />
            This API requires a login token
          </label>
          {form.authRequired && (
            <>
              <div className="form-row">
                <label>
                  Login method
                  <select value={form.loginMethod} onChange={set("loginMethod")}>
                    {METHODS.map((method) => <option key={method}>{method}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label-line">
                    Login path <small className="muted">relative to the base URL, or a full URL</small>
                  </span>
                  <input value={form.loginPath} onChange={set("loginPath")} placeholder={detected.loginPath || "/auth/login"} spellCheck={false} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Token path in the response
                  <input value={form.tokenPath} onChange={set("tokenPath")} placeholder={detected.tokenPath || "data.token"} spellCheck={false} />
                </label>
                <label>
                  Header name
                  <input
                    value={form.headerName}
                    onChange={set("headerName")}
                    placeholder={detected.headerName || DEFAULT_HEADER_NAME}
                    pattern="[A-Za-z0-9-]+"
                    title="Letters, digits and hyphens only, e.g. Authorization"
                  />
                </label>
                <label>
                  <span className="label-line">
                    Header format <small className="muted">{"{token}"} is replaced by the token</small>
                  </span>
                  <input value={form.headerFormat} onChange={set("headerFormat")} placeholder={detected.headerFormat || DEFAULT_HEADER_FORMAT} spellCheck={false} />
                </label>
              </div>
              <p className="muted auth-settings-hint">Empty fields use the value detected from the README.</p>
            </>
          )}
        </>
      ) : (
        <p className="muted auth-settings-hint">
          {detected.source === "readme"
            ? "Login settings are read from the latest README version and update automatically with it."
            : "The README does not document a public login endpoint. Choose Custom to set one."}
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn-primary btn-small">Save login settings</button>
      </div>
    </form>
  );
}
