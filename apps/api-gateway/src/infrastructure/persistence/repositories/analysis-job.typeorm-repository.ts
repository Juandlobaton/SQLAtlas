import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AnalysisJob, AnalysisStatus } from '../../../domain/entities/analysis-job.entity';
import { IAnalysisJobRepository } from '../../../domain/repositories/analysis-job.repository';
import { AnalysisJobOrmEntity } from '../entities/analysis-job.orm-entity';

const RUNNING_STATUSES = [
  AnalysisStatus.PENDING,
  AnalysisStatus.EXTRACTING,
  AnalysisStatus.PARSING,
  AnalysisStatus.ANALYZING,
];

@Injectable()
export class AnalysisJobTypeOrmRepository implements IAnalysisJobRepository {
  constructor(
    @InjectRepository(AnalysisJobOrmEntity)
    private readonly repo: Repository<AnalysisJobOrmEntity>,
  ) {}

  async findById(id: string): Promise<AnalysisJob | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByConnection(connectionId: string): Promise<AnalysisJob[]> {
    const entities = await this.repo.find({
      where: { connectionId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findRunningByConnection(connectionId: string): Promise<AnalysisJob | null> {
    const entity = await this.repo.findOne({
      where: { connectionId, status: In(RUNNING_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async create(data: Omit<AnalysisJob, 'id' | 'createdAt'>): Promise<AnalysisJob> {
    const entity = this.repo.create({
      tenantId: data.tenantId,
      connectionId: data.connectionId,
      status: data.status,
      progress: data.progress,
      totalObjects: data.totalObjects,
      processedObjects: data.processedObjects,
      errorMessage: data.errorMessage,
      errorDetails: data.errorDetails,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      triggeredBy: data.triggeredBy,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async updateStatus(
    id: string,
    status: string,
    progress?: number,
    processedObjects?: number,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (progress !== undefined) update.progress = progress;
    if (processedObjects !== undefined) update.processedObjects = processedObjects;
    await this.repo.update(id, update);
  }

  async updateError(id: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.repo.update(id, {
      status: AnalysisStatus.FAILED,
      errorMessage: message,
      errorDetails: (details ?? null) as any,
      completedAt: new Date(),
    });
  }

  async complete(id: string, totalObjects: number): Promise<void> {
    await this.repo.update(id, {
      status: AnalysisStatus.COMPLETED,
      progress: 100,
      totalObjects,
      processedObjects: totalObjects,
      completedAt: new Date(),
    });
  }

  private toDomain(e: AnalysisJobOrmEntity): AnalysisJob {
    return new AnalysisJob(
      e.id, e.tenantId, e.connectionId, e.status as AnalysisStatus,
      e.progress, e.totalObjects, e.processedObjects, e.errorMessage,
      e.errorDetails, e.startedAt, e.completedAt, e.triggeredBy, e.createdAt,
    );
  }
}
