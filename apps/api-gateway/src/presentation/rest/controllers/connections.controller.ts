import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, Min, Max } from 'class-validator';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtPayload } from '../../../application/dto/auth.dto';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateConnectionUseCase } from '../../../application/use-cases/connections/create-connection.use-case';
import { TestConnectionUseCase } from '../../../application/use-cases/connections/test-connection.use-case';
import { ListConnectionsUseCase } from '../../../application/use-cases/connections/list-connections.use-case';
import { DeleteConnectionUseCase } from '../../../application/use-cases/connections/delete-connection.use-case';
import { DbEngine } from '../../../domain/entities/db-connection.entity';

class CreateConnectionDto {
  @IsString()
  name!: string;

  @IsEnum(DbEngine)
  engine!: string;

  @IsString()
  host!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  databaseName!: string;

  @IsString()
  username!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsBoolean()
  useSsl?: boolean;
}

class TestConnectionDto {
  @IsString()
  password!: string;
}

@ApiTags('Connections')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly createConnectionUseCase: CreateConnectionUseCase,
    private readonly testConnectionUseCase: TestConnectionUseCase,
    private readonly listConnectionsUseCase: ListConnectionsUseCase,
    private readonly deleteConnectionUseCase: DeleteConnectionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all connections for current tenant' })
  async list(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const connections = await this.listConnectionsUseCase.execute(user.tenantId);
    return {
      success: true,
      data: connections,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a connection' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    await this.deleteConnectionUseCase.execute(id, user.tenantId, user.sub);
    return {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new database connection' })
  async create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.createConnectionUseCase.execute({
      tenantId: user.tenantId,
      name: dto.name,
      engine: dto.engine,
      host: dto.host,
      port: dto.port,
      databaseName: dto.databaseName,
      username: dto.username,
      password: dto.password,
      useSsl: dto.useSsl,
      createdBy: user.sub,
    });

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a database connection' })
  async test(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestConnectionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.testConnectionUseCase.execute(id, dto.password, user.tenantId);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }
}
