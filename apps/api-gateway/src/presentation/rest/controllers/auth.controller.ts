import { Body, Controller, Get, Post, Req, Res, HttpCode, HttpStatus, ForbiddenException, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoginUseCase } from '../../../application/use-cases/auth/login.use-case';
import { RegisterUseCase } from '../../../application/use-cases/auth/register.use-case';
import { SetupUseCase, SetupAlreadyCompleteError } from '../../../application/use-cases/auth/setup.use-case';
import { GetSystemStatusUseCase } from '../../../application/use-cases/auth/get-system-status.use-case';
import { setAuthCookies, clearAuthCookies } from '../helpers/auth-cookies';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsOptional()
  tenantSlug?: string;
}

class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message: 'Password must contain at least one uppercase, one lowercase, one number, and one special character',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(2)
  tenantName!: string;
}

class SetupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message: 'Password must contain at least one uppercase, one lowercase, one number, and one special character',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(2)
  orgName!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registerUseCase: RegisterUseCase,
    private readonly setupUseCase: SetupUseCase,
    private readonly getSystemStatusUseCase: GetSystemStatusUseCase,
  ) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get system status (needs setup, registration mode, etc.)' })
  async status() {
    const data = await this.getSystemStatusUseCase.execute();
    return { success: true, data };
  }

  @Post('setup')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initial setup — create first organization and admin user' })
  async setup(@Body() dto: SetupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.setupUseCase.execute({
        email: dto.email,
        password: dto.password,
        displayName: dto.displayName,
        orgName: dto.orgName,
      });

      setAuthCookies(res, tokens);

      return {
        success: true,
        data: tokens,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-correlation-id'],
      };
    } catch (error) {
      if (error instanceof SetupAlreadyCompleteError) {
        throw new ConflictException('Setup has already been completed');
      }
      throw error;
    }
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.loginUseCase.execute(
      {
        email: dto.email,
        password: dto.password,
        tenantSlug: dto.tenantSlug || '',
      },
      req.ip,
    );

    setAuthCookies(res, tokens);

    return {
      success: true,
      data: tokens,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new organization and admin user (when registration is open)' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const status = await this.getSystemStatusUseCase.execute();
    if (status.registrationMode === 'closed') {
      throw new ForbiddenException('Registration is disabled. Contact your administrator.');
    }

    const tokens = await this.registerUseCase.execute({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      tenantName: dto.tenantName,
    });

    setAuthCookies(res, tokens);

    return {
      success: true,
      data: tokens,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clear auth cookies' })
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { success: true };
  }
}
