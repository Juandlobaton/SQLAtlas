import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthenticationError } from '../../../application/use-cases/auth/login.use-case';
import { RegistrationError } from '../../../application/use-cases/auth/register.use-case';
import { ConnectionError } from '../../../application/use-cases/connections/create-connection.use-case';
import { AnalysisError } from '../../../application/use-cases/analysis/start-analysis.use-case';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.headers['x-correlation-id'] as string;

    let status: number;
    let code: string;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || exception.message;
      code = `HTTP_${status}`;
    } else if (exception instanceof AuthenticationError) {
      status = HttpStatus.UNAUTHORIZED;
      code = 'AUTHENTICATION_ERROR';
      message = exception.message;
    } else if (exception instanceof RegistrationError) {
      status = HttpStatus.CONFLICT;
      code = 'REGISTRATION_ERROR';
      message = exception.message;
    } else if (exception instanceof ConnectionError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'CONNECTION_ERROR';
      message = exception.message;
    } else if (exception instanceof AnalysisError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'ANALYSIS_ERROR';
      message = exception.message;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';
      message = 'An unexpected error occurred';
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
      requestId: correlationId,
    });
  }
}
