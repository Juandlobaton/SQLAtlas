import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MockMsalService } from './mock-msal.service';

@ApiExcludeController()
@Controller('mock-oauth')
export class MockOAuthController {
  constructor(private readonly mockMsal: MockMsalService) {}

  @Get('authorize')
  authorize(
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }

    const users = this.mockMsal.getMockUsers();
    const callbackBase = `/api/v1/mock-oauth/callback?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state || '')}`;

    const userCards = users
      .map(
        (u, i) => `
      <a href="${callbackBase}&user_index=${i}" class="user-card">
        <div class="avatar">${u.displayName.charAt(0)}</div>
        <div class="info">
          <div class="name">${u.displayName}</div>
          <div class="email">${u.email}</div>
          <div class="oid">OID: ${u.oid}</div>
        </div>
      </a>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock OAuth — Select Account</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 12px;
      padding: 40px;
      width: 420px;
      max-width: 95vw;
    }
    .badge {
      display: inline-block;
      background: #e94560;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .subtitle {
      color: #8a8a9a;
      font-size: 13px;
      margin-bottom: 28px;
    }
    .user-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid #0f3460;
      border-radius: 8px;
      margin-bottom: 10px;
      text-decoration: none;
      color: inherit;
      transition: background 0.15s, border-color 0.15s;
    }
    .user-card:hover {
      background: #0f3460;
      border-color: #e94560;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #533483;
      display: flex;
      justify-content: center;
      align-items: center;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
    }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 14px; }
    .email { font-size: 12px; color: #8a8a9a; margin-top: 2px; }
    .oid { font-size: 10px; color: #555; margin-top: 2px; font-family: monospace; }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 11px;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Mock OAuth Server</div>
    <h1>Pick an account</h1>
    <p class="subtitle">Select a mock identity to sign in with. No real credentials required.</p>
    ${userCards}
    <div class="footer">
      This is a local development mock. It does not connect to any external identity provider.
    </div>
  </div>
</body>
</html>`;

    res.type('html').send(html);
  }

  @Get('callback')
  callback(
    @Query('user_index') userIndex: string | undefined,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }
    const idx = parseInt(userIndex || '', 10);
    if (isNaN(idx) || idx < 0 || idx >= this.mockMsal.getMockUsers().length) {
      throw new BadRequestException('Invalid user selection');
    }

    const code = this.mockMsal.generateCode(idx);
    const params = new URLSearchParams({ code });
    if (state) params.set('state', state);

    res.redirect(`${redirectUri}?${params}`);
  }
}
