import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { MsalUserInfo } from '../msal.service';

export interface MockUser {
  oid: string;
  email: string;
  displayName: string;
}

const MOCK_USERS: MockUser[] = [
  { oid: 'mock-oid-owner-001', email: 'owner@mock.local', displayName: 'Mock Owner' },
  { oid: 'mock-oid-admin-001', email: 'admin@mock.local', displayName: 'Mock Admin' },
  { oid: 'mock-oid-analyst-001', email: 'analyst@mock.local', displayName: 'Mock Analyst' },
  { oid: 'mock-oid-viewer-001', email: 'viewer@mock.local', displayName: 'Mock Viewer' },
];

@Injectable()
export class MockMsalService {
  private readonly codeStore = new Map<string, { user: MockUser; expiresAt: number }>();
  private readonly redirectUri: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.redirectUri = this.config.get(
      'AZURE_AD_REDIRECT_URI',
      'http://localhost:3000/api/v1/auth/microsoft/callback',
    );
    this.baseUrl = `http://localhost:${this.config.get('PORT', 3000)}`;
  }

  isConfigured(): boolean {
    return true;
  }

  async getAuthorizationUrl(state?: string): Promise<{ url: string; verifier: string }> {
    const verifier = `mock-verifier-${randomUUID()}`;
    const params = new URLSearchParams({
      redirect_uri: this.redirectUri,
      state: state || '',
    });
    return {
      url: `${this.baseUrl}/api/v1/mock-oauth/authorize?${params}`,
      verifier,
    };
  }

  async acquireTokenByCode(code: string, _verifier: string): Promise<MsalUserInfo> {
    const entry = this.codeStore.get(code);
    if (!entry) {
      throw new Error('Invalid or expired authorization code');
    }
    if (Date.now() > entry.expiresAt) {
      this.codeStore.delete(code);
      throw new Error('Authorization code expired');
    }
    this.codeStore.delete(code);
    return { oid: entry.user.oid, email: entry.user.email, displayName: entry.user.displayName };
  }

  generateCode(userIndex: number): string {
    const user = MOCK_USERS[userIndex];
    if (!user) throw new Error(`Invalid mock user index: ${userIndex}`);
    const code = `mock-code-${randomUUID()}`;
    this.codeStore.set(code, { user, expiresAt: Date.now() + 5 * 60 * 1000 });
    return code;
  }

  getMockUsers(): readonly MockUser[] {
    return MOCK_USERS;
  }
}
