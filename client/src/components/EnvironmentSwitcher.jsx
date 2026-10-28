import { Icon } from "./icons.jsx";
import { usePopover } from "./ui.jsx";
import { baseUrlError, environmentLabel, hostOf } from "../lib/project-environments.js";

const STATUS = {
  public: { kind: "neutral", label: "Public API" },
  active: { kind: "ok", label: "Signed in" },
  expired: { kind: "warn", label: "Session expired" },
  none: { kind: "warn", label: "Sign-in required" },
  invalid: { kind: "danger", label: "Base URL needed" },
};

/** Status of the active environment, shared by the switcher pill and the sign-in button. */
export function environmentStatus(session) {
  if (baseUrlError(session.active?.baseUrl ?? "")) return "invalid";
  if (!session.auth.authRequired) return "public";
  return session.tokenState;
}

/** Toolbar pill showing the active environment; its menu switches environments and opens the manager. */
export default function EnvironmentSwitcher({ session, onManage }) {
  const [open, setOpen, ref] = usePopover();
  const { environments, active } = session;
  const status = STATUS[environmentStatus(session)];
  const host = hostOf(active?.baseUrl);

  return (
    <div className="menu-wrap env-switcher" ref={ref}>
      <button
        type="button"
        className={`env-pill env-${status.kind}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${active?.baseUrl || "No base URL"} · ${status.label}`}
      >
        <span className="env-dot" aria-hidden="true" />
        <span className="env-pill-text">
          <span className="env-pill-label">Environment</span>
          <span className="env-pill-name">
            {environmentLabel(active)}
            {host && host !== environmentLabel(active) && <span className="env-pill-host"> · {host}</span>}
          </span>
        </span>
        {/* "Sign-in required" is already said by the Sign in button next to this pill. */}
        {environmentStatus(session) !== "none" && <span className={`env-status env-status-${status.kind}`}>{status.label}</span>}
        <Icon name="down" className="chip-caret" />
      </button>
      {open && (
        <div className="popover env-menu" role="listbox" aria-label="Environments">
          <div className="env-menu-head">
            <span>Environments</span>
            <span className="count-pill">{environments.length}</span>
          </div>
          <div className="env-menu-list">
            {environments.map((environment) => {
              const selected = environment.id === active?.id;
              const invalid = Boolean(baseUrlError(environment.baseUrl));
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  key={environment.id}
                  className={`env-option${selected ? " selected" : ""}`}
                  onClick={() => {
                    session.selectEnvironment(environment.id);
                    setOpen(false);
                  }}
                >
                  <Icon name="globe" className="env-option-icon" />
                  <span className="env-option-text">
                    <span className="env-option-name">
                      {environmentLabel(environment)}
                      {environment.source === "readme" && <span className="env-tag">README</span>}
                    </span>
                    <span className={`env-option-url${invalid ? " invalid" : ""}`}>{environment.baseUrl || "No base URL set"}</span>
                  </span>
                  {selected && <Icon name="check" className="env-option-check" />}
                </button>
              );
            })}
          </div>
          <div className="env-menu-foot">
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                setOpen(false);
                onManage(active?.id);
              }}
            >
              <Icon name="edit" /> Manage environments…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
