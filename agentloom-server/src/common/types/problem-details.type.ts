export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}
