export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: FieldError[];
  [key: string]: unknown;
}

export interface FieldError {
  field: string;
  message: string;
}
