export function parseJsonLikeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function extractSubAgentHandle(toolCall: {
  args?: unknown;
  result?: unknown;
}): string | undefined {
  const args = parseJsonLikeValue(toolCall.args);
  const result = parseJsonLikeValue(toolCall.result);

  return (
    (isRecord(result) ? readString(result.handle) : undefined) ??
    (isRecord(args) ? readString(args.handle) : undefined)
  );
}

export function extractSubAgentAlias(toolCall: {
  args?: unknown;
  result?: unknown;
}): string {
  const args = parseJsonLikeValue(toolCall.args);
  const result = parseJsonLikeValue(toolCall.result);

  return (
    (isRecord(args)
      ? (readString(args.alias) ??
        readString(args.agentId) ??
        readString(args.ref))
      : undefined) ??
    (isRecord(result) ? readString(result.alias) : undefined) ??
    "subagent"
  );
}
