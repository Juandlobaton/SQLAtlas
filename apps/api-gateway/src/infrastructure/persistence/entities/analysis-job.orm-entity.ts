import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('analysis_jobs')
export class AnalysisJobOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  @Index()
  connectionId!: string;

  @Column({ length: 50, default: 'pending' })
  @Index()
  status!: string;

  @Column({ default: 0 })
  progress!: number;

  @Column({ name: 'total_objects', type: 'int', nullable: true })
  totalObjects!: number | null;

  @Column({ name: 'processed_objects', default: 0 })
  processedObjects!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails!: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
