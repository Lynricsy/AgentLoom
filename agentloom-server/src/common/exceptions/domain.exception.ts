import { HttpException, HttpStatus } from '@nestjs/common';
import type { FieldError } from '../types/problem-details.type';

export class DomainException extends HttpException {
  readonly type: string;
  readonly detail: string;
  readonly errors?: FieldError[];
  readonly extensions?: Record<string, unknown>;
  /** 由 AllExceptionsFilter 写入响应的附加头（如 Retry-After） */
  readonly headers?: Record<string, string>;

  constructor(params: {
    type: string;
    title: string;
    status: HttpStatus;
    detail: string;
    errors?: FieldError[];
    extensions?: Record<string, unknown>;
    headers?: Record<string, string>;
  }) {
    super(params.title, params.status);
    this.type = params.type;
    this.detail = params.detail;
    this.errors = params.errors;
    this.extensions = params.extensions;
    this.headers = params.headers;
  }
}
