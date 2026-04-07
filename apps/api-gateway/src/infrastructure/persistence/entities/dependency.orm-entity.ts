import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('dependencies')
export class DependencyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'source_id', type: 'uuid' })
  @Index()
  sourceId!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  @Index()
  targetId!: string | null;

  @Column({ name: 'target_external_name', type: 'varchar', length: 500, nullable: true })
  targetExternalName!: string | null;

  @Column({ name: 'dependency_type', length: 50 })
  @Index()
  dependencyType!: string;

  @Column({ type: 'jsonb', default: '{}' })
  context!: Record<string, unknown>;

  @Column({ name: 'is_dynamic', default: false })
  isDynamic!: boolean;

  @Column({ type: 'float', default: 1.0 })
  confidence!: number;

  @Column({ name: 'analysis_job_id', type: 'uuid', nullable: true })
  analysisJobId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
