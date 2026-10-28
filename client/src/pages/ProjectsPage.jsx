import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { discardDraft, useAction, useAsync, usePersistentState } from "../hooks.js";
import { Avatar, EmptyState, ErrorBanner, Skeleton, formatDate, timeAgo } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

function ProjectSkeletons() {
  return (
    <div className="grid" role="status" aria-label="Loading projects">
      {[0, 1, 2].map((i) => (
        <div className="card project-card" key={i}>
          <div className="row">
            <Skeleton w={44} h={44} r={12} />
            <div className="grow stack" style={{ gap: 8 }}>
              <Skeleton w="60%" h={14} />
              <Skeleton w="40%" h={10} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <Skeleton w={72} h={24} r={999} />
            <Skeleton w={72} h={24} r={999} />
            <Skeleton w={72} h={24} r={999} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useAsync(() => api.getProjects(), []);
  const [name, setName] = usePersistentState("projects.newName", "");
  // The form is open when there is an unsent draft, so a reload does not lose the context.
  const [creating, setCreating] = useState(() => name.trim().length > 0);
  const [query, setQuery] = useState("");
  const nameInput = useRef(null);
  const { busy, error, setError, run } = useAction();

  const create = async (event) => {
    event.preventDefault();
    const project = await run(() => api.createProject(name.trim()));
    if (project) {
      discardDraft("projects.newName");
      navigate(`/projects/${project.id}`);
    }
  };

  const openForm = () => {
    setCreating(true);
    setTimeout(() => nameInput.current?.focus(), 0);
  };

  const list = projects.data ?? [];
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((p) => `${p.name} ${p.owner?.email ?? ""}`.toLowerCase().includes(needle)) : list;
  }, [list, query]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="sub">Each project holds one API, its versions and collaborators.</p>
        </div>
        <button className="btn btn-primary" onClick={openForm} aria-expanded={creating}>
          <Icon name="plus" /> New project
        </button>
      </div>

      {creating && (
        <form className="card create-card" onSubmit={create}>
          <label className="grow">
            Project name
            <input ref={nameInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Payments API" required maxLength={191} autoFocus />
          </label>
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create project"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCreating(false);
                setName("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {list.length > 0 && (
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" />
            <input type="search" placeholder="Search projects or owners…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
          </div>
          <span className="muted toolbar-count">
            {shown.length === list.length ? `${list.length} project${list.length === 1 ? "" : "s"}` : `${shown.length} of ${list.length}`}
          </span>
        </div>
      )}

      {projects.loading && !projects.data && <ProjectSkeletons />}
      <ErrorBanner error={projects.error} />
      {projects.data?.length === 0 && !creating && (
        <EmptyState
          title="No projects yet"
          icon="folder"
          action={
            <button className="btn btn-primary" onClick={openForm}>
              <Icon name="plus" /> Create your first project
            </button>
          }
        >
          Create a project, then add an OpenAPI JSON specification to get versioning, diffs and a live tester.
        </EmptyState>
      )}
      {list.length > 0 && shown.length === 0 && (
        <EmptyState title="No matching projects" icon="search">
          Nothing matches “{query}”.
        </EmptyState>
      )}

      <div className="grid">
        {shown.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`} className="card card-link project-card">
            <div className="project-card-head">
              <Avatar name={project.name} size={44} square />
              <div className="grow">
                <h3>{project.name}</h3>
                <div className="meta">
                  <Icon name="user" /> <span className="truncate">{project.owner?.email}</span>
                </div>
              </div>
              <Icon name="chevron" className="card-arrow" />
            </div>
            <div className="chip-row">
              <span className="stat-chip" title="Versions">
                <Icon name="layers" /> <strong>{project._count.versions}</strong> versions
              </span>
              {project._count.members != null && <span className="stat-chip" title="Members">
                <Icon name="users" /> <strong>{project._count.members}</strong>
              </span>}
            </div>
            <small className="muted card-foot" title={formatDate(project.createdAt)}>
              Created {timeAgo(project.createdAt)}
            </small>
          </Link>
        ))}
      </div>
    </>
  );
}
