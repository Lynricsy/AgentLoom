import {
  isRecord,
  keyValuePairsToRecord,
  parseJsonLikeValue,
  readFirstDefined,
  readFirstString,
  stripExecOnlyInputs,
} from './node-value.util';

export function buildHttpToolRequestInput(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const dynamicRequest = extractHttpToolDynamicRequest(input);
  const staticQueryParams = readFirstDefined(
    nodeData.queryParams,
    nodeData.query_params,
  );
  const headers = {
    ...keyValuePairsToRecord(nodeData.headers),
    ...buildHttpToolAuthHeaders(nodeData),
    ...extractHttpToolHeaders(dynamicRequest.headers),
  };
  const query = {
    ...keyValuePairsToRecord(staticQueryParams, true),
    ...buildHttpToolAuthQuery(nodeData),
    ...extractHttpToolQuery(dynamicRequest.query),
  };
  const request: Record<string, unknown> = {};

  if (Object.keys(headers).length > 0) {
    request.headers = headers;
  }

  if (Object.keys(query).length > 0) {
    request.query = query;
  }

  const requestBody = resolveHttpToolRequestBody(nodeData, dynamicRequest);
  if (requestBody !== undefined) {
    request.body = requestBody;
  }

  return request;
}

export function resolveHttpToolRequestBody(
  nodeData: Record<string, unknown>,
  dynamicRequest: Record<string, unknown>,
): unknown {
  if (Object.prototype.hasOwnProperty.call(dynamicRequest, 'body')) {
    return dynamicRequest.body;
  }

  if (
    Object.keys(dynamicRequest).length > 0 &&
    !Object.prototype.hasOwnProperty.call(dynamicRequest, 'query') &&
    !Object.prototype.hasOwnProperty.call(dynamicRequest, 'headers')
  ) {
    return dynamicRequest;
  }

  if (typeof nodeData.body !== 'string' || nodeData.body.trim().length === 0) {
    return undefined;
  }

  return parseJsonLikeValue(nodeData.body);
}

export function extractHttpToolDynamicRequest(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const requestValue =
    Object.prototype.hasOwnProperty.call(input, 'request-in') &&
    input['request-in'] !== undefined
      ? input['request-in']
      : Object.prototype.hasOwnProperty.call(input, 'request') &&
          input.request !== undefined
        ? input.request
        : stripExecOnlyInputs(input);

  if (requestValue === undefined) {
    return {};
  }

  if (isRecord(requestValue)) {
    return requestValue;
  }

  return { body: requestValue };
}

export function extractHttpToolHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function extractHttpToolQuery(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function buildHttpToolAuthHeaders(
  nodeData: Record<string, unknown>,
): Record<string, string> {
  const authType = readFirstString(nodeData.authType, nodeData.auth_type);
  const authConfig = isRecord(nodeData.authConfig)
    ? nodeData.authConfig
    : isRecord(nodeData.auth_config)
      ? nodeData.auth_config
      : undefined;
  if (!authType || !authConfig) {
    return {};
  }

  if (authType === 'bearer') {
    const token = readFirstString(authConfig.token);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  if (authType === 'basic') {
    const username = readFirstString(authConfig.username);
    const password = readFirstString(authConfig.password);
    return username !== undefined && password !== undefined
      ? {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        }
      : {};
  }

  if (
    authType === 'api-key' &&
    readFirstString(authConfig.location) !== 'query'
  ) {
    const keyName = readFirstString(authConfig.keyName, authConfig.key_name);
    const keyValue = readFirstString(authConfig.keyValue, authConfig.key_value);
    return keyName && keyValue ? { [keyName]: keyValue } : {};
  }

  return {};
}

export function buildHttpToolAuthQuery(
  nodeData: Record<string, unknown>,
): Record<string, unknown> {
  const authType = readFirstString(nodeData.authType, nodeData.auth_type);
  const authConfig = isRecord(nodeData.authConfig)
    ? nodeData.authConfig
    : isRecord(nodeData.auth_config)
      ? nodeData.auth_config
      : undefined;

  if (authType !== 'api-key' || !authConfig) {
    return {};
  }

  const location = readFirstString(authConfig.location) ?? 'header';
  if (location !== 'query') {
    return {};
  }

  const keyName = readFirstString(authConfig.keyName, authConfig.key_name);
  const keyValue = readFirstString(authConfig.keyValue, authConfig.key_value);

  return keyName && keyValue ? { [keyName]: keyValue } : {};
}
