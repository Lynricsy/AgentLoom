import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { DomainException } from '../exceptions/domain.exception';
import type { ProblemDetails } from '../types/problem-details.type';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const problem = this.buildProblemDetails(exception, request.url);

    if (problem.status >= 500) {
      this.logger.error(
        `[${problem.status}] ${problem.detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    reply
      .status(problem.status)
      .header('Content-Type', 'application/problem+json')
      .send(problem);
  }

  private buildProblemDetails(
    exception: unknown,
    instance: string,
  ): ProblemDetails {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as z.ZodError;
      return {
        type: 'https://agentloom.dev/errors/validation-error',
        title: 'Validation Error',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'Request validation failed',
        instance,
        errors: zodError.issues.map((issue: z.ZodIssue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof DomainException) {
      return {
        type: exception.type,
        title: exception.message,
        status: exception.getStatus(),
        detail: exception.detail,
        instance,
        ...(exception.errors && { errors: exception.errors }),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : (response as Record<string, unknown>).message?.toString() ??
            exception.message;

      return {
        type: 'https://agentloom.dev/errors/http-error',
        title: HttpStatus[status] ?? 'Error',
        status,
        detail,
        instance,
      };
    }

    this.logger.error('Unhandled exception', exception);

    return {
      type: 'https://agentloom.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance,
    };
  }
}
