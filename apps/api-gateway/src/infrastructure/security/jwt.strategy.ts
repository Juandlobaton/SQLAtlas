import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../../application/dto/auth.dto';

function extractFromCookieOrHeader(req: Request): string | null {
  // 1. Try HttpOnly cookie first
  const fromCookie = req.cookies?.access_token;
  if (fromCookie) return fromCookie;
  // 2. Fallback to Authorization header (for API clients, Swagger, etc.)
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any): Promise<JwtPayload> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return { sub: payload.sub, email: payload.email, tenantId: payload.tenantId, role: payload.role };
  }
}
