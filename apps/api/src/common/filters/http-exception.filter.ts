import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? (req.headers['x-request-id'] as string) ?? undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof DomainError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        code = (obj.error as string) ?? code;
        details = obj.message;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          code = 'VALIDATION_FAILED';
          details = (obj.message as string[]).map((m) => ({ path: '', message: m }));
        }
      }
    }

    res.status(status).json({
      data: null,
      meta: null,
      error: {
        code,
        message,
        details: details ?? null,
        requestId: requestId ?? null,
      },
    });
  }
}
