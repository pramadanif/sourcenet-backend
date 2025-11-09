export enum ErrorCode {
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Authentication errors
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Authorization errors
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Blockchain errors
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',

  // Walrus errors
  WALRUS_ERROR = 'WALRUS_ERROR',
  BLOB_UPLOAD_FAILED = 'BLOB_UPLOAD_FAILED',
  BLOB_DOWNLOAD_FAILED = 'BLOB_DOWNLOAD_FAILED',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',

  // Encryption errors
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR = 'DECRYPTION_ERROR',
  INVALID_KEY = 'INVALID_KEY',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',

  // S3 errors
  S3_ERROR = 'S3_ERROR',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
}

export interface ErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: ErrorDetails;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    details: ErrorDetails = {},
    requestId?: string,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details, requestId);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.AUTHENTICATION_ERROR, 401, details, requestId);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.AUTHORIZATION_ERROR, 403, details, requestId);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class BlockchainError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.BLOCKCHAIN_ERROR, 500, details, requestId);
    Object.setPrototypeOf(this, BlockchainError.prototype);
  }
}

export class WalrusError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.WALRUS_ERROR, 500, details, requestId);
    Object.setPrototypeOf(this, WalrusError.prototype);
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.ENCRYPTION_ERROR, 500, details, requestId);
    Object.setPrototypeOf(this, EncryptionError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.DATABASE_ERROR, 500, details, requestId);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class S3Error extends AppError {
  constructor(message: string, details: ErrorDetails = {}, requestId?: string) {
    super(message, ErrorCode.S3_ERROR, 500, details, requestId);
    Object.setPrototypeOf(this, S3Error.prototype);
  }
}
