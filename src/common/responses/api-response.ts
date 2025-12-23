import { Response } from 'express';

type Serializable = Record<string, unknown> | null;

export class ApiResponse {
  static success<T = unknown, M extends Serializable = Serializable>(
    res: Response,
    message: string,
    data?: T | null,
    statusCode = 200,
    meta?: M,
    path?: string,
  ) {
    return res.status(statusCode).json({
      status: 'success',
      statusCode,
      message,
      data: data ?? null,
      meta: meta ?? null,
      path: path ?? res.req?.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  static error(
    res: Response,
    message: string,
    statusCode = 400,
    error?: unknown,
    path?: string,
  ) {
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      message,
      error: ApiResponse.formatError(error),
      path: path ?? res.req?.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private static formatError(error?: unknown): string | null {
    if (!error) return null;
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unexpected error';
    }
  }
}
