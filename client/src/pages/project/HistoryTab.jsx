import { useMemo, useState } from "react";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { useAction, useAsync } from "../../hooks.js";
import { Avatar, EmptyState, ErrorBanner, MethodBadge, SkeletonList, StatusBadge, formatDate, timeAgo } from "../../components/ui.jsx";
import { Icon } from "../../components/icons.jsx";

const STATUS_FILTERS = [
  ["", "All statuses"],
  ["2", "2xx success"],
  ["3", "3xx redirect"],
  ["4", "4xx client error"],
  ["5", "5xx server error"],
  ["none", "No response"],
];
const PAGE = 25;

function ProjectHistory({ project }) {
  const { user: me } = useAuth();
  const [fromTime, setFromTime] = useState(""); // datetime-local values, interpreted in the browser's time zone
  const [toTime, setToTime] = useState("");
  const history = useAsync(
    () =>
      api.getRequestHistory(project.id, 100),
    [project.id],
  );
  const [userId, setUserId] = useState("");
  const [text, setText] = useState("");
  const [method, setMethod] = useState("");
  const [statusClass, setStatusClass] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const { busy, error, setError, run } = useAction();

  const all = history.data ?? [];
  const mine = all.filter((entry) => entry.userId === me.id).length;
  const users = useMemo(() => [...new Map(all.filter((e) => e.user).map((e) => [e.user.id, e.user.email])).entries()], [all]);
  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return all.filter((entry) => {
      if (userId && String(entry.userId) !== userId) return false;
      if (method && entry.method !== method) return false;
      if (statusClass === "none" ? entry.status != null : statusClass && String(entry.status ?? "")[0] !== statusClass) return false;
      if (fromTime && Date.parse(entry.createdAt) < new Date(fromTime).getTime()) return false;
      if (toTime && Date.parse(entry.createdAt) > new Date(toTime).getTime()) return false;
      return !needle || entry.url.toLowerCase().includes(needle);
    });
  }, [all, text, method, statusClass, userId, fromTime, toTime]);
  const filtering = Boolean(text.trim() || method || statusClass || userId || fromTime || toTime);

  const clear = async () => {
    if (!window.confirm(`Delete your ${mine} saved request${mine === 1 ? "" : "s"} for "${project.name}"? Other members' requests are not affected. This cannot be undone.`)) return;
    const done = await run(async () => {
      await api.clearRequestHistory(project.id);
      return true;
    });
    if (done) {
      setVisible(PAGE);
      history.reload();
    }
  };

  const resetFilters = () => {
    setUserId("");
    setFromTime("");
    setToTime("");
    setText("");
    setMethod("");
    setStatusClass("");
  };

  return (
    <div className="card history-card">
      <div className="card-head">
        <div>
          <h3>Requests</h3>
          <p className="muted">
            {all.length > 0 ? (filtering ? `${filtered.length} of ${all.length} requests` : `${all.length} request${all.length === 1 ? "" : "s"}, newest first`) : "Sent from the Test APIs tab"}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn btn-small" onClick={clear} disabled={busy || mine === 0} title="Deletes only your own saved requests">
            <Icon name="trash" /> {busy ? "Clearing…" : "Clear my history"}
          </button>
        </div>
      </div>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {(all.length > 0 || fromTime || toTime) && (
        <div className="filter-bar">
          <div className="search-box grow">
            <Icon name="search" />
            <input type="search" placeholder="Filter by URL…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Filter by URL" />
          </div>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="User">
            <option value="">All users</option>
            {users.map(([id, email]) => (
              <option key={id} value={id}>
                {email}
                {id === me.id ? " (you)" : ""}
              </option>
            ))}
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
            <option value="">All methods</option>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select value={statusClass} onChange={(e) => setStatusClass(e.target.value)} aria-label="Status">
            {STATUS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="inline-label">
            From <input type="datetime-local" value={fromTime} max={toTime || undefined} onChange={(e) => setFromTime(e.target.value)} />
          </label>
          <label className="inline-label">
            To <input type="datetime-local" value={toTime} min={fromTime || undefined} onChange={(e) => setToTime(e.target.value)} />
          </label>
          {filtering && (
            <button className="btn btn-ghost btn-small" onClick={resetFilters}>
              <Icon name="close" /> Reset
            </button>
          )}
        </div>
      )}
      {history.loading && !history.data && <SkeletonList rows={4} height={44} label="Loading history" />}
      <ErrorBanner error={history.error} />
      {history.data && all.length === 0 && (
        <EmptyState title="No requests yet" icon="clock">
          Requests you send from the Test APIs tab will be listed here.
        </EmptyState>
      )}
      {all.length > 0 && filtered.length === 0 && (
        <EmptyState title="No requests match" icon="search">
          Try loosening the filters.
        </EmptyState>
      )}
      {filtered.length > 0 && (
        <div className="table-scroll">
          <table className="table table-sticky">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Time</th>
                <th>User</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visible).map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <MethodBadge method={entry.method} />
                  </td>
                  <td className="break mono-cell">{entry.url.replace(/^https?:\/\/[^/]+/, "")}</td>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="muted nowrap">{entry.durationMs != null ? `${entry.durationMs} ms` : ""}</td>
                  <td>
                    <span className="user-cell">
                      <Avatar name={entry.user?.email} size={20} />
                      <span className="truncate">{entry.user?.email}</span>
                    </span>
                  </td>
                  <td className="muted nowrap" title={formatDate(entry.createdAt)}>
                    {timeAgo(entry.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > visible && (
        <button className="btn btn-small show-more" onClick={() => setVisible((v) => v + PAGE)}>
          Show more ({filtered.length - visible} older)
        </button>
      )}
    </div>
  );
}

export default function HistoryTab({ project }) {
  return <ProjectHistory project={project} />;
}
