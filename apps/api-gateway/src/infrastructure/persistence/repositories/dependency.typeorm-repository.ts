import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dependency, DependencyType } from '../../../domain/entities/dependency.entity';
import {
  IDependencyRepository,
  GraphNode,
  GraphEdge,
} from '../../../domain/repositories/dependency.repository';
import { DependencyOrmEntity } from '../entities/dependency.orm-entity';
import { ProcedureOrmEntity } from '../entities/procedure.orm-entity';

@Injectable()
export class DependencyTypeOrmRepository implements IDependencyRepository {
  constructor(
    @InjectRepository(DependencyOrmEntity)
    private readonly repo: Repository<DependencyOrmEntity>,
    @InjectRepository(ProcedureOrmEntity)
    private readonly procRepo: Repository<ProcedureOrmEntity>,
  ) {}

  async findBySource(sourceId: string): Promise<Dependency[]> {
    const entities = await this.repo.find({ where: { sourceId } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByTarget(targetId: string): Promise<Dependency[]> {
    const entities = await this.repo.find({ where: { targetId } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByConnection(connectionId: string): Promise<Dependency[]> {
    const entities = await this.repo
      .createQueryBuilder('d')
      .innerJoin(ProcedureOrmEntity, 'p', 'p.id = d.source_id')
      .where('p.connection_id = :connectionId', { connectionId })
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async getCallGraph(
    tenantId: string,
    connectionId: string,
    rootId?: string,
    maxDepth?: number,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    // Get all procedures for this connection
    const procedures = await this.procRepo.find({
      where: { connectionId, tenantId, isDeleted: false },
      select: ['id', 'objectName', 'objectType', 'schemaName', 'estimatedComplexity', 'securityFindings'],
    });

    const procIds = procedures.map((p) => p.id);
    if (procIds.length === 0) return { nodes: [], edges: [] };

    // Get all dependencies between these procedures
    const deps = await this.repo
      .createQueryBuilder('d')
      .where('d.source_id IN (:...ids)', { ids: procIds })
      .getMany();

    // Build node map for label lookups
    const nodeMap = new Map<string, { label: string; objectType: string; schemaName: string }>();
    const nodes: GraphNode[] = procedures.map((p) => {
      const node = {
        id: p.id,
        label: p.objectName,
        objectType: p.objectType,
        schemaName: p.schemaName,
        complexity: p.estimatedComplexity ?? undefined,
        securityIssueCount: Array.isArray(p.securityFindings) ? p.securityFindings.length : 0,
      };
      nodeMap.set(p.id, { label: p.objectName, objectType: p.objectType, schemaName: p.schemaName });
      return node;
    });

    // Build edges with labels; create virtual nodes for unresolved targets
    const edges: GraphEdge[] = [];
    for (const d of deps) {
      const sourceInfo = nodeMap.get(d.sourceId);
      const sourceLabel = sourceInfo?.label || 'unknown';

      if (d.targetId && nodeMap.has(d.targetId)) {
        // Resolved target — normal edge
        const targetInfo = nodeMap.get(d.targetId)!;
        edges.push({
          id: d.id, source: d.sourceId, target: d.targetId,
          dependencyType: d.dependencyType, isDynamic: d.isDynamic, confidence: d.confidence,
          sourceLabel, targetLabel: targetInfo.label,
        });
      } else if (d.targetExternalName) {
        // Unresolved target — create virtual node
        const virtualId = `ext_${d.targetExternalName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const extName = d.targetExternalName.split('.').pop() || d.targetExternalName;

        if (!nodeMap.has(virtualId)) {
          nodeMap.set(virtualId, { label: extName, objectType: 'external', schemaName: '' });
          nodes.push({
            id: virtualId, label: extName, objectType: 'external',
            schemaName: d.targetExternalName.includes('.') ? d.targetExternalName.split('.')[0] : '',
            securityIssueCount: 0,
          });
        }

        edges.push({
          id: d.id, source: d.sourceId, target: virtualId,
          dependencyType: d.dependencyType, isDynamic: d.isDynamic, confidence: d.confidence,
          sourceLabel, targetLabel: extName,
        });
      }
      // Skip deps with no target and no external name
    }

    // If rootId specified, BFS to limit depth
    if (rootId && maxDepth) {
      const reachable = this.bfsReachable(rootId, edges, maxDepth);
      return {
        nodes: nodes.filter((n) => reachable.has(n.id)),
        edges: edges.filter((e) => reachable.has(e.source) && reachable.has(e.target)),
      };
    }

    return { nodes, edges };
  }

  async bulkCreate(dependencies: Omit<Dependency, 'id' | 'createdAt'>[]): Promise<number> {
    if (dependencies.length === 0) return 0;

    const entities = dependencies.map((d) =>
      this.repo.create({
        tenantId: d.tenantId,
        sourceId: d.sourceId,
        targetId: d.targetId,
        targetExternalName: d.targetExternalName,
        dependencyType: d.dependencyType,
        context: d.context as any,
        isDynamic: d.isDynamic,
        confidence: d.confidence,
        analysisJobId: d.analysisJobId,
      }),
    );

    const saved = await this.repo.save(entities);
    return saved.length;
  }

  async deleteByAnalysisJob(jobId: string): Promise<number> {
    const result = await this.repo.delete({ analysisJobId: jobId });
    return result.affected ?? 0;
  }

  private bfsReachable(rootId: string, edges: GraphEdge[], maxDepth: number): Set<string> {
    const reachable = new Set<string>([rootId]);
    let frontier = [rootId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        for (const edge of edges) {
          if (edge.source === nodeId && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            nextFrontier.push(edge.target);
          }
          if (edge.target === nodeId && !reachable.has(edge.source)) {
            reachable.add(edge.source);
            nextFrontier.push(edge.source);
          }
        }
      }
      frontier = nextFrontier;
    }

    return reachable;
  }

  private toDomain(e: DependencyOrmEntity): Dependency {
    return new Dependency(
      e.id, e.tenantId, e.sourceId, e.targetId, e.targetExternalName,
      e.dependencyType as DependencyType, e.context as any, e.isDynamic,
      e.confidence, e.analysisJobId, e.createdAt,
    );
  }
}
