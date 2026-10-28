import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useAction } from "../hooks.js";
import { ErrorBanner } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

export default function LoginPage() {
  const { user, authenticate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { busy, error, setError, run } = useAction();

  if (user) return <Navigate to={location.state?.from || "/"} replace />;

  const submit = async (event) => {
    event.preventDefault();
    const ok = await run(async () => {
      await authenticate(mode, email, password, name);
      return true;
    });
    if (ok) navigate(location.state?.from || "/", { replace: true });
  };

  const isRegister = mode === "register";

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="layers" size="17px" />
          </span>
          API Version Platform
        </div>
        <h2>Keep every version of your API documented, compared and tested.</h2>
        <ul className="feature-list">
          <li>
            <Icon name="file" />
            <span>Upload an OpenAPI specification, then inspect and edit its saved versions.</span>
          </li>
          <li>
            <Icon name="columns" />
            <span>See exactly what changed between versions, endpoint by endpoint, side by side.</span>
          </li>
          <li>
            <Icon name="play" />
            <span>Call your real API from the browser with auto-filled parameters, bodies and file uploads.</span>
          </li>
        </ul>
        <div className="hero-preview" aria-hidden="true">
          <div className="hero-preview-head">
            <span />
            <span />
            <span />
            <em>v1.1.0 · 3 changes</em>
          </div>
          <div className="hero-row">
            <span className="method method-post">POST</span>
            <code>/auth/login</code>
            <b className="hero-tag hero-tag-warn">changed</b>
          </div>
          <div className="hero-row">
            <span className="method method-get">GET</span>
            <code>/reports/export</code>
            <b className="hero-tag hero-tag-ok">added</b>
          </div>
          <div className="hero-row">
            <span className="method method-delete">DELETE</span>
            <code>{"/attachments/{id}"}</code>
            <b className="hero-tag hero-tag-bad">removed</b>
          </div>
        </div>
      </section>
      <div className="auth-panel">
        <form className="card auth-card" onSubmit={submit}>
          <div>
            <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
            <p className="muted">{isRegister ? "Start documenting and testing your APIs." : "Log in to continue to your projects."}</p>
          </div>

          <div className="segmented segmented-full" role="group" aria-label="Log in or create an account">
            <button type="button" className={!isRegister ? "active" : ""} onClick={() => setMode("login")}>
              Log in
            </button>
            <button type="button" className={isRegister ? "active" : ""} onClick={() => setMode("register")}>
              Create account
            </button>
          </div>
  
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
  
          {isRegister && (
            <label>
              Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus={!isRegister} />
          </label>
          <label>
            Password
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 6 : undefined}
                required
              />
              <button
                type="button"
                className="icon-btn password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} />
              </button>
            </div>
            {isRegister && <small className="muted">At least 6 characters.</small>}
          </label>
  
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
