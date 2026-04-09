import { Module } from '@nestjs/common';
import { MockOAuthController } from './mock-oauth.controller';
import { MockMsalService } from './mock-msal.service';

@Module({
  controllers: [MockOAuthController],
  providers: [MockMsalService],
  exports: [MockMsalService],
})
export class MockOAuthModule {}
