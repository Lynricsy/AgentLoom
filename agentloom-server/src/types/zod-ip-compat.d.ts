import 'zod';

declare module 'zod' {
  interface ZodString {
    ip(params?: string | { message?: string }): this;
  }
}
