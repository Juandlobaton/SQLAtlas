import { Logger } from '@nestjs/common';
import { StartAnalysisInput } from '../../dto/analysis.dto';
import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { IAnalysisJobRepository } from '../../../domain/repositories/analysis-job.repository';
import { IProcedureRepository } from '../../../domain/repositories/procedure.repository';
import { IDependencyRepository } from '../../../domain/repositories/dependency.repository';
import { ITableAccessRepository } from '../../../domain/repositories/table-access.repository';
import { IDiscoveredTableRepository } from '../../../domain/repositories/discovered-table.repository';
import { IDiscoveredSchemaRepository } from '../../../domain/repositories/discovered-schema.repository';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { IDbConnector, ExtractedObject } from '../../ports/db-connector.port';
import { IParsingEngine, ParseEngineResult } from '../../ports/parsing-engine.port';
import { ICredentialService } from '../../ports/credential.port';
import { ICacheService } from '../../ports/cache.port';
import { AnalysisStatus } from '../../../domain/entities/analysis-job.entity';
import { ObjectType } from '../../../domain/entities/procedure.entity';
import { DependencyType } from '../../../domain/entities/dependency.entity';
import { TableOperation } from '../../../domain/entities/table-access.entity';
import { TableType } from '../../../domain/entities/discovered-table.entity';
import type { CreateProcedure, CreateDependency, CreateTableAccess, CreateDiscoveredTable } from '../../../domain/types';
import { slugify } from '../../../shared/utils/slugify';

const BATCH_SIZE = 100;

