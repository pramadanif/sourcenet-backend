export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse<TDetails = Record<string, unknown>> {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: TDetails;
  };
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

export interface AuthenticatedRequestContext {
  userAddress: string;
  requestId: string;
  issuedAt: string;
  roles?: string[];
}

export interface RequestContext {
  requestId: string;
  userAgent?: string;
  ipAddress?: string;
  auth?: AuthenticatedRequestContext;
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
