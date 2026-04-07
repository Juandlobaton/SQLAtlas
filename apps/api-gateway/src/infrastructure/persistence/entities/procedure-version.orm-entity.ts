import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('procedure_versions')
@Index(['procedureId', 'versionNumber'], { unique: true })
export class ProcedureVersionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'procedure_id', type: 'uuid' })
  @Index()
  procedureId!: string;

  @Column({ name: 'version_number' })
  versionNumber!: number;

  @Column({ name: 'raw_definition', type: 'text' })
  rawDefinition!: string;

  @Column({ name: 'definition_hash', length: 64 })
  definitionHash!: string;

  @Column({ name: 'diff_from_previous', type: 'text', nullable: true })
  diffFromPrevious!: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  parameters!: Record<string, unknown>[];

  @Column({ name: 'auto_doc', type: 'jsonb', nullable: true })
  autoDoc!: Record<string, unknown> | null;

  @Column({ name: 'detected_at', type: 'timestamptz', default: () => 'NOW()' })
  detectedAt!: Date;

  @Column({ name: 'analysis_job_id', type: 'uuid', nullable: true })
  analysisJobId!: string | null;
}
