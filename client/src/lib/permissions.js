export const PROJECT_ROLE_VALUES = Object.freeze(["owner", "editor", "viewer"]);
export const ACCOUNT_ROLE_VALUES = Object.freeze(["admin", "developer"]);
export const ACCOUNT_STATUS_VALUES = Object.freeze(["active", "inactive", "suspended"]);

const PROJECT_ROLE_RANK = Object.freeze({ viewer: 1, editor: 2, owner: 3 });
const PROJECT_ROLE_LABELS = Object.freeze({ owner: "Owner", editor: "Editor", viewer: "Viewer" });
const ACCOUNT_ROLE_LABELS = Object.freeze({ admin: "Admin", developer: "Developer" });

export function normalizeProjectRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return PROJECT_ROLE_VALUES.includes(normalized) ? normalized : null;
}

export function normalizeAccountRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return ACCOUNT_ROLE_VALUES.includes(normalized) ? normalized : null;
}

export function normalizeAccountStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return ACCOUNT_STATUS_VALUES.includes(normalized) ? normalized : null;
}

export function projectRoleLabel(role) {
  const normalized = normalizeProjectRole(role);
  return normalized ? PROJECT_ROLE_LABELS[normalized] : "Unknown project role";
}

export function accountRoleLabel(role) {
  const normalized = normalizeAccountRole(role);
  return normalized ? ACCOUNT_ROLE_LABELS[normalized] : "Unknown account role";
}

export function projectRoleForUser(project, user) {
  if (!project || !user || user.id == null) return null;
  if (project.ownerId != null && Number(project.ownerId) === Number(user.id)) return "owner";
  const membership = Array.isArray(project.members)
    ? project.members.find((member) => {
        const memberUserId = member?.userId ?? member?.user?.id;
        return memberUserId != null && Number(memberUserId) === Number(user.id);
      })
    : null;
  return normalizeProjectRole(membership?.role);
}

export function canProjectRole(role, requiredRole) {
  const normalizedRole = normalizeProjectRole(role);
  const normalizedRequired = normalizeProjectRole(requiredRole);
  if (!normalizedRole || !normalizedRequired) return false;
  return PROJECT_ROLE_RANK[normalizedRole] >= PROJECT_ROLE_RANK[normalizedRequired];
}
