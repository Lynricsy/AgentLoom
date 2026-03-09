import { Injectable, Logger } from '@nestjs/common';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import { supportsNativeStructuredOutput } from '../llm/llm-provider-catalog';
import type {
  FormatAttempt,
  FormatResult,
  OutputFormatLevel,
  OutputFormatStrategy,
} from './dto/output-format.dto';

type JsonSchemaPrimitiveType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

type JsonLiteralValue = string | number | boolean | null;

interface JsonSchemaNode {
  type?: JsonSchemaPrimitiveType | JsonSchemaPrimitiveType[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: JsonLiteralValue[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  additionalProperties?: boolean | JsonSchemaNode;
  nullable?: boolean;
}

interface LevelExecutionResult {
  data: unknown;
  rawOutput?: string;
  rawText?: string;
}

class FormatLevelError extends Error {
  constructor(
    message: string,
    readonly rawOutput?: string,
  ) {
    super(message);
    this.name = 'FormatLevelError';
  }
}

const MAX_LEVEL_BY_STRICTNESS: Record<string, OutputFormatLevel> = {
  strict: 'L2',
  flexible: 'L3',
  lenient: 'L4',
};

@Injectable()
export class OutputFormatService {
  private readonly logger = new Logger(OutputFormatService.name);

  async executeStructuredOutput(request: FormatRequest): Promise<FormatResult> {
    const { strategy } = request;
    const attempts: FormatAttempt[] = [];
    const startLevel = this.determineStartLevel(request);
    const maxLevel = MAX_LEVEL_BY_STRICTNESS[strategy.strictness] ?? 'L4';

    const levels: OutputFormatLevel[] = ['L1', 'L2', 'L3', 'L4'];
    const startIdx = levels.indexOf(startLevel);
    const maxIdx = levels.indexOf(maxLevel);
    const allowedLevels = strategy.allowDegrade
      ? levels.slice(startIdx, maxIdx + 1)
      : [startLevel];

    for (const level of allowedLevels) {
      const start = performance.now();
      try {
        const outcome = await this.executeLevel(level, request);
        const durationMs = Math.round(performance.now() - start);
        attempts.push({
          level,
          durationMs,
          success: true,
          rawOutput: outcome.rawOutput,
        });
        return {
          outputFormatLevel: level,
          degraded: level !== startLevel,
          data: outcome.data,
          attempts,
          rawText: outcome.rawText,
        };
      } catch (error) {
        const durationMs = Math.round(performance.now() - start);
        const formatError = this.toFormatLevelError(level, error);
        attempts.push({
          level,
          durationMs,
          success: false,
          error: formatError.message,
          rawOutput: formatError.rawOutput,
        });
        this.logger.warn(
          `${level} failed (${durationMs}ms): ${formatError.message}, attempting next level`,
        );
      }
    }

    const lastAttempt = attempts[attempts.length - 1];
    return {
      outputFormatLevel: lastAttempt?.level ?? startLevel,
      degraded: true,
      data: null,
      attempts,
      rawText: lastAttempt?.rawOutput,
    };
  }

  private determineStartLevel(request: FormatRequest): OutputFormatLevel {
    const { strategy, providerId } = request;
    if (!strategy.outputSchema || strategy.outputSchema.trim() === '') {
      return 'L2';
    }
    if (!supportsNativeStructuredOutput(providerId)) {
      return 'L2';
    }
    return 'L1';
  }

  private async executeLevel(
    level: OutputFormatLevel,
    request: FormatRequest,
  ): Promise<LevelExecutionResult> {
    switch (level) {
      case 'L1':
        return this.executeL1(request);
      case 'L2':
        return this.executeL2(request);
      case 'L3':
        return this.executeL3(request);
      case 'L4':
        return this.executeL4(request);
      default:
        throw new Error(`Unknown format level: ${level}`);
    }
  }

  private async executeL1(
    request: FormatRequest,
  ): Promise<LevelExecutionResult> {
    const zodSchema = this.parseJsonSchemaToZod(request.strategy.outputSchema);
    try {
      const result = await generateText({
        model: request.model,
        prompt: request.prompt,
        system: request.system,
        output: Output.object({ schema: zodSchema }),
      });
      return { data: result.output };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new FormatLevelError(
          `L1 native structured output failed: ${errorMessage}`,
          this.extractNoObjectGeneratedText(error),
        );
      }
      throw error;
    }
  }

  private async executeL2(
    request: FormatRequest,
  ): Promise<LevelExecutionResult> {
    const schemaHint = request.strategy.outputSchema
      ? `\n\nYou MUST respond with valid JSON matching this schema:\n${request.strategy.outputSchema}`
      : '\n\nYou MUST respond with valid JSON.';

    const result = await generateText({
      model: request.model,
      prompt: request.prompt + schemaHint,
      system: request.system,
    });

    try {
      const parsed = this.repairAndParse(
        result.text,
        request.strategy.repairPolicy,
      );
      return {
        data: this.validateStructuredData(
          parsed,
          request.strategy.outputSchema,
          'L2',
        ),
        rawOutput: result.text,
      };
    } catch (error) {
      throw this.toFormatLevelError('L2', error, result.text);
    }
  }

  private async executeL3(
    request: FormatRequest,
  ): Promise<LevelExecutionResult> {
    const result = await generateText({
      model: request.model,
      prompt: request.prompt,
      system: request.system,
      output: Output.json(),
    });

    const rawOutput =
      typeof result.text === 'string' && result.text.trim() !== ''
        ? result.text
        : JSON.stringify(result.output);

    try {
      const parsed =
        typeof result.output === 'string'
          ? this.repairAndParse(result.output, request.strategy.repairPolicy)
          : result.output;
      return {
        data: this.validateStructuredData(
          parsed,
          request.strategy.outputSchema,
          'L3',
        ),
        rawOutput,
      };
    } catch (error) {
      throw this.toFormatLevelError('L3', error, rawOutput);
    }
  }

  private async executeL4(
    request: FormatRequest,
  ): Promise<LevelExecutionResult> {
    const result = await generateText({
      model: request.model,
      prompt: request.prompt,
      system: request.system,
    });

    const extracted = this.extractJsonFromText(result.text);
    if (!extracted) {
      throw new FormatLevelError(
        'L4 failed: no JSON found in text output',
        result.text,
      );
    }

    try {
      const parsed = this.repairAndParse(
        extracted,
        request.strategy.repairPolicy,
      );
      return {
        data: this.validateStructuredData(
          parsed,
          request.strategy.outputSchema,
          'L4',
        ),
        rawOutput: result.text,
        rawText: result.text,
      };
    } catch (error) {
      throw this.toFormatLevelError('L4', error, result.text);
    }
  }

  private validateStructuredData(
    data: unknown,
    outputSchema: string,
    level: OutputFormatLevel,
  ): unknown {
    if (!outputSchema.trim()) {
      return data;
    }

    const zodSchema = this.parseJsonSchemaToZod(outputSchema);
    const validation = zodSchema.safeParse(data);
    if (!validation.success) {
      throw new Error(
        `${level} validation failed: ${validation.error.message}`,
      );
    }

    return validation.data;
  }

  private repairAndParse(
    raw: string,
    repairPolicy: OutputFormatStrategy['repairPolicy'],
  ): unknown {
    const normalized = raw.trim();
    if (normalized === '') {
      throw new Error('Empty JSON output');
    }

    if (repairPolicy === 'none' || repairPolicy === 'manual') {
      return JSON.parse(normalized);
    }

    try {
      return JSON.parse(normalized);
    } catch {
      return JSON.parse(jsonrepair(normalized));
    }
  }

  private extractJsonFromText(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }

    return null;
  }

