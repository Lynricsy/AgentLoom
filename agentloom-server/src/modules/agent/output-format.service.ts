import { Injectable, Logger } from '@nestjs/common'
import { generateText, Output, NoObjectGeneratedError } from 'ai'
import type { LanguageModel } from 'ai'
import { jsonrepair } from 'jsonrepair'
import { z } from 'zod'

import { supportsNativeStructuredOutput } from '../llm/llm-provider-catalog'
import type {
  FormatAttempt,
  FormatResult,
  OutputFormatLevel,
  OutputFormatStrategy,
} from './dto/output-format.dto'

export interface FormatRequest {
  providerId: string
  model: LanguageModel
  prompt: string
  system?: string
  strategy: OutputFormatStrategy
}

const LEVEL_ORDER: Record<OutputFormatLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
}

const MAX_LEVEL_BY_STRICTNESS: Record<string, OutputFormatLevel> = {
  strict: 'L2',
  flexible: 'L3',
  lenient: 'L4',
}

@Injectable()
export class OutputFormatService {
  private readonly logger = new Logger(OutputFormatService.name)

  async executeStructuredOutput(request: FormatRequest): Promise<FormatResult> {
    const { strategy } = request
    const attempts: FormatAttempt[] = []
    const startLevel = this.determineStartLevel(request)
    const maxLevel = MAX_LEVEL_BY_STRICTNESS[strategy.strictness] ?? 'L4'

    const levels: OutputFormatLevel[] = ['L1', 'L2', 'L3', 'L4']
    const startIdx = levels.indexOf(startLevel)
    const maxIdx = levels.indexOf(maxLevel)
    const allowedLevels = strategy.allowDegrade
      ? levels.slice(startIdx, maxIdx + 1)
      : [startLevel]

    for (const level of allowedLevels) {
      const start = performance.now()
      try {
        const data = await this.executeLevel(level, request)
        const durationMs = Math.round(performance.now() - start)
        attempts.push({ level, durationMs, success: true })
        return {
          outputFormatLevel: level,
          degraded: level !== startLevel,
          data,
          attempts,
        }
      } catch (error) {
        const durationMs = Math.round(performance.now() - start)
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        attempts.push({
          level,
          durationMs,
          success: false,
          error: errorMessage,
        })
        this.logger.warn(
          `${level} failed (${durationMs}ms): ${errorMessage}, attempting next level`,
        )
      }
    }

    const lastAttempt = attempts[attempts.length - 1]
    return {
      outputFormatLevel: lastAttempt?.level ?? startLevel,
      degraded: true,
      data: null,
      attempts,
      rawText: lastAttempt?.rawOutput,
    }
  }

  private determineStartLevel(request: FormatRequest): OutputFormatLevel {
    const { strategy, providerId } = request
    if (!strategy.outputSchema || strategy.outputSchema.trim() === '') {
      return 'L2'
    }
    if (!supportsNativeStructuredOutput(providerId)) {
      return 'L2'
    }
    return 'L1'
  }

  private async executeLevel(
    level: OutputFormatLevel,
    request: FormatRequest,
  ): Promise<unknown> {
    switch (level) {
      case 'L1':
        return this.executeL1(request)
      case 'L2':
        return this.executeL2(request)
      case 'L3':
        return this.executeL3(request)
      case 'L4':
        return this.executeL4(request)
      default:
        throw new Error(`Unknown format level: ${level}`)
    }
  }

  private async executeL1(request: FormatRequest): Promise<unknown> {
    const zodSchema = this.parseJsonSchemaToZod(request.strategy.outputSchema)
    try {
      const result = await generateText({
        model: request.model,
        prompt: request.prompt,
        system: request.system,
        output: Output.object({ schema: zodSchema }),
      })
      return result.output
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error(`L1 native structured output failed: ${error.message}`)
      }
      throw error
    }
  }

  private async executeL2(request: FormatRequest): Promise<unknown> {
    const schemaHint = request.strategy.outputSchema
      ? `\n\nYou MUST respond with valid JSON matching this schema:\n${request.strategy.outputSchema}`
      : '\n\nYou MUST respond with valid JSON.'

    const result = await generateText({
      model: request.model,
      prompt: request.prompt + schemaHint,
      system: request.system,
    })

    const parsed = this.repairAndParse(
      result.text,
      request.strategy.repairPolicy,
    )
    if (request.strategy.outputSchema) {
      const zodSchema = this.parseJsonSchemaToZod(
        request.strategy.outputSchema,
      )
      const validation = zodSchema.safeParse(parsed)
      if (!validation.success) {
        throw new Error(
          `L2 validation failed: ${validation.error.message}`,
        )
      }
      return validation.data
    }
    return parsed
  }

  private async executeL3(request: FormatRequest): Promise<unknown> {
    const result = await generateText({
      model: request.model,
      prompt: request.prompt,
      system: request.system,
      output: Output.json(),
    })

    const raw =
      typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output)
    return this.repairAndParse(raw, request.strategy.repairPolicy)
  }

  private async executeL4(request: FormatRequest): Promise<unknown> {
    const result = await generateText({
      model: request.model,
      prompt: request.prompt,
      system: request.system,
    })

    const extracted = this.extractJsonFromText(result.text)
    if (!extracted) {
      throw new Error('L4 failed: no JSON found in text output')
    }
    return this.repairAndParse(extracted, request.strategy.repairPolicy)
  }

  private repairAndParse(raw: string, repairPolicy: string): unknown {
    if (repairPolicy === 'none') {
      return JSON.parse(raw)
    }

    try {
      const repaired = jsonrepair(raw)
      return JSON.parse(repaired)
    } catch {
      return JSON.parse(raw)
    }
  }

  private extractJsonFromText(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    const objectMatch = text.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return objectMatch[0]
    }

    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return arrayMatch[0]
    }

    return null
  }

  parseJsonSchemaToZod(_schemaStr: string): z.ZodType {
    return z.record(z.string(), z.any())
  }
}
