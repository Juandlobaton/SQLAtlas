import { Body, Controller, Get, Post, Query, Req, Res, Inject, HttpCode, HttpStatus, ForbiddenException, ConflictException, UnauthorizedException, BadRequestException, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { LoginUseCase } from '../../../application/use-cases/auth/login.use-case';
import { RegisterUseCase } from '../../../application/use-cases/auth/register.use-case';
import { SetupUseCase, SetupAlreadyCompleteError } from '../../../application/use-cases/auth/setup.use-case';
import { GetSystemStatusUseCase } from '../../../application/use-cases/auth/get-system-status.use-case';
import { MicrosoftLoginUseCase, MicrosoftLoginError } from '../../../application/use-cases/auth/microsoft-login.use-case';
import { MsalService, MSAL_SERVICE } from '../../../infrastructure/security/msal.service';
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
    private readonly jwtService: JwtService,
    @Optional() private readonly microsoftLoginUseCase?: MicrosoftLoginUseCase,
    @Optional() @Inject(MSAL_SERVICE) private readonly msalService?: MsalService,
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

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      clearAuthCookies(res);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const accessToken = this.jwtService.sign(
      { sub: payload.sub, email: payload.email, tenantId: payload.tenantId, role: payload.role, type: 'access' },
    );

    const expiresIn = 900; // 15 minutes
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: expiresIn * 1000,
      path: '/',
    });

    return { success: true, expiresIn };
  }

  @Get('microsoft')
  @ApiOperation({ summary: 'Initiate Microsoft SSO login — redirects to Microsoft' })
  async microsoftLogin(
    @Query('tenant') tenantSlug: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!this.msalService?.isConfigured()) {
      throw new BadRequestException('Microsoft SSO is not configured');
    }

    const { url, verifier } = await this.msalService.getAuthorizationUrl(tenantSlug || '');

    // Store PKCE verifier in a short-lived httpOnly cookie
    res.cookie('msal_verifier', verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // lax required for OAuth redirect flow
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/api/v1/auth',
    });

    res.redirect(url);
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Microsoft SSO callback — exchanges code for tokens' })
  async microsoftCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDesc: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:5173';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorDesc || error)}`);
      return;
    }

    if (!code) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('No authorization code received')}`);
      return;
    }

    if (!this.msalService?.isConfigured() || !this.microsoftLoginUseCase) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Microsoft SSO is not configured')}`);
      return;
    }

    const verifier = req.cookies?.msal_verifier;
    if (!verifier) {
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Session expired. Please try again.')}`);
      return;
    }

    // Clear the verifier cookie
    res.clearCookie('msal_verifier', { path: '/api/v1/auth' });

    try {
      const msUser = await this.msalService.acquireTokenByCode(code, verifier);

      const tokens = await this.microsoftLoginUseCase.execute(
        { oid: msUser.oid, email: msUser.email, displayName: msUser.displayName },
        state || undefined, // tenantSlug passed via state
        req.ip,
      );

      setAuthCookies(res, tokens);

      // Redirect to frontend with token in URL fragment for session restoration
      res.redirect(`${frontendUrl}/login?sso=success&token=${tokens.accessToken}`);
    } catch (err) {
      const message = err instanceof MicrosoftLoginError ? err.message : 'Authentication failed';
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clear auth cookies' })
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { success: true };
  }
}
