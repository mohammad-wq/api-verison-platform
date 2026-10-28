import { useMemo } from "react";
import { api } from "../api.js";

function platformClient(project, apiToken) {
  const expired = Boolean(apiToken?.expiresAt && Date.parse(apiToken.expiresAt) <= Date.now());
  const token = expired ? null : apiToken?.token;
  return {
    getEndpoints: () => api.getTestableEndpoints(project.id),
    login: (body) => api.loginProject(project, body),
    execute: (payload) => api.executeRequest(project, payload, token),
    executeMultipart: (form) => api.executeMultipartRequest(project, form, token),
  };
}

export function useTesterClient(project, apiToken) {
  return useMemo(() => platformClient(project, apiToken), [project, apiToken]);
}
