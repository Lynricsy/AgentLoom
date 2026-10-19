import {
  isRecord,
  keyValuePairsToRecord,
  parseJsonLikeValue,
  readFirstDefined,
  readFirstString,
  stripExecOnlyInputs,
} from './node-value.util';
import {
  resolveTemplatePath,
  TEMPLATE_PLACEHOLDER_PATTERN,
} from './template-placeholder.util';

/** OpenAPI 路径模板风格的 `{id}`：不是本产品的占位符写法，留在 URL 里只会按字面量请求。 */
const SINGLE_BRACE_PLACEHOLDER = /\{([A-Za-z_][\w.-]*)\}/;

/**
 * 构造 HTTP 请求节点的最终 URL 与请求（headers / query / body）。
 *
 * - URL 中的 `{{字段}}` 按「请求体」端口数据取值（点分路径），值经 encodeURIComponent 后拼入；
 *   没有值、值不是标量、或写成了 `{字段}` 时抛错让节点失败，不按字面量发出请求。
 * - GET 不发送请求体：端口数据是不含 body / query / headers 的普通对象时，URL 未引用的字段
 *   转为 query 参数；端口数据显式给出 body（或是标量）时抛错，不静默丢弃。
 */
export function buildHttpToolRequestInput(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
  binding: { url: string; method: string },
): { url: string; request: Record<string, unknown> } {
  const dynamicRequest = extractHttpToolDynamicRequest(input);
  const { url, referencedKeys } = resolveHttpToolUrl(
    binding.url,
    dynamicRequest,
  );
  const staticQueryParams = readFirstDefined(
    nodeData.queryParams,
    nodeData.query_params,
  );
  const headers = {
    ...keyValuePairsToRecord(nodeData.headers),
    ...buildHttpToolAuthHeaders(nodeData),
    ...extractHttpToolHeaders(dynamicRequest.headers),
  };
  const isGet = binding.method === 'GET';
  const query = {
    ...keyValuePairsToRecord(staticQueryParams, true),
    ...buildHttpToolAuthQuery(nodeData),
    ...extractHttpToolQuery(dynamicRequest.query),
    ...(isGet ? resolveGetRequestQuery(dynamicRequest, referencedKeys) : {}),
  };
  const request: Record<string, unknown> = {};

  if (Object.keys(headers).length > 0) {
    request.headers = headers;
  }

  if (Object.keys(query).length > 0) {
    request.query = query;
  }

  const requestBody = isGet
    ? undefined
    : resolveHttpToolRequestBody(nodeData, dynamicRequest);
  if (requestBody !== undefined) {
    request.body = requestBody;
  }

  return { url, request };
}

export function resolveHttpToolUrl(
  urlTemplate: string,
  dynamicRequest: Record<string, unknown>,
): { url: string; referencedKeys: Set<string> } {
  const referencedKeys = new Set<string>();
  const missing: string[] = [];
  const nonScalar: string[] = [];
  const url = urlTemplate.replace(
    TEMPLATE_PLACEHOLDER_PATTERN,
    (placeholder, rawPath: string) => {
      const path = rawPath.trim();
      referencedKeys.add(path.split('.')[0]);
      const value = resolveTemplatePath(dynamicRequest, path);
      if (value === undefined || value === null || value === '') {
        missing.push(placeholder);
        return placeholder;
      }
      if (typeof value === 'object') {
        nonScalar.push(placeholder);
        return placeholder;
      }
      return encodeURIComponent(String(value));
    },
  );

  if (missing.length > 0) {
    throw new Error(
      `HTTP 请求 URL 中的占位符 ${missing.join('、')} 在「请求体」端口数据中没有值`,
    );
  }
  if (nonScalar.length > 0) {
    throw new Error(
      `HTTP 请求 URL 中的占位符 ${nonScalar.join('、')} 的值不是字符串、数字或布尔值，不能拼入 URL`,
    );
  }
  const singleBrace = SINGLE_BRACE_PLACEHOLDER.exec(url);
  if (singleBrace) {
    throw new Error(
      `HTTP 请求 URL 中的 ${singleBrace[0]} 不是占位符写法：引用「请求体」端口数据请写 {{${singleBrace[1]}}}`,
    );
  }

  return { url, referencedKeys };
}

function resolveGetRequestQuery(
  dynamicRequest: Record<string, unknown>,
  referencedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const explicitBody = Object.prototype.hasOwnProperty.call(
    dynamicRequest,
    'body',
  )
    ? dynamicRequest.body
    : undefined;
  if (explicitBody !== undefined && explicitBody !== null) {
    throw new Error(
      'GET 请求不能携带请求体：「请求体」端口数据中的 body 无法发送。请改用 POST / PUT / PATCH，或把参数放进 query 字段',
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(dynamicRequest, 'body') ||
    Object.prototype.hasOwnProperty.call(dynamicRequest, 'query') ||
    Object.prototype.hasOwnProperty.call(dynamicRequest, 'headers')
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(dynamicRequest).filter(([key]) => !referencedKeys.has(key)),
  );
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
