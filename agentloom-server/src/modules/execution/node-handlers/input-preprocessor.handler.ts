import jmespath from 'jmespath';
import jsonata from 'jsonata';
import { createContext, Script } from 'node:vm';

export type InputPreprocessorTransformType =
  'jmespath' | 'jsonata' | 'template' | 'script';

export interface InputPreprocessorConfig {
  transformType: InputPreprocessorTransformType;
  expression: string;
  outputFormat?: string;
}

function readStringAlias(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeTransformType(
  value: unknown,
): InputPreprocessorTransformType {
  return value === 'jsonata' || value === 'template' || value === 'script'
    ? value
    : 'jmespath';
}

export function normalizeInputPreprocessorConfig(
  value: Record<string, unknown>,
  fallbackTransformType?: string | null,
): InputPreprocessorConfig {
  const expression =
    readStringAlias(value.expression) ?? readStringAlias(value.template) ?? '';
  const outputFormat =
    readStringAlias(value.outputFormat) ?? readStringAlias(value.output_format);

  return {
    transformType: normalizeTransformType(
      readStringAlias(value.transformType) ??
        readStringAlias(value.transform_type) ??
        fallbackTransformType,
    ),
    expression,
    ...(outputFormat ? { outputFormat } : {}),
  };
}

export interface InputPreprocessorNodeHandler {
  execute(
    input: string | Record<string, unknown>,
    config: InputPreprocessorConfig,
  ): Promise<{
    output: string | Record<string, unknown>;
    outputFormat?: string;
  }>;
}

/** SECURITY: 防止恶意 script 无限循环的硬超时 */
const SCRIPT_TIMEOUT_MS = 5_000;

/** `{{key}}` / `{{a.b.c}}` Handlebars-style 占位符 */
const TEMPLATE_PATTERN = /\{\{([^}]+)\}\}/g;

export class InputPreprocessorHandlerImpl implements InputPreprocessorNodeHandler {
  async execute(
    input: string | Record<string, unknown>,
    config: InputPreprocessorConfig,
  ): Promise<{
    output: string | Record<string, unknown>;
    outputFormat?: string;
  }> {
    if (!config.expression?.trim()) {
      throw new Error('InputPreprocessor: expression 不能为空');
    }

    let output: string | Record<string, unknown>;

    switch (config.transformType) {
      case 'jmespath':
        output = this.executeJmespath(input, config.expression);
        break;
      case 'jsonata':
        output = await this.executeJsonata(input, config.expression);
        break;
      case 'template':
        output = this.executeTemplate(input, config.expression);
        break;
      case 'script':
        output = this.executeScript(input, config.expression);
        break;
      default:
        throw new Error(
          `InputPreprocessor: 不支持的 transformType "${config.transformType as string}"`,
        );
    }

    return {
      output,
      ...(config.outputFormat ? { outputFormat: config.outputFormat } : {}),
    };
  }

  private executeJmespath(
    input: string | Record<string, unknown>,
    expression: string,
  ): string | Record<string, unknown> {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const result = jmespath.search(data, expression);
    return result ?? {};
  }

  private async executeJsonata(
    input: string | Record<string, unknown>,
    expression: string,
  ): Promise<string | Record<string, unknown>> {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const expr = jsonata(expression);
    const result = await expr.evaluate(data);
    return result ?? {};
  }

  private executeTemplate(
    input: string | Record<string, unknown>,
    expression: string,
  ): string {
    const data: Record<string, unknown> =
      typeof input === 'string' ? JSON.parse(input) : input;

    return expression.replace(TEMPLATE_PATTERN, (_match, key: string) => {
      const trimmedKey = key.trim();
      const value = this.resolveNestedKey(data, trimmedKey);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * SECURITY: sandbox 仅暴露 input + 安全内置对象，
   * 禁止 require / process / fs / global / globalThis / __dirname
   */
  private executeScript(
    input: string | Record<string, unknown>,
    expression: string,
  ): string | Record<string, unknown> {
    const data = typeof input === 'string' ? JSON.parse(input) : input;

    const sandbox = Object.create(null) as Record<string, unknown>;
    sandbox.input = data;
    sandbox.JSON = { parse: JSON.parse, stringify: JSON.stringify };
    sandbox.Math = Math;
    sandbox.parseInt = parseInt;
    sandbox.parseFloat = parseFloat;
    sandbox.String = String;
    sandbox.Number = Number;
    sandbox.Boolean = Boolean;
    sandbox.Array = Array;
    sandbox.Object = {
      keys: Object.keys,
      values: Object.values,
      entries: Object.entries,
      assign: Object.assign,
      fromEntries: Object.fromEntries,
    };
    sandbox.Date = Date;

    const context = createContext(sandbox);
    const script = new Script(expression, {
      filename: 'input-preprocessor-script.vm',
    });
    const result = script.runInContext(context, {
      timeout: SCRIPT_TIMEOUT_MS,
    });

    if (result === undefined || result === null) {
      return {};
    }
    if (
      typeof result === 'string' ||
      (typeof result === 'object' && !Array.isArray(result))
    ) {
      return result as string | Record<string, unknown>;
    }
    return { result };
  }

  private resolveNestedKey(
    data: Record<string, unknown>,
    key: string,
  ): unknown {
    const parts = key.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
