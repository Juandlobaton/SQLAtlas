import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { RotateCredentialsUseCase } from '../../../application/use-cases/admin/rotate-credentials.use-case';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminController {
  constructor(
    private readonly rotateCredentialsUseCase: RotateCredentialsUseCase,
  ) {}

  @Post('rotate-credentials')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-encrypt all credentials with the current key (after key rotation)' })
  async rotateCredentials() {
    const result = await this.rotateCredentialsUseCase.execute();
    return { success: true, data: result };
  }
}
