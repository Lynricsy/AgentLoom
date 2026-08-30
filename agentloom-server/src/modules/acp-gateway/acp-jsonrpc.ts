export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<TResult = unknown> =
  JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse;

export class AcpJsonRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    value === null || typeof value === 'string' || typeof value === 'number'
  );
}

export function parseJsonRpcRequest(raw: string): JsonRpcRequest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AcpJsonRpcError(-32700, 'Parse error');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AcpJsonRpcError(-32600, 'Invalid Request');
  }

  const request = parsed as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
  };

  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    throw new AcpJsonRpcError(-32600, 'Invalid Request');
  }

  if (Object.hasOwn(request, 'id') && !isJsonRpcId(request.id)) {
    throw new AcpJsonRpcError(-32600, 'Invalid Request');
  }

  return parsed as JsonRpcRequest;
}

export function buildJsonRpcSuccess<TResult>(
  id: JsonRpcId,
  result: TResult,
): JsonRpcSuccessResponse<TResult> {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function buildJsonRpcRequest<TParams>(
  id: JsonRpcId,
  method: string,
  params?: TParams,
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };
}

export function buildJsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

export function buildJsonRpcNotification<TParams>(
  method: string,
  params?: TParams,
): JsonRpcNotification<TParams> {
  return {
    jsonrpc: '2.0',
    method,
    ...(params === undefined ? {} : { params }),
  };
}
