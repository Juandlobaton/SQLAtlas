import { BadRequestException } from '@nestjs/common';
import * as net from 'net';

const BLOCKED_RANGES = [
  /^127\./,                    // loopback
  /^10\./,                     // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918
  /^192\.168\./,               // RFC 1918
  /^169\.254\./,               // link-local / cloud metadata
  /^0\./,                      // current network
  /^::1$/,                     // IPv6 loopback
  /^fc00:/i,                   // IPv6 ULA
  /^fe80:/i,                   // IPv6 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
];

export function validateHost(host: string): void {
  // Skip validation in development to allow localhost connections
  if (process.env.NODE_ENV === 'development') return;

  const lower = host.toLowerCase().trim();

  if (BLOCKED_HOSTNAMES.includes(lower)) {
    throw new BadRequestException('Connection to this host is not allowed');
  }

  if (net.isIP(lower)) {
    for (const range of BLOCKED_RANGES) {
      if (range.test(lower)) {
        throw new BadRequestException('Connection to private/internal addresses is not allowed');
      }
    }
  }
}
