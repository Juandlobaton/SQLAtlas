import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './presentation/rest/filters/all-exceptions.filter';
import { SetupUseCase } from './application/use-cases/auth/setup.use-case';
import { GetSystemStatusUseCase } from './application/use-cases/auth/get-system-status.use-case';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  // Global prefix
  const prefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(prefix, { exclude: ['health'] });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Auto-setup from ENV vars (for Docker/CI deploys)
  await autoSetupFromEnv(app);

  // Swagger (dev only)
  if (['development', 'local'].includes(process.env.NODE_ENV || '')) {
    const config = new DocumentBuilder()
      .setTitle('SQLAtlas API')
      .setDescription('Open-source platform to map, analyze, and document stored procedures across SQL Server, PostgreSQL, and Oracle')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication & registration')
      .addTag('Connections', 'Database connection management')
      .addTag('Analysis', 'SP analysis & dependency graphs')
      .addTag('Health', 'Service health checks')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`SQLAtlas API Gateway running on port ${port}`);
  console.log(`API: http://localhost:${port}/${prefix}`);
  if (['development', 'local'].includes(process.env.NODE_ENV || '')) {
    console.log(`Swagger: http://localhost:${port}/docs`);
  }
}

async function autoSetupFromEnv(app: any): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;

  const statusUseCase = app.get(GetSystemStatusUseCase);
  const status = await statusUseCase.execute();
  if (!status.needsSetup) return;

  const setupUseCase = app.get(SetupUseCase);
  try {
    await setupUseCase.execute({
      email: adminEmail,
      password: adminPassword,
      displayName: process.env.ADMIN_DISPLAY_NAME || 'Admin',
      orgName: process.env.ORG_NAME || 'Default',
    });
    console.log(`Auto-setup complete: admin user created (${adminEmail})`);
  } catch (error: any) {
    console.error('Auto-setup failed:', error.message);
  }
}

bootstrap();
