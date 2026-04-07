/**
 * App Module — Composition Root for NestJS.
 * The ONLY place that wires domain interfaces to infrastructure implementations.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

// ── Presentation ──
import { AuthController } from './presentation/rest/controllers/auth.controller';
import { ConnectionsController } from './presentation/rest/controllers/connections.controller';
import { AnalysisController } from './presentation/rest/controllers/analysis.controller';
import { HealthController } from './presentation/rest/controllers/health.controller';
import { AdminController } from './presentation/rest/controllers/admin.controller';
import { CorrelationIdMiddleware } from './presentation/rest/middleware/correlation-id.middleware';
import { AuditLogInterceptor } from './presentation/rest/interceptors/audit-log.interceptor';

// ── ORM Entities ──
import { TenantOrmEntity } from './infrastructure/persistence/entities/tenant.orm-entity';
import { UserOrmEntity } from './infrastructure/persistence/entities/user.orm-entity';
import { DbConnectionOrmEntity } from './infrastructure/persistence/entities/db-connection.orm-entity';
import { ProcedureOrmEntity } from './infrastructure/persistence/entities/procedure.orm-entity';
import { ProcedureVersionOrmEntity } from './infrastructure/persistence/entities/procedure-version.orm-entity';
import { DependencyOrmEntity } from './infrastructure/persistence/entities/dependency.orm-entity';
import { AnalysisJobOrmEntity } from './infrastructure/persistence/entities/analysis-job.orm-entity';
import { AuditLogOrmEntity } from './infrastructure/persistence/entities/audit-log.orm-entity';
import { DiscoveredSchemaOrmEntity } from './infrastructure/persistence/entities/discovered-schema.orm-entity';
import { DiscoveredTableOrmEntity } from './infrastructure/persistence/entities/discovered-table.orm-entity';
import { TableAccessOrmEntity } from './infrastructure/persistence/entities/table-access.orm-entity';

// ── Repository Implementations ──
import { TenantTypeOrmRepository } from './infrastructure/persistence/repositories/tenant.typeorm-repository';
import { UserTypeOrmRepository } from './infrastructure/persistence/repositories/user.typeorm-repository';
import { AuditLogTypeOrmRepository } from './infrastructure/persistence/repositories/audit-log.typeorm-repository';
import { ConnectionTypeOrmRepository } from './infrastructure/persistence/repositories/connection.typeorm-repository';
import { AnalysisJobTypeOrmRepository } from './infrastructure/persistence/repositories/analysis-job.typeorm-repository';
import { DiscoveredSchemaTypeOrmRepository } from './infrastructure/persistence/repositories/discovered-schema.typeorm-repository';
import { DiscoveredTableTypeOrmRepository } from './infrastructure/persistence/repositories/discovered-table.typeorm-repository';
import { ProcedureTypeOrmRepository } from './infrastructure/persistence/repositories/procedure.typeorm-repository';
import { DependencyTypeOrmRepository } from './infrastructure/persistence/repositories/dependency.typeorm-repository';
import { TableAccessTypeOrmRepository } from './infrastructure/persistence/repositories/table-access.typeorm-repository';

// ── Infrastructure Services ──
import { BcryptHasher } from './infrastructure/security/bcrypt-hasher';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';
import { HttpParsingEngine } from './infrastructure/parsing-client/http-parsing-engine';
import { DbConnectorFactory } from './infrastructure/connectors/db-connector.factory';
import { RolesGuard } from './presentation/rest/guards/roles.guard';
import { UserThrottlerGuard } from './presentation/rest/guards/user-throttler.guard';

// ── Domain Repository Tokens & Interfaces ──
import { TENANT_REPOSITORY, ITenantRepository } from './domain/repositories/tenant.repository';
import { USER_REPOSITORY, IUserRepository } from './domain/repositories/user.repository';
import { AUDIT_LOG_REPOSITORY, IAuditLogRepository } from './domain/repositories/audit-log.repository';
import { CONNECTION_REPOSITORY, IConnectionRepository } from './domain/repositories/connection.repository';
import { ANALYSIS_JOB_REPOSITORY, IAnalysisJobRepository } from './domain/repositories/analysis-job.repository';
import { DISCOVERED_SCHEMA_REPOSITORY } from './domain/repositories/discovered-schema.repository';
import { DISCOVERED_TABLE_REPOSITORY } from './domain/repositories/discovered-table.repository';
import { PROCEDURE_REPOSITORY, IProcedureRepository } from './domain/repositories/procedure.repository';
import { DEPENDENCY_REPOSITORY, IDependencyRepository } from './domain/repositories/dependency.repository';
import { TABLE_ACCESS_REPOSITORY } from './domain/repositories/table-access.repository';

// ── Cache ──
import { RedisCacheModule } from './infrastructure/cache/redis-cache.module';
import { RedisCacheService } from './infrastructure/cache/redis-cache.service';
import { CACHE_SERVICE, ICacheService } from './application/ports/cache.port';

// ── Application Port Tokens ──
import { HASHER, IHasher } from './application/ports/hasher.port';
import { PARSING_ENGINE, IParsingEngine } from './application/ports/parsing-engine.port';
import { DB_CONNECTOR, IDbConnector } from './application/ports/db-connector.port';
import { CREDENTIAL_SERVICE, ICredentialService } from './application/ports/credential.port';
import { CredentialEncryptionService } from './infrastructure/security/credential-encryption.service';
import { VaultCredentialService } from './infrastructure/security/vault-credential.service';
import { AwsSecretsCredentialService } from './infrastructure/security/aws-secrets-credential.service';

// ── Use Cases ──
import { LoginUseCase } from './application/use-cases/auth/login.use-case';
import { RegisterUseCase } from './application/use-cases/auth/register.use-case';
import { SetupUseCase } from './application/use-cases/auth/setup.use-case';
import { GetSystemStatusUseCase } from './application/use-cases/auth/get-system-status.use-case';
import { CreateConnectionUseCase } from './application/use-cases/connections/create-connection.use-case';
import { TestConnectionUseCase } from './application/use-cases/connections/test-connection.use-case';
import { ListConnectionsUseCase } from './application/use-cases/connections/list-connections.use-case';
import { DeleteConnectionUseCase } from './application/use-cases/connections/delete-connection.use-case';
import { StartAnalysisUseCase } from './application/use-cases/analysis/start-analysis.use-case';
import { GetDependencyGraphUseCase } from './application/use-cases/analysis/get-dependency-graph.use-case';
import { RotateCredentialsUseCase } from './application/use-cases/admin/rotate-credentials.use-case';
import { GetDashboardStatsUseCase } from './application/use-cases/dashboard/get-dashboard-stats.use-case';
import { JwtPayload, AuthTokensOutput } from './application/dto/auth.dto';

const ORM_ENTITIES = [
  TenantOrmEntity, UserOrmEntity, DbConnectionOrmEntity,
  ProcedureOrmEntity, ProcedureVersionOrmEntity, DependencyOrmEntity,
  AnalysisJobOrmEntity, AuditLogOrmEntity,
  DiscoveredSchemaOrmEntity, DiscoveredTableOrmEntity, TableAccessOrmEntity,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.getOrThrow('DB_USERNAME'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.get('DB_DATABASE', 'sqlatlas'),
        entities: ORM_ENTITIES,
        synchronize: config.get('NODE_ENV') === 'development',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature(ORM_ENTITIES),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    RedisCacheModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_EXPIRATION', '15m'),
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController, ConnectionsController, AnalysisController, HealthController, AdminController],
  providers: [
    // ── JWT Strategy ──
    JwtStrategy,

    // ── Global Guards (order matters: Auth first, then Roles, then Throttler) ──
    { provide: APP_GUARD, useClass: UserThrottlerGuard },

    // ── Global Interceptors ──
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },

    // ── Repository bindings: Symbol → Implementation ──
    { provide: TENANT_REPOSITORY, useClass: TenantTypeOrmRepository },
    { provide: USER_REPOSITORY, useClass: UserTypeOrmRepository },
    { provide: AUDIT_LOG_REPOSITORY, useClass: AuditLogTypeOrmRepository },
    { provide: CONNECTION_REPOSITORY, useClass: ConnectionTypeOrmRepository },
    { provide: ANALYSIS_JOB_REPOSITORY, useClass: AnalysisJobTypeOrmRepository },
    { provide: DISCOVERED_SCHEMA_REPOSITORY, useClass: DiscoveredSchemaTypeOrmRepository },
    { provide: DISCOVERED_TABLE_REPOSITORY, useClass: DiscoveredTableTypeOrmRepository },
    { provide: PROCEDURE_REPOSITORY, useClass: ProcedureTypeOrmRepository },
    { provide: DEPENDENCY_REPOSITORY, useClass: DependencyTypeOrmRepository },
    { provide: TABLE_ACCESS_REPOSITORY, useClass: TableAccessTypeOrmRepository },

    // ── Service bindings ──
    { provide: CACHE_SERVICE, useClass: RedisCacheService },
    { provide: HASHER, useClass: BcryptHasher },
    { provide: DB_CONNECTOR, useClass: DbConnectorFactory },
    {
      provide: CREDENTIAL_SERVICE,
      useFactory: async (config: ConfigService) => {
        const backend = config.get<string>('CREDENTIAL_BACKEND', 'aes');
        let service: ICredentialService & { onModuleInit?: () => void };
        switch (backend) {
          case 'vault':
            service = new VaultCredentialService(config);
            break;
          case 'aws':
            service = new AwsSecretsCredentialService(config);
            break;
          case 'aes':
          default:
            service = new CredentialEncryptionService(config);
            break;
        }
        if (service.onModuleInit) {
          service.onModuleInit();
        }
        return service;
      },
      inject: [ConfigService],
    },
    {
      provide: PARSING_ENGINE,
      useFactory: (config: ConfigService) =>
        new HttpParsingEngine(
          config.get('PARSING_ENGINE_URL', 'http://localhost:8100'),
          config.get('PARSING_ENGINE_API_KEY', ''),
        ),
      inject: [ConfigService],
    },

    // ── Use Cases ──
    {
      provide: LoginUseCase,
      useFactory: (userRepo: IUserRepository, tenantRepo: ITenantRepository, auditRepo: IAuditLogRepository, hasher: IHasher, jwtService: JwtService, config: ConfigService) => {
        const generateTokens = (payload: JwtPayload): AuthTokensOutput => ({
          accessToken: jwtService.sign({ ...payload, type: 'access' }),
          refreshToken: jwtService.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' }),
          expiresIn: 900,
        });
        const multiTenant = config.get('MULTI_TENANT', 'false') === 'true';
        return new LoginUseCase(userRepo, tenantRepo, auditRepo, hasher, generateTokens, multiTenant);
      },
      inject: [USER_REPOSITORY, TENANT_REPOSITORY, AUDIT_LOG_REPOSITORY, HASHER, JwtService, ConfigService],
    },
    {
      provide: RegisterUseCase,
      useFactory: (userRepo: IUserRepository, tenantRepo: ITenantRepository, hasher: IHasher, jwtService: JwtService) => {
        const generateTokens = (payload: JwtPayload): AuthTokensOutput => ({
          accessToken: jwtService.sign({ ...payload, type: 'access' }),
          refreshToken: jwtService.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' }),
          expiresIn: 900,
        });
        return new RegisterUseCase(userRepo, tenantRepo, hasher, generateTokens);
      },
      inject: [USER_REPOSITORY, TENANT_REPOSITORY, HASHER, JwtService],
    },
    {
      provide: SetupUseCase,
      useFactory: (userRepo: IUserRepository, tenantRepo: ITenantRepository, hasher: IHasher, jwtService: JwtService) => {
        const generateTokens = (payload: JwtPayload): AuthTokensOutput => ({
          accessToken: jwtService.sign({ ...payload, type: 'access' }),
          refreshToken: jwtService.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' }),
          expiresIn: 900,
        });
        return new SetupUseCase(userRepo, tenantRepo, hasher, generateTokens);
      },
      inject: [USER_REPOSITORY, TENANT_REPOSITORY, HASHER, JwtService],
    },
    {
      provide: GetSystemStatusUseCase,
      useFactory: (tenantRepo: ITenantRepository, config: ConfigService) => {
        const registrationMode = config.get<'closed' | 'invite-only' | 'open'>('REGISTRATION_MODE', 'closed');
        const multiTenant = config.get('MULTI_TENANT', 'false') === 'true';
        return new GetSystemStatusUseCase(tenantRepo, registrationMode, multiTenant);
      },
      inject: [TENANT_REPOSITORY, ConfigService],
    },
    {
      provide: CreateConnectionUseCase,
      useFactory: (connRepo: IConnectionRepository, tenantRepo: ITenantRepository, auditRepo: IAuditLogRepository, credService: ICredentialService) =>
        new CreateConnectionUseCase(connRepo, tenantRepo, auditRepo, credService),
      inject: [CONNECTION_REPOSITORY, TENANT_REPOSITORY, AUDIT_LOG_REPOSITORY, CREDENTIAL_SERVICE],
    },
    {
      provide: TestConnectionUseCase,
      useFactory: (connRepo: IConnectionRepository, dbConnector: IDbConnector, credService: ICredentialService) =>
        new TestConnectionUseCase(connRepo, dbConnector, credService),
      inject: [CONNECTION_REPOSITORY, DB_CONNECTOR, CREDENTIAL_SERVICE],
    },
    {
      provide: ListConnectionsUseCase,
      useFactory: (connRepo: IConnectionRepository) => new ListConnectionsUseCase(connRepo),
      inject: [CONNECTION_REPOSITORY],
    },
    {
      provide: DeleteConnectionUseCase,
      useFactory: (connRepo: IConnectionRepository, auditRepo: IAuditLogRepository) => new DeleteConnectionUseCase(connRepo, auditRepo),
      inject: [CONNECTION_REPOSITORY, AUDIT_LOG_REPOSITORY],
    },
    {
      provide: StartAnalysisUseCase,
      useFactory: (connRepo: any, jobRepo: any, procRepo: any, depRepo: any, tableAccessRepo: any, discoveredTableRepo: any, auditRepo: any, dbConnector: any, parsingEngine: any, credService: any, cache: ICacheService) =>
        new StartAnalysisUseCase(connRepo, jobRepo, procRepo, depRepo, tableAccessRepo, discoveredTableRepo, auditRepo, dbConnector, parsingEngine, credService, cache),
      inject: [
        CONNECTION_REPOSITORY, ANALYSIS_JOB_REPOSITORY, PROCEDURE_REPOSITORY,
        DEPENDENCY_REPOSITORY, TABLE_ACCESS_REPOSITORY, DISCOVERED_TABLE_REPOSITORY,
        AUDIT_LOG_REPOSITORY, DB_CONNECTOR, PARSING_ENGINE, CREDENTIAL_SERVICE, CACHE_SERVICE,
      ],
    },
    {
      provide: GetDependencyGraphUseCase,
      useFactory: (depRepo: IDependencyRepository, cache: ICacheService) => new GetDependencyGraphUseCase(depRepo, cache),
      inject: [DEPENDENCY_REPOSITORY, CACHE_SERVICE],
    },
    {
      provide: GetDashboardStatsUseCase,
      useFactory: (connRepo: IConnectionRepository, procRepo: IProcedureRepository, jobRepo: IAnalysisJobRepository) =>
        new GetDashboardStatsUseCase(connRepo, procRepo, jobRepo),
      inject: [CONNECTION_REPOSITORY, PROCEDURE_REPOSITORY, ANALYSIS_JOB_REPOSITORY],
    },
    {
      provide: RotateCredentialsUseCase,
      useFactory: (connRepo: IConnectionRepository, credService: ICredentialService) =>
        new RotateCredentialsUseCase(connRepo, credService),
      inject: [CONNECTION_REPOSITORY, CREDENTIAL_SERVICE],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
