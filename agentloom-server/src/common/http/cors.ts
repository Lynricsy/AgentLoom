type CorsDecisionCallback = (error: Error | null, allow: boolean) => void;

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function collectAllowedCorsOrigins(
  frontendUrl?: string,
): ReadonlySet<string> {
  const allowedOrigins = new Set<string>();
  const normalizedFrontendOrigin =
    typeof frontendUrl === 'string' && frontendUrl.trim().length > 0
      ? normalizeOrigin(frontendUrl.trim())
      : null;

  if (normalizedFrontendOrigin) {
    allowedOrigins.add(normalizedFrontendOrigin);
  }

  return allowedOrigins;
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  const parsedOrigin = new URL(normalizedOrigin);
  return LOOPBACK_HOSTS.has(parsedOrigin.hostname);
}

export function createCorsOriginDelegate(allowedOrigins: ReadonlySet<string>) {
  return (origin: string | undefined, callback: CorsDecisionCallback): void => {
    callback(null, isAllowedCorsOrigin(origin, allowedOrigins));
  };
}
