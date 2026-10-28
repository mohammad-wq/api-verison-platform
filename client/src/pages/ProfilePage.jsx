import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useAction } from "../hooks.js";
import { AccountRoleBadge, Avatar, ErrorBanner, Notice, useCrumb } from "../components/ui.jsx";

const MIN_PASSWORD = 6;

/** The signed-in user's own account: display name and password. */
export default function ProfilePage() {
  const { user } = useAuth();
  useCrumb("Profile");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p className="sub">Your account details and password.</p>
        </div>
      </div>
      <div className="stack profile-page">
        <section className="card">
          <div className="row profile-identity">
            <Avatar name={user.name || user.email} size={48} />
            <div className="grow">
              <strong>{user.name || user.email}</strong>
              <div className="muted break">{user.email}</div>
            </div>
            <AccountRoleBadge role={user.role} />
          </div>
        </section>
        <DetailsForm />
        <PasswordForm />
      </div>
    </>
  );
}

function DetailsForm() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name ?? "");
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();
  const unchanged = name.trim() === (user.name ?? "");

  const submit = async (event) => {
    event.preventDefault();
    setSaved(false);
    const updated = await run(() => api.updateProfile(name.trim()));
    if (updated) {
      updateUser(updated);
      setName(updated.name ?? name.trim());
      setSaved(true);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <div>
          <h3>Account details</h3>
          <p className="muted">Your name is shown to collaborators on shared projects.</p>
        </div>
      </div>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          required
          maxLength={191}
          autoComplete="name"
        />
      </label>
      <label>
        Email
        <input value={user.email ?? ""} readOnly disabled />
      </label>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {saved && <Notice kind="ok" onDismiss={() => setSaved(false)}>Profile updated.</Notice>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || !name.trim() || unchanged}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const empty = { current: "", next: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();
  const set = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value });
    setSaved(false);
  };

  const mismatch = form.confirm !== "" && form.next !== form.confirm;
  const tooShort = form.next !== "" && form.next.length < MIN_PASSWORD;
  const sameAsCurrent = form.next !== "" && form.next === form.current;
  const invalid = !form.current || !form.next || mismatch || tooShort || sameAsCurrent;

  const submit = async (event) => {
    event.preventDefault();
    if (invalid) return;
    setSaved(false);
    const done = await run(async () => {
      await api.updatePassword(form.current, form.next);
      return true;
    });
    if (done) {
      setForm(empty);
      setSaved(true);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <div>
          <h3>Change password</h3>
          <p className="muted">Use at least {MIN_PASSWORD} characters.</p>
        </div>
      </div>
      <label>
        Current password
        <input type="password" value={form.current} onChange={set("current")} required autoComplete="current-password" />
      </label>
      <div className="form-row">
        <label>
          New password
          <input type="password" value={form.next} onChange={set("next")} required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </label>
        <label>
          Confirm new password
          <input type="password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
        </label>
      </div>
      {tooShort && <p className="field-hint">The new password must be at least {MIN_PASSWORD} characters.</p>}
      {sameAsCurrent && <p className="field-hint">The new password must differ from the current one.</p>}
      {mismatch && <p className="field-hint">The new passwords do not match.</p>}
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {saved && <Notice kind="ok" onDismiss={() => setSaved(false)}>Password changed.</Notice>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || invalid}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
