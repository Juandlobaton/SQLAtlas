import { IsOptional, IsBoolean, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConnectionOptionsDto {
  @IsOptional()
  @IsBoolean()
  useSsl?: boolean;

  @IsOptional()
  @IsString()
  sslCaCert?: string;

  @IsOptional()
  @IsNumber()
  connectionTimeout?: number;

  @IsOptional()
  @IsNumber()
  requestTimeout?: number;
}

export interface CreateConnectionInput {
  tenantId: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  useSsl?: boolean;
  connectionOptions?: ConnectionOptionsDto;
  createdBy: string;
}

export interface UpdateConnectionInput {
  name?: string;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  connectionOptions?: ConnectionOptionsDto;
}

export interface ConnectionOutput {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  useSsl: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  isActive: boolean;
  createdAt: string;
}
