import { HttpException, HttpStatus } from '@nestjs/common';
import type { FieldError } from '../types/problem-details.type';

export class DomainException extends HttpException {
  readonly type: string;
  readonly detail: string;
  readonly errors?: FieldError[];
  readonly extensions?: Record<string, unknown>;

  constructor(params: {
    type: string;
    title: string;
    status: HttpStatus;
    detail: string;
    errors?: FieldError[];
    extensions?: Record<string, unknown>;
  }) {
    super(params.title, params.status);
    this.type = params.type;
    this.detail = params.detail;
    this.errors = params.errors;
    this.extensions = params.extensions;
  }
}
