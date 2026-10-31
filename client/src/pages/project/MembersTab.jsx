import { useState } from "react";
import { api } from "../../api.js";
import { appPath } from "../../base.js";
import { useAuth } from "../../auth.jsx";
import { useAction, useAsync, usePersistentState } from "../../hooks.js";
import { AccountRoleBadge, Avatar, Badge, ErrorBanner, Notice, RolePill, SkeletonList } from "../../components/ui.jsx";
import { Icon } from "../../components/icons.jsx";
import { normalizeProjectRole, projectRoleLabel } from "../../lib/permissions.js";

const ROLES = [
  { value: "viewer", label: "Viewer — view, compare, and test APIs" },
  { value: "editor", label: "Editor — viewer access, manage versions, edit project settings" },
  { value: "owner", label: "Owner — editor access, manage collaborators and delete project" },
];

function AddCollaborator({ projectId, existingUserIds, onAdded }) {
  const [email, setEmail] = usePersistentState(`members.${projectId}.email`, "");
  const [matches, setMatches] = usePersistentState(`members.${projectId}.matches`, null, { memoryOnly: true });
  const [role, setRole] = usePersistentState(`members.${projectId}.role`, "viewer");
  const selectedRole = normalizeProjectRole(role) ?? "viewer";
  const search = useAction();
  const add = useAction();

  const find = async (event) => {
    event.preventDefault();
    const users = await search.run(() => api.searchUsers(email.trim()));
    if (users) setMatches(users);
  };

  const addUser = async (user) => {
    if (!normalizeProjectRole(selectedRole) || user.status !== "active" || !user.role || existingUserIds.has(user.id)) return;
    const ok = await add.run(async () => {
      await api.addMember(projectId, user.id, selectedRole);
      return true;
    });
    if (ok) {
      setMatches(null);
      setEmail("");
      onAdded();
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Add a collaborator</h3>
          <p className="muted">Only active Admin or Developer accounts can be added. Project access is assigned separately using the project role.</p>
        </div>
      </div>
      <form className="inline-form" onSubmit={find}>
        <label className="grow">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" required />
        </label>
        <label className="role-field">
          Role
          <select value={selectedRole} onChange={(e) => setRole(normalizeProjectRole(e.target.value) ?? "viewer")}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={search.busy}>
          <Icon name="search" /> {search.busy ? "Searching…" : "Search"}
        </button>
      </form>
      <ErrorBanner error={search.error} />
      <ErrorBanner error={add.error} onDismiss={() => add.setError(null)} />

      {matches && matches.length === 0 && <Notice kind="warn">No registered user matches that email.</Notice>}
      {matches?.length > 0 && (
        <ul className="plain-list match-list">
          {matches.map((user) => {
            const already = existingUserIds.has(user.id);
            return (
              <li key={user.id} className="person-row">
                <Avatar name={user.email} size={32} />
                <div className="grow person-main">
                  <span className="truncate person-email">{user.name || user.email}</span>
                  <span className="person-tags">
                    <span className="muted">{user.email}</span>
                    <AccountRoleBadge role={user.role} />
                  </span>
                </div>
                {already ? (
                  <Badge kind="neutral">already a member</Badge>
                ) : (
                  <button className="btn btn-small btn-primary" onClick={() => addUser(user)} disabled={add.busy}>
                    <Icon name="plus" /> Add as {projectRoleLabel(selectedRole)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function MembersTab({ project, can, reloadProject }) {
  const { user } = useAuth();
  const members = useAsync(() => api.getMembers(project.id), [project.id]);
  const change = useAction();

  const refresh = () => {
    members.reload();
    reloadProject();
  };

  const setRole = async (member, role) => {
    if (!can("OWNER") || member.userId === project.ownerId) return;
    const validRole = normalizeProjectRole(role);
    if (!validRole) return;
    const updated = await change.run(() => api.updateMemberRole(project.id, member.userId, validRole));
    if (updated) refresh();
  };

  // Member removal is confirmed with the app's confirm bar, not window.confirm.
  const [confirming, setConfirming] = useState(null);

  const remove = async (member) => {
    const self = member.userId === user.id;
    if ((!can("OWNER") && !self) || member.userId === project.ownerId) return;
    setConfirming(member);
  };

  const removeConfirmed = async () => {
    const member = confirming;
    if (!member) return;
    const self = member.userId === user.id;
    const ok = await change.run(async () => {
      await api.removeMember(project.id, member.userId);
      return true;
    });
    if (ok) {
      setConfirming(null);
      if (self) window.location.assign(appPath("/"));
      else refresh();
    }
  };

  const list = members.data ?? [];

  return (
    <div className="stack">
      {can("OWNER") ? (
        <AddCollaborator projectId={project.id} existingUserIds={new Set(list.map((m) => m.userId))} onAdded={refresh} />
      ) : (
        <Notice kind="info">Collaborator invitations and role changes are restricted to project owners.</Notice>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>People with access</h3>
            <p className="muted">{list.length > 0 ? `${list.length} ${list.length === 1 ? "person" : "people"}` : "Who can open this project"}</p>
          </div>
        </div>
        <ErrorBanner error={change.error} onDismiss={() => change.setError(null)} />
        {confirming && (
          <div className="confirm-bar" role="alertdialog" aria-label={confirming.userId === user.id ? "Confirm leaving the project" : "Confirm collaborator removal"}>
            <Icon name="alert" />
            <span className="grow">
              <strong>{confirming.userId === user.id ? "Leave this project?" : `Remove ${confirming.user.email} from this project?`}</strong> Access is taken away immediately. This cannot be undone.
            </span>
            <button className="btn btn-danger-solid" onClick={removeConfirmed} disabled={change.busy}>
              {change.busy ? "Removing…" : confirming.userId === user.id ? "Yes, leave" : "Yes, remove"}
            </button>
            <button className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        )}
        {members.loading && !members.data && <SkeletonList rows={3} height={52} label="Loading collaborators" />}
        <ErrorBanner error={members.error} />
        <ul className="people-list">
          {list.map((member) => (
            <li key={member.id} className="person-row">
              <Avatar name={member.user.email} size={36} />
              <div className="grow person-main">
                <span className="truncate person-email">{member.user.email}</span>
                <span className="person-tags">
                  {member.userId === user.id && <Badge kind="neutral">you</Badge>}
                  {member.userId === project.ownerId && <Badge kind="ok">project creator</Badge>}
                </span>
              </div>
              {can("OWNER") && member.userId !== project.ownerId ? (
                <select className="role-select" value={normalizeProjectRole(member.role) ?? ""} onChange={(e) => setRole(member, e.target.value)} disabled={change.busy} aria-label={`Project role of ${member.user.email}`}>
                  {!normalizeProjectRole(member.role) && <option value="" disabled>Unknown role</option>}
                  {ROLES.map((role) => <option key={role.value} value={role.value}>{projectRoleLabel(role.value)}</option>)}
                </select>
              ) : (
                <RolePill role={member.userId === project.ownerId ? "owner" : member.role} />
              )}
              {(can("OWNER") || member.userId === user.id) && member.userId !== project.ownerId ? (
                <button className="btn btn-small btn-ghost" onClick={() => remove(member)} disabled={change.busy}>
                  {member.userId === user.id ? "Leave" : "Remove"}
                </button>
              ) : (
                <span className="person-spacer" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
