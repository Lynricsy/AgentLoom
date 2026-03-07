export interface ApiResponse<T> {
  data: T
}

export interface ApiError {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}
