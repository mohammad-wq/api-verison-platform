import { useEffect, useMemo } from "react";
import { discardDraft, useSessionState } from "../hooks.js";
import { detectAuthConfig, resolveAuthConfig, tokenStatus } from "./auth-config.js";
import { useProjectEnvironments } from "./project-environments.js";

/**
 * Everything the tester needs for the active environment: its base URL, the login settings
 * (detected from the spec unless the user overrode them) and the API token for this browser session.
 */
export function useTestSession(project, spec, endpoints, saveEnvironments) {
  const environmentState = useProjectEnvironments(project, spec?.servers, saveEnvironments);
  const { active, activeServer } = environmentState;

  const detected = useMemo(() => detectAuthConfig(spec ?? {}, endpoints ?? [], activeServer), [spec, endpoints, activeServer]);
  const auth = useMemo(() => resolveAuthConfig(detected, project.authOverrides), [detected, project.authOverrides]);

  const [apiToken, setApiToken] = useSessionState(`project.${project.id}.token.${active?.id ?? "default"}`, null);

  // Tokens used to be kept in localStorage; they now live only for the browser session.
  useEffect(() => discardDraft(`project.${project.id}.apiToken`), [project.id]);

  const runtimeProject = useMemo(
    () => ({
      ...environmentState.runtimeProject,
      authRequired: auth.authRequired,
      loginMethod: auth.loginMethod,
      loginPath: auth.loginPath,
      tokenPath: auth.tokenPath,
      expiresPath: auth.expiresPath,
      headerName: auth.headerName,
      headerFormat: auth.headerFormat,
    }),
    [environmentState.runtimeProject, auth],
  );

  return {
    ...environmentState,
    runtimeProject,
    detected,
    auth,
    apiToken,
    setApiToken,
    tokenState: tokenStatus(apiToken),
  };
}
