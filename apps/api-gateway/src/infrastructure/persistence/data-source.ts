import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Load .env manually without dotenv dependency (NestJS uses ConfigModule)
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

import { TenantOrmEntity } from './entities/tenant.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';
import { DbConnectionOrmEntity } from './entities/db-connection.orm-entity';
import { ProcedureOrmEntity } from './entities/procedure.orm-entity';
import { ProcedureVersionOrmEntity } from './entities/procedure-version.orm-entity';
import { DependencyOrmEntity } from './entities/dependency.orm-entity';
import { AnalysisJobOrmEntity } from './entities/analysis-job.orm-entity';
import { AuditLogOrmEntity } from './entities/audit-log.orm-entity';
import { DiscoveredSchemaOrmEntity } from './entities/discovered-schema.orm-entity';
import { DiscoveredTableOrmEntity } from './entities/discovered-table.orm-entity';
import { TableAccessOrmEntity } from './entities/table-access.orm-entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'sqlatlas',
  password: process.env.DB_PASSWORD || 'changeme',
  database: process.env.DB_DATABASE || 'sqlatlas',
  entities: [
    TenantOrmEntity,
    UserOrmEntity,
    DbConnectionOrmEntity,
    ProcedureOrmEntity,
    ProcedureVersionOrmEntity,
    DependencyOrmEntity,
    AnalysisJobOrmEntity,
    AuditLogOrmEntity,
    DiscoveredSchemaOrmEntity,
    DiscoveredTableOrmEntity,
    TableAccessOrmEntity,
  ],
  migrations: ['src/infrastructure/persistence/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
