import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { SessionMiddleware } from './session.middleware';

@Global()
@Module({ providers: [SessionMiddleware] })
export class SessionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(SessionMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