export class StartAnalysisUseCase {
  private readonly logger = new Logger(StartAnalysisUseCase.name);

  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly jobRepo: IAnalysisJobRepository,
    private readonly procedureRepo: IProcedureRepository,
    private readonly dependencyRepo: IDependencyRepository,
    private readonly tableAccessRepo: ITableAccessRepository,
    private readonly discoveredTableRepo: IDiscoveredTableRepository,
    private readonly discoveredSchemaRepo: IDiscoveredSchemaRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly dbConnector: IDbConnector,
    private readonly parsingEngine: IParsingEngine,
    private readonly credentialService: ICredentialService,
    private readonly cache: ICacheService,
  ) {}

  async execute(input: StartAnalysisInput): Promise<{ jobId: string }> {
    const connection = await this.connectionRepo.findById(input.connectionId);
    if (!connection) {
      throw new AnalysisError('Connection not found');
    }

    const runningJob = await this.jobRepo.findRunningByConnection(input.connectionId);
    if (runningJob) {
      throw new AnalysisError('An analysis is already running for this connection');
    }

    const job = await this.jobRepo.create({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      status: AnalysisStatus.PENDING,
      progress: 0,
      totalObjects: null,
      processedObjects: 0,
      errorMessage: null,
      errorDetails: null,
      startedAt: new Date(),
      completedAt: null,
      triggeredBy: input.triggeredBy,
    });

    await this.auditRepo.create({
      tenantId: input.tenantId,
      userId: input.triggeredBy,
      action: 'analysis.start',
      resourceType: 'analysis_job',
      resourceId: job.id,
      details: { connectionId: input.connectionId, connectionName: connection.name },
      ipAddress: null,
      userAgent: null,
    });

    this.runAnalysis(job.id, connection, input).catch((err) => {
      this.logger.error(`Analysis ${job.id} failed`, err?.stack);
    });

    return { jobId: job.id };
  }

  private async runAnalysis(jobId: string, connection: any, input: StartAnalysisInput) {
    const tenantId = input.tenantId;
    const connectionId = input.connectionId;

    try {
      // ── Phase 1: Extract objects from target database ──
      this.logger.log(`[${jobId}] Phase 1: Extracting from ${connection.name}...`);
      await this.jobRepo.updateStatus(jobId, AnalysisStatus.EXTRACTING, 5);

      const password = connection.encryptedPassword
        ? await this.credentialService.decrypt(connection.encryptedPassword)
        : '';

      const objects = await this.dbConnector.extractProcedures(
        {
          engine: connection.engine,
          host: connection.host,
          port: connection.port,
          database: connection.databaseName,
          username: connection.username,
          password,
          useSsl: connection.useSsl,
        },
        input.schemas,
      );

      this.logger.log(`[${jobId}] Extracted ${objects.length} objects`);

      // ── Phase 1b: Extract table metadata ──
      try {
        this.logger.log(`[${jobId}] Phase 1b: Extracting table metadata...`);
        const tableMetadata = await this.dbConnector.extractTableMetadata(
          {
            engine: connection.engine,
            host: connection.host,
            port: connection.port,
            database: connection.databaseName,
            username: connection.username,
            password,
            useSsl: connection.useSsl,
          },
          input.schemas,
        );

        if (tableMetadata.length > 0) {
          // Create discovered_schemas FIRST (required by FK on discovered_tables)
          const schemaIdMap = new Map<string, string>();
          const uniqueSchemas = new Set(tableMetadata.map(t => t.schemaName));
          for (const schemaName of uniqueSchemas) {
            const schema = await this.discoveredSchemaRepo.upsert({
              tenantId,
              connectionId,
              schemaName,
              slug: slugify(schemaName),
              catalogName: null,
              objectCounts: { procedures: 0, functions: 0, triggers: 0, views: 0, tables: 0, sequences: 0, indexes: 0 },
              sizeBytes: null,
              owner: null,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
            });
            schemaIdMap.set(schemaName, schema.id);
          }
          this.logger.log(`[${jobId}] Created ${schemaIdMap.size} schema records`);

          const tablesToUpsert: CreateDiscoveredTable[] = tableMetadata.map(t => ({
            tenantId,
            connectionId,
            schemaId: schemaIdMap.get(t.schemaName)!,
            schemaName: t.schemaName,
            tableName: t.tableName,
            slug: slugify(`${t.schemaName}.${t.tableName}`),
            fullQualifiedName: `${t.schemaName}.${t.tableName}`,
            tableType: (t.tableType === 'materialized_view' ? TableType.MATERIALIZED_VIEW : t.tableType === 'view' ? TableType.VIEW : TableType.TABLE),
            estimatedRowCount: t.estimatedRowCount,
            sizeBytes: null,
            columns: t.columns.map((c, i) => ({
              columnName: c.columnName,
              dataType: c.dataType,
              ordinalPosition: c.ordinalPosition || i + 1,
              isNullable: c.isNullable,
              defaultValue: c.defaultValue,
              isPrimaryKey: t.primaryKey.includes(c.columnName),
              isForeignKey: t.foreignKeys.some(fk => fk.columns.includes(c.columnName)),
              maxLength: c.maxLength,
              precision: c.precision,
              scale: c.scale,
              description: null,
            })),
            primaryKey: t.primaryKey,
            foreignKeys: t.foreignKeys.map(fk => ({
              constraintName: fk.constraintName,
              columns: fk.columns,
              referencedTable: `${fk.referencedSchema}.${fk.referencedTable}`,
              referencedColumns: fk.referencedColumns,
              onDelete: fk.onDelete,
              onUpdate: fk.onUpdate,
            })),
            indexes: t.indexes,
            referencedByCount: 0,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            isDeleted: false,
          }));

          const tableCount = await this.discoveredTableRepo.bulkUpsert(tablesToUpsert);
          this.logger.log(`[${jobId}] Stored ${tableCount} table metadata records`);
        }
      } catch (err) {
        this.logger.warn(`[${jobId}] Table metadata extraction failed (non-fatal): ${err}`);
      }

      await this.jobRepo.updateStatus(jobId, AnalysisStatus.PARSING, 15, 0);

      // ── Phase 2: Parse in batches via Parsing Engine ──
      this.logger.log(`[${jobId}] Phase 2: Parsing ${objects.length} objects in batches of ${BATCH_SIZE}...`);

      const allParsedObjects: { extracted: ExtractedObject; parsed: Record<string, unknown> }[] = [];
      let parseErrors = 0;

      for (let i = 0; i < objects.length; i += BATCH_SIZE) {
        const batch = objects.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(objects.length / BATCH_SIZE);

        const parseItems = batch.map((obj) => ({
          sql: obj.definition,
          dialect: connection.dialect,
        }));

        try {
          const batchResult = await this.parsingEngine.batchParse(parseItems);

          for (let j = 0; j < batch.length; j++) {
            const parseResult = batchResult.results[j];
            if (parseResult?.success && parseResult.data?.length > 0) {
              allParsedObjects.push({
                extracted: batch[j],
                parsed: parseResult.data[0],
              });
            } else {
              parseErrors++;
            }
          }
        } catch (err) {
          this.logger.warn(`[${jobId}] Batch ${batchNum} failed: ${err}`);
          parseErrors += batch.length;
        }

        const progress = 15 + Math.round((i / objects.length) * 50);
        await this.jobRepo.updateStatus(jobId, AnalysisStatus.PARSING, progress, i + batch.length);
        this.logger.log(`[${jobId}] Batch ${batchNum}/${totalBatches} done (${allParsedObjects.length} parsed, ${parseErrors} errors)`);
      }

      // ── Phase 3: Store procedures, dependencies, table accesses ──
      this.logger.log(`[${jobId}] Phase 3: Storing ${allParsedObjects.length} parsed objects...`);
      await this.jobRepo.updateStatus(jobId, AnalysisStatus.ANALYZING, 70, allParsedObjects.length);

      const storedProcedureIds: string[] = [];
      const storedProcedureMap = new Map<string, string>(); // name → UUID
      const allDependencies: CreateDependency[] = [];
      const allTableAccesses: CreateTableAccess[] = [];

      for (const { extracted, parsed } of allParsedObjects) {
        // 3a. Upsert procedure
        const procedureData: CreateProcedure = {
          tenantId,
          connectionId,
          schemaId: null,
          analysisJobId: jobId,
          objectType: this.mapObjectType(extracted.objectType),
          schemaName: extracted.schemaName,
          objectName: extracted.objectName,
          slug: slugify(`${extracted.schemaName}.${extracted.objectName}`),
          fullQualifiedName: `${extracted.schemaName}.${extracted.objectName}`,
          rawDefinition: extracted.definition,
          definitionHash: (parsed.definitionHash as string) || '',
          language: connection.dialect,
          parameters: (parsed.parameters as any[]) || [],
          returnType: (parsed.returnType as string) || null,
          isDeterministic: null,
          estimatedComplexity: (parsed.complexity as any)?.cyclomaticComplexity ?? null,
          lineCount: (parsed.lineCount as number) || 0,
          autoDoc: (parsed.autoDoc as Record<string, unknown>) || null,
          flowTree: (parsed.flowTree as Record<string, unknown>) || null,
          securityFindings: (parsed.securityFindings as any[]) || [],
          sourceCreatedAt: extracted.createdAt || null,
          sourceModifiedAt: extracted.modifiedAt || null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          isDeleted: false,
        };

        const procedure = await this.procedureRepo.upsert(procedureData);
        storedProcedureIds.push(procedure.id);

        // Register in lookup map (multiple keys for fuzzy matching)
        const fqn = `${extracted.schemaName}.${extracted.objectName}`;
        storedProcedureMap.set(fqn, procedure.id);
        storedProcedureMap.set(fqn.toLowerCase(), procedure.id);
        storedProcedureMap.set(extracted.objectName, procedure.id);
        storedProcedureMap.set(extracted.objectName.toLowerCase(), procedure.id);

        // 3b. Collect dependencies
        const deps = (parsed.dependencies as any[]) || [];
        for (const dep of deps) {
          allDependencies.push({
            tenantId,
            sourceId: procedure.id,
            targetId: null,
            targetExternalName: dep.targetName || null,
            dependencyType: this.mapDependencyType(dep.dependencyType),
            context: {
              lineNumber: dep.lineNumber,
              snippet: dep.snippet,
            },
            isDynamic: dep.isDynamic || false,
            confidence: dep.confidence || 0.5,
            analysisJobId: jobId,
          });
        }

        // 3c. Collect table accesses
        const tableRefs = (parsed.tableReferences as any[]) || [];
        for (const ref of tableRefs) {
          allTableAccesses.push({
            tenantId,
            procedureId: procedure.id,
            tableId: null,
            tableName: ref.tableName || ref.fullName || '',
            fullTableName: ref.fullName || ref.tableName || '',
            operation: (ref.operation as TableOperation) || TableOperation.SELECT,
            columns: [],
            lineNumber: ref.lineNumber || null,
            isTempTable: ref.isTempTable || false,
            isDynamic: false,
            confidence: 1.0,
            analysisJobId: jobId,
          });
        }
      }

      // 3d. Resolve dependency targets (match names to UUIDs)
      let resolvedCount = 0;
      for (const dep of allDependencies) {
        if (dep.targetExternalName) {
          const name = dep.targetExternalName;
          const resolved = storedProcedureMap.get(name)
            || storedProcedureMap.get(name.toLowerCase())
            || storedProcedureMap.get(name.split('.').pop() || '')
            || storedProcedureMap.get((name.split('.').pop() || '').toLowerCase())
            || null;
          if (resolved) {
            dep.targetId = resolved;
            resolvedCount++;
          }
        }
      }
      this.logger.log(`[${jobId}] Resolved ${resolvedCount}/${allDependencies.length} dependency targets`);

      // 3e. Bulk create dependencies
      if (allDependencies.length > 0) {
        const depCount = await this.dependencyRepo.bulkCreate(allDependencies);
        this.logger.log(`[${jobId}] Stored ${depCount} dependencies`);
      }

      // 3e. Bulk create table accesses
      if (allTableAccesses.length > 0) {
        const taCount = await this.tableAccessRepo.bulkCreate(allTableAccesses);
        this.logger.log(`[${jobId}] Stored ${taCount} table accesses`);
      }

      // 3f. Mark procedures not seen in this analysis as deleted
      if (storedProcedureIds.length > 0) {
        const deletedCount = await this.procedureRepo.markDeleted(connectionId, storedProcedureIds);
        if (deletedCount > 0) {
          this.logger.log(`[${jobId}] Marked ${deletedCount} stale procedures as deleted`);
        }
      }

      await this.jobRepo.updateStatus(jobId, AnalysisStatus.ANALYZING, 95, allParsedObjects.length);

      // ── Phase 4: Complete ──
      await this.jobRepo.complete(jobId, objects.length);
      this.logger.log(
        `[${jobId}] Analysis complete: ${storedProcedureIds.length} procedures, ` +
        `${allDependencies.length} dependencies, ${allTableAccesses.length} table accesses, ` +
        `${parseErrors} parse errors`,
      );

      // ── Invalidate caches for this connection ──
      await this.cache.delByPattern(`graph:${connectionId}:*`);
      await this.cache.delByPattern(`procedures:${connectionId}:*`);
      this.logger.log(`[${jobId}] Cache invalidated for connection ${connectionId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`[${jobId}] Analysis failed: ${message}`);
      await this.jobRepo.updateError(jobId, message);
    }
  }

  private mapObjectType(type: string): ObjectType {
    const map: Record<string, ObjectType> = {
      procedure: ObjectType.PROCEDURE,
      function: ObjectType.FUNCTION,
      trigger: ObjectType.TRIGGER,
      view: ObjectType.VIEW,
      package: ObjectType.PACKAGE,
    };
    return map[type?.toLowerCase()] || ObjectType.PROCEDURE;
  }

  private mapDependencyType(type: string): DependencyType {
    const map: Record<string, DependencyType> = {
      calls: DependencyType.CALLS,
      reads_from: DependencyType.READS_FROM,
      writes_to: DependencyType.WRITES_TO,
      references: DependencyType.REFERENCES,
    };
    return map[type?.toLowerCase()] || DependencyType.CALLS;
  }
}

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}
