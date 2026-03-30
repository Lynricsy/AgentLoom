import type { AgentHttpToolBinding } from '../agent-definition/agent-runtime-config.interface';

type HttpToolRequestBinding = Pick<AgentHttpToolBinding, 'url' | 'method'> & {
  timeout?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractStringHeaders(input: unknown): Record<string, string> {
  const headers = asRecord(input);
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

async function parseHttpResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  return await response.text();
}

export async function executeHttpToolRequest(
  binding: HttpToolRequestBinding,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const method = binding.method ?? 'GET';
  const url = new URL(binding.url);
  const query = asRecord(input.query);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
    }
  }

  const headers = extractStringHeaders(input.headers);
  let body: BodyInit | undefined;
  if (method !== 'GET' && 'body' in input) {
    const rawBody = input.body;
    if (typeof rawBody === 'string') {
      body = rawBody;
    } else if (rawBody !== undefined) {
      headers['content-type'] ??= 'application/json';
      body = JSON.stringify(rawBody);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    ...(binding.timeout !== undefined
      ? { signal: AbortSignal.timeout(binding.timeout * 1000) }
      : {}),
    ...(body === undefined ? {} : { body }),
  });

  const responseBody = await parseHttpResponseBody(response);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  };
}
