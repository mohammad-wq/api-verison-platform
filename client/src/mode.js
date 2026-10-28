import { tokenStore } from "./api.js";
import { API_BASE } from "./base.js";

// The same UI runs in two places: hosted (accounts and collaborators) and local (the npm
// package: one implicit user, one project). The local server announces itself at /api/local/status.
export const mode = { local: false, projectId: null };

export async function detectMode() {
  if (!API_BASE.endsWith("/api")) return;
  try {
    const response = await fetch(`${API_BASE}/local/status`);
    if (!response.ok) return;
    const { data } = await response.json();
    if (data?.mode !== "local") return;
    mode.local = true;
    mode.projectId = data.projectId;
    tokenStore.set("local-session"); // the local server has no sign-in; this just restores the session on load
  } catch {
    /* not reachable or not local: behave as the hosted app */
  }
}
