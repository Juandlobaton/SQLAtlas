import { Response } from 'express';
import { AuthTokensOutput } from '../../../application/dto/auth.dto';

const IS_PROD = process.env.NODE_ENV === 'production';

export function setAuthCookies(res: Response, tokens: AuthTokensOutput): void {
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: tokens.expiresIn * 1000,
    path: '/',
  });

  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth',
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });
}
