import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConfidentialClientApplication,
  Configuration,
  AuthorizationUrlRequest,
  AuthorizationCodeRequest,
  AuthenticationResult,
  CryptoProvider,
} from '@azure/msal-node';

export interface MsalUserInfo {
  oid: string;
  email: string;
  displayName: string;
}

@Injectable()
export class MsalService {
  private msalClient: ConfidentialClientApplication | null = null;
  private readonly cryptoProvider = new CryptoProvider();
  private readonly clientId: string;
  private readonly tenantId: string;
  private readonly redirectUri: string;
  private readonly scopes: string[];

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get('AZURE_AD_CLIENT_ID', '');
    this.tenantId = this.config.get('AZURE_AD_TENANT_ID', 'common');
    this.redirectUri = this.config.get('AZURE_AD_REDIRECT_URI', 'http://localhost:3000/api/v1/auth/microsoft/callback');
    this.scopes = this.config.get('AZURE_AD_SCOPES', 'openid profile email').split(' ');
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.config.get('AZURE_AD_CLIENT_SECRET'));
  }

  private getClient(): ConfidentialClientApplication {
    if (!this.msalClient) {
      const msalConfig: Configuration = {
        auth: {
          clientId: this.clientId,
          authority: `https://login.microsoftonline.com/${this.tenantId}`,
          clientSecret: this.config.getOrThrow('AZURE_AD_CLIENT_SECRET'),
        },
      };
      this.msalClient = new ConfidentialClientApplication(msalConfig);
    }
    return this.msalClient;
  }

  async getAuthorizationUrl(state?: string): Promise<{ url: string; verifier: string }> {
    const { verifier, challenge } = await this.cryptoProvider.generatePkceCodes();

    const authUrlRequest: AuthorizationUrlRequest = {
      scopes: this.scopes,
      redirectUri: this.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: state || '',
    };

    const url = await this.getClient().getAuthCodeUrl(authUrlRequest);
    return { url, verifier };
  }

  async acquireTokenByCode(code: string, verifier: string): Promise<MsalUserInfo> {
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: this.scopes,
      redirectUri: this.redirectUri,
      codeVerifier: verifier,
    };

    const response: AuthenticationResult = await this.getClient().acquireTokenByCode(tokenRequest);

    const claims = response.idTokenClaims as Record<string, unknown>;

    const oid = (claims.oid as string) || (claims.sub as string) || '';
    const email =
      (claims.preferred_username as string) ||
      (claims.email as string) ||
      (claims.upn as string) ||
      '';
    const displayName = (claims.name as string) || email.split('@')[0] || 'User';

    if (!oid || !email) {
      throw new Error('Microsoft token missing required claims (oid, email)');
    }

    return { oid, email: email.toLowerCase(), displayName };
  }
}

export const MSAL_SERVICE = Symbol('MsalService');
