const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);

export function resolveConversationSocketUrl(): string {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;

  const resolvedUrl = new URL(API_BASE_URL || "/api/v1", origin);
  const pathname = resolvedUrl.pathname.replace(/\/$/, "");

  let basePath = pathname;
  if (basePath.endsWith("/api/v1")) {
    basePath = basePath.slice(0, -"/api/v1".length);
  } else if (basePath.endsWith("/api")) {
    basePath = basePath.slice(0, -"/api".length);
  }

  const namespacePath = `${basePath}/agent-conversation`.replace(/\/+/g, "/");
  return new URL(namespacePath, resolvedUrl.origin).toString();
}