  parseJsonSchemaToZod(schemaStr: string): z.ZodType<unknown> {
    const normalized = schemaStr.trim();
    if (normalized === '') {
      return this.createLooseObjectSchema();
    }

    const schema = JSON.parse(normalized) as JsonSchemaNode;
    return this.convertJsonSchemaToZod(schema);
  }

  private convertJsonSchemaToZod(schema: JsonSchemaNode): z.ZodType<unknown> {
    if (schema.enum && schema.enum.length > 0) {
      return this.applyNullability(
        schema,
        this.createLiteralUnion(schema.enum),
      );
    }

    const variants = schema.anyOf ?? schema.oneOf;
    if (variants && variants.length > 0) {
      return this.applyNullability(
        schema,
        this.createUnionSchema(
          variants.map((variant) => this.convertJsonSchemaToZod(variant)),
        ),
      );
    }

    const types = this.normalizeSchemaTypes(schema);
    const nonNullableTypes = types.filter((type) => type !== 'null');

    let baseSchema: z.ZodType<unknown>;
    if (nonNullableTypes.length === 0) {
      baseSchema = schema.properties
        ? this.createObjectSchema(schema)
        : this.createLooseObjectSchema();
    } else if (nonNullableTypes.length === 1) {
      baseSchema = this.createSchemaForType(nonNullableTypes[0], schema);
    } else {
      baseSchema = this.createUnionSchema(
        nonNullableTypes.map((type) => this.createSchemaForType(type, schema)),
      );
    }

    return this.applyNullability(schema, baseSchema);
  }

