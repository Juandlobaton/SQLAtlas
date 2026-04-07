import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtPayload } from '../../../application/dto/auth.dto';
import { UserRole } from '../../../domain/entities/user.entity';
import { StartAnalysisUseCase } from '../../../application/use-cases/analysis/start-analysis.use-case';
import { GetDependencyGraphUseCase } from '../../../application/use-cases/analysis/get-dependency-graph.use-case';
import { Inject } from '@nestjs/common';
import { PROCEDURE_REPOSITORY, IProcedureRepository } from '../../../domain/repositories/procedure.repository';
import { ANALYSIS_JOB_REPOSITORY, IAnalysisJobRepository } from '../../../domain/repositories/analysis-job.repository';
import { DISCOVERED_TABLE_REPOSITORY, IDiscoveredTableRepository } from '../../../domain/repositories/discovered-table.repository';
import { CACHE_SERVICE, ICacheService } from '../../../application/ports/cache.port';

class StartAnalysisDto {
  @IsString()
  connectionId!: string;

  @IsOptional()
  @IsArray()
  schemas?: string[];

  @IsOptional()
  @IsArray()
  objectTypes?: string[];
}

@ApiTags('Analysis')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly startAnalysisUseCase: StartAnalysisUseCase,
    private readonly getDependencyGraphUseCase: GetDependencyGraphUseCase,
    @Inject(PROCEDURE_REPOSITORY) private readonly procedureRepo: IProcedureRepository,
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepo: IAnalysisJobRepository,
    @Inject(DISCOVERED_TABLE_REPOSITORY) private readonly tableRepo: IDiscoveredTableRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  @Post('start')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.ANALYST)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start database analysis' })
  async startAnalysis(
    @Body() dto: StartAnalysisDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.startAnalysisUseCase.execute({
      tenantId: user.tenantId,
      connectionId: dto.connectionId,
      triggeredBy: user.sub,
      schemas: dto.schemas,
      objectTypes: dto.objectTypes,
    });

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('procedures/:connectionId')
  @ApiOperation({ summary: 'List procedures for a connection' })
  async listProcedures(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('schema') schema: string | undefined,
    @Query('type') objectType: string | undefined,
    @Query('securityOnly') securityOnly: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? Math.min(parseInt(limit, 10), 1000) : 50;
    const cacheKey = `procedures:${connectionId}:${p}:${l}:${search || ''}:${schema || ''}:${objectType || ''}:${securityOnly || ''}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-correlation-id'],
      };
    }

    const result = await this.procedureRepo.findByConnection(
      user.tenantId,
      connectionId,
      {
        search: search || undefined,
        schemaName: schema || undefined,
        objectType: objectType || undefined,
        hasSecurityIssues: securityOnly === 'true' ? true : undefined,
      },
      {
        page: p,
        limit: l,
        sortBy: 'objectName',
        sortOrder: 'asc',
      },
    );

    await this.cache.set(cacheKey, result, 2 * 60 * 1000); // 2 min TTL

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('procedures/:connectionId/:procedureId')
  @ApiOperation({ summary: 'Get a single procedure with full details' })
  async getProcedure(
    @Param('procedureId', ParseUUIDPipe) procedureId: string,
    @Req() req: Request,
  ) {
    const procedure = await this.procedureRepo.findById(procedureId);
    return {
      success: true,
      data: procedure,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('jobs/:connectionId')
  @ApiOperation({ summary: 'List analysis jobs for a connection' })
  async listJobs(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Req() req: Request,
  ) {
    const jobs = await this.jobRepo.findByConnection(connectionId);
    return {
      success: true,
      data: jobs,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('graph/:connectionId')
  @ApiOperation({ summary: 'Get dependency graph for a connection' })
  async getDependencyGraph(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query('rootId') rootId: string | undefined,
    @Query('maxDepth') maxDepth: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const depth = maxDepth ? Math.min(parseInt(maxDepth, 10), 20) : undefined;
    const result = await this.getDependencyGraphUseCase.execute({
      tenantId: user.tenantId,
      connectionId,
      rootProcedureId: rootId,
      maxDepth: depth,
    });

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('tables/:connectionId')
  @ApiOperation({ summary: 'List tables for a connection' })
  async listTables(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query('schema') schema: string | undefined,
    @Query('search') search: string | undefined,
    @Query('type') tableType: string | undefined,
    @Req() req: Request,
  ) {
    const tables = await this.tableRepo.findByConnection(connectionId, {
      schemaName: schema || undefined,
      search: search || undefined,
      tableType: tableType || undefined,
    });

    return {
      success: true,
      data: tables,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('tables/:connectionId/:tableId')
  @ApiOperation({ summary: 'Get table detail with accessing procedures' })
  async getTableDetail(
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Req() req: Request,
  ) {
    const table = await this.tableRepo.findById(tableId);
    const accessedBy = table ? await this.tableRepo.getProceduresAccessingTable(tableId) : [];

    return {
      success: true,
      data: { table, accessedBy },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }

  @Get('er-diagram/:connectionId')
  @ApiOperation({ summary: 'Get ER diagram data (tables + FK relationships)' })
  async getERDiagram(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query('schema') schema: string | undefined,
    @Req() req: Request,
  ) {
    const tables = await this.tableRepo.findByConnection(connectionId, {
      schemaName: schema || undefined,
    });

    const erTables = tables.map(t => ({
      id: t.id,
      schemaName: t.schemaName,
      tableName: t.tableName,
      fullQualifiedName: t.fullQualifiedName,
      columns: t.columns.map(c => ({
        name: c.columnName,
        type: c.dataType,
        isPK: c.isPrimaryKey,
        isFK: c.isForeignKey,
        isNullable: c.isNullable,
      })),
      estimatedRowCount: t.estimatedRowCount,
    }));

    // Build relationships from FKs
    const tableIdByFQN = new Map<string, string>();
    for (const t of tables) {
      tableIdByFQN.set(t.fullQualifiedName, t.id);
      tableIdByFQN.set(t.fullQualifiedName.toLowerCase(), t.id);
    }

    const relationships: {
      id: string; constraintName: string;
      sourceTableId: string; sourceColumns: string[];
      targetTableId: string; targetColumns: string[];
      onDelete: string; onUpdate: string;
    }[] = [];

    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        const targetId = tableIdByFQN.get(fk.referencedTable) || tableIdByFQN.get(fk.referencedTable.toLowerCase());
        if (targetId) {
          relationships.push({
            id: `${t.id}-${fk.constraintName}`,
            constraintName: fk.constraintName,
            sourceTableId: t.id,
            sourceColumns: fk.columns,
            targetTableId: targetId,
            targetColumns: fk.referencedColumns,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
          });
        }
      }
    }

    return {
      success: true,
      data: { tables: erTables, relationships },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id'],
    };
  }
}
