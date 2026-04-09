import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('procedures')
export class ProcedureOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  @Index()
  connectionId!: string;

  @Column({ name: 'schema_id', type: 'uuid', nullable: true })
  schemaId!: string | null;

  @Column({ name: 'analysis_job_id', type: 'uuid', nullable: true })
  analysisJobId!: string | null;

  @Column({ name: 'object_type', length: 50 })
  @Index()
  objectType!: string;

  @Column({ name: 'schema_name', length: 255 })
  schemaName!: string;

  @Column({ name: 'object_name', length: 255 })
  objectName!: string;

  @Column({ length: 500 })
  @Index()
  slug!: string;

  @Column({ name: 'full_qualified_name', length: 1000 })
  @Index()
  fullQualifiedName!: string;

  @Column({ name: 'raw_definition', type: 'text' })
  rawDefinition!: string;

  @Column({ name: 'definition_hash', length: 64 })
  @Index()
  definitionHash!: string;

  @Column({ length: 50 })
  language!: string;

  @Column({ type: 'jsonb', default: '[]' })
  parameters!: Record<string, unknown>[];

  @Column({ name: 'return_type', type: 'varchar', length: 255, nullable: true })
  returnType!: string | null;

  @Column({ name: 'is_deterministic', type: 'boolean', nullable: true })
  isDeterministic!: boolean | null;

  @Column({ name: 'estimated_complexity', type: 'int', nullable: true })
  estimatedComplexity!: number | null;

  @Column({ name: 'line_count' })
  lineCount!: number;

  @Column({ name: 'auto_doc', type: 'jsonb', nullable: true })
  autoDoc!: Record<string, unknown> | null;

  @Column({ name: 'flow_tree', type: 'jsonb', nullable: true })
  flowTree!: Record<string, unknown> | null;

  @Column({ name: 'security_findings', type: 'jsonb', default: '[]' })
  securityFindings!: Record<string, unknown>[];

  @Column({ name: 'source_created_at', type: 'timestamptz', nullable: true })
  sourceCreatedAt!: Date | null;

  @Column({ name: 'source_modified_at', type: 'timestamptz', nullable: true })
  sourceModifiedAt!: Date | null;

  @Column({ name: 'first_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt!: Date;

  @Column({ name: 'is_deleted', default: false })
  isDeleted!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