  private createSchemaForType(
    type: JsonSchemaPrimitiveType,
    schema: JsonSchemaNode,
  ): z.ZodType<unknown> {
    switch (type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(
          schema.items
            ? this.convertJsonSchemaToZod(schema.items)
            : z.unknown(),
        );
      case 'object':
        return this.createObjectSchema(schema);
      case 'null':
        return z.null();
    }
  }

  private createObjectSchema(schema: JsonSchemaNode): z.ZodType<unknown> {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const shape: Record<string, z.ZodType<unknown>> = {};

    for (const [key, value] of Object.entries(properties)) {
      const propertySchema = this.convertJsonSchemaToZod(value);
      shape[key] = required.has(key)
        ? propertySchema
        : propertySchema.optional();
    }

    const objectSchema = z.object(shape);
    if (schema.additionalProperties === false) {
      return objectSchema.strict();
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      return objectSchema.catchall(
        this.convertJsonSchemaToZod(schema.additionalProperties),
      );
    }

    return objectSchema.catchall(z.unknown());
  }

  private createLooseObjectSchema(): z.ZodType<unknown> {
    return z.object({}).catchall(z.unknown());
  }

  private createLiteralUnion(values: JsonLiteralValue[]): z.ZodType<unknown> {
    const literals = values.map((value) => z.literal(value));
    return this.createUnionSchema(literals);
  }

  private createUnionSchema(schemas: z.ZodType<unknown>[]): z.ZodType<unknown> {
    const [first, second, ...rest] = schemas;
    if (!first) {
      return z.unknown();
    }
    if (!second) {
      return first;
    }

    let unionSchema: z.ZodType<unknown> = z.union([first, second]);
    for (const schema of rest) {
      unionSchema = z.union([unionSchema, schema]);
    }

    return unionSchema;
  }

  private normalizeSchemaTypes(
    schema: JsonSchemaNode,
  ): JsonSchemaPrimitiveType[] {
    if (Array.isArray(schema.type)) {
      return schema.type;
    }

    if (schema.type) {
      return [schema.type];
    }

    if (schema.properties || schema.additionalProperties !== undefined) {
      return ['object'];
    }

    if (schema.items) {
      return ['array'];
    }

    return [];
  }

  private applyNullability(
    schema: JsonSchemaNode,
    zodSchema: z.ZodType<unknown>,
  ): z.ZodType<unknown> {
    const typeIncludesNull = this.normalizeSchemaTypes(schema).includes('null');
    return schema.nullable || typeIncludesNull
      ? zodSchema.nullable()
      : zodSchema;
  }

  private toFormatLevelError(
    level: OutputFormatLevel,
    error: unknown,
    rawOutput?: string,
  ): FormatLevelError {
    if (error instanceof FormatLevelError) {
      return error.rawOutput === undefined && rawOutput !== undefined
        ? new FormatLevelError(error.message, rawOutput)
        : error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return new FormatLevelError(`${level} failed: ${errorMessage}`, rawOutput);
  }

  private extractNoObjectGeneratedText(error: unknown): string | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'text' in error &&
      typeof error.text === 'string'
    ) {
      return error.text;
    }

    return undefined;
  }
}

export interface FormatRequest {
  providerId: string;
  model: LanguageModel;
  prompt: string;
  system?: string;
  strategy: OutputFormatStrategy;
}
