import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Keeps the VS03 response contract stable while M01 adopts the explicit
 * persistence names responseType and purpose. New consumers can use the new
 * fields; legacy clients continue to receive the former type alias.
 */
@Injectable()
export class AssessmentCompatibilityInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value: unknown) => this.addLegacyTypeAliases(value)));
  }

  private addLegacyTypeAliases(value: unknown): unknown {
    // Binary responses must retain Nest's StreamableFile wrapper. Recursively
    // copying it turns protected assessment media into an empty JSON object.
    if (value instanceof StreamableFile || Buffer.isBuffer(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.addLegacyTypeAliases(item));
    }
    if (!value || typeof value !== 'object' || value instanceof Date) {
      return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(source)) {
      result[key] = this.addLegacyTypeAliases(nestedValue);
    }
    if (result.type === undefined) {
      if (typeof result.responseType === 'string') {
        result.type = result.responseType;
      } else if (typeof result.purpose === 'string') {
        result.type = result.purpose;
      }
    }
    return result;
  }
}
